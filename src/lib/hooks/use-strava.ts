"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import {
  clearStravaConnection,
  markStravaRevoked,
  setStravaConnection,
  updateStravaTokens,
} from "@/lib/firestore/profile";
import { profileKey, useProfile } from "@/lib/hooks/use-profile";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import {
  ACTIVITY_CACHE_TTL_MS,
  TODAY_ACTIVITY_TTL_MS,
  clearActivityCache,
} from "@/lib/strava/cache";
import {
  StravaAuthError,
  ensureFreshConnection,
  exchangeCode,
  fetchStravaActivities,
  resetRefreshState,
} from "@/lib/strava/client";
import type { StravaActivity } from "@/lib/strava/types";
import type { StravaConnection, UserProfile } from "@/lib/types";

/**
 * The connected Strava account, read off the profile that is already loaded.
 *
 * `isRevoked` plays the part `isExpired` plays for Octiv, but it cannot be
 * derived from the expiry: a Strava access token is stale most of the time by
 * design and refreshes itself, so only a *refused refresh* means the connection
 * has ended. See `revokedAt` on `StravaConnection`.
 */
export function useStravaConnection() {
  const { data: profile, isPending } = useProfile();
  const connection = profile?.strava ?? null;

  return {
    connection,
    isConnected: connection !== null,
    isRevoked: connection !== null && Boolean(connection.revokedAt),
    isPending,
  };
}

/** Write a connection straight into the profile cache, without a refetch. */
function patchProfile(
  queryClient: QueryClient,
  uid: string,
  strava: StravaConnection | null,
) {
  const key = profileKey(uid);
  const previous = queryClient.getQueryData<UserProfile | null>(key);
  if (previous) {
    queryClient.setQueryData<UserProfile>(key, { ...previous, strava });
  }
}

/**
 * Finish the OAuth flow: turn the code from the callback into a stored
 * connection.
 *
 * There is no `useConnectStrava` counterpart to Octiv's, because starting the
 * flow is a redirect rather than a request — the connect button just leaves for
 * Strava. This is the half that comes back.
 */
export function useCompleteStravaConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ code, scope }: { code: string; scope: string }) => {
      if (!user) throw new Error("Not signed in");
      const connection = await exchangeCode(code, scope);
      await setStravaConnection(user.uid, connection);
      return connection;
    },

    // Written into the cache rather than invalidated, for the same reason as
    // Octiv's: the profile read has a five-minute staleTime, so a refetch would
    // show "not connected" for as long as it took to come back — and here that
    // lands on a page whose whole job is to report success.
    onSuccess: (connection) => {
      if (user) patchProfile(queryClient, user.uid, connection);
    },
  });
}

export function useDisconnectStrava() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      await clearStravaConnection(user.uid);
    },

    onSuccess: () => {
      if (user) patchProfile(queryClient, user.uid, null);
      // The day panels are keyed per date; dropping them all avoids a stale
      // activity reappearing on a day that was already visited. The local cache
      // has to go with them, or it would outlive the connection it came from.
      queryClient.removeQueries({ queryKey: ["strava"] });
      clearActivityCache();
      // The module-level refresh memo in strava/client.ts outlives the
      // connection that filled it, and connecting a different account in the
      // same session must not be handed the previous one's tokens.
      resetRefreshState();
    },
  });
}

/**
 * A connection with a live access token, refreshing and persisting if needed.
 *
 * The bridge between `strava/client.ts`, which deliberately knows nothing about
 * Firestore, and the profile document that holds the tokens. Every read goes
 * through here.
 *
 * A refused refresh is the end of the connection: it is recorded on the profile
 * so the card can ask for a reconnect and the day panels stop asking, and then
 * rethrown so the caller still fails rather than proceeding with a dead token.
 */
export function useFreshStravaConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return async function fresh(
    connection: StravaConnection,
  ): Promise<StravaConnection> {
    if (!user) throw new Error("Not signed in");

    try {
      return await ensureFreshConnection(connection, async (tokens) => {
        const next = await updateStravaTokens(user.uid, connection, tokens);
        patchProfile(queryClient, user.uid, next);
        return next;
      });
    } catch (error) {
      if (error instanceof StravaAuthError) {
        // Firestore first, so the fact survives a reload and follows the athlete
        // to their other devices — the same ordering as Octiv's
        // `markConnectionExpired`, and for the same reasons.
        try {
          const revoked = await markStravaRevoked(user.uid, connection);
          patchProfile(queryClient, user.uid, revoked);
        } catch {
          // Swallowed on purpose: the caller is already reporting the refusal
          // that got us here, and replacing it with a Firestore error would
          // trade a problem the athlete can fix for one they cannot.
          patchProfile(queryClient, user.uid, {
            ...connection,
            revokedAt: new Date().toISOString(),
          });
        }
      }
      throw error;
    }
  };
}

/**
 * Today, local — the same convention the cache uses for its TTL split.
 */
function localDayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The athlete's Strava activities for one calendar day.
 *
 * Gated on `online`, like the Octiv WOD query: there is no Firestore behind this,
 * so offline it would only ever produce a failed request.
 *
 * `staleTime` matches whichever TTL `cache.ts` would have applied, so a remount
 * inside the window does not even reach `localStorage` — and today, the one day
 * that changes, is allowed to go stale in five minutes rather than twelve hours.
 */
export function useStravaActivities(dateKey: string) {
  const { user } = useAuth();
  const { connection, isRevoked } = useStravaConnection();
  const { online } = useSyncStatus();
  const fresh = useFreshStravaConnection();

  const isTodayOrLater = dateKey >= localDayKey();

  return useQuery<StravaActivity[]>({
    queryKey: ["strava", "activities", user?.uid ?? "anonymous", dateKey],
    queryFn: async () => {
      // Refreshed first rather than reacting to a 401: the access token lasts six
      // hours, so it is stale more often than not, and a request made with it
      // would usually fail on the first visit of the day.
      const live = await fresh(connection!);
      return fetchStravaActivities(live, dateKey);
    },
    enabled: Boolean(user && connection && !isRevoked && online),
    staleTime: isTodayOrLater ? TODAY_ACTIVITY_TTL_MS : ACTIVITY_CACHE_TTL_MS,
    // Retrying a revoked connection just repeats the rejection; anything else
    // gets one more go, since a single failed request on mobile data is normal.
    retry: (failureCount, error) =>
      !(error instanceof StravaAuthError) && failureCount < 1,
  });
}
