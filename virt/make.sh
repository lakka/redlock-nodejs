#!/bin/bash
# Take a clean snapshot of the git repository for testing.

DIR=$HOME/redlock

mkdir -p $DIR
git clone /vagrant redlock

cd $DIR
