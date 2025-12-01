#!/usr/bin/env bash
# .platform/hooks/postdeploy/00_get_certificate.sh
sudo certbot -n -d ella-rises.com --nginx --agree-tos --email jakewright989@gmail.com