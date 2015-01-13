var redis = require('redis'),
    _     = require('underscore'),
    async = require('async');

module.exports.Redlock = Redlock;

function Redlock(serversOpts, id) {
  this.id = id || "id_not_set";
  this.unlockSript = ' \
      if redis.call("get",KEYS[1]) == ARGV[1] then \
        return redis.call("del",KEYS[1]) \
      else \
        return 0 \
      end \
  ';
  this.clients = [];
  this.clients = _.map(serversOpts, function(serverOpts) {
    return redis.createClient(serverOpts.port, serverOpts.host);
  });
  this.quorum = Math.ceil(serversOpts.length / 2);
  console.log("Quorum:",this.quorum);
}

Redlock.prototype._lockInstance = function(client, resource, value, ttl, callback) {
  client.set(resource, value, 'NX', 'PX', ttl, function(err, reply) {
    if(err) {
      console.log('Failed to lock instance: ' + err);
      callback(err);
    }
    else
      callback();
  });
};

Redlock.prototype._unlockInstance = function(client, resource, value) {
  client.eval(this.unlockScript, 1, resource, value);
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
      console.log('N is now', n);
      var timeSpent = new Date().getTime() - startTime;
      console.log('Time spent locking:', timeSpent);
      var validityTime = ttl-timeSpent;
      if(n >= that.quorum && validityTime > 0) {
        callback(null, {
          validity: validityTime,
          resource: resource,
          value: value
        });
      } else {
        callback('Could not lock resource');
      }
    }
  ], callback);
};
