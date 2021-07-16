#!/bin/sh
set -e
echo $SETTINGS
echo $SETTINGS > /usr/share/nginx/html/assets/config/settings.env.json
ls /usr/share/nginx/html/assets/config
cat /usr/share/nginx/html/assets/config/settings.env.json
nginx -g "daemon off;"