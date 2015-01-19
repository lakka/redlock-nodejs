var Docker  = require('dockerode'),
    docker  = new Docker(),
    async   = require('async'),
    redis   = require('redis'),
    Redlock = require('../index');

/*
 * This test requires three redis-server docker containers named:
 * redis-1, redis-2 and redis-3
 */

describe('(integration) Redlock with three redis-servers', function() {
  var servers, containers, redlock, clients;

  beforeEach(function(done) {
    servers = [];
    clients = [];
    containers = [];
    // Start redis-containers
    async.series([function(done) {
      async.times(3,
        function(n, next) {
          var containerName = "redis-" + (n + 1);
          var container = docker.getContainer(containerName);
          if(!container) {
            next('Could not find container ' + containerName + '. Abort.');
            return;
          }
          containers.push(container);
          container.start(function(err, data) {
            if(err && err.statusCode != 304) {
              next(err);
            }
            container.inspect(function(err, containerInfo) {
              if(err) next(err);
              var server = {
                host: containerInfo.NetworkSettings.IPAddress,
                port: 6379
              };
              servers.push(server);

              // Clear previous data
              var client = redis.createClient(server.port, server.host);
              client.on('error', function() {});
              clients.push(client);
              client.flushall();
              next();
            });
          });
        }, done);
    }, function(done) {
      redlock = new Redlock(servers);
      redlock.on('connect', done);
    }], done);
  });

  after(function(done) {
    docker.listContainers(function (err, containers) {
      async.each(containers, function (containerInfo, next) {
        var container = docker.getContainer(containerInfo.Id);
        container.stop(function() {
          next();
        });
      }, done);
    });
  });

  describe('#lock()', function() {
    it('should acquire lock if all servers approve', function(done) {
      redlock.lock('test', 1000, done);
    });
  });
  describe('#renew()', function() {
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

  describe('failover', function() {
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
    it('servers A, B, C; C down -> lock acquired -> C up, B down -> lock released ' +
       '-> B up, C down -> lock should be acquired', function(done) {
      var value;
      async.series([function(next) {
        containers[2].kill(next);
      }, function(next) {
        redlock.lock('test', 2000, function(err, data) {
          if(err) {
            next(err);
            return;
          }
          value = data.value;
          next();
        });
      }, function(next) {
        async.parallel([function(ready) {
          containers[2].start(ready);
        }, function(ready) {
          containers[1].kill(ready);
        }], next);
      }, function(next) {
        redlock.unlock('test', value);
        next();
      }, function(next) {
        async.parallel([function(ready) {
          containers[1].start(ready);
        }, function(ready) {
          containers[2].kill(ready);
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
