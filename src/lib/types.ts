import type { Timestamp } from "firebase/firestore";

export type Gender = "male" | "female" | "non_binary";
export type UnitSystem = "metric" | "imperial";

export type WorkoutType =
  | "AMRAP"
  | "EMOM"
  | "ForTime"
  | "Strength"
  | "Hyrox"
  | "Custom";

export type ScoreType =
  | "time_seconds"
  | "reps"
  | "weight"
  | "rounds_reps"
  | "pass_fail";

export type RxOrScaled = "RX" | "Scaled";

export type BenchmarkCategory = "Lift" | "Benchmark" | "Hero" | "Run";

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
}
