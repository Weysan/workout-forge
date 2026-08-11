"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import { fetchRecords } from "@/lib/firestore/records";
import type { PersonalRecord } from "@/lib/types";

export const prKeys = {
  all: (uid: string) => ["prs", uid] as const,
};

export function useRecords() {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery<PersonalRecord[]>({
    queryKey: prKeys.all(uid ?? "anonymous"),
    queryFn: () => fetchRecords(uid!),
    enabled: Boolean(uid),
  });
}

/** Records keyed by movement id, for joining against the benchmark library. */
export function useRecordMap() {
  const query = useRecords();
  const map = new Map<string, PersonalRecord>(
    (query.data ?? []).map((record) => [record.movementId, record]),
  );
  return { ...query, map };
}
