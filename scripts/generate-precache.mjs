/**
 * Injects a precache manifest into the exported service worker.
 *
 * Runs as `postbuild`, against `out/`. It enumerates what the build actually
 * produced — every route's HTML plus the JS/CSS/icons it needs — so the app shell
 * is complete in the cache before the connection drops.
 *
 * This has to be generated rather than hand-written: Next fingerprints chunk
 * filenames on every build, so a static list would be stale immediately and the
 * failure mode is silent (the app just doesn't open offline).
 *
 *   node scripts/generate-precache.mjs [outDir]
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT_DIR = process.argv[2] ?? "out";
const SW_PATH = join(OUT_DIR, "sw.js");

/** Files that are pointless or harmful to precache. */
function shouldSkip(urlPath) {
  return (
    // The worker cannot meaningfully cache itself.
    urlPath === "/sw.js" ||
    // Source maps are large and only used by devtools.
    urlPath.endsWith(".map")
  );
}

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      entries.push(...walk(full));
    } else {
      entries.push(full);
    }
  }
  return entries;
}

const files = walk(OUT_DIR);

const assets = [];

for (const file of files) {
  // Convert a filesystem path into the URL Hosting will serve it at.
  const urlPath = "/" + relative(OUT_DIR, file).split(sep).join("/");
  if (shouldSkip(urlPath)) continue;

  if (urlPath.endsWith(".html")) {
    // `cleanUrls` is enabled in firebase.json, so login.html is served at /login.
    // Precaching under the extensionless path is what lets the worker answer a
    // navigation to /login from cache.
    if (urlPath === "/index.html") {
      assets.push("/");
    } else if (urlPath === "/404.html") {
      // Reachable only as an error response; not a navigable route.
      continue;
    } else {
      assets.push(urlPath.replace(/\.html$/, ""));
    }
    continue;
  }

  // Everything else, including each route's `.txt` RSC payload. Those are what
  // an in-app link actually fetches — the App Router swaps the tree from the
  // flight data rather than navigating — so without them the app opens offline
  // but the bottom nav goes nowhere.
  assets.push(urlPath);
}

assets.sort();

// Version the caches by content, so a deploy that changes nothing does not force
// clients to re-download the shell, and one that changes anything does.
const version = createHash("sha256")
  .update(assets.join("\n"))
  .digest("hex")
  .slice(0, 12);

const manifest = { version, assets };

const source = readFileSync(SW_PATH, "utf8");

const PLACEHOLDER = "self.__FORGE_PRECACHE";
if (!source.includes(PLACEHOLDER)) {
  console.error(
    `[precache] ${SW_PATH} does not reference ${PLACEHOLDER}. ` +
      "The worker and this script have drifted apart; refusing to write a " +
      "service worker that would silently skip precaching.",
  );
  process.exit(1);
}

// Define the manifest ahead of the worker body so the existing
// `self.__FORGE_PRECACHE || {...}` fallback picks it up.
const banner = `self.__FORGE_PRECACHE = ${JSON.stringify(manifest)};\n`;
writeFileSync(SW_PATH, banner + source, "utf8");

const htmlCount = assets.filter((a) => !a.includes(".")).length;
console.log(
  `[precache] ${assets.length} assets (${htmlCount} routes) · version ${version}`,
);
