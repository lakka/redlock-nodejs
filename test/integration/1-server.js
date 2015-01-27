var Docker  = require('dockerode'),
    docker  = new Docker(),
    async   = require('async'),
    redis   = require('redis'),
    dockerhelper = require('./containers-helper'),
    Redlock = require('../../index');

/*
 * This test requires a redis-server docker container named:
 * redis-1
 */

describe('(integration) Redlock with one redis-server', function() {
  var servers, containers, redlock, clients;

  beforeEach(function(done) {
    async.series([
      function(next) {
        dockerhelper.startRedisServers(1, function(err, serv, cli, cont) {
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
