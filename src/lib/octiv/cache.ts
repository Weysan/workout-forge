/**
 * A local cache for the box's programming, so browsing the calendar does not
 * re-ask Octiv for the same day over and over.
 *
 * React Query alone is not enough here: its cache lives in memory, so every
 * reload — and this is a PWA that gets killed and relaunched constantly — starts
 * asking again from scratch. This puts the answers in `localStorage`, keyed by
 * the request parameters, and serves them for half a day.
 *
 * Only the WOD read is cached. Login is not, and must not be: it exchanges a
 * password for a token, the token is what gets stored (in Firestore, by
 * `lib/firestore/profile.ts`), and a cached login would mean either a stale
 * token or a password sitting in `localStorage`.
 *
 * Nothing in the cache is user-specific — the key is the tenant, the programme
 * and the date, which is exactly what the request is. Two athletes at the same
 * box asking for the same day are asking the same question.
 *
 * Import-free on purpose (types only, which are erased): Node's built-in type
 * stripping runs it directly in `tests/octiv-cache.test.mjs`.
 */

import type { OctivWod } from "./types";

/**
 * How long a published day is trusted.
 *
 * Octiv's programming goes up in advance and is rarely edited after, so half a
 * day is a long way inside the window where re-asking would learn nothing.
 */
export const WOD_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * How long "the box has published nothing for this day" is trusted, for today
 * and later.
 *
 * Shorter than the above, because it is the one answer that genuinely changes:
 * a coach posting this evening's session at lunchtime would otherwise be
 * invisible until tomorrow. For dates in the past there is nothing left to
 * publish, so those keep the full TTL.
 */
export const UNPUBLISHED_WOD_TTL_MS = 30 * 60 * 1000;

const STORAGE_KEY = "forge.octiv.wods.v1";

/**
 * Cap on stored days. One entry is a few KB at most, and a year of browsing
 * would still fit comfortably, but `localStorage` is a shared ~5 MB budget and
 * this is the least important thing in it.
 */
const MAX_ENTRIES = 200;

/** The parameters that identify a WOD request — and so index its cache entry. */
export interface WodCacheParams {
  tenantId: number;
  programmeId: number;
  /** `YYYY-MM-DD`. */
  dateKey: string;
}

interface WodCacheEntry {
  /** `null` records a day the box published nothing for. */
  wod: OctivWod | null;
  expiresAt: number;
}

/** A cache hit. Wrapped so a cached `null` is not mistaken for a miss. */
export interface WodCacheHit {
  wod: OctivWod | null;
}

export function wodCacheKey({
  tenantId,
  programmeId,
  dateKey,
}: WodCacheParams): string {
  return `${tenantId}/${programmeId}/${dateKey}`;
}

// --- Storage -------------------------------------------------------------

/**
 * `localStorage`, when there is one to have.
 *
 * Absent during the static export's build, and *throwing* rather than absent in
 * Safari with cookies blocked — hence the try. A device without it just means
 * every read goes to the network, which is the behaviour this file replaces.
 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readAll(store: Storage): Record<string, WodCacheEntry> {
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    // Written by an older version, hand-edited, or truncated by a full disk:
    // anything that is not a well-formed entry is dropped rather than trusted.
    const entries: Record<string, WodCacheEntry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value === "object" &&
        typeof (value as WodCacheEntry).expiresAt === "number" &&
        "wod" in value
      ) {
        entries[key] = value as WodCacheEntry;
      }
    }
    return entries;
  } catch {
    return {};
  }
}

function writeAll(store: Storage, entries: Record<string, WodCacheEntry>) {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Out of quota, most likely. A cache that cannot be updated is worse than
    // no cache — it would serve the same stale day forever — so drop it and let
    // the next fetch start clean.
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      // Nothing further to try; reads simply go to the network.
    }
  }
}

/** Forget expired entries, then the oldest, until at most `limit` remain. */
function prune(
  entries: Record<string, WodCacheEntry>,
  now: number,
  limit: number,
): Record<string, WodCacheEntry> {
  const live = Object.entries(entries).filter(
    ([, entry]) => entry.expiresAt > now,
  );

  if (live.length > limit) {
    // Soonest to expire is the least recently written, since every entry is
    // written with one of two fixed TTLs.
    live.sort((a, b) => b[1].expiresAt - a[1].expiresAt);
    live.length = limit;
  }

  return Object.fromEntries(live);
}

// --- Public API ----------------------------------------------------------

/**
 * The cached answer for these parameters, or `null` when there is none.
 *
 * A hit is `{ wod }` — where `wod` may itself be `null`, meaning "asked, and the
 * box had published nothing". That distinction is the whole point: without it,
 * an empty day would be re-fetched on every visit.
 */
export function readCachedWod(
  params: WodCacheParams,
  now: number = Date.now(),
): WodCacheHit | null {
  const store = storage();
  if (!store) return null;

  const entry = readAll(store)[wodCacheKey(params)];
  if (!entry || entry.expiresAt <= now) return null;

  return { wod: entry.wod };
}

export function writeCachedWod(
  params: WodCacheParams,
  wod: OctivWod | null,
  now: number = Date.now(),
): void {
  const store = storage();
  if (!store) return;

  const ttl =
    wod === null && params.dateKey >= localDayKey(now)
      ? UNPUBLISHED_WOD_TTL_MS
      : WOD_CACHE_TTL_MS;

  const key = wodCacheKey(params);

  // The existing entry for this key goes first so replacing a day does not
  // count against the cap twice, and the cap leaves room for the new entry —
  // which is the one write that must survive pruning, whatever its TTL.
  const existing = readAll(store);
  delete existing[key];

  const entries = prune(existing, now, MAX_ENTRIES - 1);
  entries[key] = { wod, expiresAt: now + ttl };

  writeAll(store, entries);
}

/**
 * Forget everything. Called when an Octiv account is disconnected — the
 * programming came with that connection and should leave with it.
 */
export function clearWodCache(): void {
  const store = storage();
  if (!store) return;

  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Already unusable; there is nothing cached to leak.
  }
}

/**
 * Today, as the athlete's calendar has it. Local, never UTC — the same reasoning
 * as `lib/utils.ts`, and local here so this module keeps no imports.
 */
function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
