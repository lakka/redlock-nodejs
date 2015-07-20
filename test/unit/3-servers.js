var chai = require("chai");
var expect = chai.expect;
var sinon = require('sinon');
chai.use(require('sinon-chai'));
var redis = require('redis');
var async = require('async');
var Redlock = require('../../index');
var EventEmitter = require('events').EventEmitter

describe('(unit) Redlock with three servers', function() {
  var sandbox = sinon.sandbox.create();
  var redisStub, redlock, clientStubs, servers;
  beforeEach(function() {
    servers = [
      {host:'jaakkomaa', port:2922},
      {host:'jakkomaa', port:3922},
      {host:'jaakomaa', port:2922}
    ];
    var count = 3;
    clientStubs = [];
    for(var i = 0; i < count; i++) {
      clientStubs[i] = sandbox.stub(redis.createClient().on('error', function() {}));
      clientStubs[i].on.restore();
      clientStubs[i].emit.restore();
    }
    redisStub = sandbox.stub(redis, 'createClient');
    for(var i = 0; i < count; i++) {
      redisStub.onCall(i).returns(clientStubs[i]);
    }
    redlock = new Redlock(servers);
  });

  afterEach(function() {
    sandbox.restore()
  });

  describe('events', function() {
    it('should emit connect when two servers are ready', function(done) {
      this.timeout(500);
      redlock.on('connect', done);;
      clientStubs[0].emit('ready');
      clientStubs[1].emit('ready');
    });
    it('should emit disconnect when connection count falls below two', function(done) {
      this.timeout(500);
      redlock.on('disconnect', done);;
      clientStubs.forEach(function (clientStub) {
        clientStub.emit('ready');
      });
      clientStubs[0].emit('end');
      clientStubs[1].emit('end');
    });
  });

  describe('constructor', function() {
    it('should call redis.createClient thrice', function() {
      expect(redisStub).to.have.been.calledThrice;
    });
  });
  describe('lock()', function() {
    it('should call set for each client', function() {
      redlock.lock('test', 500, function() {
        clientStubs.forEach(function (clientStub) {
          expect(clientStub.set).to.have.been.calledOnce;
        });
      });
    });
  });
  describe('unlock()', function() {
    it('should call eval for each client', function() {
      redlock.lock('test', 500, function(err, val) {
        redlock.unlock(val.resource, val.value);
        clientStubs.forEach(function (clientStub) {
          expect(clientStub.eval).to.have.been.calledOnce;
        });
      });
    });
  });
  describe('renew()', function() {
    it('should call eval for each client', function() {
      redlock.lock('test', 500, function(err, val) {
        redlock.renew(val.resource, val.value, 1000, function() {
          clientStubs.forEach(function (clientStub) {
            expect(clientStub.eval).to.have.been.calledOnce;
          });
        });
      });
    });
  });
  describe('disconnect()', function() {
    it('should call unref for all clients', function() {
      redlock.disconnect();
      clientStubs.forEach(function (clientStub) {
        expect(clientStub.unref).to.have.been.calledOnce;
      });
    });
  });
  describe('close()', function() {
    it('should call redisClient.quit thrice', function() {
      redlock.close();
      clientStubs.forEach(function (clientStub) {
        expect(clientStub.quit).to.have.been.calledOnce;
      });
    });
  });
});
