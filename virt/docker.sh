#!/bin/sh
gpasswd -a vagrant docker
service docker restart

# Build redis docker image
docker build -t redis /vagrant/virt/redis
