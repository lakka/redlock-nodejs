var redis  = require('redis'),
    events = require('events'),
    util   = require('util'),
    async  = require('async');

function Redlock(servers, id) {
  this.servers = servers;
  this.id = id || "id_not_set";
  this.drift = 100;
  this.unlockScript = ' \
      if redis.call("get",KEYS[1]) == ARGV[1] then \
        return redis.call("del",KEYS[1]) \
      else \
        return 0 \
      end \
  ';
  this.quorum = Math.floor(this.servers.length / 2) + 1;
  // console.log("Quorum is",this.quorum);
  this.clients = [];
  this._connectedClients = 0;
  this._connect();
  this._registerListeners();
}

util.inherits(Redlock, events.EventEmitter);

Redlock.prototype._connect = function() {
  this.clients = this.servers.map(function(server) {
    var client = redis.createClient(server.port, server.host);
    client.on('error', function() { });
    client.lockRequestTimeout = server.lockRequestTimeout || 100;
    return client;
  });
};

Redlock.prototype._registerListeners = function() {
  var that = this;
  this.clients.forEach(function(client) {
    client.on('connect', function() {
      if(++that._connectedClients === that.quorum) {
        that.emit('connect');
      }
    });
    client.on('end', function() {
      if(--that._connectedClients === (that.quorum - 1)) {
        that.emit('disconnect');
      }
    });
  });
};

Redlock.prototype._lockInstance = function(client, resource, value, ttl, callback) {
  var done = false;
  setTimeout(function() {
    if(!done) {
      callback(new Error('locking timed out'));
    }
  }, client.lockRequestTimeout);
  client.set(resource, value, 'NX', 'PX', ttl, function(err, reply) {
    done = true;
    if(err || !reply) {
      err = err || new Error('resource locked');
      // console.log('Failed to lock instance:', err);
      callback(err);
    }
    else
      callback();
  });
};

Redlock.prototype._unlockInstance = function(client, resource, value) {
  client.eval(this.unlockScript, 1, resource, value, function() {});
  // Unlocking is best-effort, so we don't care about errors
};

Redlock.prototype._getUniqueLockId = function(callback) {
  return this.id + "." + new Date().getTime();
};

Redlock.prototype.lock = function(resource, ttl, callback) {
  var that = this;
  var value = this._getUniqueLockId();
  var n = 0;
  var startTime = new Date().getTime();

  async.waterfall([
    function(locksSet) {
      async.each(that.clients, function(client, done) {
        that._lockInstance(client, resource, value, ttl, function(err) {
          if(!err)
            n++;
          done();
        });
      }, locksSet);
    },
    function(callback) {
      var timeSpent = new Date().getTime() - startTime;
      // console.log('Time spent locking:', timeSpent, 'ms');
      // console.log(n + "", 'servers approve our lock');
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
  ], callback);
};

Redlock.prototype.unlock = function(resource, value) {
  var that = this;
  this.clients.forEach(function(client) {
    that._unlockInstance(client, resource, value);
  });
};

module.exports = Redlock;
