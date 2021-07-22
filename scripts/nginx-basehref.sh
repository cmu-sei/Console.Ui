#!/bin/sh
set -e
src=/var/www
basehref=`echo $APP_BASEHREF | sed -e s,^/,, -e s,/$,,`
if [ -n "$basehref" ]; then
  sed -i "s,base\ href=\"/\",base\ href=\"/$basehref/\"," $src/index.html
  dst=$src/$basehref
  mkdir -p `dirname $dst`
  ln -s $src $dst
fi
