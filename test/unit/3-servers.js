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
  var redisStub, redlock, clientStubs, setSpy;
  beforeEach(function() {
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
    redlock = new Redlock([{host:'localhost', port:6739}]);
  });

  afterEach(function() {
    sandbox.restore()
  });

  describe('events', function() {
    it('should emit connect when 2 servers are ready', function(done) {
      this.timeout(500);
      redlock.on('connect', done);;
      clientStubs[0].emit('ready');
      clientStubs[1].emit('ready');
    });
    it('should emit disconnect when connection count falls to 1', function(done) {
      redlock.on('disconnect', done);;
      clientStubs.forEach(function (clientStub) {
        clientStub.emit('ready');
      });
      clientStubs[0].emit('end');
      clientStubs[1].emit('end');
    });
  });
});
