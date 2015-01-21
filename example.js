var Redlock = require('./index');

var redlock = new Redlock([{host:'localhost', port:6379}])

redlock.on('connect', function() { 
  // Let's lock resource 'console' for 10 seconds!
  redlock.lock('console', 10000, function(err, lock) {
    if(err) {
      console.log(err);
      return;
    }

    // Do some stuff with the resource...
    console.log(lock);

    // Release lock when you're done with the resource
    redlock.unlock('console', lock.value);
  });
});
