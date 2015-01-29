var async = require('async');

exports.unlock = "unlock";
exports.renew  = "renew";

function Queues(redlock, clients, options) {
  this.redlock = redlock;
  this.clients = clients;
  this.options = options;
  this.serverIdScript = '' +
      'if redis.call("exists",KEYS[1]) == 1 then' +
      '  return redis.call("get",KEYS[1])' +
      'else' +
      '  return redis.call("set",KEYS[1],ARGV[1],"NX")' +
      'end';
  this.ttl = options.queueTtl || 3600;
}

Queues.prototype._pollQueues = function(forClient) {
  var that = this;
  if(!forClient.conn.connected) {
    return;
  }
  if(!forClient.id) {
    this._getServerId(forClient, function(id) {
      forClient.id = id;
      that._dequeue(forClient, exports.unlock);
      that._dequeue(forClient, exports.renew);
    });
  } else {
    this._dequeue(forClient, exports.unlock);
    this._dequeue(forClient, exports.renew);
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

Queues.prototype._enqueue = function(forClient, queueId, resource, value, ttl) {
  if(!queueId) return;
  var queueKey = forClient.id;
  var itemKey = forClient.id + "." + queueId + "_" + resource + "_" + value;
  var that = this;
  this.clients.forEach(function(client) {
    var itemValue = JSON.stringify({
      command: queueId,
      resource: resource,
      value:value,
    });
    client.conn.set(itemKey, itemValue, 'NX', 'EX', that.ttl, function(err, reply) {
      if(err || !reply) {
        err = err || new Error('item already exists');
        console.warn('Could not add item', itemKey, 'to queue', err);
        return;
      }
      client.conn.rpush(queueKey, itemKey);
    });
  });
};

Queues.prototype._dequeue = function(forClient, queueId) {
  var that = this;
  var clientsWithQueue = [];
  if(!queueId) return;
  var queueKey = forClient.id + "." + queueId;
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
        reply.forEach(function(queuedItem) {
          client.conn.get(queuedItem, function(err, reply) {
            if(err || !reply) {
              return;
            }
            var lock;
            try {
              lock = JSON.parse(lock);
            } catch (e) {
              console.warn('Could not parse queued item',e);
              return;
            }
            that.redlock._unlockInstance(forClient, lock.resource, lock.value);
            clientsWithQueue.forEach(function(client) {
              client.conn.del(queuedItem, function() { });
            });
          });
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
