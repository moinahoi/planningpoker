#!/bin/sh
# Runs from the nginx image entrypoint: activate nginx.$DEPLOYMENT_ENV.conf (fails fast if missing).
set -eu
cp "/etc/nginx/conf-available/nginx.${DEPLOYMENT_ENV}.conf" /etc/nginx/conf.d/default.conf
echo "Using nginx.${DEPLOYMENT_ENV}.conf"
