import type { Timestamp } from "firebase/firestore";

export type Gender = "male" | "female" | "non_binary";
export type UnitSystem = "metric" | "imperial";

export type WorkoutType =
  | "AMRAP"
  | "EMOM"
  | "ForTime"
  | "Strength"
  | "Hyrox"
  /**
   * Running, rowing, riding — a session measured by covering ground.
   *
   * Distinct from `ForTime`, which means a workout done against the clock for a
   * result. A long easy run is timed without being a time trial, and putting the
   * two under one badge would file it beside benchmark efforts it has nothing to
   * do with.
   *
   * Any change here must be made in `firestore.rules` and in
   * `WORKOUT_TYPE_OPTIONS` at the same time, or the rules reject the write.
   */
  | "Run"
  | "Custom";

export type ScoreType =
  | "time_seconds"
  | "reps"
  | "weight"
  | "rounds_reps"
  /**
   * Ground covered, in metres, with the time it took alongside it in
   * `Workout.durationSeconds`.
   *
   * The pair is deliberate. An open run is two numbers and neither one is the
   * result on its own: "8 km" says nothing about the effort and "42:10" says
   * nothing about the session. Distance is the ranked half — further is better,
   * so `isLowerBetter` stays false — and the time rides along the way `reps`
   * rides along with a `weight` score.
   *
   * They are deliberately *not* packed into one number the way `rounds_reps`
   * and the time cap are. Those work because their ordering is unambiguous;
   * a longer slow run and a shorter fast one have no such order, and inventing
   * one would rank sessions by a rule nobody believes.
   *
   * Any change here must be made in `firestore.rules` and in
   * `SCORE_TYPE_OPTIONS` at the same time, or the rules reject the write.
   */
  | "distance_metres"
  | "pass_fail";

export type RxOrScaled = "RX" | "Scaled";

export type BenchmarkCategory =
  | "Lift"
  | "Benchmark"
  | "Hero"
  | "Run"
  | "Open"
  | "Games";

/**
 * A connected Octiv account, stored on the user document.
 *
 * The password is used once, to log in, and never stored. What is kept is the
 * bearer token Octiv hands back, which is long-lived (a year), so it lives in
 * the user's own Firestore subtree — readable by nobody else, and available on
 * every device they sign in from.
 */
export interface OctivConnection {
  accessToken: string;
  /** "Bearer" in every response seen so far; sent back as-is. */
  tokenType: string;
  /** ISO instant, derived from `expiresIn` at login. */
  expiresAt: string;
  /** Shown as "connected as". The login identifier, never the password. */
  username: string;
}

/**
 * A connected Strava account, stored on the user document beside `octiv`.
 *
 * Deliberately a sibling field rather than a generalised `integrations` map: two
 * integrations is not enough to justify a migration, and the security rules pin
 * each one's shape separately anyway.
 *
 * Unlike Octiv's year-long token, a Strava access token lasts six hours, so
 * `refreshToken` — not `accessToken` — is what actually keeps this connection
 * alive. Strava invalidates the old refresh token the moment it issues a new one,
 * which is why `lib/strava/client.ts` serialises refreshes and persists the new
 * one before using the access token that came with it.
 */
export interface StravaConnection {
  /** Six-hour lifetime. Expected to be stale most of the time. */
  accessToken: string;
  /** Long-lived, and rotated on some refreshes. The real credential. */
  refreshToken: string;
  /** ISO instant, converted from Strava's `expires_at` epoch seconds. */
  expiresAt: string;
  athleteId: number;
  /** Shown as "connected as" — Strava's username, or a first/last name. */
  username: string;
  /**
   * What the user actually granted, as Strava echoed it back.
   *
   * Stored because the consent screen lets them untick scopes: asking for
   * `activity:read_all` is no guarantee of getting it, and an athlete who
   * granted only `activity:read` will silently not see their private activities.
   */
  scope: string;
  /**
   * When Strava stopped accepting this connection, if it has.
   *
   * Octiv can express the same state through `expiresAt`, because its tokens last
   * a year and an early expiry is unambiguous. Strava cannot: its access tokens
   * are *meant* to be stale most of the time, and a stale one is self-healing, so
   * expiry says nothing about whether the connection still works.
   *
   * What does end a Strava connection is the refresh being refused — the athlete
   * revoked access in their Strava settings, or the refresh token rotated out from
   * under a device that was offline while another one refreshed. That is recorded
   * here so the card can say "connect again" instead of showing a green tick over
   * something dead, and so the day panels stop asking.
   *
   * Absent on every healthy connection.
   */
  revokedAt?: string | null;
}

/** `users/{uid}` */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  gender: Gender;
  unitSystem: UnitSystem;
  /** Absent or null when no Octiv account is connected. */
  octiv?: OctivConnection | null;
  /** Absent or null when no Strava account is connected. */
  strava?: StravaConnection | null;
  /**
   * Places this athlete has tagged a session with, most recently used first.
   *
   * Kept here rather than derived from the log because the profile is already
   * read once per session and cached, so the workout form gets its suggestions
   * for free — the alternative is a query across workouts every time the form
   * opens, to collect half a dozen strings.
   *
   * Sanitised on read and capped on write by lib/locations.ts. Nothing depends on
   * it: losing an entry costs one retype, which is why it can live somewhere this
   * cheap.
   */
  locations?: string[] | null;
  createdAt: Timestamp | null;
}

/**
 * `users/{uid}/workouts/{workoutId}`
 *
 * Storage invariants — see lib/units.ts and lib/scoring.ts:
 *   · durations are total seconds
 *   · weights are kilograms
 *   · `scoreValue` is always the comparable, unit-normalised number, or null
 */
export interface Workout {
  id: string;
  /** `YYYY-MM-DD`, so lexical sorting is chronological. */
  date: string;
  title: string;
  type: WorkoutType;
  description: string;
  /**
   * How this workout *will be* scored. Set even while the score is still
   * missing, so the panel that fills it in later knows which fields to show.
   */
  scoreType: ScoreType;
  /**
   * `null` means the session is logged but not yet scored — planned ahead, or
   * written down before the result was known.
   *
   * Deliberately distinct from `0`, which is a real result: a `pass_fail` DNF
   * and a 0-rep attempt both score zero and must not read as "unscored".
   * Unscored sessions are skipped by the record recompute, so they can never
   * win a PR.
   */
  scoreValue: number | null;
  /** Pre-formatted for display, e.g. "04:15", "8 rnds + 12 reps", "120 kg". Empty when unscored. */
  scoreDisplay: string;
  rxOrScaled: RxOrScaled;
  isPR: boolean;
  /** Set when the workout was logged from the benchmark library. */
  linkedBenchmarkId: string | null;
  /** Reps performed at `scoreValue` kg. Strength lifts only. */
  reps?: number | null;
  /**
   * Time taken to cover `scoreValue` metres. `distance_metres` sessions only.
   *
   * The exact counterpart of `reps` above: a second number that qualifies the
   * score without being the score. `null` on a distance session logged without
   * a time — a route walked to recce it is still a distance worth keeping — and
   * absent on every other score type.
   *
   * Pace is derived from the two at render time and never stored, so a distance
   * corrected in the form cannot leave a stale pace behind it.
   */
  durationSeconds?: number | null;
  /**
   * Position within its day, from 0 — the sequence the athlete trained it in.
   *
   * Absent until the day is arranged, and then written for every session on that
   * day at once; see lib/day-order.ts for the sorting rules that follow. Not part
   * of `WorkoutInput`, because it belongs to the day rather than to the session:
   * the form never sets it, and an edit that omits it leaves the arrangement
   * intact.
   */
  order?: number | null;
  /**
   * The `wodExercises[].id` this session was imported from, when it came in
   * from Octiv. Absent on everything logged by hand.
   *
   * It exists so the day's Octiv panel can tell what has already been imported
   * without a second query — the day's workouts are loaded anyway — and so
   * deleting an imported card offers that piece again rather than losing it.
   */
  octivExerciseId?: string | null;
  /**
   * The Strava activity id this session was imported from. Absent on everything
   * logged by hand, and on everything that came from Octiv.
   *
   * Exactly the same role as `octivExerciseId`: it lets the day's Strava panel
   * tell what has already been imported without a second query, and means
   * deleting an imported card offers that activity again rather than losing it.
   *
   * A string rather than the number Strava sends, because Strava ids exceed
   * `Number.MAX_SAFE_INTEGER` — they are already past 2^53 — so they cannot
   * survive a round trip through JSON as numbers.
   */
  stravaActivityId?: string | null;
  /**
   * Where the session was trained — a free-text label such as "CrossFit Berlin"
   * or "home garage".
   *
   * Optional, and `null` on every session logged before this existed and on
   * everything imported from Octiv or Strava. Nothing derives from it: it is
   * shown on the card and carried through an edit, and that is all. See
   * lib/locations.ts for why it is a name rather than a pair of coordinates.
   */
  location?: string | null;
  notes: string;
  createdAt: Timestamp | null;
}

/**
 * Payload accepted by the create/update mutations.
 *
 * `order` is excluded deliberately: it is set by the reorder panel, for a whole
 * day at a time, and an edit that carried a stale copy of it would shuffle the
 * day as a side effect of changing a score.
 */
export type WorkoutInput = Omit<Workout, "id" | "createdAt" | "order">;

export type DayStatus = "rest" | "injured";

/**
 * `users/{uid}/days/{dateKey}` — document id *is* the date key.
 *
 * A day the athlete accounted for without training: deliberate recovery, or time
 * lost to an injury. Kept out of `workouts` on purpose — a rest day has no
 * title, score, standard or PR, and putting one in the log would have it
 * counted as a session by every query that reads it.
 *
 * `status` is a single field, so a day cannot be both rest and injured. The
 * document id being the date key means one marker per day by construction, and
 * marking the same day twice is a no-op upsert rather than a duplicate.
 */
export interface DayMark {
  /** `YYYY-MM-DD`. Duplicated from the document id so ranges are queryable. */
  date: string;
  status: DayStatus;
  note: string;
  createdAt: Timestamp | null;
}

/** Payload accepted by the set mutation. */
export type DayMarkInput = Omit<DayMark, "createdAt">;

/** `users/{uid}/prs/{movementId}` — document id is the movement id. */
export interface PersonalRecord {
  movementId: string;
  name: string;
  category: BenchmarkCategory;
  scoreType: ScoreType;
  bestValue: number;
  bestDisplay: string;
  /** Date of the session that set this record, `YYYY-MM-DD`. */
  achievedOn: string;
  updatedAt: Timestamp | null;
}

/** An entry in the static benchmark library. */
export interface Benchmark {
  id: string;
  name: string;
  category: BenchmarkCategory;
  type: WorkoutType;
  scoreType: ScoreType;
  description: string;
  /**
   * The CrossFit season this workout belongs to, for the `Open` and `Games`
   * categories — the calendar year the Open was run in, which is also the year
   * of the Games it fed into.
   *
   * Absent on every other category: a back squat belongs to no season.
   */
  season?: number;
}
