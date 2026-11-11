/**
 * Movements → muscle load, and muscle load → a period summary.
 *
 * A muscle's load is Σ (working seconds of a movement × that muscle's weight in
 * it). The unit is "weighted working seconds": meaningless on its own, but
 * additive across movements, workouts and days, which is all it has to be.
 *
 * How hot a muscle is drawn depends on the period:
 *
 *   · Day — relative to the day's busiest muscle. A single day is too spiky to
 *     compare with an average: every training day would be red next to the
 *     rest days dragging the average down.
 *
 *   · Week / month — relative to the athlete's own baseline: their average
 *     daily load on that muscle over the 12 weeks before the period, times the
 *     days of the period that have elapsed. Yellow is "as usual", green is less,
 *     red is more. A week in progress is compared at its pace so far, so Monday
 *     morning does not read as a week of neglect.
 *
 *     Without two weeks of history before the period there is no baseline worth
 *     the name, and the week/month falls back to the day rule.
 *
 * Pure: no imports beyond its siblings, no clock, no I/O.
 */

import { MOVEMENTS_BY_ID, MUSCLES, type Muscle } from "./catalog";
import { parseWorkout, type ParsableWorkout, type ParsedWorkout } from "./parse";

export type MuscleLoad = Partial<Record<Muscle, number>>;

export const BASELINE_DAYS = 84;
/** Less history than this before the period and the baseline is not used. */
export const MIN_BASELINE_DAYS = 14;

/** Ratios to baseline at which the colour scale reaches its ends. */
const RATIO_LOW = 0.25;
const RATIO_HIGH = 1.75;

export interface LoadableWorkout extends ParsableWorkout {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
}

export interface WorkoutLoad {
  workout: LoadableWorkout;
  parsed: ParsedWorkout;
  load: MuscleLoad;
}

export function muscleLoadOf(parsed: ParsedWorkout): MuscleLoad {
  const load: MuscleLoad = {};
  for (const item of parsed.movements) {
    const movement = MOVEMENTS_BY_ID.get(item.movementId);
    if (!movement) continue;
    for (const [muscle, weight] of Object.entries(movement.muscles) as [
      Muscle,
      number,
    ][]) {
      load[muscle] = (load[muscle] ?? 0) + item.seconds * weight;
    }
  }
  return load;
}

export function loadWorkout(workout: LoadableWorkout): WorkoutLoad {
  const parsed = parseWorkout(workout);
  return { workout, parsed, load: muscleLoadOf(parsed) };
}

export function addLoads(loads: readonly MuscleLoad[]): MuscleLoad {
  const total: MuscleLoad = {};
  for (const load of loads) {
    for (const [muscle, value] of Object.entries(load) as [Muscle, number][]) {
      total[muscle] = (total[muscle] ?? 0) + value;
    }
  }
  return total;
}

// --- Dates (local copies, as in lib/stats.ts, to stay import-free) ----------

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftKey(key: string, delta: number): string {
  const date = parseKey(key);
  date.setDate(date.getDate() + delta);
  return formatKey(date);
}

/** Inclusive day count from `start` to `end`. */
export function daysBetween(start: string, end: string): number {
  const span = parseKey(end).getTime() - parseKey(start).getTime();
  return Math.round(span / 86_400_000) + 1;
}

export type MusclePeriod = "day" | "week" | "month";

/** First and last day of the period containing `anchor`. Weeks run Monday–Sunday. */
export function periodRange(
  period: MusclePeriod,
  anchor: string,
): { start: string; end: string } {
  if (period === "day") return { start: anchor, end: anchor };
  if (period === "week") {
    const offset = (parseKey(anchor).getDay() + 6) % 7;
    const start = shiftKey(anchor, -offset);
    return { start, end: shiftKey(start, 6) };
  }
  const date = parseKey(anchor);
  const start = formatKey(new Date(date.getFullYear(), date.getMonth(), 1));
  const end = formatKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  return { start, end };
}

/** The anchor of the period before or after the one containing `anchor`. */
export function stepPeriod(
  period: MusclePeriod,
  anchor: string,
  direction: -1 | 1,
): string {
  if (period === "day") return shiftKey(anchor, direction);
  if (period === "week") return shiftKey(anchor, 7 * direction);
  const date = parseKey(anchor);
  return formatKey(new Date(date.getFullYear(), date.getMonth() + direction, 1));
}

// --- Summary ---------------------------------------------------------------

export interface MuscleStat {
  muscle: Muscle;
  load: number;
  /** Share of all muscle load in the period, 0–1. */
  share: number;
  /** Load × elapsed days the baseline predicts. `null` in relative mode. */
  expected: number | null;
  /** 0 (green) – 1 (red). `null` when the muscle did no work. */
  level: number | null;
  /** Workouts that loaded this muscle, heaviest contribution first. */
  contributors: { workoutId: string; title: string; date: string; load: number }[];
}

export interface PeriodSummary {
  start: string;
  end: string;
  mode: "baseline" | "relative";
  /** Every muscle, heaviest first; untrained muscles last with `level: null`. */
  muscles: MuscleStat[];
  workouts: WorkoutLoad[];
  /** Workouts in the period with lines the parser could not read. */
  unrecognised: { workoutId: string; title: string; lines: string[] }[];
}

export interface SummaryInput {
  period: MusclePeriod;
  anchor: string;
  /** `YYYY-MM-DD` local today. Days after it never count as elapsed. */
  today: string;
  /**
   * Workouts covering at least the period and the `BASELINE_DAYS` before it.
   * Anything outside that window is ignored.
   */
  workouts: readonly LoadableWorkout[];
}

/** First day the caller has to fetch for a summary of this period. */
export function fetchStartFor(period: MusclePeriod, anchor: string): string {
  return shiftKey(periodRange(period, anchor).start, -BASELINE_DAYS);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function summarisePeriod({
  period,
  anchor,
  today,
  workouts,
}: SummaryInput): PeriodSummary {
  const { start, end } = periodRange(period, anchor);
  const baselineStart = shiftKey(start, -BASELINE_DAYS);
  const baselineEnd = shiftKey(start, -1);

  const inPeriod: WorkoutLoad[] = [];
  const baselineLoads: MuscleLoad[] = [];
  let firstBaselineDate: string | null = null;

  for (const workout of workouts) {
    if (workout.date >= start && workout.date <= end) {
      inPeriod.push(loadWorkout(workout));
    } else if (workout.date >= baselineStart && workout.date <= baselineEnd) {
      baselineLoads.push(loadWorkout(workout).load);
      if (firstBaselineDate === null || workout.date < firstBaselineDate) {
        firstBaselineDate = workout.date;
      }
    }
  }

  const total = addLoads(inPeriod.map((w) => w.load));
  const totalLoad = Object.values(total).reduce((sum, v) => sum + (v ?? 0), 0);
  const maxLoad = Math.max(0, ...Object.values(total).map((v) => v ?? 0));

  // The baseline covers only the days since the athlete started logging, so a
  // three-week-old account is averaged over three weeks rather than twelve.
  const baselineDays =
    firstBaselineDate === null ? 0 : daysBetween(firstBaselineDate, baselineEnd);
  const useBaseline = period !== "day" && baselineDays >= MIN_BASELINE_DAYS;
  const baselineTotal = addLoads(baselineLoads);

  const lastElapsed = today < end ? today : end;
  const elapsedDays = lastElapsed < start ? 0 : daysBetween(start, lastElapsed);

  const muscles: MuscleStat[] = MUSCLES.map(({ id }) => {
    const load = total[id] ?? 0;
    let expected: number | null = null;
    let level: number | null = null;

    if (useBaseline) {
      expected = ((baselineTotal[id] ?? 0) / baselineDays) * Math.max(1, elapsedDays);
      if (load > 0) {
        level =
          expected > 0
            ? clamp01((load / expected - RATIO_LOW) / (RATIO_HIGH - RATIO_LOW))
            : 1;
      }
    } else if (load > 0 && maxLoad > 0) {
      level = load / maxLoad;
    }

    const contributors = inPeriod
      .filter((w) => (w.load[id] ?? 0) > 0)
      .map((w) => ({
        workoutId: w.workout.id,
        title: w.workout.title,
        date: w.workout.date,
        load: w.load[id] ?? 0,
      }))
      .sort((a, b) => b.load - a.load);

    return {
      muscle: id,
      load,
      share: totalLoad > 0 ? load / totalLoad : 0,
      expected,
      level,
      contributors,
    };
  }).sort((a, b) => b.load - a.load);

  const unrecognised = inPeriod
    .filter((w) => w.parsed.unrecognised.length > 0)
    .map((w) => ({
      workoutId: w.workout.id,
      title: w.workout.title,
      lines: w.parsed.unrecognised,
    }));

  return {
    start,
    end,
    mode: useBaseline ? "baseline" : "relative",
    muscles,
    workouts: inPeriod,
    unrecognised,
  };
}

/** Green (0) → yellow (0.5) → red (1). */
export function levelColor(level: number): string {
  const hue = Math.round(130 * (1 - clamp01(level)));
  return `hsl(${hue} 75% 48%)`;
}
