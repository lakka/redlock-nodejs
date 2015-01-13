var proxyquire = require('proxyquire');
var chai = require("chai");
var expect = chai.expect;
var sinon = require('sinon');
chai.use(require('sinon-chai'));
var redis = require('redis');
var async = require('async');
var Redlock = require('../index');

describe('Redlock', function() {
  var sandbox = sinon.sandbox.create();
  var redisStub, redlock, clientStub, setSpy;
  beforeEach(function() {
    clientStub = sandbox.stub(redis.createClient().on('error', function() {}));
    clientStub.set.onFirstCall().yields(null, 'OK');
    clientStub.set.onSecondCall().yields();
    clientStub.emit('connect');
    redisStub = sandbox.stub(redis, 'createClient');
    redisStub.returns(clientStub);
    redlock = new Redlock([{host:'localhost', port:6739}]);
  });

  afterEach(function() {
    sandbox.restore()
  });

  describe('constructor', function() {
    it('should call redis.createClient at least once', function() {
      expect(redisStub).to.have.been.called;
    });
  });

  describe('#lock()', function() {
    it('should call at least one redis client\'s set-function', function() {
      async.series([
        function(cb) {
          redlock.lock('test', 1000, cb);
        },
        function(cb) {
          expect(clientStub.set).to.have.been.called;
          cb();
        }
      ], function() {});
    });
    it('should call back with error if no redis servers approve of the lock', function() {
      async.series([
        function(cb) {
          redlock.lock('test', 1000, cb);
        },
        function(cb) {
          redlock.lock('test', 1000, function(err) {
            if(err) done()
            else done('no error');
          });
        },
      ], function() {});
    });
    it('should call back with no error and an object on success', function() {
      async.waterfall([
        function(cb) {
          redlock.lock('test', 1000, cb);
        },
        function(param2, cb) {
          expect(param2).to.be.an.object;
          cb();
        }
      ], function() {});
    });
  });
});

