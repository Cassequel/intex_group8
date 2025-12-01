#!/usr/bin/env bash
# .platform/hooks/postdeploy/00_get_certificate.sh
sudo certbot -n -d ellarises2-8-env.eba-agwgxmmh.us-east-2.elasticbeanstalk.com --nginx --agree-tos --email jakewright989@gmail.com