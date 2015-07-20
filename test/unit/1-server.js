var chai = require("chai");
var expect = chai.expect;
var sinon = require('sinon');
chai.use(require('sinon-chai'));
var redis = require('redis');
var async = require('async');
var Redlock = require('../../index');
var EventEmitter = require('events').EventEmitter

describe('(unit) Redlock with one server', function() {
  var sandbox = sinon.sandbox.create();
  var redisStub, redlock, clientStub, setSpy;
  beforeEach(function() {
    clientStub = sandbox.stub(redis.createClient().on('error', function() {}));
    clientStub.on.restore();
    clientStub.emit.restore();
    clientStub.set.onFirstCall().yields(null, 'OK');
    clientStub.set.onSecondCall().yields();
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

  describe('lock()', function() {
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
      redlock = new Redlock([{host:'localhost', port:6739}]);
      redlock.setRetry(2, 100);
      clientStub.set.onFirstCall().yields();
      clientStub.set.onSecondCall().yields();
      clientStub.set.onThirdCall().yields(null, 'OK');
      redlock.lock('test', 1000, function(err, res) {
        expect(clientStub.set).to.have.been.calledThrice;
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
  describe('renew()', function() {
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
  
  describe('unlock()', function() {
    it('should call redisClient.eval once', function() {
      redlock.unlock('test', 'value', function() {});
      expect(clientStub.eval).to.have.been.calledOnce;
    });
  });
});
