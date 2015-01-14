var chai = require("chai");
var expect = chai.expect;
var sinon = require('sinon');
chai.use(require('sinon-chai'));
var redis = require('redis');
var async = require('async');
var Redlock = require('../index');

describe('Redlock with one server', function() {
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
    it('should call redis.createClient once', function() {
      expect(redisStub).to.have.been.calledOnce;
    });
  });

  describe('#lock()', function() {
    it('should call redisClient.set once', function() {
      redlock.lock('test', 1000, function() {
        expect(clientStub.set).to.have.been.calledOnce;
      });
    });
    it('should call back with error if no redis servers approve of the lock', function() {
      redlock.lock('test', 1000, function() {
        redlock.lock('test', 1000, function(err) {
          expect(err).to.be.not.null;
        });
      });
    });
    it('should call back with no error and an object on success', function() {
      redlock.lock('test', 1000, function(err, res) {
        expect(err).to.be.null;
        expect(res).to.be.an.object;
      });
    });
  });
  
  describe('#unlock()', function() {
    it('should call redisClient.eval once', function() {
      redlock.unlock('test', 'value', function() {});
      expect(clientStub.eval).to.have.been.calledOnce;
    });
  });
});

describe('Redlock with three servers', function() {
  var sandbox = sinon.sandbox.create();
  var servers = [
    {host:'localhost', port:6739},
    {host:'jaakkomaa', port:6739},
    {host:'localhost', port:6799}
  ];
  var redisStub, redlock, clientStubError, clientStub, setSpy;
  beforeEach(function() {
    clientStub = sandbox.stub(redis.createClient().on('error', function() {}));
    clientStub.on.restore();
    clientStub.emit.restore();
    redisStub = sandbox.stub(redis, 'createClient');
    redisStub.returns(clientStub);
    redlock = new Redlock(servers);
  });

  afterEach(function() {
    sandbox.restore();
  });
  describe('constructor', function() {
    it('should call redis.createClient thrice', function() {
      expect(redisStub).to.have.been.calledThrice;
    });
    it('should emit connect', function(done) {
      redlock.on('connect', done);
      clientStub.emit('connect');
    });
    it('should emit disconnect if all servers go down', function(done) {
      redlock.on('disconnect', done);
      clientStub.emit('connect');
      clientStub.emit('end');
    });
  });

  describe('#lock()', function() {
    it('should call redisClient.set thrice', function() {
      redlock.lock('test', 1000, function() {
        expect(clientStub.set).to.have.been.calledThrice;
      });
    });
    it('should err if less than two servers approve of lock', function() {
      clientStub.set.onFirstCall().yields(null, 'OK');
      clientStub.set.onSecondCall().yields();
      clientStub.set.onThirdCall().yields();
      redlock.lock('test', 1000, function(err) {
        expect(err).to.be.not.null;
      });
    });
    it('should err if one server approves lock, one errs and one disapproves', function() {
      clientStub.set.onFirstCall().yields(null, 'OK');
      clientStub.set.onSecondCall().yields('ERROR');
      clientStub.set.onThirdCall().yields();
      redlock.lock('test', 1000, function(err) {
        expect(err).to.be.not.null;
      });
    });
    it('should succeed if two servers approve of lock', function() {
      clientStub.set.onFirstCall().yields(null, 'OK');
      clientStub.set.onSecondCall().yields(null, 'OK');
      clientStub.set.onThirdCall().yields();
      redlock.lock('test', 1000, function(err, res) {
        expect(err).to.be.null;
        expect(res).to.be.an.object;
      });
    });
  });
  
  describe('#unlock()', function() {
    it('should call redisClient.eval thrice', function() {
      redlock.unlock('test', 'value', function() {});
      expect(clientStub.eval).to.have.been.calledThrice;
    });
  });
});
