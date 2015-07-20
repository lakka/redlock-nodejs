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
      containers[n] = container;
      container.start(function(err, data) {
        if(err && err.statusCode != 304) {
          next(err);
        }
        container.unpause(function() { });
        container.inspect(function(err, containerInfo) {
          if(err) next(err);
          var port = 6379;
          var host = containerInfo.NetworkSettings.IPAddress;
          try {
            port = containerInfo.NetworkSettings.Ports['6379/tcp'][0].HostPort;
            host = 'localhost';
          } catch(e) { }
          var server = {
            host: host,
            port: port
          };
          servers[n] = server;

          // Clear previous data
          var client = redis.createClient(server.port, server.host);
          client.on('error', function() {});
          clients[n] = client;
          client.flushall(next);
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
