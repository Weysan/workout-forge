/**
 * A local cache for the athlete's activities, so browsing the calendar does not
 * re-ask Strava for the same day over and over.
 *
 * The same reasoning as `octiv/cache.ts`, which this deliberately mirrors: React
 * Query's cache lives in memory, so every reload of a PWA that gets killed and
 * relaunched constantly would start asking again from scratch.
 *
 * There is one extra reason to cache here that Octiv does not have. Strava
 * enforces a hard rate limit per application — 200 requests every fifteen
 * minutes — and unlike Octiv's, it is shared by everyone using this build. A
 * calendar scrolled without a cache would spend it.
 *
 * Unlike the Octiv cache, entries *are* user-specific: they are one athlete's
 * activities, and the key carries the athlete id to make that structural rather
 * than a matter of remembering to clear on sign-out.
 *
 * Import-free on purpose (types only, which are erased): Node's built-in type
 * stripping runs it directly in `tests/strava-cache.test.mjs`.
 */

import type { StravaActivity } from "./types";

/**
 * How long a finished day's activities are trusted.
 *
 * A day that is over does not gain sessions. It can in principle — a watch synced
 * late, an activity uploaded the next morning — so this is half a day rather than
 * forever, which bounds how long such a straggler stays invisible.
 */
export const ACTIVITY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * How long today's answer is trusted.
 *
 * Much shorter, because today is the one day that genuinely changes: an athlete
 * finishing a run and opening FORGE to log it is the exact moment this integration
 * exists for, and a twelve-hour cache would greet them with the empty day it saw
 * this morning.
 */
export const TODAY_ACTIVITY_TTL_MS = 5 * 60 * 1000;

const STORAGE_KEY = "forge.strava.activities.v1";

/** Cap on stored days. Same budget reasoning as the Octiv cache. */
const MAX_ENTRIES = 200;

/** The parameters that identify an activity request — and so index its entry. */
export interface ActivityCacheParams {
  athleteId: number;
  /** `YYYY-MM-DD`. */
  dateKey: string;
}

interface ActivityCacheEntry {
  /** `[]` records a day that was asked about and had nothing. */
  activities: StravaActivity[];
  expiresAt: number;
}

/** A cache hit. Wrapped so a cached empty day is not mistaken for a miss. */
export interface ActivityCacheHit {
  activities: StravaActivity[];
}

export function activityCacheKey({
  athleteId,
  dateKey,
}: ActivityCacheParams): string {
  return `${athleteId}/${dateKey}`;
}

// --- Storage -------------------------------------------------------------

/**
 * `localStorage`, when there is one to have.
 *
 * Absent during the static export's build, and *throwing* rather than absent in
 * Safari with cookies blocked — hence the try.
 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readAll(store: Storage): Record<string, ActivityCacheEntry> {
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    // Written by an older version, hand-edited, or truncated by a full disk:
    // anything that is not a well-formed entry is dropped rather than trusted.
    const entries: Record<string, ActivityCacheEntry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value === "object" &&
        typeof (value as ActivityCacheEntry).expiresAt === "number" &&
        Array.isArray((value as ActivityCacheEntry).activities)
      ) {
        entries[key] = value as ActivityCacheEntry;
      }
    }
    return entries;
  } catch {
    return {};
  }
}

function writeAll(store: Storage, entries: Record<string, ActivityCacheEntry>) {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Out of quota, most likely. A cache that cannot be updated is worse than no
    // cache — it would serve the same stale day forever — so drop it and let the
    // next fetch start clean.
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      // Nothing further to try; reads simply go to the network.
    }
  }
}

/** Forget expired entries, then the oldest, until at most `limit` remain. */
function prune(
  entries: Record<string, ActivityCacheEntry>,
  now: number,
  limit: number,
): Record<string, ActivityCacheEntry> {
  const live = Object.entries(entries).filter(
    ([, entry]) => entry.expiresAt > now,
  );

  if (live.length > limit) {
    live.sort((a, b) => b[1].expiresAt - a[1].expiresAt);
    live.length = limit;
  }

  return Object.fromEntries(live);
}

// --- Public API ----------------------------------------------------------

/**
 * The cached answer for these parameters, or `null` when there is none.
 *
 * A hit is `{ activities }`, where the array may be empty — meaning "asked, and
 * there was nothing that day". Without that distinction a rest day would be
 * re-fetched on every visit, and rest days are most of the calendar.
 */
export function readCachedActivities(
  params: ActivityCacheParams,
  now: number = Date.now(),
): ActivityCacheHit | null {
  const store = storage();
  if (!store) return null;

  const entry = readAll(store)[activityCacheKey(params)];
  if (!entry || entry.expiresAt <= now) return null;

  return { activities: entry.activities };
}

export function writeCachedActivities(
  params: ActivityCacheParams,
  activities: StravaActivity[],
  now: number = Date.now(),
): void {
  const store = storage();
  if (!store) return;

  // Today and anything later get the short TTL. A future day is included on
  // purpose: it is empty now, and its emptiness is worth almost nothing.
  const ttl =
    params.dateKey >= localDayKey(now)
      ? TODAY_ACTIVITY_TTL_MS
      : ACTIVITY_CACHE_TTL_MS;

  const key = activityCacheKey(params);

  // The existing entry for this key goes first so replacing a day does not count
  // against the cap twice, and the cap leaves room for the new entry — which is
  // the one write that must survive pruning, whatever its TTL.
  const existing = readAll(store);
  delete existing[key];

  const entries = prune(existing, now, MAX_ENTRIES - 1);
  entries[key] = { activities, expiresAt: now + ttl };

  writeAll(store, entries);
}

/**
 * Forget everything. Called when a Strava account is disconnected — the
 * activities came with that connection and should leave with it.
 */
export function clearActivityCache(): void {
  const store = storage();
  if (!store) return;

  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Already unusable; there is nothing cached to leak.
  }
}

/**
 * Today, as the athlete's calendar has it. Local, never UTC — local here so this
 * module keeps no imports.
 */
function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
