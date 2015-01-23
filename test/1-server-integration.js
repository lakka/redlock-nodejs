var Docker  = require('dockerode'),
    docker  = new Docker(),
    async   = require('async'),
    redis   = require('redis'),
    Redlock = require('../index');

/*
 * This test requires a redis-server docker container named:
 * redis-1
 */

describe('(integration) Redlock with five redis-servers', function() {
  var servers, containers, redlock, clients;

  beforeEach(function(done) {
    servers = [];
    clients = [];
    containers = [];
    // Start redis-containers
    async.series([function(done) {
      async.times(1,
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
            container.unpause(function() { });  // In case someone has been sloppy
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

  describe('lock()', function() {
    it('should acquire lock by retrying if previous lock expires', function(done) {
      redlock.setRetry(9,100);
      redlock.lock('test', 150, function(err, lock) {
        if(err) {
          done(new Error('Could not lock resource with clean database'));
          return;
        }
        redlock.lock('test', 150, function(err, lock) {
          done(err);
        });
      });
    });
    it('should acquire lock by retrying if previous lock is unlocked', function(done) {
      redlock.setRetry(9,100);
      redlock.lock('test', 2000, function(err, lock) {
        if(err) {
          done(new Error('Could not lock resource with clean database'));
          return;
        }
        redlock.unlock('test', lock.value);
        redlock.lock('test', 150, function(err, lock) {
          done(err);
        });
      });
    });
    it('should acquire lock by retrying when server comes back up', function(done) {
      redlock.setRetry(9,100);
      containers[0].pause(function() {   // Restarting a container will change it's IP
        redlock.lock('test', 150, function(err, lock) {
          done(err);
        });
        containers[0].unpause(function() {});
      });
    });
  });
});
