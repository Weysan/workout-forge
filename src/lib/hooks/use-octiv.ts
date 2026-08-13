"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import {
  clearOctivConnection,
  setOctivConnection,
} from "@/lib/firestore/profile";
import { profileKey, useProfile } from "@/lib/hooks/use-profile";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import {
  OctivAuthError,
  fetchOctivWod,
  isConnectionExpired,
  octivLogin,
} from "@/lib/octiv/client";
import type { OctivWod } from "@/lib/octiv/types";
import type { UserProfile } from "@/lib/types";

/** Octiv's programming is published in advance and rarely edited after. */
const WOD_STALE_MS = 5 * 60 * 1000;

/**
 * The connected Octiv account, read off the profile that is already loaded.
 *
 * `isExpired` is separate from `isConnected` because the two need different
 * words in the UI: an expired token is not "connect Octiv", it is "sign in
 * again".
 */
export function useOctivConnection() {
  const { data: profile, isPending } = useProfile();
  const connection = profile?.octiv ?? null;

  return {
    connection,
    isConnected: connection !== null,
    isExpired: connection !== null && isConnectionExpired(connection),
    isPending,
  };
}

export function useConnectOctiv() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = profileKey(user?.uid ?? "anonymous");

  return useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      if (!user) throw new Error("Not signed in");
      const connection = await octivLogin(
        credentials.username,
        credentials.password,
      );
      await setOctivConnection(user.uid, connection);
      return connection;
    },

    // Written straight into the cache rather than invalidated: the profile read
    // has a five-minute staleTime, so a refetch would show "not connected" for
    // as long as it took to come back.
    onSuccess: (connection) => {
      const previous = queryClient.getQueryData<UserProfile | null>(key);
      if (previous) {
        queryClient.setQueryData<UserProfile>(key, {
          ...previous,
          octiv: connection,
        });
      }
    },
  });
}

export function useDisconnectOctiv() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = profileKey(user?.uid ?? "anonymous");

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      await clearOctivConnection(user.uid);
    },

    onSuccess: () => {
      const previous = queryClient.getQueryData<UserProfile | null>(key);
      if (previous) {
        queryClient.setQueryData<UserProfile>(key, { ...previous, octiv: null });
      }
      // The day panel is keyed per date; dropping them all avoids a stale WOD
      // reappearing on a day that was already visited.
      queryClient.removeQueries({ queryKey: ["octiv"] });
    },
  });
}

/**
 * The box's programming for one calendar day.
 *
 * Gated on `online`: unlike Firestore there is no local cache behind this, so
 * offline it would only ever produce a failed request.
 */
export function useOctivWod(dateKey: string) {
  const { user } = useAuth();
  const { connection, isExpired } = useOctivConnection();
  const { online } = useSyncStatus();

  return useQuery<OctivWod | null>({
    queryKey: ["octiv", "wod", user?.uid ?? "anonymous", dateKey],
    queryFn: () => fetchOctivWod(connection!, dateKey),
    enabled: Boolean(user && connection && !isExpired && online),
    staleTime: WOD_STALE_MS,
    // Retrying a rejected token just repeats the rejection; anything else gets
    // one more go, since a single failed request on gym wifi is normal.
    retry: (failureCount, error) =>
      !(error instanceof OctivAuthError) && failureCount < 1,
  });
}
