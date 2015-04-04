var async  = require('async'),
    Docker = require('dockerode'),
    docker = new Docker(),
    redis  = require('redis');

exports.startRedisServers = function(n, callback) {
  var servers = [];
  var containers = [];
  var clients = [];
  // Start redis containers
  async.times(n,
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
        container.unpause(function() { });
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

          // Retry flushall to Redis for a total of about 4 seconds
          // with timeouts of 16 ms, 32 ms, 64 ms .. 2048 ms
          var retryCount = 0;
          var flushallRetryHandler = function(err) {
            if (err) {
              retryCount++;
              if (retryCount > 8 ) {
                next(new Error('Unable to find started redis N=' + n + '. Last error: ' + err ));
              }
              else {
                setTimeout(
                    function() {
                      client.flushall(flushallRetryHandler);
                    },
                    Math.pow(2, retryCount+3)
                );
              }
            }
            else {
              next();
            }
          };
          client.flushall(flushallRetryHandler);
        });
      });
    }, function(err) {
      callback(err, servers, clients, containers);
    });
};

exports.stopEverything = function(callback) {
  docker.listContainers(function (err, containers) {
    async.each(containers, function (containerInfo, next) {
      var container = docker.getContainer(containerInfo.Id);
      container.stop(function() {
        next();
      });
    }, callback);
  });
};
