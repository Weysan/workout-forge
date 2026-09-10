import {
  decodeCappedReps,
  encodeCappedReps,
  encodeRoundsReps,
  formatScore,
  fromTotalSeconds,
  isTimeCapped,
  toTotalSeconds,
} from "./scoring";
import {
  toDisplayDistance,
  toDisplayWeight,
  toStoredDistance,
  toStoredWeight,
} from "./units";
import type { ScoreType, UnitSystem, Workout } from "./types";

/**
 * The score section of the form, held as strings.
 *
 * Editing through a single number would fight the user: clearing the seconds
 * field to retype it would momentarily mean "0 seconds", and a half-typed "1."
 * has no numeric equivalent. Every field for every score type is kept, so
 * switching type and switching back does not discard what was already entered.
 */
export interface ScoreDraft {
  /** time_seconds — minutes is intentionally unbounded, so Murph is 72:14. */
  minutes: string;
  seconds: string;
  /**
   * time_seconds — the athlete hit the time cap without finishing, and scores
   * the reps they completed instead of a time. See `encodeCappedReps`.
   *
   * A mode rather than a third field, because the two are alternatives: a result
   * is a finish time or a cap-out, never both. The time fields are kept while
   * this is on, so toggling it by mistake does not discard what was typed.
   */
  timeCapped: boolean;
  cappedReps: string;
  /** rounds_reps */
  rounds: string;
  partialReps: string;
  /** reps */
  totalReps: string;
  /** weight */
  weight: string;
  weightUnit: UnitSystem;
  weightReps: string;
  /**
   * distance_metres — the distance, in `distanceUnit`, and the time it took.
   *
   * The time has its own two fields rather than reusing `minutes`/`seconds`:
   * those belong to `time_seconds`, and sharing them would let a time typed for
   * a for-time workout reappear as a run's duration after a type switch.
   */
  distance: string;
  distanceUnit: UnitSystem;
  distanceMinutes: string;
  distanceSeconds: string;
  /** pass_fail — `null` until answered, so an unscored session stays unscored. */
  completed: boolean | null;
}

export function emptyDraft(unitSystem: UnitSystem): ScoreDraft {
  return {
    minutes: "",
    seconds: "",
    timeCapped: false,
    cappedReps: "",
    rounds: "",
    partialReps: "",
    totalReps: "",
    weight: "",
    weightUnit: unitSystem,
    weightReps: "1",
    distance: "",
    distanceUnit: unitSystem,
    distanceMinutes: "",
    distanceSeconds: "",
    completed: null,
  };
}

/** Rebuilds the draft when opening an existing workout for editing. */
export function draftFromWorkout(
  workout: Workout,
  unitSystem: UnitSystem,
): ScoreDraft {
  const draft = emptyDraft(unitSystem);

  // Nothing to rebuild: the session was logged without a result.
  if (workout.scoreValue === null) return draft;

  switch (workout.scoreType) {
    case "time_seconds": {
      if (isTimeCapped(workout.scoreValue)) {
        draft.timeCapped = true;
        draft.cappedReps = String(decodeCappedReps(workout.scoreValue));
        break;
      }
      const { hours, minutes, seconds } = fromTotalSeconds(workout.scoreValue);
      // Hours are folded back into minutes: the form has no hours field.
      draft.minutes = String(hours * 60 + minutes);
      draft.seconds = String(seconds).padStart(2, "0");
      break;
    }
    case "rounds_reps": {
      const rounds = Math.floor(workout.scoreValue / 1000);
      draft.rounds = String(rounds);
      draft.partialReps = String(workout.scoreValue % 1000);
      break;
    }
    case "reps":
      draft.totalReps = String(workout.scoreValue);
      break;
    case "weight":
      draft.weight = String(toDisplayWeight(workout.scoreValue, unitSystem));
      draft.weightUnit = unitSystem;
      draft.weightReps = String(workout.reps ?? 1);
      break;
    case "distance_metres": {
      draft.distance = String(
        toDisplayDistance(workout.scoreValue, unitSystem),
      );
      draft.distanceUnit = unitSystem;

      // A distance session may have been logged without a time, which leaves
      // both fields empty rather than showing a confident "00:00".
      const seconds = workout.durationSeconds;
      if (typeof seconds === "number" && seconds > 0) {
        const parts = fromTotalSeconds(seconds);
        // Hours fold into minutes, as they do for `time_seconds` above: the
        // form has no hours field, and a two-hour run is "120".
        draft.distanceMinutes = String(parts.hours * 60 + parts.minutes);
        draft.distanceSeconds = String(parts.seconds).padStart(2, "0");
      }
      break;
    }
    case "pass_fail":
      draft.completed = workout.scoreValue >= 1;
      break;
  }

  return draft;
}

function num(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export interface ResolvedScore {
  /** `null` when nothing has been entered — the workout is logged unscored. */
  scoreValue: number | null;
  scoreDisplay: string;
  reps: number | null;
  /** Set only by `distance_metres`, and only when a time was entered. */
  durationSeconds: number | null;
}

/** What an untouched score section resolves to: a session with no result yet. */
const UNSCORED: ResolvedScore = {
  scoreValue: null,
  scoreDisplay: "",
  reps: null,
  durationSeconds: null,
};

/**
 * Collapses the draft into what Firestore stores.
 *
 * An empty draft resolves to `UNSCORED` rather than to zero, which is what lets
 * a workout be logged now and scored later: zero is a real result for
 * `pass_fail` and `reps`, so it cannot double as "not filled in".
 *
 * `scoreDisplay` is denormalised for convenience only — views format from
 * `scoreValue` at render time so that flipping kg↔lbs updates history too.
 */
export function resolveScore(
  draft: ScoreDraft,
  scoreType: ScoreType,
  unitSystem: UnitSystem,
): ResolvedScore {
  if (!isScoreComplete(draft, scoreType)) return UNSCORED;

  switch (scoreType) {
    case "time_seconds": {
      const scoreValue = draft.timeCapped
        ? encodeCappedReps(num(draft.cappedReps))
        : toTotalSeconds(0, num(draft.minutes), num(draft.seconds));
      return {
        scoreValue,
        scoreDisplay: formatScore("time_seconds", scoreValue, unitSystem),
        reps: null,
        durationSeconds: null,
      };
    }

    case "rounds_reps": {
      const scoreValue = encodeRoundsReps(
        num(draft.rounds),
        num(draft.partialReps),
      );
      return {
        scoreValue,
        scoreDisplay: formatScore("rounds_reps", scoreValue, unitSystem),
        reps: null,
        durationSeconds: null,
      };
    }

    case "reps": {
      const scoreValue = Math.trunc(num(draft.totalReps));
      return {
        scoreValue,
        scoreDisplay: formatScore("reps", scoreValue, unitSystem),
        reps: null,
        durationSeconds: null,
      };
    }

    case "weight": {
      // Always converted to kilograms, whichever unit the user typed in.
      const scoreValue = toStoredWeight(num(draft.weight), draft.weightUnit);
      const reps = Math.max(1, Math.trunc(num(draft.weightReps) || 1));
      return {
        scoreValue,
        scoreDisplay: formatScore("weight", scoreValue, unitSystem, { reps }),
        reps,
        durationSeconds: null,
      };
    }

    case "distance_metres": {
      // Always stored in metres, whichever unit the user typed in — the same
      // rule `weight` follows with kilograms.
      const scoreValue = toStoredDistance(
        num(draft.distance),
        draft.distanceUnit,
      );
      // The time is optional, and zero means "not given" rather than "instant".
      const entered = toTotalSeconds(
        0,
        num(draft.distanceMinutes),
        num(draft.distanceSeconds),
      );
      const durationSeconds = entered > 0 ? entered : null;

      return {
        scoreValue,
        scoreDisplay: formatScore("distance_metres", scoreValue, unitSystem, {
          durationSeconds,
        }),
        reps: null,
        durationSeconds,
      };
    }

    case "pass_fail": {
      const scoreValue = draft.completed ? 1 : 0;
      return {
        scoreValue,
        scoreDisplay: formatScore("pass_fail", scoreValue, unitSystem),
        reps: null,
        durationSeconds: null,
      };
    }
  }
}

/** Whether the user has entered enough for the score to mean anything. */
export function isScoreComplete(
  draft: ScoreDraft,
  scoreType: ScoreType,
): boolean {
  switch (scoreType) {
    case "time_seconds":
      // A cap-out is scored by its reps, so the time fields say nothing about
      // whether it is filled in — and vice versa.
      return draft.timeCapped
        ? num(draft.cappedReps) > 0
        : num(draft.minutes) > 0 || num(draft.seconds) > 0;
    case "rounds_reps":
      return num(draft.rounds) > 0 || num(draft.partialReps) > 0;
    case "reps":
      return num(draft.totalReps) > 0;
    case "weight":
      return num(draft.weight) > 0;
    case "distance_metres":
      // The distance alone is the result. A time makes it a better record, but
      // requiring one would refuse to log a route the athlete only walked.
      return num(draft.distance) > 0;
    case "pass_fail":
      // Both answers are valid, including "did not finish" — but one of them has
      // to actually be picked.
      return draft.completed !== null;
  }
}
