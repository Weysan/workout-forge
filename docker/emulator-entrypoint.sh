#!/bin/sh
# Start the Firebase emulator suite.
#
# EMULATOR_ONLY selects which emulators run, and defaults to the data ones:
#
#   auth,firestore   what `make dev` needs
#   hosting          what `make preview` needs, to serve out/ exactly as
#                    production does (cleanUrls, headers, 404 handling)
#
# The default deliberately excludes hosting. firebase.json declares a `hosting`
# block, so an unfiltered `emulators:start` would also try to serve `out/` — which
# does not exist until someone has run a build, and would fail on a fresh clone.
#
# Two things to know about `--export-on-exit`:
#
#   1. It recreates its target directory, which means it calls rmdir on it. If
#      that target is the bind-mount point itself, rmdir fails with EBUSY and the
#      export is lost on every shutdown — silently, because the emulator is
#      already on its way out. So we export into a subdirectory *inside* the
#      mount, which is an ordinary directory the CLI is free to replace.
#
#   2. `--import` fails hard on a directory that has never been exported to,
#      which is the state of every fresh clone. So we import only once a real
#      export exists.

set -eu

EMULATOR_ONLY="${EMULATOR_ONLY:-auth,firestore}"
DATA_ROOT="${EMULATOR_DATA_ROOT:-/workspace/.emulator-data}"
DATA_DIR="$DATA_ROOT/data"
PROJECT_ID="${FIREBASE_PROJECT_ID:-forge-local}"

set -- --only "$EMULATOR_ONLY"

# Persistence is only meaningful for the emulators that hold state.
case "$EMULATOR_ONLY" in
  *auth* | *firestore*)
    # Only the mount point — DATA_DIR is left for the CLI to create and replace.
    mkdir -p "$DATA_ROOT"

    if [ -f "$DATA_DIR/firebase-export-metadata.json" ]; then
      echo "→ importing existing emulator data from $DATA_DIR"
      set -- "$@" --import="$DATA_DIR"
    else
      echo "→ no previous emulator data found; starting with an empty project"
    fi

    set -- "$@" --export-on-exit="$DATA_DIR"
    ;;
esac

echo "→ starting emulators: $EMULATOR_ONLY"

# `exec` keeps firebase as PID 1 so it receives SIGTERM from `docker compose
# down` and gets the chance to export state before exiting.
exec firebase emulators:start --project "$PROJECT_ID" "$@"
