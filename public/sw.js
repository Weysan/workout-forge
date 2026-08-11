/**
 * FORGE service worker.
 *
 * The app has to open and work with no connection at all — the gym is the primary
 * place it gets used. That means the whole shell (every route's HTML plus the JS
 * and CSS it needs) must be in the cache before the connection drops, not merely
 * cached opportunistically as pages are visited.
 *
 * `self.__FORGE_PRECACHE` below is replaced at build time by
 * scripts/generate-precache.mjs, which enumerates the real contents of `out/`.
 * Hand-maintaining that list would silently rot as routes and chunk names change.
 *
 * Strategies
 *   navigations   network-first, then this route's cached HTML, then /offline
 *   static assets cache-first (Next fingerprints them, so a URL never changes)
 *   Firestore/Auth never intercepted — the SDK owns its own offline queue, and
 *                 caching its traffic would corrupt that
 */

// Injected at build time. The placeholder keeps `npm run dev` working.
const PRECACHE_MANIFEST = self.__FORGE_PRECACHE || {
  version: "dev",
  assets: ["/offline", "/manifest.webmanifest"],
};

const VERSION = PRECACHE_MANIFEST.version;
const SHELL_CACHE = `forge-shell-${VERSION}`;
const RUNTIME_CACHE = `forge-runtime-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);

      // Individually, so one failed asset cannot abort the whole installation and
      // leave the app with no offline support at all.
      const results = await Promise.allSettled(
        PRECACHE_MANIFEST.assets.map((url) =>
          cache.add(new Request(url, { cache: "reload" })),
        ),
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.warn(`[forge sw] ${failed} asset(s) failed to precache`);
      }

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches belonging to previous builds.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Firebase and Google endpoints must reach the network untouched.
 *
 * Firestore maintains its own IndexedDB queue for offline writes and replays it
 * on reconnect. Intercepting or caching that traffic would break the guarantee
 * that a workout logged offline is uploaded later.
 */
function isFirebaseRequest(url) {
  return (
    url.hostname.endsWith("googleapis.com") ||
    url.hostname.endsWith("firebaseio.com") ||
    url.hostname.endsWith("firebaseapp.com") ||
    url.hostname.endsWith("google.com") ||
    url.hostname.endsWith("gstatic.com") ||
    // Local emulator ports.
    url.port === "8080" ||
    url.port === "9099"
  );
}

/** Maps a navigation request to the cache key its HTML was stored under. */
function shellKeyFor(url) {
  // `cleanUrls` serves /login from login.html, so the precache holds "/login".
  // Normalise a trailing slash and default the root to "/".
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path === "" ? "/" : path;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (isFirebaseRequest(url)) return;

  // --- Page navigations -------------------------------------------------
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);

        try {
          const response = await fetch(request);
          // Keep the shell copy fresh so the next offline visit is up to date.
          if (response.ok) {
            cache.put(shellKeyFor(url), response.clone());
          }
          return response;
        } catch {
          // Offline. Serve this route's own HTML so the app opens on the page the
          // user asked for, rather than the generic offline notice.
          const cached =
            (await cache.match(shellKeyFor(url))) ??
            (await cache.match(request));

          if (cached) return cached;

          // A route that was never precached or visited.
          return (
            (await cache.match(OFFLINE_URL)) ??
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })(),
    );
    return;
  }

  // --- Build assets -----------------------------------------------------
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      (async () => {
        // Cache-first: these URLs are content-addressed, so a hit is never stale
        // and this keeps the app instant on a slow connection as well as offline.
        const cached =
          (await caches.match(request, { cacheName: SHELL_CACHE })) ??
          (await caches.match(request, { cacheName: RUNTIME_CACHE }));
        if (cached) return cached;

        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })(),
    );
  }
});

// Lets a future in-app "update available" prompt activate a new worker.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
