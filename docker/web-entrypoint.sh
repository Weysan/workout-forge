#!/bin/sh
# Keep the container's dependencies in step with the lockfile.
#
# `node_modules` lives in a named volume so that Linux-native binaries are not
# clobbered by the host's macOS build. The catch is that Docker only seeds a
# named volume when it is empty: after someone adds a dependency and re-runs
# `docker compose up --build`, the image has the new packages but the volume
# still holds the old ones, and the app fails with a confusing missing-module
# error.
#
# So compare the lockfile against what is actually installed, and reinstall when
# they disagree. Costs one checksum per start and removes a whole class of
# "works on my machine" reports.

set -eu

STAMP="/app/node_modules/.lockfile-checksum"
CURRENT="$(md5sum /app/package-lock.json | cut -d' ' -f1)"

if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$CURRENT" ]; then
  echo "→ lockfile changed since the last install; running npm ci"
  npm ci --no-audit --no-fund
  echo "$CURRENT" > "$STAMP"
  echo "✓ dependencies up to date"
fi

exec "$@"
