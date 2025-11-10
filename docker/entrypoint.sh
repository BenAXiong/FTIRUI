#!/usr/bin/env sh
set -e

python apps/ftirui/manage.py migrate --noinput

exec "$@"
