import type { ScoreType, UnitSystem } from "./types";
import { formatWeight } from "./units";

/**
 * Score normalisation.
 *
 * Every workout carries a single numeric `scoreValue` so that PRs, sorting and
 * charts work without branching on `scoreType` at the query layer. What that
 * number *means* depends on `scoreType`:
 *
 *   time_seconds  total seconds            lower is better
 *   reps          repetitions              higher is better
 *   weight        kilograms                higher is better
 *   rounds_reps   packed, see below        higher is better
 *   pass_fail     1 completed / 0 failed   higher is better
 */

/**
 * `rounds_reps` packs two numbers into one sortable value:
 *
 *     scoreValue = rounds * 1000 + partialReps
 *
 * Ordering by this value orders by rounds first and partial reps second, which
 * is exactly how an AMRAP is scored. 1000 is the cap on reps within a single
 * round — no published benchmark comes close.
 */
export const REPS_PER_ROUND_CAP = 1000;

export function encodeRoundsReps(rounds: number, partialReps: number): number {
  return Math.max(0, Math.trunc(rounds)) * REPS_PER_ROUND_CAP +
    Math.max(0, Math.trunc(partialReps));
}

export function decodeRoundsReps(scoreValue: number): {
  rounds: number;
  partialReps: number;
} {
  const safe = Math.max(0, Math.trunc(scoreValue));
  return {
    rounds: Math.floor(safe / REPS_PER_ROUND_CAP),
    partialReps: safe % REPS_PER_ROUND_CAP,
  };
}

/** True when a *smaller* `scoreValue` is the better result. */
export function isLowerBetter(scoreType: ScoreType): boolean {
  return scoreType === "time_seconds";
}

/**
 * Narrows a workout to one that has an actual result.
 *
 * A session can be logged before it is scored, so every reader of `scoreValue`
 * has to decide what to show in the meantime. Shaped as a type guard so
 * TypeScript forces that decision at each call site, instead of letting a null
 * reach `formatScore` and render as a confident "00:00".
 */
export function isScored<T extends { scoreValue: number | null }>(
  workout: T,
): workout is T & { scoreValue: number } {
  return workout.scoreValue !== null;
}

// --- Duration ------------------------------------------------------------

export function toTotalSeconds(
  hours: number,
  minutes: number,
  seconds: number,
): number {
  return Math.max(0, Math.trunc(hours)) * 3600 +
    Math.max(0, Math.trunc(minutes)) * 60 +
    Math.max(0, Math.trunc(seconds));
}

export function fromTotalSeconds(total: number): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  const safe = Math.max(0, Math.trunc(total));
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
}

/**
 * `MM:SS`, widening to `H:MM:SS` past the hour — Murph and a full Hyrox
 * simulation both run long, and "72:14" reads worse than "1:12:14".
 */
export function formatDuration(totalSeconds: number): string {
  const { hours, minutes, seconds } = fromTotalSeconds(totalSeconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

// --- Display -------------------------------------------------------------

export function formatScore(
  scoreType: ScoreType,
  scoreValue: number,
  unitSystem: UnitSystem,
  reps?: number | null,
): string {
  switch (scoreType) {
    case "time_seconds":
      return formatDuration(scoreValue);

    case "reps":
      return `${Math.trunc(scoreValue)} reps`;

    case "weight": {
      const load = formatWeight(scoreValue, unitSystem);
      return reps && reps > 1 ? `${load} × ${reps}` : load;
    }

    case "rounds_reps": {
      const { rounds, partialReps } = decodeRoundsReps(scoreValue);
      const roundLabel = `${rounds} ${rounds === 1 ? "rnd" : "rnds"}`;
      return partialReps > 0 ? `${roundLabel} + ${partialReps} reps` : roundLabel;
    }

    case "pass_fail":
      return scoreValue >= 1 ? "Completed" : "Did not finish";
  }
}

/** Short label for the score axis, used next to inputs and on PR cards. */
export function scoreTypeLabel(scoreType: ScoreType): string {
  switch (scoreType) {
    case "time_seconds":
      return "Time";
    case "reps":
      return "Reps";
    case "weight":
      return "Load";
    case "rounds_reps":
      return "Rounds + reps";
    case "pass_fail":
      return "Completion";
  }
}

// --- Records -------------------------------------------------------------

/**
 * Strictly better than the standing record. Ties do not count as a PR: matching
 * a best is not beating it, and treating equality as a PR would re-badge every
 * repeat of a `pass_fail` workout.
 */
export function beatsRecord(
  scoreType: ScoreType,
  candidate: number,
  current: number | undefined | null,
): boolean {
  if (current === undefined || current === null) return true;
  return isLowerBetter(scoreType) ? candidate < current : candidate > current;
}
