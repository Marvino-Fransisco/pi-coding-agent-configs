#!/bin/sh
set -e

if [ -n "$GIT_USERNAME" ]; then
    git config --global user.name "$GIT_USERNAME"
fi

if [ -n "$GIT_EMAIL" ]; then
    git config --global user.email "$GIT_EMAIL"
fi

if [ -f /home/node/.ssh/id_ed25519 ]; then
    chmod 600 /home/node/.ssh/id_ed25519
fi

exec "$@"
