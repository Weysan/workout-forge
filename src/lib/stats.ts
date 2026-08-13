/**
 * Training habit statistics.
 *
 * Everything here is a pure function of two lists — the days that have a workout
 * and the days that carry a rest or injury marker — so the numbers on the
 * profile can be reasoned about and tested without a database.
 *
 * The module imports nothing on purpose, which is what lets Node's built-in type
 * stripping run it directly in `tests/stats.test.mjs`. Dates are handled as
 * `YYYY-MM-DD` strings throughout, matching the storage format, and the few date
 * helpers below are local for the same reason. String comparison on that format
 * is chronological, so ranges are plain `>=` / `<=`.
 */

/** How far back the profile reads. Bounds the streak and the averaging window. */
export const STATS_WINDOW_DAYS = 365;

/** Complete weeks the per-week averages are taken over, at most. */
export const AVERAGE_WINDOW_WEEKS = 12;

export type StatsDayStatus = "rest" | "injured";

export interface StatsDayMark {
  date: string;
  status: StatsDayStatus;
}

export interface StatsInput {
  /** `YYYY-MM-DD` for the athlete's *local* today. */
  todayKey: string;
  /** Dates with at least one workout. Duplicates are tolerated. */
  workoutDates: readonly string[];
  dayMarks: readonly StatsDayMark[];
}

export interface TrainingStats {
  /** Consecutive days, counting back from today, that were accounted for. */
  logStreak: number;
  /** `null` until at least one complete week has elapsed to average over. */
  avgWorkoutDaysPerWeek: number | null;
  avgRestDaysPerWeek: number | null;
  /** Complete weeks behind the two averages, so the figure can be qualified. */
  averagedOverWeeks: number;
  injuredDaysThisMonth: number;
}

// --- Date helpers ---------------------------------------------------------

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  // Local midnight, never UTC — the same reasoning as lib/utils.ts: these are
  // calendar days as the athlete experienced them.
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Move a date key by whole days. Goes through `Date.setDate`, which handles
 * month and year rollover, leap days and DST shifts for us.
 */
export function shiftDayKey(key: string, delta: number): string {
  const date = parseKey(key);
  date.setDate(date.getDate() + delta);
  return formatKey(date);
}

/** The Monday of the week containing `key`. Weeks run Monday–Sunday. */
function mondayOf(key: string): string {
  // getDay() is 0 for Sunday, so Sunday has to fall at the *end* of its week.
  const offset = (parseKey(key).getDay() + 6) % 7;
  return shiftDayKey(key, -offset);
}

/** Inclusive count of Monday-start weeks between two Mondays. */
function weeksBetween(startMonday: string, endMonday: string): number {
  const span = parseKey(endMonday).getTime() - parseKey(startMonday).getTime();
  // Rounded because a DST boundary makes a week 167 or 169 hours long.
  return Math.round(span / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

// --- Statistics -----------------------------------------------------------

export function computeTrainingStats({
  todayKey,
  workoutDates,
  dayMarks,
}: StatsInput): TrainingStats {
  const trained = new Set(workoutDates);
  const restDays = new Set<string>();
  const injuredDays = new Set<string>();

  for (const mark of dayMarks) {
    if (mark.status === "rest") restDays.add(mark.date);
    else injuredDays.add(mark.date);
  }

  return {
    logStreak: computeStreak(todayKey, trained, restDays, injuredDays),
    ...computeAverages(todayKey, trained, restDays, injuredDays),
    injuredDaysThisMonth: countInMonth(injuredDays, todayKey),
  };
}

/**
 * Consecutive accounted-for days, counting back from today.
 *
 * A day counts if it has a workout, a rest marker or an injury marker — the
 * streak measures the habit of keeping the log honest, not the habit of
 * training, which is the whole reason a rest day is worth recording.
 *
 * The walk starts at yesterday when today is still blank. Otherwise a streak
 * would appear to break every night at midnight and only come back once the
 * athlete had trained, which reads as a bug at eight in the morning.
 *
 * Because it walks *backwards* from today, a session planned for tomorrow can
 * never inflate it.
 */
function computeStreak(
  todayKey: string,
  trained: ReadonlySet<string>,
  restDays: ReadonlySet<string>,
  injuredDays: ReadonlySet<string>,
): number {
  const accounted = (key: string) =>
    trained.has(key) || restDays.has(key) || injuredDays.has(key);

  let cursor = accounted(todayKey) ? todayKey : shiftDayKey(todayKey, -1);
  let streak = 0;

  // Bounded by the window the caller actually fetched: past it, an absent day
  // means "not loaded" rather than "not logged", and counting on would be a
  // guess.
  while (streak < STATS_WINDOW_DAYS && accounted(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }

  return streak;
}

/**
 * Workout and rest days per week, over whole Monday–Sunday weeks.
 *
 * The current week is excluded. It is partial by definition, so including it
 * would drag both averages down every Monday morning and back up by Sunday —
 * movement that says nothing about how the athlete is training.
 *
 * The window is also floored at the athlete's first logged day, so someone two
 * weeks into using the app is divided by two rather than by twelve.
 */
function computeAverages(
  todayKey: string,
  trained: ReadonlySet<string>,
  restDays: ReadonlySet<string>,
  injuredDays: ReadonlySet<string>,
): Pick<
  TrainingStats,
  "avgWorkoutDaysPerWeek" | "avgRestDaysPerWeek" | "averagedOverWeeks"
> {
  const thisMonday = mondayOf(todayKey);
  const lastCompleteWeekStart = shiftDayKey(thisMonday, -7);
  const lastCompleteWeekEnd = shiftDayKey(thisMonday, -1);
  const earliest = shiftDayKey(thisMonday, -7 * AVERAGE_WINDOW_WEEKS);

  const empty = {
    avgWorkoutDaysPerWeek: null,
    avgRestDaysPerWeek: null,
    averagedOverWeeks: 0,
  };

  // Injury days establish the window alongside the other two even though they
  // feed neither average: a fortnight spent hurt is history, and the honest
  // reading of it is "zero training days a week", not "no data".
  //
  // Anything dated after the last complete week is either this week or a plan
  // for a day that has not happened; neither belongs in a historical average.
  const history = [...trained, ...restDays, ...injuredDays].filter(
    (key) => key <= lastCompleteWeekEnd,
  );
  if (history.length === 0) return empty;

  const firstMonday = mondayOf(history.reduce((a, b) => (a < b ? a : b)));
  const windowStart = firstMonday > earliest ? firstMonday : earliest;

  // The athlete's first activity is in the current week — nothing complete yet.
  if (windowStart > lastCompleteWeekStart) return empty;

  const inWindow = (key: string) =>
    key >= windowStart && key <= lastCompleteWeekEnd;

  const weeks = weeksBetween(windowStart, lastCompleteWeekStart);
  const workoutDays = [...trained].filter(inWindow).length;
  // A day that somehow carries both only counts once, and counts as trained, so
  // the two averages can never sum past seven.
  const restOnlyDays = [...restDays].filter(
    (key) => inWindow(key) && !trained.has(key),
  ).length;

  return {
    avgWorkoutDaysPerWeek: roundToTenth(workoutDays / weeks),
    avgRestDaysPerWeek: roundToTenth(restOnlyDays / weeks),
    averagedOverWeeks: weeks,
  };
}

/** Days in the same calendar month as `todayKey`. */
function countInMonth(days: ReadonlySet<string>, todayKey: string): number {
  const month = todayKey.slice(0, 7);
  let count = 0;
  for (const key of days) {
    if (key.startsWith(month)) count += 1;
  }
  return count;
}
