import type { ScoreType, UnitSystem } from "./types";
import {
  distanceUnit,
  formatDistance,
  formatWeight,
  metresToMiles,
} from "./units";

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
 *   distance_metres  metres covered        higher is better
 *   pass_fail     1 completed / 0 failed   higher is better
 *
 * `distance_metres` is the one score with a second number beside it — the time
 * it took, in `Workout.durationSeconds`. Only the metres are ranked; see the
 * ScoreType doc for why the two are not packed together.
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

/**
 * A `time_seconds` workout that ran out of time.
 *
 * Most "for time" workouts carry a time cap, and an athlete who reaches it
 * unfinished scores the reps they completed instead of a time. Two different
 * units, one score type — which the single-`scoreValue` invariant above would
 * seem to forbid.
 *
 * It does not, because the *ranking* is unambiguous: whoever finished beats
 * whoever did not, and among those who did not, more reps is better. So a capped
 * result is encoded as a time nobody could ever record:
 *
 *     scoreValue = TIME_CAP_BASE - repsCompleted
 *
 * A finisher scores their seconds — at most a few thousand. A capped result
 * scores just under a million. Sorting ascending therefore puts every finisher
 * ahead of every cap-out, and orders the cap-outs by reps descending, which is
 * exactly how a CrossFit leaderboard reads. `isLowerBetter` stays true,
 * `beatsRecord` needs no special case, and the records collection is unchanged.
 *
 * The same trick as `encodeRoundsReps` above: pack the compound score into one
 * number whose natural order is the right order.
 *
 * Nothing already stored is affected — every existing time is a count of
 * seconds, far below the threshold, so it reads as uncapped without a migration.
 */
export const TIME_CAP_BASE = 1_000_000;

/**
 * The most reps a capped result can record.
 *
 * Bounds the encoding: reps beyond this would push `scoreValue` down into the
 * range real times occupy and be read back as a finish time. 100,000 reps is
 * absurd for any workout with a cap, and the input caps far below it.
 */
export const MAX_CAPPED_REPS = 100_000;

/**
 * At or above this is a capped result, not a time. ~10.4 days as seconds.
 *
 * Inclusive, and that matters: a cap-out at exactly `MAX_CAPPED_REPS` encodes to
 * precisely this value, and an exclusive test would read the one result with the
 * most reps as a finish time.
 */
const TIME_CAP_THRESHOLD = TIME_CAP_BASE - MAX_CAPPED_REPS;

export function encodeCappedReps(reps: number): number {
  const safe = Math.min(MAX_CAPPED_REPS, Math.max(0, Math.trunc(reps)));
  return TIME_CAP_BASE - safe;
}

export function decodeCappedReps(scoreValue: number): number {
  return TIME_CAP_BASE - Math.trunc(scoreValue);
}

/**
 * Whether a `time_seconds` score is a cap-out rather than a finish time.
 *
 * Read off the value itself, so no extra field is stored and no document can
 * disagree with itself about which of the two it holds.
 */
export function isTimeCapped(scoreValue: number): boolean {
  return scoreValue >= TIME_CAP_THRESHOLD;
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

// --- Pace ----------------------------------------------------------------

/**
 * Above this, the athlete was walking, stopped, or forgot to end the activity,
 * and a "pace" is noise rather than information. Per km or per mile alike — the
 * threshold is loose enough that the difference does not matter.
 */
const MAX_PACE_SECONDS = 20 * 60;

/**
 * Time per kilometre or per mile — `"5:15 /km"` — or `null` when it would not
 * mean anything.
 *
 * Derived on every render rather than stored, so a distance corrected in the
 * form cannot leave a stale pace behind it.
 */
export function formatPace(
  metres: number,
  seconds: number,
  system: UnitSystem,
): string | null {
  if (metres <= 0 || seconds <= 0) return null;

  const units = system === "metric" ? metres / 1000 : metresToMiles(metres);
  if (units <= 0) return null;

  const perUnit = seconds / units;
  if (perUnit > MAX_PACE_SECONDS) return null;

  return `${formatDuration(Math.round(perUnit))} /${distanceUnit(system)}`;
}

// --- Display -------------------------------------------------------------

/**
 * The score as it is read.
 *
 * The trailing `extra` carries the second number a score type may have beside
 * its `scoreValue` — reps for a lift, a duration for a distance. An options
 * object rather than more positional parameters, because a third one would make
 * every call site a row of anonymous arguments.
 */
export function formatScore(
  scoreType: ScoreType,
  scoreValue: number,
  unitSystem: UnitSystem,
  extra?: { reps?: number | null; durationSeconds?: number | null },
): string {
  switch (scoreType) {
    case "time_seconds":
      // Spelled out rather than the leaderboard's "CAP+12", which counts reps
      // *short* of finishing — a number this app cannot know, because it never
      // learns how many reps the workout held.
      return isTimeCapped(scoreValue)
        ? `${decodeCappedReps(scoreValue)} reps (capped)`
        : formatDuration(scoreValue);

    case "reps":
      return `${Math.trunc(scoreValue)} reps`;

    case "weight": {
      const load = formatWeight(scoreValue, unitSystem);
      const reps = extra?.reps;
      return reps && reps > 1 ? `${load} × ${reps}` : load;
    }

    case "rounds_reps": {
      const { rounds, partialReps } = decodeRoundsReps(scoreValue);
      const roundLabel = `${rounds} ${rounds === 1 ? "rnd" : "rnds"}`;
      return partialReps > 0 ? `${roundLabel} + ${partialReps} reps` : roundLabel;
    }

    case "distance_metres": {
      const distance = formatDistance(scoreValue, unitSystem);
      const seconds = extra?.durationSeconds;
      // A distance logged without a time is a complete result, not a broken
      // one — see `Workout.durationSeconds` — so it reads as the distance alone.
      if (!seconds || seconds <= 0) return distance;

      const pace = formatPace(scoreValue, seconds, unitSystem);
      const time = formatDuration(seconds);
      return pace === null
        ? `${distance} · ${time}`
        : `${distance} · ${time} (${pace})`;
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
    case "distance_metres":
      return "Distance";
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
