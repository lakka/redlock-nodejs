var async = require('async');

function Queues(clients, options) {
  this.clients = clients;
  this.options = options;
  this.serverIdScript = '' +
      'if redis.call("exists",KEYS[1]) == 1 then' +
      '  return redis.call("get",KEYS[1])' +
      'else' +
      '  return redis.call("set",KEYS[1],ARGV[1],"NX")' +
      'end';
}

Queues.prototype._pollQueues = function(forClient) {
  var that = this;
  if(!forClient.conn.connected) {
    return;
  }
  if(!forClient.id) {
    this._getServerId(forClient, function(id) {
      forClient.id = id;
      that._dequeue(forClient);
    });
  } else {
    this._dequeue(forClient);
  }
};

Queues.prototype._getServerId = function(client, callback) {
  var that = this;
  var key = "multiredlockServerId";
  var id = this._getUniqueServerId();
  client.conn.eval(this.serverIdScript, 1, key, id, function(err, reply) {
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

Queues.prototype._enqueue = function(queueId, resource, value) {
  if(!queueId) return;
  this.clients.forEach(function(client) {
    client.conn.rpush(queueId, JSON.stringify({
      resource: resource,
      value:value
    }), function() {});
  });
};

Queues.prototype._dequeue = function(forClient, queueId) {
  var that = this;
  var clientsWithQueue = [];
  var queueKey = forClient.id + "_" + queueId;
  if(!queueKey) return;
  async.each(this.clients, function(client, next) {
    client.conn.exists(queueKey, function(err, reply) {
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
      console.log('Got',clientsWithQueue.length,'servers with unlock queue for',queueKey);
    }
    var client = clientsWithQueue[0];
    client.conn.llen(queueKey, function(err, length) {
      if(err || (length == 0)) {
        return;
      }
      client.conn.lrange(queueKey, 0, length, function(err, reply) {
        if(err || !reply) {
          return;
        }
        reply.forEach(function(lockStr) {
          var locks;
          try {
            lock = JSON.parse(lockStr);
          } catch (e) { }
          that._unlockInstance(forClient, lock.resource, lock.value);
        });
        clientsWithQueue.forEach(function(client) {
          client.conn.del(queueKey, function() { });
        });
      });
    });
  });
};

Queues.prototype._getUniqueServerId = function(callback) {
  return Date.now() + "_" +  Math.random().toString(16).slice(2);
};

module.exports = Queues;
