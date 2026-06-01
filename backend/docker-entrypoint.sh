#!/bin/bash
# Container entrypoint. Runs alembic migrations idempotently before starting
# the uvicorn server, so a fresh DB doesn't crash with "no such table".
#
# `alembic upgrade head` is a no-op when there's nothing to apply, so this
# is safe to run on every container start.
set -e

cd /app
echo "[entrypoint] Running alembic migrations..."
alembic upgrade head

echo "[entrypoint] Starting: $*"
exec "$@"
