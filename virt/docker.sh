#!/bin/sh
gpasswd -a vagrant docker
service docker restart

# Build redis docker image
cd $HOME/redlock
docker build -t redis virt/redis
