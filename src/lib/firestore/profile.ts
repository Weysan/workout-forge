import {
  deleteDoc,
  getDoc,
  getDocFromCache,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { getDb } from "@/lib/firebase";
import { acceptWrite, isOnline, readWithCacheFallback } from "@/lib/offline";
import type { Gender, UnitSystem, UserProfile } from "@/lib/types";
import { prsCol, userDoc, workoutsCol } from "./paths";

export async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const ref = userDoc(uid);

  // Cache fallback matters here more than anywhere: the profile gates the whole
  // app through AuthGate, so failing to read it offline would strand a signed-in
  // user on the onboarding screen.
  const snapshot = await readWithCacheFallback(
    () => getDoc(ref),
    () => getDocFromCache(ref).catch(() => null),
  );

  if (!snapshot?.exists()) return null;

  const data = snapshot.data();
  return {
    uid,
    email: data.email ?? "",
    displayName: data.displayName ?? "",
    photoURL: data.photoURL ?? null,
    gender: (data.gender as Gender) ?? "non_binary",
    unitSystem: (data.unitSystem as UnitSystem) ?? "metric",
    createdAt: data.createdAt ?? null,
  };
}

/** Called once, at the end of onboarding. */
export async function createProfile(input: {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  gender: Gender;
  unitSystem: UnitSystem;
}): Promise<void> {
  await acceptWrite(
    "create profile",
    setDoc(userDoc(input.uid), {
      uid: input.uid,
      email: input.email,
      displayName: input.displayName,
      photoURL: input.photoURL ?? null,
      gender: input.gender,
      unitSystem: input.unitSystem,
      createdAt: serverTimestamp(),
    }),
  );
}

export async function updateProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, "displayName" | "gender" | "unitSystem">>,
): Promise<void> {
  await acceptWrite("update profile", updateDoc(userDoc(uid), patch));
}

/**
 * Delete every document the user owns.
 *
 * Firestore has no client-side recursive delete, so subcollections are removed
 * explicitly — an orphaned subcollection would survive the parent document and
 * keep the user's training data alive after they asked for it to be erased.
 */
export async function deleteAllUserData(uid: string): Promise<void> {
  // The one operation that genuinely requires a connection. Everything else in
  // the app queues happily, but "delete everything" must be confirmed by the
  // server before the auth user is removed — a queued deletion whose auth user is
  // already gone can never be authorised, and would leave the data behind
  // forever. Refusing up front is the honest behaviour.
  if (!isOnline()) {
    throw new Error(
      "Deleting your account needs a connection. Try again when you are back online.",
    );
  }

  const [workouts, records] = await Promise.all([
    getDocs(workoutsCol(uid)),
    getDocs(prsCol(uid)),
  ]);

  const docs = [...workouts.docs, ...records.docs];

  // A batch caps at 500 operations, so chunk it.
  const CHUNK = 400;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(getDb());
    for (const snapshot of docs.slice(i, i + CHUNK)) {
      batch.delete(snapshot.ref);
    }
    await batch.commit();
  }

  // Parent last: while it exists, the rules still authorise the deletes above.
  await deleteDoc(userDoc(uid));
}
