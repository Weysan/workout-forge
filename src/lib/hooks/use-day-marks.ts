"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import {
  clearDayMark,
  fetchDayMark,
  fetchDayMarksInRange,
  setDayMark,
} from "@/lib/firestore/day-marks";
import type { DayMark, DayMarkInput } from "@/lib/types";

const root = (uid: string) => ["dayMarks", uid] as const;

export const dayMarkKeys = {
  root,
  byDate: (uid: string, dateKey: string) =>
    [...root(uid), "date", dateKey] as const,
  range: (uid: string, startKey: string, endKey: string) =>
    [...root(uid), "range", startKey, endKey] as const,
};

/**
 * Marking a day shifts the strip dots, the day view and the profile stats, so
 * every cached view of day marks is dropped rather than patched by hand.
 */
function invalidateAfterWrite(
  queryClient: ReturnType<typeof useQueryClient>,
  uid: string,
) {
  queryClient.invalidateQueries({ queryKey: root(uid) });
}

/** The rest/injury marker for one day, or `null` when the day is unmarked. */
export function useDayMark(dateKey: string) {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery<DayMark | null>({
    queryKey: dayMarkKeys.byDate(uid ?? "anonymous", dateKey),
    queryFn: () => fetchDayMark(uid!, dateKey),
    enabled: Boolean(uid),
  });
}

/** Powers the strip dots and the profile stats. */
export function useDayMarksInRange(startKey: string, endKey: string) {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery<DayMark[]>({
    queryKey: dayMarkKeys.range(uid ?? "anonymous", startKey, endKey),
    queryFn: () => fetchDayMarksInRange(uid!, startKey, endKey),
    enabled: Boolean(uid),
  });
}

export function useSetDayMark() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DayMarkInput) => {
      if (!user) throw new Error("Not signed in");
      return setDayMark(user.uid, input);
    },
    onSuccess: () => {
      if (user) invalidateAfterWrite(queryClient, user.uid);
    },
  });
}

export function useClearDayMark() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dateKey: string) => {
      if (!user) throw new Error("Not signed in");
      return clearDayMark(user.uid, dateKey);
    },
    onSuccess: () => {
      if (user) invalidateAfterWrite(queryClient, user.uid);
    },
  });
}
