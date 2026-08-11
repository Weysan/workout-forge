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
 *   · `scoreValue` is always the comparable, unit-normalised number
 */
export interface Workout {
  id: string;
  /** `YYYY-MM-DD`, so lexical sorting is chronological. */
  date: string;
  title: string;
  type: WorkoutType;
  description: string;
  scoreType: ScoreType;
  scoreValue: number;
  /** Pre-formatted for display, e.g. "04:15", "8 rnds + 12 reps", "120 kg". */
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
