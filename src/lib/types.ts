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

/** `users/{uid}` */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  gender: Gender;
  unitSystem: UnitSystem;
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
  notes: string;
  createdAt: Timestamp | null;
}

/** Payload accepted by the create/update mutations. */
export type WorkoutInput = Omit<Workout, "id" | "createdAt">;

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
