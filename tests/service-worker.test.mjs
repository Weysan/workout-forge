/**
 * Service worker offline-routing tests.
 *
 * Runs against the *built* worker in `out/sw.js`, after the precache manifest has
 * been injected by scripts/generate-precache.mjs. That is deliberate: the thing
 * worth testing is not the source but the artefact, including whether the
 * generated manifest and the worker's own path handling still agree.
 *
 * The failure this guards against is silent. If `shellKeyFor` and the manifest
 * disagree about how a route is keyed, every offline navigation quietly falls
 * through to the offline page instead of opening the app, and nothing errors.
 *
 *   npm run build && npm run test:sw
 */

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SW_PATH = process.env.SW_PATH ?? "out/sw.js";

let shellKeyFor;
let rscKeyFor;
let isRscPayload;
let isFirebaseRequest;
let manifest;
let cachedKeys;

before(() => {
  let source;
  try {
    source = readFileSync(SW_PATH, "utf8");
  } catch {
    throw new Error(
      `${SW_PATH} not found. Run \`npm run build\` before this suite — it tests ` +
        "the built worker, not the source.",
    );
  }

  const manifestMatch = source.match(/^self\.__FORGE_PRECACHE = (.*?);\n/s);
  assert.ok(
    manifestMatch,
    "no precache manifest was injected — did postbuild run?",
  );
  manifest = JSON.parse(manifestMatch[1]);
  cachedKeys = new Set(manifest.assets);

  // Lift the real function bodies out of the shipped file so the test cannot
  // drift from the code that actually runs.
  const lift = (name) => {
    const match = source.match(new RegExp(`function ${name}[\\s\\S]*?\\n}`));
    assert.ok(match, `${name} not found in ${SW_PATH}`);
    return new Function(`${match[0]}; return ${name};`)();
  };

  shellKeyFor = lift("shellKeyFor");
  rscKeyFor = lift("rscKeyFor");
  isRscPayload = lift("isRscPayload");
  isFirebaseRequest = lift("isFirebaseRequest");
});

describe("precache manifest", () => {
  it("has a content-derived version", () => {
    assert.match(manifest.version, /^[a-f0-9]{12}$/);
  });

  it("covers every navigable route", () => {
    for (const route of [
      "/",
      "/login",
      "/onboarding",
      "/performance",
      "/profile",
      "/workout/new",
      "/workout/edit",
      "/offline",
    ]) {
      assert.ok(cachedKeys.has(route), `${route} is not precached`);
    }
  });

  it("includes the JavaScript needed to boot those routes", () => {
    // HTML alone is useless: without the chunks the shell cannot hydrate offline.
    const scripts = manifest.assets.filter((a) => a.endsWith(".js"));
    assert.ok(scripts.length > 5, `only ${scripts.length} scripts precached`);
  });

  it("includes the RSC payload behind every in-app link", () => {
    // Tapping a nav item fetches `<route>.txt`, not the HTML. Precaching the
    // HTML alone makes the app openable offline but not navigable.
    for (const payload of [
      "/index.txt",
      "/performance.txt",
      "/profile.txt",
      "/workout/new.txt",
      "/workout/edit.txt",
    ]) {
      assert.ok(cachedKeys.has(payload), `${payload} is not precached`);
    }
  });

  it("does not try to cache the worker or source maps", () => {
    assert.ok(!cachedKeys.has("/sw.js"));
    assert.ok(manifest.assets.every((a) => !a.endsWith(".map")));
  });
});

describe("RSC payload routing", () => {
  it("recognises flight data and nothing else", () => {
    assert.equal(isRscPayload(new URL("https://forge.app/index.txt")), true);
    assert.equal(
      isRscPayload(new URL("https://forge.app/performance.txt?_rsc=1a2b3c")),
      true,
    );
    assert.equal(isRscPayload(new URL("https://forge.app/performance")), false);
    assert.equal(
      isRscPayload(new URL("https://forge.app/_next/static/chunks/main.js")),
      false,
    );
  });

  it("keys on the pathname, so the ?_rsc= cache-buster cannot orphan the copy", () => {
    // The precached key has no query; the runtime request always does. Keying
    // on the full URL would miss every time and offline navigation would fail.
    const key = rscKeyFor(new URL("https://forge.app/performance.txt?_rsc=9zx"));
    assert.equal(key, "/performance.txt");
    assert.ok(cachedKeys.has(key));
  });

  it("produces a cached key for each route the nav links to", () => {
    for (const route of ["/", "/performance", "/profile"]) {
      // Mirrors what the router requests: "/" becomes "/index.txt".
      const href = route === "/" ? "/index.txt" : `${route}.txt`;
      const key = rscKeyFor(new URL(`https://forge.app${href}?_rsc=abc`));
      assert.ok(cachedKeys.has(key), `${route} → ${key} is not precached`);
    }
  });
});

describe("shellKeyFor", () => {
  const cases = [
    ["https://forge.app/", "/"],
    ["https://forge.app/login", "/login"],
    ["https://forge.app/login/", "/login"],
    ["https://forge.app/performance", "/performance"],
    ["https://forge.app/workout/new", "/workout/new"],
    ["https://forge.app/workout/edit", "/workout/edit"],
    ["https://forge.app/workout/edit/", "/workout/edit"],
  ];

  for (const [href, expected] of cases) {
    it(`maps ${href} to ${expected}`, () => {
      assert.equal(shellKeyFor(new URL(href)), expected);
    });
  }

  it("produces keys that exist in the precache", () => {
    // The whole point: a navigation offline must find its HTML.
    for (const [href] of cases) {
      const key = shellKeyFor(new URL(href));
      assert.ok(cachedKeys.has(key), `${href} → ${key} is not precached`);
    }
  });

  it("ignores the query string, so ?id= still resolves offline", () => {
    const key = shellKeyFor(new URL("https://forge.app/workout/edit?id=abc123"));
    assert.equal(key, "/workout/edit");
    assert.ok(cachedKeys.has(key));
  });
});

describe("isFirebaseRequest", () => {
  it("passes Firebase traffic straight through", () => {
    // Intercepting these would break Firestore's own offline write queue.
    for (const href of [
      "https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents",
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp",
      "https://securetoken.googleapis.com/v1/token",
      "https://apis.google.com/js/api.js",
      "https://www.gstatic.com/firebasejs/x.js",
      "http://localhost:8080/google.firestore.v1.Firestore/Listen",
      "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts",
    ]) {
      assert.equal(
        isFirebaseRequest(new URL(href)),
        true,
        `${href} should not be intercepted`,
      );
    }
  });

  it("still handles the app's own assets", () => {
    for (const href of [
      "https://forge.app/_next/static/chunks/main.js",
      "https://forge.app/login",
      "https://forge.app/icons/icon-512.png",
    ]) {
      assert.equal(isFirebaseRequest(new URL(href)), false, href);
    }
  });
});
