/**
 * The shapes Strava's API actually returns.
 *
 * Named in snake_case, unlike the Octiv types beside them: there is no
 * `camelize.ts` here because the field set this integration touches is small and
 * fixed, so naming the wire directly is one fewer transformation to keep in step
 * with reality.
 *
 * Written from the published reference and from observed responses, and treated
 * as neither: every field is optional and nullable, and `mapping.ts` does the
 * narrowing. Strava's own docs omit some of what it sends and describe fields it
 * does not always include.
 */

/** The part of Strava's athlete the Worker forwards. The rest is not this app's business. */
export interface StravaAthlete {
  id?: number | null;
  username?: string | null;
  firstname?: string | null;
  lastname?: string | null;
}

/**
 * What the token broker returns, for both `/exchange` and `/refresh`.
 *
 * `athlete` is present only on the first exchange — a refresh describes tokens,
 * not who they belong to.
 */
export interface StravaTokenResponse {
  access_token?: string | null;
  refresh_token?: string | null;
  /** Epoch **seconds**, not milliseconds, and absolute rather than a duration. */
  expires_at?: number | null;
  token_type?: string | null;
  athlete?: StravaAthlete | null;
}

/**
 * One activity, as `GET /athlete/activities` summarises it.
 *
 * The subset FORGE reads. Strava sends about sixty fields per activity —
 * follower counts, kudos, map polylines, device names — and none of the rest is
 * this app's business.
 */
export interface StravaActivity {
  id?: number | null;
  name?: string | null;
  /** Metres. */
  distance?: number | null;
  /** Seconds, excluding time spent stopped. The honest figure for a session. */
  moving_time?: number | null;
  /** Seconds, wall clock from start to finish. */
  elapsed_time?: number | null;
  /**
   * The granular activity kind: "Run", "TrailRun", "VirtualRide", "Rowing"…
   *
   * Preferred over the older `type`, which collapses several of these together.
   * Both are sent; `type` is kept below only as a fallback for an activity
   * recorded before Strava introduced `sport_type`.
   */
  sport_type?: string | null;
  /** Deprecated by Strava, and read only when `sport_type` is missing. */
  type?: string | null;
  /**
   * ISO 8601 *without* a zone offset, already shifted into the athlete's local
   * time — e.g. "2026-08-27T19:04:11Z", where the trailing Z is a lie.
   *
   * This, not `start_date`, decides which day a session is filed under: it is
   * the clock the athlete trained by. See `dayKeyOf` in mapping.ts.
   */
  start_date_local?: string | null;
  /** ISO 8601 UTC. Only used for the request window, never for the day key. */
  start_date?: string | null;
  /**
   * For runs: 0 default, 1 race, 2 long run, 3 workout. For rides: 10, 11, 12.
   *
   * Observed and widely relied upon, but *not* in Strava's published reference,
   * so it is treated the way `octiv/types.ts` treats its fields — as a hint whose
   * absence or change must not break anything. Only `1` is acted on, and only to
   * decide whether a run may claim a personal record.
   */
  workout_type?: number | null;
  /** Metres. */
  total_elevation_gain?: number | null;
  average_heartrate?: number | null;
  /** True when the athlete typed the activity in rather than recording it. */
  manual?: boolean | null;
  /** True for a treadmill or turbo session. */
  trainer?: boolean | null;
}
