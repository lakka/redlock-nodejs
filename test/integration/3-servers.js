var Docker       = require('dockerode'),
    docker       = new Docker(),
    async        = require('async'),
    redis        = require('redis'),
    dockerhelper = require('./containers-helper'),
    Redlock      = require('../../index');

/*
 * This test requires three redis-server docker containers named:
 * redis-1, redis-2 and redis-3
 */

describe('(integration) Redlock with three redis-servers', function() {
  var servers, containers, redlock, clients;
  var that = this;

  beforeEach(function(done) {
    async.series([
      function(next) {
        dockerhelper.startRedisServers(3, function(err, serv, cli, cont) {
          if(err) {
            next(err);
            return;
          }
          servers = serv;
          clients = cli;
          containers = cont;
          next();
        });
    }, function(next) {
      redlock = new Redlock(servers);
      redlock.once('connect', next);
    }], done);
  });

  after(function(done) {
    dockerhelper.stopEverything(done);
  });

  describe('lock()', function() {
    it('should acquire lock if all servers approve', function(done) {
      redlock.lock('test', 1000, done);
    });
    it('another redlock instance should acquire lock after unlock', function(done) {
      this.timeout(1000);
      var redlock2 = new Redlock(servers);
      redlock2.once('connect', function() {
        redlock.lock('test', 1000, function(err, lock) {
          redlock.unlock('test', lock.value);
          redlock2.lock('test', 500, done);
        });
      });
    });
    it('another redlock instance should acquire lock after timeout', function(done) {
      this.timeout(1000);
      var redlock2 = new Redlock(servers);
      redlock2.setRetry(100, 50);
      redlock2.once('connect', function() {
        redlock.lock('test', 150, function(err, lock) {
          redlock2.lock('test', 500, done);
        });
      });
    });
  });
  describe('renew()', function() {
    it('should extend existing lock\'s ttl', function(done) {
      redlock.lock('test', 200, function(err, lock) {
        redlock.renew('test', lock.value, 1500, function(err, lock) {
          setTimeout(function() {
            clients[0].get('test', function(err, reply) {
              if(!err && reply) {
                done();
              } else {
                done(new Error('Lock was deleted before it was supposed to'));
              }
            });
          }, 300);
        });
      });
    });
  });

  describe('failover, servers denoted with A, B and C', function() {
    var random = Math.floor(Math.random() * 10) % 3;
    it('should acquire lock if a server crashes', function(done) {
      redlock.setRetry(0,0);
      containers[random].kill(function(err, data) {
        redlock.lock('test', 2000, function(err) {
          done(err);
        });
      });
    });
    it('should not acquire lock if res is locked and a server crashes', function(done) {
      redlock.setRetry(0,0);
      redlock.lock('test', 2000, function() {
        containers[random].kill(function(err, data) {
          redlock.lock('test', 2000, function(err) {
            if(err) done();
            else done(new Error('lock acquired'));
          });
        });
      });
    });
    it('acquire lock -> A, B down -> lock released -> ' +
       'A, B up -> lock should be acquired', function(done) {
      this.timeout(5000);
      var value;
      async.series([function(next) {
        redlock.lock('test', 5000, function(err, lock) {
          if(err) {
            done(new Error('First step failed' + err));
            return;
          }
          value = lock.value;
          next();
        });
      }, function(next) {
        async.parallel([function(next) {
          containers[1].stop(next);
        }, function(next) {
          containers[2].stop(next);
        }], next);
      }, function(next) {
        redlock.unlock('test', value);
        next();
      }, function(next) {
        async.parallel([function(next) {
          containers[1].start(next);
        }, function(next) {
          containers[2].start(next);
        }], function() {
          redlock.once('connect', next);
        });
      }, function(next) {
        redlock.lock('test', 500, function(err, lock) {
          if(err) {
            done(new Error('Final step failed' + err));
            return;
          }
          next();
        });
       }], done);
    });
    it('acquire lock -> A, B down -> lock released -> ' +
       'redlock down -> A up -> lock should be acquired ' +
       'by another redlock', function(done) {
      this.timeout(5000);
      var value, redlock2;
      async.series([function(next) {
        redlock2 = new Redlock(servers);
        redlock2.once('connect', next);
      }, function(next) {
        redlock.lock('test', 5000, function(err, lock) {
          if(err) {
            done(new Error('First step failed' + err));
            return;
          }
          value = lock.value;
          next();
        });
      }, function(next) {
        async.parallel([function(next) {
          containers[1].stop(next);
        }, function(next) {
          containers[2].stop(next);
        }], next);
      }, function(next) {
        redlock.unlock('test', value);
        redlock.disconnect();
        next();
      }, function(next) {
          containers[1].start(function() {});
          redlock2.once('connect', next);
      }, function(next) {
        redlock2.lock('test', 500, function(err, lock) {
          if(err) {
            done(new Error('Final step failed' + err));
            return;
          }
          next();
        });
       }], done);
    });
    it('C down -> lock acquired -> C up, B down -> lock released ' +
       '-> B up, C down -> lock should be acquired', function(done) {
      var value;
      this.timeout(5000);
      async.series([function(next) {
        containers[2].kill(next);
      }, function(next) {
        redlock.lock('test', 5000, function(err, data) {
          if(err) {
            next(err);
            return;
          }
          value = data.value;
          next();
        });
      }, function(next) {
        async.parallel([function(ready) {
          clients[2].once('ready', ready);
          containers[2].start(function() { });
        }, function(ready) {
          containers[1].kill(ready);
        }], next);
      }, function(next) {
        redlock.unlock('test', value);
        next();
      }, function(next) {
        async.parallel([function(ready) {
          clients[1].once('ready', ready);
          containers[1].start(function() { });
        }, function(ready) {
          containers[2].stop(ready); // Stop the container so lock gets saved
        }], next);
      }, function(next) {
        redlock.lock('test', 500, function(err) {
          if(err) {
            next(new Error('Last step failed, lock not acquired'));
            return;
          }
          next();
        });
      }], done);
    });
  });

});
