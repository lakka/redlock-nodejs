var chai = require("chai");
var expect = chai.expect;
var sinon = require('sinon');
chai.use(require('sinon-chai'));
var redis = require('redis');
var async = require('async');
var Redlock = require('../index');

describe('(unit) Redlock with one server', function() {
  var sandbox = sinon.sandbox.create();
  var redisStub, redlock, clientStub, setSpy;
  beforeEach(function() {
    clientStub = sandbox.stub(redis.createClient().on('error', function() {}));
    clientStub.set.onFirstCall().yields(null, 'OK');
    clientStub.set.onSecondCall().yields();
    clientStub.emit('ready');
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
    it('should retry on fail', function() {
      clientStub.set.onFirstCall().yields();
      clientStub.set.onSecondCall().yields(null, 'OK');
      redlock.lock('test', 1000, function(err, res) {
        expect(clientStub.set).to.have.been.calledTwice;
      });
    });
    it('should try to lock three times if retries: 2 set', function() {
      redlock = new Redlock([{host:'localhost', port:6739}],
                            {retries:2});
      clientStub.set.onFirstCall().yields();
      clientStub.set.onSecondCall().yields();
      clientStub.set.onThirdCall().yields(null, 'OK');
      redlock.lock('test', 1000, function(err, res) {
        expect(clientStub.set).to.have.been.calledThrice;
      });
    });
  });

  describe('#renew()', function() {
    it('should call clientStub.eval once', function() {
      redlock.lock('test', 1000, function(err, lock) {
        if(err) return;
        redlock.renew('test', lock.value, 100, function() {
          expect(clientStub.eval).to.have.been.calledOnce;
        });
      });
    });
    it('should err if resource does not exist', function(done) {
      clientStub.eval.onFirstCall().yields(null, 0);
      redlock.renew('test', 'randomVal', 100, function(err) {
        if(err) done();
        else done(new Error('callback was not called with error'));
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
      clientStub.emit('ready');
    });
    it('should emit disconnect if all servers go down', function(done) {
      redlock.on('disconnect', done);
      clientStub.emit('ready');
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
      clientStub.set.onSecondCall().yields(new Error('test error'));
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

  describe('#close()', function() {
    it('should call redisClient.quit thrice', function() {
      redlock.close();
      expect(clientStub.quit).to.have.been.calledThrice;
    });
  });
});
