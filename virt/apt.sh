#!/bin/sh

cat >/etc/apt/sources.list <<EOL
deb http://archive.ubuntu.com/ubuntu trusty main universe
deb http://archive.ubuntu.com/ubuntu trusty-updates main universe
deb http://security.ubuntu.com/ubuntu trusty-security main universe
EOL

echo >/etc/apt/apt.conf.d/99translations <<EOL
Acquire::Languages "none";
EOL

export DEBIAN_FRONTEND=noninteractive

# latest docker
wget -qO- https://get.docker.io/gpg | apt-key add -
echo deb http://get.docker.io/ubuntu docker main > /etc/apt/sources.list.d/docker.list

apt-get update

apt-get remove --yes node

apt-get install --yes --no-install-recommends \
  lxc-docker \
  git \
  nodejs-legacy \
  npm \
  redis-server \
  redis-tools
