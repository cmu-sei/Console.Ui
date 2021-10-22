#!/bin/sh
set -e
FILE=/usr/share/nginx/html/assets/config/settings.env.json
if [[ ! -e "$FILE" ]] && [[ -w "$FILE" ]]; then 
  echo $SETTINGS > /usr/share/nginx/html/assets/config/settings.env.json
fi
