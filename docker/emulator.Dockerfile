# syntax=docker/dockerfile:1.7
#
# Firebase Emulator Suite.
#
# The emulators for Firestore and Auth are Java programs. Bundling a JRE here
# means contributors never install Java on their own machine — `make dev` works
# on a clean laptop.

FROM node:22-bookworm-slim

# default-jre-headless is what the Firestore/Auth emulator JARs require.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      default-jre-headless \
      ca-certificates \
      curl \
 && rm -rf /var/lib/apt/lists/*

# Pinned so every contributor and CI run gets identical emulator behaviour.
ARG FIREBASE_TOOLS_VERSION=13.29.1
RUN npm install -g firebase-tools@${FIREBASE_TOOLS_VERSION} \
 && npm cache clean --force

# Pre-download the emulator JARs into the image. Without this, the first
# `make dev` spends a minute fetching them and fails entirely when offline.
ENV FIREBASE_EMULATORS_PATH=/opt/firebase-emulators
RUN firebase setup:emulators:firestore \
 && firebase setup:emulators:ui

WORKDIR /workspace

COPY docker/emulator-entrypoint.sh /usr/local/bin/emulator-entrypoint
RUN chmod +x /usr/local/bin/emulator-entrypoint

# auth · firestore · ui · hub · logging
EXPOSE 9099 8080 4000 4400 4500

ENTRYPOINT ["/usr/local/bin/emulator-entrypoint"]
