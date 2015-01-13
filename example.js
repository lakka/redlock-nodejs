var Redlock = require('./index');

var rlock = new Redlock([{host:'localhost', port:6379}])
rlock.lock('sinep', 10000, console.log);
