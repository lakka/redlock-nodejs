#!/bin/sh
gpasswd -a vagrant docker
service docker restart
sleep 3

# Build redis docker images
docker build -t redis /vagrant/virt/redis
docker run -d --name redis-1 redis
docker run -d --name redis-2 redis
docker run -d --name redis-3 redis
