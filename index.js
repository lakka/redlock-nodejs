var redis  = require('redis'),
    events = require('events'),
    util   = require('util'),
    async  = require('async'),
    os     = require('os');

function Redlock(servers, options) {
  if(servers && !Array.isArray(servers)) {
    if(servers.host) {
      servers = [servers];
    } else if(!options) {
      options = servers;
      servers = null;
    }
  }
  this.options = options || {};
  this.servers = servers || [{host: 'localhost', port: 6379}];
  this.id = this.options.id || os.hostname();
  this.retries = 3;
  this.retryWait = 100;
  this.drift = this.options.drift || 100;
  this.serverIdScript = '' +
      'if redis.call("exists",KEYS[1]) == 1 then' +
      '  return redis.call("get",KEYS[1])' +
      'else' +
      '  return redis.call("set",KEYS[1],ARGV[1],"NX")' +
      'end';
  this.unlockScript = '' +
      'if redis.call("get",KEYS[1]) == ARGV[1] then ' +
      '  return redis.call("del",KEYS[1]) ' +
      'else ' +
      '  return 0 ' +
      'end ';
  this.renewScript = '' +
      'if redis.call("get",KEYS[1]) == ARGV[1] then ' +
      '  return redis.call("pexpire",KEYS[1],ARGV[2]) ' +
      'else ' +
      '  return 0 ' +
      'end ';
  this.quorum = Math.floor(this.servers.length / 2) + 1;
  this.clients = [];
  this.connected = false;
  this._connectedClients = 0;
  this._connect();
  this._registerListeners();
  if(this.options.debug) {
    console.log("Initialized with quorum",this.quorum,
                ", total servers", servers.length);
  }
}


util.inherits(Redlock, events.EventEmitter);

Redlock.prototype.setRetry = function(retries, retryWait) {
  this.retries = retries;
  this.retryWait = retryWait;
};

Redlock.prototype._connect = function() {
  var that = this;
  var onError = (this.options.debug) ? console.log : function() {};
  this.clients = this.servers.map(function(server) {
    var port = server.port || 6379;
    var client = redis.createClient(port, server.host,
                                    {enable_offline_queue:false});
    client.on('error', onError);
    that._pollQueuesPeriodically(client);
    return client;
  });
};

Redlock.prototype._pollQueuesPeriodically = function(forClient) {
  this._pollQueues(forClient);
  setTimeout(this._pollQueuesPeriodically.bind(this, forClient), 5000);
};

Redlock.prototype._pollQueues = function(forClient) {
  var that = this;
  if(!forClient.connected) {
    return;
  }
  if(!forClient.redlockServerId) {
    this._getServerId(forClient, function(id) {
      forClient.redlockServerId = id;
      that._dequeueUnlocks(forClient);
    });
  } else {
    this._dequeueUnlocks(forClient);
  }
};

Redlock.prototype._registerListeners = function() {
  var that = this;
  this.clients.forEach(function(client) {
    client.on('ready', function() {
      if(++that._connectedClients === that.quorum) {
        that.connected = true;
        that.emit('connect');
      }
      that._pollQueues(client);
    });
    client.on('end', function() {
      if(--that._connectedClients === (that.quorum - 1)) {
        that.connected = false;
        that.emit('disconnect');
      }
    });
  });
};

Redlock.prototype._lockInstance = function(client, resource, value, ttl, callback) {
  var that = this;
  client.set(resource, value, 'NX', 'PX', ttl, function(err, reply) {
    if(err || !reply) {
      err = err || new Error('resource locked');
      if(that.options.debug) {
        console.log('Failed to lock instance:', err);
      }
      callback(err);
    }
    else
      callback();
  });
};

Redlock.prototype._renewInstance = function(client, resource, value, ttl, callback) {
  var that = this;
  client.eval(this.renewScript, 1, resource, value, ttl, function(err, reply) {
    if(err || !reply) {
      err = err || new Error('resource does not exist');
      if(that.options.debug) {
       console.log('Failed to renew instance:', err);
      }
      callback(err);
      return;
    }
    callback();
  });
};

Redlock.prototype._unlockInstance = function(client, resource, value) {
  var that = this;
  client.eval(this.unlockScript, 1, resource, value, function(err, reply) {
    if(that.options.disableUnlockQueue) return;
    if(err) {
      that._enqueueUnlock(client.redlockUniqueId, resource, value);
    }
  });
};

Redlock.prototype._getServerId = function(client, callback) {
  var that = this;
  var key = "redlockServerId";
  var id = this._getUniqueServerId();
  client.eval(this.serverIdScript, 1, key, id, function(err, reply) {
    if(err || !reply) {
      console.log(reply);
      err = err || new Error('server id key existed unexpectedly');
      console.warn('Could not set id for a client! Unlocks not queued for this client',
                   err);
      callback(client);
      return;
    }
    if(that.options.debug) {
      console.log('Got server id', reply);
    }
    callback(reply);
  });
  

};

Redlock.prototype._enqueueUnlock = function(queueId, resource, value) {
  if(!queueId) return;
  this.clients.forEach(function(client) {
    client.rpush(queueId, JSON.stringify({
      resource: resource,
      value:value
    }), function() {});
  });
};

Redlock.prototype._dequeueUnlocks = function(fromClient) {
  var that = this;
  var clientsWithQueue = [];
  var queueId = fromClient.redlockServerId;
  if(!queueId) return;
  async.each(this.clients, function(client, next) {
    client.exists(queueId, function(err, reply) {
      if(!err && reply) {
        clientsWithQueue.push(client);
      }
      next();
    });
  }, function() {
    if(clientsWithQueue.length == 0) {
      return;
    }
    if(that.options.debug) {
      console.log('Got',clientsWithQueue.length,'servers with unlock queue for',queueId);
    }
    var client = clientsWithQueue[0];
    client.llen(queueId, function(err, length) {
      if(err || (length == 0)) {
        return;
      }
      client.lrange(queueId, 0, length, function(err, reply) {
        if(err || !reply) {
          return;
        }
        reply.forEach(function(lockStr) {
          var locks;
          try {
            lock = JSON.parse(lockStr);
          } catch (e) { }
          that._unlockInstance(fromClient, lock.resource, lock.value);
        });
        clientsWithQueue.forEach(function(client) {
          client.del(queueId, function() { });
        });
      });
    });
  });
};

Redlock.prototype._getUniqueLockId = function(callback) {
  return this.id + "_" + Date.now() + "_" +  Math.random().toString(16).slice(2);
};

Redlock.prototype._getUniqueServerId = function(callback) {
  return Date.now() + "_" +  Math.random().toString(16).slice(2);
};

Redlock.prototype._acquireLock = function(resource, value, ttl, lockFunction, callback) {
  var that = this;
  var value = value || this._getUniqueLockId();
  var n = 0;
  var startTime = Date.now();

  async.series([
    function(locksSet) {
      async.each(that.clients, function(client, done) {
        lockFunction.apply(that, [client, resource, value, ttl, function(err) {
          if(!err)
            n++;
          done();
        }]);
      }, locksSet);
    },
    function() {
      var timeSpent = Date.now() - startTime;
      if(that.options.debug) {
        console.log('Time spent locking:', timeSpent, 'ms');
        console.log(n + "", 'servers approve our lock');
      }
      var validityTime = ttl - timeSpent - that.drift;
      if(n >= that.quorum && validityTime > 0) {
        callback(null, {
          validity: validityTime,
          resource: resource,
          value: value
        });
      } else {
        that.unlock(resource, value);
        callback(new Error('Could not lock resource ' + resource));
      }
    }
  ]);
};

Redlock.prototype.lock = function(resource, ttl, callback) {
  var that = this;
  var retries = this.retries;
  var retryCallback = function(err, lock) {
    if(err) {
      if(retries > 0) {
        retries--;
        var timeout = Math.floor(Math.random() * that.retryWait);
        if(that.options.debug) {
          console.log('Retrying locking in', timeout, 'ms');
        }
        setTimeout(
          that._acquireLock.bind(that, resource, null, ttl, that._lockInstance, retryCallback),
          timeout);
      } else {
        callback(err);
      }
      return;
    }
    callback(null, lock);
  };
  this._acquireLock(resource, null, ttl, this._lockInstance, retryCallback);
};

Redlock.prototype.renew = function(resource, value, ttl, callback) {
  this._acquireLock(resource, value, ttl, this._renewInstance, callback);
};

Redlock.prototype.unlock = function(resource, value) {
  var that = this;
  this.clients.forEach(function(client) {
    that._unlockInstance(client, resource, value);
  });
};

module.exports = Redlock;
