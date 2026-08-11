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

// Note: there is deliberately no distance conversion here. Run and Hyrox
// distances appear only inside benchmark descriptions ("400m Run", "50m Sled
// Push"), and those are prescribed standards — rewriting Murph's "1 mile Run" as
// "1.6 km Run" would misquote the workout. Only *scores* are unit-converted.
