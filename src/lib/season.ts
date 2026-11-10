/**
 * Which festive season, and which holiday, a date falls in.
 *
 * One answer for the whole app: the share sheet uses it to decide which
 * seasonal backgrounds to offer, and the date strip uses it for its accent and
 * its holiday markers. If the two disagreed, the picker would offer a snowy
 * card on a day the calendar was dressed for Halloween.
 *
 * Imports nothing, so `node --test` runs it directly (see tests/season.test.mjs).
 * All checks use local calendar fields — a holiday is the day on the athlete's
 * wall calendar, not in UTC.
 */

export type Season = "halloween" | "christmas";

/**
 * Halloween is the whole of October. Christmas runs from 1 November to
 * 6 January (Epiphany): long enough for the run-up and the "first WOD of the
 * year" posts, short enough that nothing is snowy in July. The windows meet but
 * never overlap, so at most one season is ever active.
 */
export function seasonOn(date: Date): Season | null {
  const month = date.getMonth(); // 0-based
  const day = date.getDate();
  if (month === 9) return "halloween";
  if (month === 10 || month === 11 || (month === 0 && day <= 6)) return "christmas";
  return null;
}

export interface Holiday {
  name: string;
  /** Drawn on the day's tile in the date strip. */
  emoji: string;
}

/** The handful of days worth marking on the date strip. */
export function holidayOn(date: Date): Holiday | null {
  const month = date.getMonth();
  const day = date.getDate();
  if (month === 9 && day === 31) return { name: "Halloween", emoji: "🎃" };
  if (month === 11 && day === 24) return { name: "Christmas Eve", emoji: "🎄" };
  if (month === 11 && day === 25) return { name: "Christmas Day", emoji: "🎄" };
  if (month === 11 && day === 31) return { name: "New Year's Eve", emoji: "🎆" };
  return null;
}
