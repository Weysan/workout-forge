"use client";

import { useMemo } from "react";

import { useDayMarksInRange } from "@/lib/hooks/use-day-marks";
import { useWorkoutDatesInRange } from "@/lib/hooks/use-workouts";
import {
  computeTrainingStats,
  shiftDayKey,
  STATS_WINDOW_DAYS,
  type TrainingStats,
} from "@/lib/stats";
import { todayKey } from "@/lib/utils";

/**
 * Training habit statistics for the profile.
 *
 * Built on the same two range queries the calendar already uses, so the numbers
 * come out of the local cache — and therefore work offline — rather than needing
 * a counter maintained on every write. Aggregates kept as stored fields would
 * have to be corrected on every edit, backdated entry and deletion; recomputing
 * from the log cannot drift.
 *
 * The window ends at today: a session planned for next week is not history and
 * must not move an average.
 */
export function useTrainingStats(): {
  data: TrainingStats | null;
  isPending: boolean;
} {
  const today = todayKey();
  const start = shiftDayKey(today, -(STATS_WINDOW_DAYS - 1));

  const workouts = useWorkoutDatesInRange(start, today);
  const marks = useDayMarksInRange(start, today);

  const data = useMemo(() => {
    if (!workouts.data || !marks.data) return null;
    return computeTrainingStats({
      todayKey: today,
      workoutDates: workouts.data,
      dayMarks: marks.data,
    });
  }, [workouts.data, marks.data, today]);

  return { data, isPending: workouts.isPending || marks.isPending };
}
