"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import {
  clearOctivConnection,
  expireOctivConnection,
  setOctivConnection,
} from "@/lib/firestore/profile";
import { profileKey, useProfile } from "@/lib/hooks/use-profile";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { WOD_CACHE_TTL_MS, clearWodCache } from "@/lib/octiv/cache";
import {
  OctivAuthError,
  fetchOctivWod,
  isConnectionExpired,
  octivLogin,
} from "@/lib/octiv/client";
import type { OctivWod } from "@/lib/octiv/types";
import type { OctivConnection, UserProfile } from "@/lib/types";

/**
 * Octiv's programming is published in advance and rarely edited after, so a day
 * that has been read is left alone for as long as `cache.ts` would have served
 * it anyway. Matching the two means a remount inside the window does not even
 * reach `localStorage`, and never reaches Octiv.
 */
const WOD_STALE_MS = WOD_CACHE_TTL_MS;

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
      // reappearing on a day that was already visited. The local half-day cache
      // has to go with them, or it would outlive the connection it came from.
      queryClient.removeQueries({ queryKey: ["octiv"] });
      clearWodCache();
    },
  });
}

/**
 * Record that Octiv has stopped accepting a token it had not yet expired.
 *
 * Only an `OctivAuthError` gets here, and only Octiv itself can produce one: the
 * ambiguous failures — offline, gym wifi that routes nowhere, a captive portal,
 * a 500 — all come back as `OctivRequestError`, since a response without
 * `access-control-allow-origin` never reaches a status code at all. So one
 * rejection is enough to act on, and counting them before believing it would
 * only mean more dead requests before the same conclusion.
 *
 * Firestore first, so the rejection survives a reload and follows the athlete to
 * their phone. The cache write is what makes the profile card change now rather
 * than whenever its five-minute `staleTime` lapses — and, by flipping
 * `isExpired`, is also what switches the remaining days off through `enabled`.
 */
async function markConnectionExpired(
  queryClient: QueryClient,
  uid: string,
  connection: OctivConnection,
): Promise<void> {
  let expired: OctivConnection;

  try {
    expired = await expireOctivConnection(uid, connection);
  } catch {
    // Swallowed on purpose: the caller is on its way to reporting the rejection
    // that got us here, and replacing it with a Firestore error would trade a
    // problem the athlete can fix for one they cannot. The local expiry is still
    // applied below, which is what ends the run of doomed requests this session.
    expired = { ...connection, expiresAt: new Date().toISOString() };
  }

  const key = profileKey(uid);
  const previous = queryClient.getQueryData<UserProfile | null>(key);
  if (previous) {
    queryClient.setQueryData<UserProfile>(key, { ...previous, octiv: expired });
  }
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
  const queryClient = useQueryClient();

  return useQuery<OctivWod | null>({
    queryKey: ["octiv", "wod", user?.uid ?? "anonymous", dateKey],
    queryFn: async () => {
      try {
        return await fetchOctivWod(connection!, dateKey);
      } catch (error) {
        // A token Octiv refuses is a connection that has ended, whatever date it
        // was issued with. Writing that down is what turns a silent run of
        // failing days into the "sign in again" the profile card already shows
        // for a token that ran out on its own — the panel below sends the
        // athlete there, and without this it would greet them with a green tick.
        if (error instanceof OctivAuthError && user) {
          await markConnectionExpired(queryClient, user.uid, connection!);
        }
        throw error;
      }
    },
    enabled: Boolean(user && connection && !isExpired && online),
    staleTime: WOD_STALE_MS,
    // Retrying a rejected token just repeats the rejection; anything else gets
    // one more go, since a single failed request on gym wifi is normal.
    retry: (failureCount, error) =>
      !(error instanceof OctivAuthError) && failureCount < 1,
  });
}
