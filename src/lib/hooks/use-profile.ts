"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import {
  createProfile,
  fetchProfile,
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
