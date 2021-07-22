#!/bin/sh
set -e
echo $SETTINGS > /usr/share/nginx/html/assets/config/settings.env.json
nginx -g "daemon off;"