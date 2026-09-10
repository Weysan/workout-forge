"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import {
  createProfile,
  fetchProfile,
  rememberProfileLocation,
  updateProfile,
} from "@/lib/firestore/profile";
import type { Gender, UnitSystem, UserProfile } from "@/lib/types";

export const profileKey = (uid: string) => ["profile", uid] as const;

/**
 * The signed-in user's profile.
 *
 * `data === null` is meaningful: the user is authenticated but has not completed
 * onboarding. `AuthGate` relies on that to distinguish "no profile yet" from
 * "still loading".
 */
export function useProfile() {
  const { user } = useAuth();

  return useQuery<UserProfile | null>({
    queryKey: profileKey(user?.uid ?? "anonymous"),
    queryFn: () => fetchProfile(user!.uid),
    enabled: Boolean(user?.uid),
    // The profile changes only from the settings form, which updates the cache
    // directly, so background refetching would just add reads.
    staleTime: 5 * 60 * 1000,
  });
}

/** Unit preference, safe to call before the profile loads. */
export function useUnitSystem(): UnitSystem {
  const { data } = useProfile();
  return data?.unitSystem ?? "metric";
}

/**
 * Places the athlete has tagged a session with, most recently used first.
 *
 * Safe to call before the profile loads, like `useUnitSystem`: an empty list is
 * the honest answer for an athlete who has not tagged anything yet, and it is
 * also the right one for a form that opened before the read came back — the
 * field is free text either way, so nothing is blocked by having no suggestions.
 */
export function useLocations(): string[] {
  const { data } = useProfile();
  return data?.locations ?? [];
}

/**
 * Remember the place a session was just saved at.
 *
 * Separate from `useUpdateProfile` because it is not a settings change: nobody
 * asked for it, it happens as a side effect of logging a workout, and it must be
 * invisible when it fails. Errors are swallowed for that reason — a suggestion
 * that did not get remembered costs one retype next time, and surfacing it would
 * put an error toast over a workout that saved perfectly well.
 */
export function useRememberLocation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = profileKey(user?.uid ?? "anonymous");
  const locations = useLocations();

  return useMutation({
    mutationFn: async (name: string | null) => {
      if (!user) return null;
      return rememberProfileLocation(user.uid, locations, name);
    },

    onSuccess: (next) => {
      // `null` means the list was already in this order, so there is nothing to
      // patch. Written into the cache rather than invalidated: the profile is
      // read once per session on purpose, and re-fetching it to learn a list this
      // client just computed would be a read for nothing.
      if (!next) return;
      const previous = queryClient.getQueryData<UserProfile | null>(key);
      if (previous) {
        queryClient.setQueryData<UserProfile>(key, {
          ...previous,
          locations: next,
        });
      }
    },
  });
}

export function useCreateProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      displayName: string;
      gender: Gender;
      unitSystem: UnitSystem;
    }) => {
      if (!user) throw new Error("Not signed in");
      await createProfile({
        uid: user.uid,
        email: user.email ?? "",
        photoURL: user.photoURL,
        ...input,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: profileKey(user?.uid ?? "anonymous"),
      });
    },
  });
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = profileKey(user?.uid ?? "anonymous");

  return useMutation({
    mutationFn: async (
      patch: Partial<Pick<UserProfile, "displayName" | "gender" | "unitSystem">>,
    ) => {
      if (!user) throw new Error("Not signed in");
      await updateProfile(user.uid, patch);
      return patch;
    },

    // Flipping kg → lbs re-renders every score in the app, so it has to feel
    // instant; waiting for the write would make the toggle lag behind the thumb.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserProfile | null>(key);
      if (previous) {
        queryClient.setQueryData<UserProfile>(key, { ...previous, ...patch });
      }
      return { previous };
    },

    onError: (_error, _patch, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous);
      }
    },
  });
}
