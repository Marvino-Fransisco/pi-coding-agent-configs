#!/bin/sh
set -e

if [ -n "$GIT_USERNAME" ]; then
    git config --global user.name "$GIT_USERNAME"
fi

if [ -n "$GIT_EMAIL" ]; then
    git config --global user.email "$GIT_EMAIL"
fi

exec "$@"
