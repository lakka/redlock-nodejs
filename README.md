# multiredlock [![Build Status](https://travis-ci.org/lakka/redlock-nodejs.svg?branch=master)](https://travis-ci.org/lakka/redlock-nodejs)
A distributed lock algorithm for redis, see http://redis.io/topics/distlock

## Install
`npm install multiredlock`

## Usage
Simple example, which can be found in `example.js`:

```js
    var Redlock = require('multiredlock');
    
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
```

## API

### Events
- `connect`: emitted when multiredlock has connected to at least `N/2 + 1` redis-servers, where `N` is the total amount of servers supplied to multiredlock. In other words, `connect` will be emitted when multiredlock is able to acquire locks.
- `disconnect`: emitted when multiredlock is connected to less than `N/2 + 1` redis-servers, meaning that it will not be able to acquire locks. However, unlocking currently locked resources is possible.

### Variables
- `connected`: `true`, when connected to at least `N/2 + 1` redis-servers, `false` otherwise.

### Constructor
The constructor takes two arguments, an array `servers` and an object `options`:
- new Redlock() = new Redlock([{host:'localhost', port:6379}]);
- new Redlock([{host:'192.168.0.100', port:6380}, {host:'example.com', port:6379}, {host:'localhost', port:6381}], options); will connect to three redis-servers residing at `192.168.0.100`, `example.com` and `localhost`.

One may omit the `port`-property from the server object. Multiredlock will then will assume port number `6379`.

The object `options` may have the following properties:
- `id`: an optional ID to give for this instance of multiredlock. Is used in identifying locks. Defaults to the machine's hostname.
- `debug`: run multiredlock in debug mode.

### redlock.setRetry(retries, retryWait)
Sets the amount of retries and the maximum time to wait between retries when acquiring a lock. The default is 3 retries with 100ms maximum wait between them. This means that multiredlock will try to acquire a lock 4 times before giving up. Setting `retries` to 0 will disable retrying.

### redlock.lock(resource, ttl, callback)
Will try to acquire a lock for `resource`. The lock will be acquired if `N/2 + 1` redis-servers approve of the locking attempt (in other words, they don't think the resource is already locked). Will retry acquiring lock if it is not granted at first time according to retry policies, see `redlock.setRetry`.

- `resource`: the name of the resource to lock, arbitrary but must be a string.
- `ttl`: Time To Live, the amount of milliseconds before the lock is released, should the resource not be unlocked with `redlock.unlock` before that.
- `callback`: will be called with `callback(err, lock)`, where:
    - `err`: error message if the lock was not acquired. `null` if lock was acquired.
    - `lock`: an object detailing the acquired lock. Has the following properties:
        - `validity`: how long the lock is valid, in milliseconds.
        - `resource`: the name of the resource that was locked.
        - `value`: unique id for the acquired lock. Needed when unlocking a resource or renewing the lock.

### redlock.renew(resource, value, ttl, callback)
Sets a new TTL for an existing lock.

- `resource`: name of the locked resource
- `value`: value of the lock to renew. Can be found in the `lock` object provided by `redlock.lock`.
- `ttl`: new Time To Live value for the lock in milliseconds.
- `callback`: will be called with `callback(err, lock)`, where:
    - `err`: error message if the lock was not renewed. `null` if lock was renewed.
    - `lock`: an object detailing the renewed lock. Has the following properties:
        - `validity`: how long the lock is valid, in milliseconds.
        - `resource`: the name of the resource that had its lock renewed.
        - `value`: same as the value of the lock before renewing.

Example:
```js
    redlock.lock('test', 200, function(err, lock) {
        // Do some stuff with resource 'test'...
        // Realize that this stuff is going to take longer than 200ms
        redlock.renew('test', lock.value, 200, function(err, lock) {
            // If no errors occured, lock.validity is now a little less than 200ms
        }
    }
```

### redlock.unlock(resource, value)
Unlocks a resource.

- `resource`: the name of the resource to unlock.
- `value`: the unique id of the lock to release. See `redlock.lock`.

Notice: unlock does not provide a callback, for unlocking attempts are best-effort, and there is no guarantee that the resource will be unlocked.

## Tests
This project has integration and failover tests implemented with Vagrant and Docker.
The tests simulate a production environment where redis servers may crash.

To run these tests, your CPU needs to support VT-x, and you need at least 4GB memory.
You also must have VirtualBox and Vagrant installed.

    $ vagrant up
      (be patient...)
    $ vagrant ssh
  
    redlock:~$ cd redlock
    redlock:~$ npm install
    redlock:~$ npm test

If you wish to run only unit tests, you can do so by issuing `mocha test/unit.js` in the project root.
