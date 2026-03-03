#!/usr/bin/env sh
set -e

python apps/ftirui/manage.py migrate --noinput

if [ "$#" -eq 0 ]; then
  PORT="${PORT:-8000}"
  set -- gunicorn --chdir /app/apps/ftirui ftirui.wsgi:application --bind "0.0.0.0:${PORT}"
fi

exec "$@"
