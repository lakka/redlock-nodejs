var Docker  = require('dockerode'),
    docker  = new Docker(),
    async   = require('async'),
    redis   = require('redis'),
    Redlock = require('../index');

/*
 * This test requires five redis-server docker containers named:
 * redis-1, redis-2, redis-3, redis-4 and redis-5
 */

describe('(integration) Redlock with five redis-servers', function() {
  var servers, containers, redlock, clients;

  beforeEach(function(done) {
    servers = [];
    clients = [];
    containers = [];
    // Start redis-containers
    async.series([function(done) {
      async.times(5,
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

  describe('failover', function() {
    it('should acquire lock if two servers crash', function(done) {
      redlock.setRetry(0,0);
      async.times(2, function(n, next) {
        containers[n].kill(function(err, data) {
          next();
        });
      }, function() {
        redlock.lock('test', 2000, function(err) {
          done(err);
        });
      });
    });
    it('should not acquire lock if three servers crash', function(done) {
      redlock.setRetry(0,0);
      async.times(3, function(n, next) {
        containers[n].kill(function(err, data) {
          next();
        });
      }, function() {
        redlock.lock('test', 2000, function(err) {
          if(err) done();
          else done(new Error('Callback not called with error'));
        });
      });
    });
  });
});
