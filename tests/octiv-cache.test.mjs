/**
 * Octiv WOD cache tests.
 *
 * `src/lib/octiv/cache.ts` exists to keep the app from asking Octiv the same
 * question repeatedly, so what is worth pinning down is when it answers from
 * store and when it steps aside:
 *
 *   · entries are indexed by the parameters that vary the request
 *   · a published day is served for half a day, then expires
 *   · "the box published nothing" is a cached answer too, not a miss
 *   · except for today and later, where it expires quickly — that answer changes
 *   · a device with no usable localStorage degrades to no cache, never to a crash
 *
 * The module imports types only, so Node's built-in type stripping runs it
 * directly and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:octiv-cache
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

/** The parts of the Storage interface this module uses. */
function fakeStorage({ failWrites = false } = {}) {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => {
      if (failWrites) {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      }
      items.set(key, String(value));
    },
    removeItem: (key) => void items.delete(key),
    get size() {
      return items.size;
    },
    raw: items,
  };
}

// Installed before the import so the module's lazy `globalThis.localStorage`
// lookup finds it, and replaceable per test.
globalThis.localStorage = fakeStorage();

const {
  WOD_CACHE_TTL_MS,
  UNPUBLISHED_WOD_TTL_MS,
  clearWodCache,
  readCachedWod,
  wodCacheKey,
  writeCachedWod,
} = await import("../src/lib/octiv/cache.ts");

/** 2026-08-13, 12:00 local — the sample day the mapping tests also use. */
const NOW = new Date(2026, 7, 13, 12, 0, 0).getTime();

const PARAMS = { tenantId: 101219, programmeId: 432, dateKey: "2026-08-13" };
const WOD = { id: 660834, date: "2026-08-13", tenantId: 101219 };

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
});

describe("wodCacheKey", () => {
  it("is indexed by every parameter that varies the request", () => {
    assert.equal(wodCacheKey(PARAMS), "101219/432/2026-08-13");

    const keys = new Set([
      wodCacheKey(PARAMS),
      wodCacheKey({ ...PARAMS, dateKey: "2026-08-14" }),
      wodCacheKey({ ...PARAMS, programmeId: 433 }),
      wodCacheKey({ ...PARAMS, tenantId: 1 }),
    ]);

    assert.equal(keys.size, 4, "a differing parameter must not collide");
  });
});

describe("readCachedWod", () => {
  it("misses when nothing has been written", () => {
    assert.equal(readCachedWod(PARAMS, NOW), null);
  });

  it("serves a written day back", () => {
    writeCachedWod(PARAMS, WOD, NOW);

    assert.deepEqual(readCachedWod(PARAMS, NOW), { wod: WOD });
  });

  it("serves it for half a day, and not a moment past", () => {
    writeCachedWod(PARAMS, WOD, NOW);

    const lastMoment = NOW + WOD_CACHE_TTL_MS - 1;
    assert.deepEqual(readCachedWod(PARAMS, lastMoment), { wod: WOD });
    assert.equal(readCachedWod(PARAMS, NOW + WOD_CACHE_TTL_MS), null);
  });

  it("answers only the parameters it was asked about", () => {
    writeCachedWod(PARAMS, WOD, NOW);

    assert.equal(
      readCachedWod({ ...PARAMS, dateKey: "2026-08-14" }, NOW),
      null,
      "a neighbouring day is a different question",
    );
  });

  it("treats a cached empty day as a hit, not a miss", () => {
    // The distinction the wrapper object exists for: without it every day the
    // box published nothing would be re-fetched on every visit.
    writeCachedWod({ ...PARAMS, dateKey: "2026-07-04" }, null, NOW);

    assert.deepEqual(readCachedWod({ ...PARAMS, dateKey: "2026-07-04" }, NOW), {
      wod: null,
    });
  });
});

describe("writeCachedWod", () => {
  it("keeps an empty past day for the full half day — nothing can be published to it", () => {
    const past = { ...PARAMS, dateKey: "2026-07-04" };
    writeCachedWod(past, null, NOW);

    assert.deepEqual(readCachedWod(past, NOW + WOD_CACHE_TTL_MS - 1), {
      wod: null,
    });
  });

  it("expires an empty today quickly, so programming posted later shows up", () => {
    writeCachedWod(PARAMS, null, NOW);

    assert.deepEqual(readCachedWod(PARAMS, NOW + UNPUBLISHED_WOD_TTL_MS - 1), {
      wod: null,
    });
    assert.equal(readCachedWod(PARAMS, NOW + UNPUBLISHED_WOD_TTL_MS), null);
  });

  it("expires an empty future day quickly too", () => {
    const future = { ...PARAMS, dateKey: "2026-08-20" };
    writeCachedWod(future, null, NOW);

    assert.equal(readCachedWod(future, NOW + UNPUBLISHED_WOD_TTL_MS), null);
  });

  it("keeps a published day for the full half day even when it is today", () => {
    writeCachedWod(PARAMS, WOD, NOW);

    assert.deepEqual(readCachedWod(PARAMS, NOW + UNPUBLISHED_WOD_TTL_MS), {
      wod: WOD,
    });
  });

  it("replaces the entry for the same parameters rather than growing", () => {
    writeCachedWod(PARAMS, WOD, NOW);
    const updated = { ...WOD, name: "Reprogrammed" };
    writeCachedWod(PARAMS, updated, NOW + 1000);

    assert.deepEqual(readCachedWod(PARAMS, NOW + 1000), { wod: updated });
    assert.equal(globalThis.localStorage.size, 1, "one storage key throughout");
  });

  it("drops expired entries as it goes, so the store does not grow forever", () => {
    for (let day = 1; day <= 20; day += 1) {
      const dateKey = `2026-06-${String(day).padStart(2, "0")}`;
      writeCachedWod({ ...PARAMS, dateKey }, WOD, NOW);
    }

    // A write well past their expiry should carry none of them forward.
    const later = NOW + WOD_CACHE_TTL_MS + 1;
    writeCachedWod({ ...PARAMS, dateKey: "2026-08-14" }, WOD, later);

    const stored = JSON.parse(
      globalThis.localStorage.getItem("forge.octiv.wods.v1"),
    );
    assert.deepEqual(Object.keys(stored), ["101219/432/2026-08-14"]);
  });

  it("keeps the store within its cap", () => {
    // 250 days, all live, against a 200 cap.
    for (let day = 0; day < 250; day += 1) {
      const date = new Date(2026, 0, 1 + day);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      writeCachedWod({ ...PARAMS, dateKey }, WOD, NOW + day);
    }

    const stored = JSON.parse(
      globalThis.localStorage.getItem("forge.octiv.wods.v1"),
    );
    assert.ok(
      Object.keys(stored).length <= 200,
      `expected at most 200 entries, found ${Object.keys(stored).length}`,
    );
  });
});

describe("clearWodCache", () => {
  it("forgets everything, so a disconnected account leaves nothing behind", () => {
    writeCachedWod(PARAMS, WOD, NOW);
    writeCachedWod({ ...PARAMS, dateKey: "2026-08-12" }, WOD, NOW);

    clearWodCache();

    assert.equal(readCachedWod(PARAMS, NOW), null);
    assert.equal(readCachedWod({ ...PARAMS, dateKey: "2026-08-12" }, NOW), null);
    assert.equal(globalThis.localStorage.size, 0);
  });
});

describe("a store that cannot be relied on", () => {
  it("reads through corrupt contents instead of throwing", () => {
    globalThis.localStorage.setItem("forge.octiv.wods.v1", "{not json");

    assert.equal(readCachedWod(PARAMS, NOW), null);

    // And is recoverable: the next write starts a clean file.
    writeCachedWod(PARAMS, WOD, NOW);
    assert.deepEqual(readCachedWod(PARAMS, NOW), { wod: WOD });
  });

  it("ignores entries that are not well-formed", () => {
    globalThis.localStorage.setItem(
      "forge.octiv.wods.v1",
      JSON.stringify({
        [wodCacheKey(PARAMS)]: { wod: WOD },
        "101219/432/2026-08-12": "nonsense",
      }),
    );

    assert.equal(readCachedWod(PARAMS, NOW), null, "no expiry means no trust");
    assert.equal(readCachedWod({ ...PARAMS, dateKey: "2026-08-12" }, NOW), null);
  });

  it("drops the cache rather than serving a file it can no longer update", () => {
    writeCachedWod(PARAMS, WOD, NOW);

    const stored = globalThis.localStorage.raw.get("forge.octiv.wods.v1");
    const failing = fakeStorage({ failWrites: true });
    failing.raw.set("forge.octiv.wods.v1", stored);
    globalThis.localStorage = failing;

    assert.doesNotThrow(() =>
      writeCachedWod({ ...PARAMS, dateKey: "2026-08-14" }, WOD, NOW),
    );
    assert.equal(readCachedWod(PARAMS, NOW), null, "stale file was let go");
  });

  it("degrades to no cache when there is no storage at all", () => {
    delete globalThis.localStorage;

    assert.equal(readCachedWod(PARAMS, NOW), null);
    assert.doesNotThrow(() => writeCachedWod(PARAMS, WOD, NOW));
    assert.doesNotThrow(() => clearWodCache());
  });

  it("survives storage that throws on access, as Safari does with cookies blocked", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });

    try {
      assert.equal(readCachedWod(PARAMS, NOW), null);
      assert.doesNotThrow(() => writeCachedWod(PARAMS, WOD, NOW));
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: fakeStorage(),
      });
    }
  });
});
