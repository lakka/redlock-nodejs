#!/bin/bash
# Take a clean snapshot of the git repository for testing.

DIR=$HOME/redlock

if [ ! -e $DIR ]; then
  git clone /vagrant $DIR
fi

cd $DIR
