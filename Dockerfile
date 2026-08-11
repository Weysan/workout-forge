# syntax=docker/dockerfile:1.7
#
# FORGE development image.
#
# There is no production stage here: `next build` emits a static site into `out/`
# and Firebase Hosting serves it from a CDN, so nothing about production runs in a
# container. To check a production build locally, use `make preview`, which serves
# `out/` through the Firebase Hosting emulator and therefore exercises the real
# hosting config rather than an approximation of it.

# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependencies
#
# Installed inside the image rather than mounted from the host: Tailwind v4
# ships platform-native binaries (@tailwindcss/oxide, lightningcss), so macOS
# node_modules cannot be reused in a Linux container.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./

# `npm ci` is deliberate — it installs exactly the lockfile, so the container and
# CI agree. The failure hint matters because npm's own message ("update your lock
# file with npm install") does not describe the usual cause here: an incremental
# `npm install <pkg>` / `npm uninstall <pkg>` on macOS can drop the hoisted
# entries that only Linux needs (e.g. @emnapi/*, required by @img/sharp-wasm32),
# producing a lockfile that resolves on the host but not in this image.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund || { \
      echo ""; \
      echo "───────────────────────────────────────────────────────────────"; \
      echo " npm ci failed inside the Linux container."; \
      echo ""; \
      echo " If it reports packages 'Missing ... from lock file', the"; \
      echo " lockfile was last written by an incremental npm command on a"; \
      echo " different platform and lost Linux-only optional entries."; \
      echo ""; \
      echo " Fix, on the host:"; \
      echo "   rm -rf node_modules package-lock.json && npm install"; \
      echo "   make dev"; \
      echo "───────────────────────────────────────────────────────────────"; \
      exit 1; \
    }

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
# Bind mounts on macOS/Windows do not deliver inotify events reliably.
ENV WATCHPACK_POLLING=true
ENV CHOKIDAR_USEPOLLING=true

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Record which lockfile these node_modules were built from, so the entrypoint can
# detect a drifted volume on start. See docker/web-entrypoint.sh.
RUN md5sum package-lock.json | cut -d' ' -f1 > node_modules/.lockfile-checksum

COPY docker/web-entrypoint.sh /usr/local/bin/web-entrypoint
RUN chmod +x /usr/local/bin/web-entrypoint

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/web-entrypoint"]
CMD ["npm", "run", "dev"]
