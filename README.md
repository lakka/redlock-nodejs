# redlock-nodejs [![Build Status](https://travis-ci.org/lakka/redlock-nodejs.svg?branch=master)](https://travis-ci.org/lakka/redlock-nodejs)
A distributed lock algorithm for redis, see http://redis.io/topics/distlock

### Install dependencies
`npm install`

### Run integration tests
This project has integration tests implemented with Vagrant and Docker.
The tests simulate a production environment where redis servers may crash.

To run these tests, your CPU needs to support VT-x, and you need at least 4GB memory.
You also must have VirtualBox and Vagrant installed.

    $ vagrant up
      (be patient...)
    $ vagrant ssh
  
    redlock:~$ cd redlock
    redlock:~$ npm install
    redlock:~$ npm test
