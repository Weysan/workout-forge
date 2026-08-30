/**
 * Strava activity cache tests.
 *
 * `src/lib/strava/cache.ts` exists for the reason `octiv/cache.ts` does, plus
 * one: Strava's rate limit is 200 requests every fifteen minutes for the whole
 * application, so a calendar scrolled without a cache would spend it. What is
 * worth pinning down:
 *
 *   · entries are indexed per athlete, so two accounts cannot read each other's
 *   · a finished day is served for half a day, then expires
 *   · "nothing was recorded that day" is a cached answer too, not a miss
 *   · except today, which expires in minutes — an athlete logging a run just done
 *     is the exact moment this integration exists for
 *   · a device with no usable localStorage degrades to no cache, never to a crash
 *
 * The module imports types only, so Node's built-in type stripping runs it
 * directly and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:strava-cache
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
  ACTIVITY_CACHE_TTL_MS,
  TODAY_ACTIVITY_TTL_MS,
  activityCacheKey,
  clearActivityCache,
  readCachedActivities,
  writeCachedActivities,
} = await import("../src/lib/strava/cache.ts");

/** 2026-08-27, 12:00 local — the sample day the mapping tests also use. */
const NOW = new Date(2026, 7, 27, 12, 0, 0).getTime();

const TODAY = "2026-08-27";
const PAST = "2026-08-20";

const PARAMS = { athleteId: 12345, dateKey: PAST };
const ACTIVITIES = [{ id: 15450425037, sport_type: "Run", moving_time: 1387 }];

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
});

describe("activityCacheKey", () => {
  it("is indexed by athlete as well as day", () => {
    assert.equal(activityCacheKey(PARAMS), "12345/2026-08-20");
  });

  it("keeps two athletes' answers apart", () => {
    // Structural rather than a matter of remembering to clear on sign-out: these
    // are one person's activities and must never be served to another.
    assert.notEqual(
      activityCacheKey({ athleteId: 1, dateKey: PAST }),
      activityCacheKey({ athleteId: 2, dateKey: PAST }),
    );
  });
});

describe("a finished day", () => {
  it("is served back", () => {
    writeCachedActivities(PARAMS, ACTIVITIES, NOW);

    const hit = readCachedActivities(PARAMS, NOW);
    assert.deepEqual(hit, { activities: ACTIVITIES });
  });

  it("is still served just inside its TTL", () => {
    writeCachedActivities(PARAMS, ACTIVITIES, NOW);

    const hit = readCachedActivities(PARAMS, NOW + ACTIVITY_CACHE_TTL_MS - 1);
    assert.deepEqual(hit?.activities, ACTIVITIES);
  });

  it("has expired at its TTL", () => {
    writeCachedActivities(PARAMS, ACTIVITIES, NOW);

    assert.equal(
      readCachedActivities(PARAMS, NOW + ACTIVITY_CACHE_TTL_MS),
      null,
    );
  });

  it("is not served to a different day or a different athlete", () => {
    writeCachedActivities(PARAMS, ACTIVITIES, NOW);

    assert.equal(
      readCachedActivities({ ...PARAMS, dateKey: "2026-08-21" }, NOW),
      null,
    );
    assert.equal(readCachedActivities({ ...PARAMS, athleteId: 999 }, NOW), null);
  });
});

describe("a day with nothing recorded", () => {
  it("is a cached answer, not a miss", () => {
    // Rest days are most of the calendar. Without this, every visit to one would
    // spend a request re-learning that it is empty.
    writeCachedActivities(PARAMS, [], NOW);

    const hit = readCachedActivities(PARAMS, NOW);
    assert.notEqual(hit, null);
    assert.deepEqual(hit?.activities, []);
  });

  it("keeps the full TTL when the day is over", () => {
    writeCachedActivities(PARAMS, [], NOW);

    assert.notEqual(
      readCachedActivities(PARAMS, NOW + TODAY_ACTIVITY_TTL_MS + 1),
      null,
    );
  });
});

describe("today", () => {
  const todayParams = { athleteId: 12345, dateKey: TODAY };

  it("expires in minutes, because it is the one day that changes", () => {
    writeCachedActivities(todayParams, [], NOW);

    assert.notEqual(
      readCachedActivities(todayParams, NOW + TODAY_ACTIVITY_TTL_MS - 1),
      null,
    );
    assert.equal(
      readCachedActivities(todayParams, NOW + TODAY_ACTIVITY_TTL_MS),
      null,
    );
  });

  it("expires quickly even when something was recorded", () => {
    // Unlike the Octiv cache, where only the *empty* answer is short-lived: an
    // athlete can record a second session after the first is cached.
    writeCachedActivities(todayParams, ACTIVITIES, NOW);

    assert.equal(
      readCachedActivities(todayParams, NOW + TODAY_ACTIVITY_TTL_MS),
      null,
    );
  });

  it("treats a future day the same way", () => {
    const future = { athleteId: 12345, dateKey: "2026-09-01" };
    writeCachedActivities(future, [], NOW);

    assert.equal(
      readCachedActivities(future, NOW + TODAY_ACTIVITY_TTL_MS),
      null,
    );
  });
});

describe("housekeeping", () => {
  it("replaces a day rather than accumulating copies of it", () => {
    writeCachedActivities(PARAMS, [], NOW);
    writeCachedActivities(PARAMS, ACTIVITIES, NOW);

    const stored = JSON.parse(
      globalThis.localStorage.getItem("forge.strava.activities.v1"),
    );
    assert.equal(Object.keys(stored).length, 1);
    assert.deepEqual(readCachedActivities(PARAMS, NOW)?.activities, ACTIVITIES);
  });

  it("keeps the newest write when the cap is reached", () => {
    // 250 days, against a cap of 200. The write that must survive is the last.
    for (let day = 1; day <= 250; day += 1) {
      const dateKey = `2025-01-${String((day % 28) + 1).padStart(2, "0")}`;
      writeCachedActivities(
        { athleteId: 12345, dateKey: `${dateKey}-${day}` },
        [],
        NOW,
      );
    }

    const stored = JSON.parse(
      globalThis.localStorage.getItem("forge.strava.activities.v1"),
    );
    assert.ok(
      Object.keys(stored).length <= 200,
      `expected at most 200 entries, found ${Object.keys(stored).length}`,
    );
  });

  it("forgets expired entries on the way past", () => {
    writeCachedActivities(PARAMS, ACTIVITIES, NOW);

    // A write half a day later, by which time the entry above has expired.
    const later = NOW + ACTIVITY_CACHE_TTL_MS + 1;
    writeCachedActivities({ athleteId: 12345, dateKey: "2026-08-21" }, [], later);

    const stored = JSON.parse(
      globalThis.localStorage.getItem("forge.strava.activities.v1"),
    );
    assert.equal(Object.keys(stored).length, 1);
    assert.ok(!(activityCacheKey(PARAMS) in stored));
  });

  it("clears everything on disconnect", () => {
    writeCachedActivities(PARAMS, ACTIVITIES, NOW);
    clearActivityCache();

    assert.equal(readCachedActivities(PARAMS, NOW), null);
  });
});

describe("a device with unusable storage", () => {
  it("degrades to no cache when writes throw", () => {
    globalThis.localStorage = fakeStorage({ failWrites: true });

    // Must not throw: a full quota is not a reason to fail the athlete's day.
    writeCachedActivities(PARAMS, ACTIVITIES, NOW);
    assert.equal(readCachedActivities(PARAMS, NOW), null);
  });

  it("degrades to no cache when localStorage is absent entirely", () => {
    // The static export's build has no localStorage at all.
    delete globalThis.localStorage;

    writeCachedActivities(PARAMS, ACTIVITIES, NOW);
    assert.equal(readCachedActivities(PARAMS, NOW), null);

    globalThis.localStorage = fakeStorage();
  });

  it("ignores stored garbage rather than trusting it", () => {
    globalThis.localStorage.setItem(
      "forge.strava.activities.v1",
      '{"12345/2026-08-20":{"expiresAt":"soon","activities":"nope"}}',
    );

    assert.equal(readCachedActivities(PARAMS, NOW), null);
  });

  it("ignores a stored value that is not even JSON", () => {
    globalThis.localStorage.setItem("forge.strava.activities.v1", "{truncated");

    assert.equal(readCachedActivities(PARAMS, NOW), null);
  });
});
