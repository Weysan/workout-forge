import { encodeRoundsReps, formatScore, fromTotalSeconds, toTotalSeconds } from "./scoring";
import { toDisplayWeight, toStoredWeight } from "./units";
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
  /** rounds_reps */
  rounds: string;
  partialReps: string;
  /** reps */
  totalReps: string;
  /** weight */
  weight: string;
  weightUnit: UnitSystem;
  weightReps: string;
  /** pass_fail */
  completed: boolean;
}

export function emptyDraft(unitSystem: UnitSystem): ScoreDraft {
  return {
    minutes: "",
    seconds: "",
    rounds: "",
    partialReps: "",
    totalReps: "",
    weight: "",
    weightUnit: unitSystem,
    weightReps: "1",
    completed: true,
  };
}

/** Rebuilds the draft when opening an existing workout for editing. */
export function draftFromWorkout(
  workout: Workout,
  unitSystem: UnitSystem,
): ScoreDraft {
  const draft = emptyDraft(unitSystem);

  switch (workout.scoreType) {
    case "time_seconds": {
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
  scoreValue: number;
  scoreDisplay: string;
  reps: number | null;
}

/**
 * Collapses the draft into what Firestore stores.
 *
 * `scoreDisplay` is denormalised for convenience only — views format from
 * `scoreValue` at render time so that flipping kg↔lbs updates history too.
 */
export function resolveScore(
  draft: ScoreDraft,
  scoreType: ScoreType,
  unitSystem: UnitSystem,
): ResolvedScore {
  switch (scoreType) {
    case "time_seconds": {
      const scoreValue = toTotalSeconds(0, num(draft.minutes), num(draft.seconds));
      return {
        scoreValue,
        scoreDisplay: formatScore("time_seconds", scoreValue, unitSystem),
        reps: null,
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
      };
    }

    case "reps": {
      const scoreValue = Math.trunc(num(draft.totalReps));
      return {
        scoreValue,
        scoreDisplay: formatScore("reps", scoreValue, unitSystem),
        reps: null,
      };
    }

    case "weight": {
      // Always converted to kilograms, whichever unit the user typed in.
      const scoreValue = toStoredWeight(num(draft.weight), draft.weightUnit);
      const reps = Math.max(1, Math.trunc(num(draft.weightReps) || 1));
      return {
        scoreValue,
        scoreDisplay: formatScore("weight", scoreValue, unitSystem, reps),
        reps,
      };
    }

    case "pass_fail": {
      const scoreValue = draft.completed ? 1 : 0;
      return {
        scoreValue,
        scoreDisplay: formatScore("pass_fail", scoreValue, unitSystem),
        reps: null,
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
      return num(draft.minutes) > 0 || num(draft.seconds) > 0;
    case "rounds_reps":
      return num(draft.rounds) > 0 || num(draft.partialReps) > 0;
    case "reps":
      return num(draft.totalReps) > 0;
    case "weight":
      return num(draft.weight) > 0;
    case "pass_fail":
      // Both answers are valid, including "did not finish".
      return true;
  }
}
