var Docker  = require('dockerode'),
    docker  = new Docker(),
    async   = require('async'),
    redis   = require('redis'),
    dockerhelper = require('./containers-helper'),
    Redlock = require('../index');

/*
 * This test requires five redis-server docker containers named:
 * redis-1, redis-2, redis-3, redis-4 and redis-5
 */

describe('(integration) Redlock with five redis-servers', function() {
  var servers, containers, redlock, clients;

  beforeEach(function(done) {
    async.series([
      function(next) {
        dockerhelper.startRedisServers(5, function(err, serv, cli, cont) {
          if(err) {
            next(err);
            return;
          }
          servers = serv;
          clients = cli;
          containers = cont;
          next();
        });
    }, function(done) {
      redlock = new Redlock(servers);
      redlock.once('connect', done);
    }], done);
  });

  after(function(done) {
    dockerhelper.stopEverything(done);
  });

  describe('failover', function() {
    it('should acquire lock if two servers crash', function(done) {
      async.times(2, function(n, next) {
        containers[n].kill(function(err, data) {
          next(err);
        });
      }, function() {
        redlock.lock('test', 2000, function(err) {
          done(err);
        });
      });
    });
    it('should not acquire lock if three servers crash', function(done) {
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
