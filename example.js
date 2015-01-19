var Redlock = require('./index');

var redlock = new Redlock([{host:'localhost', port:6379}]).on('connect', function() { 
  // Let's lock resource 'sinep' for 10 seconds!
  redlock.lock('sinep', 10000, console.log);
});
