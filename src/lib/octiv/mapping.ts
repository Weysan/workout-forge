/**
 * Octiv programming → FORGE workouts.
 *
 * One Octiv WOD is a day of programming holding several pieces, each with its
 * own measuring unit — the strength piece is scored in kilograms, the metcon
 * that follows it in minutes and seconds. FORGE already lets a day hold several
 * sessions, so each piece becomes its own workout rather than being flattened
 * into one card with a single score type it does not fit.
 *
 * The result is a plain `WorkoutInput`: once imported, nothing about a workout
 * remembers it came from Octiv except `octivExerciseId`, which exists only so
 * the same piece is not offered twice.
 *
 * This module imports types only, so Node's type stripping runs it directly and
 * `tests/octiv.test.mjs` exercises the real implementation.
 */

import type { ScoreType, WorkoutInput, WorkoutType } from "@/lib/types";
import type { OctivMeasuringUnit, OctivWod, OctivWodExercise } from "./types";

/** Mirrors the caps in firestore.rules, so an import can never be rejected. */
export const OCTIV_TITLE_MAX = 120;
export const OCTIV_DESCRIPTION_MAX = 5000;

/**
 * How a piece is scored, read from the measuring unit's name.
 *
 * Matched on the name rather than `measuringUnitId`: only two ids have ever been
 * observed (1 = "For Weight - kg", 14 = "For Time - min"), and a guessed id
 * table would mis-score silently, whereas the names are self-describing.
 *
 * Units FORGE cannot represent faithfully — distance, calories, anything new —
 * fall back to `pass_fail`. That records the session honestly as done-or-not and
 * leaves the number to the description, which is better than filing metres under
 * "reps"; the edit form can change the score type in one tap.
 */
export function scoreTypeForUnit(
  unit: OctivMeasuringUnit | null | undefined,
): ScoreType {
  const text = `${unit?.name ?? ""} ${unit?.unit ?? ""}`.toLowerCase();

  // "Rounds + Reps" contains both words, so rounds are tested first.
  if (text.includes("round")) return "rounds_reps";
  if (text.includes("weight") || text.includes("kg") || text.includes("lb")) {
    return "weight";
  }
  if (text.includes("time") || text.includes("mm.ss")) return "time_seconds";
  if (text.includes("rep")) return "reps";

  return "pass_fail";
}

/**
 * The workout type, which is presentation only — it sets the badge on the card.
 *
 * The score type gives a decent default, and the description is checked for the
 * two formats that announce themselves in the text: a box writes "EMOM" or
 * "Every 4:00" and "AMRAP" verbatim, and those read better on the card than the
 * "For Time" the unit alone would imply.
 */
export function inferWorkoutType(
  scoreType: ScoreType,
  description: string,
): WorkoutType {
  if (/\bemom\b|\bevery \d{1,2}[:.]\d{2}\b/i.test(description)) return "EMOM";
  if (/\bamrap\b/i.test(description)) return "AMRAP";

  switch (scoreType) {
    case "weight":
      return "Strength";
    case "time_seconds":
      return "ForTime";
    case "rounds_reps":
      return "AMRAP";
    default:
      return "Custom";
  }
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** `"A"` + `"Pull Superset"` → `"A. Pull Superset"`. */
function titleFor(entry: OctivWodExercise, wod: OctivWod): string {
  const name =
    text(entry.exercise?.name) ||
    text(wod.name) ||
    text(wod.nickname) ||
    "Octiv workout";

  const prefix = text(entry.prefix);
  return clamp(prefix ? `${prefix}. ${name}` : name, OCTIV_TITLE_MAX);
}

/**
 * Every piece of one day's programming, in the order the box wrote it.
 *
 * `dateKey` is the day being viewed, and is used in preference to `wod.date`:
 * the session is filed under the day the athlete is looking at, which is the day
 * the panel offered it for.
 */
export function wodToWorkoutInputs(
  wod: OctivWod | null | undefined,
  dateKey: string,
): WorkoutInput[] {
  const entries = wod?.wodExercises ?? [];
  if (!wod || entries.length === 0) return [];

  return entries
    // `isActive: 0` is Octiv's soft delete — the piece was pulled from the day.
    .filter((entry) => entry.isActive !== 0)
    // A slot with no id cannot be tracked as imported, and one with neither a
    // name nor a description carries nothing worth logging: it would arrive as a
    // blank card with no way to tell what it was meant to be.
    .filter(
      (entry) =>
        entry.id != null &&
        Boolean(text(entry.exercise?.name) || text(entry.exercise?.description)),
    )
    // `order` is what the coach set; the array order is only a tiebreak.
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const byOrder = (a.entry.order ?? 0) - (b.entry.order ?? 0);
      return byOrder !== 0 ? byOrder : a.index - b.index;
    })
    .map(({ entry }) => {
      const description = clamp(
        text(entry.exercise?.description),
        OCTIV_DESCRIPTION_MAX,
      );
      const scoreType = scoreTypeForUnit(entry.exercise?.measuringUnit);

      return {
        date: dateKey,
        title: titleFor(entry, wod),
        type: inferWorkoutType(scoreType, description),
        description,
        scoreType,
        // Imported ahead of doing it, so there is no result yet — deliberately
        // null rather than 0, which is a real score. See lib/scoring.ts.
        scoreValue: null,
        scoreDisplay: "",
        // The standard is settled by doing the workout, not by importing it.
        rxOrScaled: "RX" as const,
        isPR: false,
        linkedBenchmarkId: null,
        reps: null,
        octivExerciseId: String(entry.id),
        notes: "",
      };
    });
}
