/**
 * Percentage-of-max reference table.
 *
 * Strength work is *prescribed* in percentages ("5 × 3 @ 75%") but *logged* in
 * absolute loads. This converts a standing best back into the numbers a
 * programme asks for, so the athlete is not doing arithmetic on a phone between
 * sets.
 *
 * Kilograms in, kilograms out — the unit the log stores. Conversion to the
 * athlete's preferred unit stays a render-time concern, exactly as in lib/units.ts.
 */

/**
 * 100% down to 40% in 5% steps.
 *
 * Descending, because a session is written from its top set downwards, so the
 * heaviest number is the one being looked for. The floor is 40% rather than 0%:
 * below that a percentage is warm-up territory where nobody needs a table, and
 * padding the list only makes the useful rows harder to scan.
 */
export const PERCENTAGE_STEPS: readonly number[] = [
  100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40,
];

export interface PercentageRow {
  /** Whole percent, e.g. `75`. */
  percent: number;
  /** The corresponding load in kilograms. */
  kg: number;
}

/**
 * `percent` is a whole number (75, not 0.75).
 *
 * Rounded to two decimals — the same precision `toStoredWeight` keeps — so the
 * value converts exactly into either unit without float noise such as
 * `76.87499999999999`.
 */
export function percentageOfMax(maxKg: number, percent: number): number {
  return Math.round(maxKg * percent) / 100;
}

export function buildPercentageTable(maxKg: number): PercentageRow[] {
  return PERCENTAGE_STEPS.map((percent) => ({
    percent,
    kg: percentageOfMax(maxKg, percent),
  }));
}
