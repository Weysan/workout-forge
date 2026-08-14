"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import {
  createWorkout,
  deleteWorkout,
  fetchBenchmarkHistory,
  fetchWorkout,
  fetchWorkoutDatesInRange,
  fetchWorkoutsByDate,
  setDayOrder,
  updateWorkout,
} from "@/lib/firestore/workouts";
import type { Workout, WorkoutInput } from "@/lib/types";

const root = (uid: string) => ["workouts", uid] as const;

export const workoutKeys = {
  byDate: (uid: string, dateKey: string) =>
    [...root(uid), "date", dateKey] as const,
  range: (uid: string, startKey: string, endKey: string) =>
    [...root(uid), "range", startKey, endKey] as const,
  single: (uid: string, id: string) => [...root(uid), "single", id] as const,
  benchmark: (uid: string, benchmarkId: string) =>
    [...root(uid), "benchmark", benchmarkId] as const,
};

/** Every write can shift PRs and badges, so derived caches are dropped wholesale. */
function invalidateAfterWrite(
  queryClient: ReturnType<typeof useQueryClient>,
  uid: string,
) {
  queryClient.invalidateQueries({ queryKey: root(uid) });
  queryClient.invalidateQueries({ queryKey: ["prs", uid] });
  // Writing a session onto a rest day clears that day's marker — see
  // `releaseRestDaySafely` — so the day views have to be re-read too.
  queryClient.invalidateQueries({ queryKey: ["dayMarks", uid] });
}

export function useWorkoutsByDate(dateKey: string) {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery<Workout[]>({
    queryKey: workoutKeys.byDate(uid ?? "anonymous", dateKey),
    queryFn: () => fetchWorkoutsByDate(uid!, dateKey),
    enabled: Boolean(uid),
  });
}

/** Powers the activity dots on the date strip. */
export function useWorkoutDatesInRange(startKey: string, endKey: string) {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery<string[]>({
    queryKey: workoutKeys.range(uid ?? "anonymous", startKey, endKey),
    queryFn: () => fetchWorkoutDatesInRange(uid!, startKey, endKey),
    enabled: Boolean(uid),
  });
}

export function useWorkout(workoutId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery<Workout | null>({
    queryKey: workoutKeys.single(uid ?? "anonymous", workoutId ?? ""),
    queryFn: () => fetchWorkout(uid!, workoutId!),
    enabled: Boolean(uid && workoutId),
  });
}

export function useBenchmarkHistory(benchmarkId: string | null) {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery<Workout[]>({
    queryKey: workoutKeys.benchmark(uid ?? "anonymous", benchmarkId ?? ""),
    queryFn: () => fetchBenchmarkHistory(uid!, benchmarkId!),
    enabled: Boolean(uid && benchmarkId),
  });
}

export function useCreateWorkout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: WorkoutInput) => {
      if (!user) throw new Error("Not signed in");
      return createWorkout(user.uid, input);
    },
    onSuccess: () => {
      if (user) invalidateAfterWrite(queryClient, user.uid);
    },
  });
}

export function useUpdateWorkout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      workoutId: string;
      input: WorkoutInput;
      previousBenchmarkId?: string | null;
    }) => {
      if (!user) throw new Error("Not signed in");
      // Returned so callers can tell a confirmed save from a queued one.
      return updateWorkout(
        user.uid,
        args.workoutId,
        args.input,
        args.previousBenchmarkId,
      );
    },
    onSuccess: () => {
      if (user) invalidateAfterWrite(queryClient, user.uid);
    },
  });
}

/**
 * Persists the order the athlete arranged a day into.
 *
 * The list is rewritten in the cache before the batch is issued: the panel this
 * runs from closes on save, and a day that snapped back to its old order for a
 * moment would read as a failed write. Only `order` changes, so the cached
 * documents are otherwise correct — no refetch is needed for the day to be right.
 */
export function useReorderWorkouts(dateKey: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const uid = user?.uid ?? "anonymous";
  const listKey = workoutKeys.byDate(uid, dateKey);

  return useMutation({
    mutationFn: async (workoutIds: readonly string[]) => {
      if (!user) throw new Error("Not signed in");
      return setDayOrder(user.uid, dateKey, workoutIds);
    },

    onMutate: async (workoutIds) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<Workout[]>(listKey);

      queryClient.setQueryData<Workout[]>(listKey, (current) => {
        if (!current) return current;
        const byId = new Map(current.map((workout) => [workout.id, workout]));
        // flatMap rather than map + filter: an id with no document behind it —
        // deleted from another tab, say — drops out instead of leaving a hole.
        return workoutIds.flatMap<Workout>((id, index) => {
          const workout = byId.get(id);
          return workout ? [{ ...workout, order: index }] : [];
        });
      });

      return { previous };
    },

    onError: (_error, _workoutIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },

    // Deliberately narrower than `invalidateAfterWrite`: an arrangement cannot
    // change a score, so no record or day marker is affected by it. Only the
    // day's own list is re-read.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

export function useDeleteWorkout(dateKey: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const uid = user?.uid ?? "anonymous";
  const listKey = workoutKeys.byDate(uid, dateKey);

  return useMutation({
    mutationFn: async (workout: Pick<Workout, "id" | "linkedBenchmarkId">) => {
      if (!user) throw new Error("Not signed in");
      return deleteWorkout(user.uid, workout.id, workout.linkedBenchmarkId);
    },

    // Removed from the feed immediately — a card that lingers after "Delete"
    // reads as a failure even when the write is in flight.
    onMutate: async (workout) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<Workout[]>(listKey);
      queryClient.setQueryData<Workout[]>(
        listKey,
        (current) => current?.filter((w) => w.id !== workout.id) ?? [],
      );
      return { previous };
    },

    onError: (_error, _workout, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },

    onSettled: () => {
      if (user) invalidateAfterWrite(queryClient, user.uid);
    },
  });
}
