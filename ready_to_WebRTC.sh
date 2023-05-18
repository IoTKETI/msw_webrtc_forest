#!/usr/bin/sh

sudo rpi-update -y

OS="`uname -a`"
CHECK_OS="`echo $OS | cut -d" " -f1`"

echo  ${CHECK_OS}

sudo apt-get purge -y chromium-browser
sudo apt-get install -y chromium-browser
sudo apt-get install -y chromium-chromedriver
