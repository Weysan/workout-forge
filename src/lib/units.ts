import type { UnitSystem } from "./types";

/**
 * Unit conversion.
 *
 * Firestore only ever holds metric: kilograms for load, metres for distance,
 * seconds for time. Imperial is a render-time concern, so a user can flip the
 * setting at any point and every historical record follows without a migration.
 */

export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 2.20462262;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function weightUnit(system: UnitSystem): "kg" | "lbs" {
  return system === "metric" ? "kg" : "lbs";
}

/** Rounds to at most one decimal, dropping a trailing ".0". */
function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Formats a stored kilogram value in the user's preferred unit. */
export function formatWeight(
  kg: number,
  system: UnitSystem,
  { withUnit = true }: { withUnit?: boolean } = {},
): string {
  const value = system === "metric" ? kg : kgToLb(kg);
  return withUnit ? `${trim(value)} ${weightUnit(system)}` : trim(value);
}

/** Converts a value the user typed in their own unit into kilograms. */
export function toStoredWeight(value: number, system: UnitSystem): number {
  const kg = system === "metric" ? value : lbToKg(value);
  // Two decimals is finer than any gym plate and avoids float drift creeping
  // into stored records.
  return Math.round(kg * 100) / 100;
}

/** Converts a stored kilogram value into the unit the user edits in. */
export function toDisplayWeight(kg: number, system: UnitSystem): number {
  const value = system === "metric" ? kg : kgToLb(kg);
  return Math.round(value * 100) / 100;
}

// --- Distance ------------------------------------------------------------
//
// Only *scores* are unit-converted, which is why the distances written into
// benchmark descriptions ("400m Run", "50m Sled Push") are left alone: those are
// prescribed standards, and rewriting Murph's "1 mile Run" as "1.6 km Run" would
// misquote the workout. What follows converts the distance an athlete *covered*,
// which is a result like any other.

export const METRES_PER_MILE = 1609.344;

export function metresToMiles(metres: number): number {
  return metres / METRES_PER_MILE;
}

export function milesToMetres(miles: number): number {
  return miles * METRES_PER_MILE;
}

/** The unit a distance is entered and displayed in. */
export function distanceUnit(system: UnitSystem): "km" | "mi" {
  return system === "metric" ? "km" : "mi";
}

/**
 * A stored metre count, in the athlete's own unit.
 *
 * Metric drops to bare metres below a kilometre, because a set of 400s reads as
 * "400 m" and never as "0.40 km". Imperial has no such second unit in use —
 * nobody logs a rep in yards — so it stays in miles all the way down.
 *
 * Two decimals rather than the one `trim` gives weights: 5.01 km and 5.1 km are
 * different runs, and rounding them together would lose a PR.
 */
export function formatDistance(
  metres: number,
  system: UnitSystem,
  { withUnit = true }: { withUnit?: boolean } = {},
): string {
  if (system === "metric" && metres < 1000) {
    const value = String(Math.round(metres));
    return withUnit ? `${value} m` : value;
  }

  const value = system === "metric" ? metres / 1000 : metresToMiles(metres);
  const shown = value.toFixed(2);
  return withUnit ? `${shown} ${distanceUnit(system)}` : shown;
}

/** Converts a value the user typed in km or miles into metres. */
export function toStoredDistance(value: number, system: UnitSystem): number {
  const metres = system === "metric" ? value * 1000 : milesToMetres(value);
  // Whole metres: finer than any GPS, and it keeps float drift out of a stored
  // result the same way `toStoredWeight` does.
  return Math.round(metres);
}

/** Converts a stored metre count into the unit the user edits in. */
export function toDisplayDistance(metres: number, system: UnitSystem): number {
  const value = system === "metric" ? metres / 1000 : metresToMiles(metres);
  return Math.round(value * 100) / 100;
}
