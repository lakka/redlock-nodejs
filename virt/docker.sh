#!/bin/sh
gpasswd -a vagrant docker
service docker restart
