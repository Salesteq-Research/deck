#!/bin/bash
# Atomic deploy: build, clean old assets on prod, copy new ones
set -e

SSH="ssh -i /root/.ssh/id_bmw root@89.167.77.26"
SCP="scp -i /root/.ssh/id_bmw"
REMOTE_DIST="/root/bmw-chat/frontend/dist"

cd /root/bmw-chat/frontend

echo "Building..."
npm run build

echo "Cleaning old assets on prod..."
$SSH "rm -f $REMOTE_DIST/assets/index-*.js $REMOTE_DIST/assets/index-*.css"

echo "Deploying..."
$SCP -r dist/* root@89.167.77.26:$REMOTE_DIST/

echo "Verifying..."
$SSH "cat $REMOTE_DIST/index.html | grep -oP 'index-\w+\.(js|css)'"

echo "Done."
