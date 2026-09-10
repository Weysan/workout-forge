import {
  deleteDoc,
  deleteField,
  getDoc,
  getDocFromCache,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { getDb } from "@/lib/firebase";
import { readLocations, rememberLocation } from "@/lib/locations";
import { acceptWrite, isOnline, readWithCacheFallback } from "@/lib/offline";
import type {
  Gender,
  OctivConnection,
  StravaConnection,
  UnitSystem,
  UserProfile,
} from "@/lib/types";
import { dayMarksCol, prsCol, userDoc, workoutsCol } from "./paths";

/**
 * The stored Octiv connection, or `null` if it is not there or not usable.
 *
 * Written by an older build, half-written, or hand-edited: any of those would
 * otherwise reach `fetch` as an `undefined` token and fail as a network error
 * rather than as the "not connected" it actually is.
 */
function toOctivConnection(value: unknown): OctivConnection | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  if (typeof raw.accessToken !== "string" || raw.accessToken.length === 0) {
    return null;
  }

  return {
    accessToken: raw.accessToken,
    tokenType: typeof raw.tokenType === "string" ? raw.tokenType : "Bearer",
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : "",
    username: typeof raw.username === "string" ? raw.username : "",
  };
}

/**
 * The stored Strava connection, or `null` if it is not there or not usable.
 *
 * Stricter than its Octiv counterpart in one place: a connection without a
 * refresh token is treated as absent. Strava access tokens last six hours, so
 * such a record is dead within the day and there is nothing that can renew it —
 * reading it as "connected" would show a green tick over a connection that
 * cannot be repaired except by connecting again.
 */
function toStravaConnection(value: unknown): StravaConnection | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  if (typeof raw.accessToken !== "string" || raw.accessToken.length === 0) {
    return null;
  }
  if (typeof raw.refreshToken !== "string" || raw.refreshToken.length === 0) {
    return null;
  }

  return {
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken,
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : "",
    athleteId: typeof raw.athleteId === "number" ? raw.athleteId : 0,
    username: typeof raw.username === "string" ? raw.username : "",
    scope: typeof raw.scope === "string" ? raw.scope : "",
    revokedAt: typeof raw.revokedAt === "string" ? raw.revokedAt : null,
  };
}

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
    octiv: toOctivConnection(data.octiv),
    strava: toStravaConnection(data.strava),
    locations: readLocations(data.locations),
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
 * Move a place to the front of the athlete's remembered list, and return the
 * list as it was written — or `null` when there was nothing to write.
 *
 * Called after a workout is saved, never before: a place is worth remembering
 * because a session happened there, and remembering one from a form the athlete
 * abandoned would put a phantom box in their suggestions.
 *
 * `null` covers the ordinary case — the same box as last time, already at the
 * front — so the tenth session at your own gym costs no write at all. The caller
 * treats a failure here as nothing happening: this list is a convenience, and
 * losing an entry costs one retype, so it must never be able to fail a save.
 */
export async function rememberProfileLocation(
  uid: string,
  current: readonly string[],
  name: string | null,
): Promise<string[] | null> {
  const next = rememberLocation(current, name);

  if (
    next.length === current.length &&
    next.every((place, index) => place === current[index])
  ) {
    return null;
  }

  await acceptWrite(
    `remember location ${name}`,
    updateDoc(userDoc(uid), { locations: next }),
  );

  return next;
}

/**
 * Store the Octiv bearer token on the user document.
 *
 * Kept here rather than on the device so the connection follows the athlete to
 * their phone, and because the user document is already the one place only they
 * can read (see firestore.rules). The password that produced the token is never
 * written anywhere.
 */
export async function setOctivConnection(
  uid: string,
  connection: OctivConnection,
): Promise<void> {
  await acceptWrite(
    "connect octiv",
    updateDoc(userDoc(uid), { octiv: connection }),
  );
}

/**
 * Move the stored connection's expiry to now, keeping everything else, and
 * return what was written.
 *
 * For the one case the issued expiry cannot describe: Octiv refusing a token
 * before the date it came with, because it was revoked or the password behind it
 * changed. Recording that as an expiry puts the athlete in the state the profile
 * card already has words and a button for.
 *
 * Deliberately not `clearOctivConnection` — deleting the field would take the
 * username with it and read as the app quietly forgetting the integration, when
 * what actually happened is that it needs signing into again.
 */
export async function expireOctivConnection(
  uid: string,
  connection: OctivConnection,
): Promise<OctivConnection> {
  const expired: OctivConnection = {
    ...connection,
    expiresAt: new Date().toISOString(),
  };

  await acceptWrite("expire octiv", updateDoc(userDoc(uid), { octiv: expired }));

  return expired;
}

/** Remove the field outright — an emptied object would still read as connected. */
export async function clearOctivConnection(uid: string): Promise<void> {
  await acceptWrite(
    "disconnect octiv",
    updateDoc(userDoc(uid), { octiv: deleteField() }),
  );
}

/**
 * Store the Strava connection on the user document.
 *
 * Same reasoning as `setOctivConnection`: the user document is the one place only
 * its owner can read, and keeping the connection there rather than on the device
 * means it follows the athlete to their phone. It also rescues the one awkward
 * case in the OAuth flow — an installed PWA that hands the authorize step to
 * Safari finishes the connection *there*, and this is what makes the PWA pick it
 * up on its next profile read.
 */
export async function setStravaConnection(
  uid: string,
  connection: StravaConnection,
): Promise<void> {
  await acceptWrite(
    "connect strava",
    updateDoc(userDoc(uid), { strava: connection }),
  );
}

/**
 * Persist rotated tokens, keeping the athlete's identity from the original
 * connection.
 *
 * Split out from `setStravaConnection` because a refresh response carries no
 * athlete: Strava sends that only on the first exchange. Writing a whole
 * connection built from a refresh would blank `athleteId`, `username` and
 * `scope`.
 *
 * Called on the way *in* to using a freshly refreshed token, never after: Strava
 * invalidates the previous refresh token as soon as it issues a new one, so a
 * token that is used before it is stored is a token that can be lost to a
 * reload.
 */
export async function updateStravaTokens(
  uid: string,
  connection: StravaConnection,
  tokens: { accessToken: string; refreshToken: string; expiresAt: string },
): Promise<StravaConnection> {
  const next: StravaConnection = { ...connection, ...tokens, revokedAt: null };

  await acceptWrite("refresh strava", updateDoc(userDoc(uid), { strava: next }));

  return next;
}

/**
 * Record that Strava has refused to renew this connection, and return what was
 * written.
 *
 * The Strava counterpart of `expireOctivConnection`, and deliberately not
 * `clearStravaConnection` for the same reason: deleting the field would take the
 * athlete's name with it and read as the app forgetting the integration, when what
 * actually happened is that it needs connecting again.
 */
export async function markStravaRevoked(
  uid: string,
  connection: StravaConnection,
): Promise<StravaConnection> {
  const revoked: StravaConnection = {
    ...connection,
    revokedAt: new Date().toISOString(),
  };

  await acceptWrite(
    "revoke strava",
    updateDoc(userDoc(uid), { strava: revoked }),
  );

  return revoked;
}

/** Remove the field outright — an emptied object would still read as connected. */
export async function clearStravaConnection(uid: string): Promise<void> {
  await acceptWrite(
    "disconnect strava",
    updateDoc(userDoc(uid), { strava: deleteField() }),
  );
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

  const [workouts, records, dayMarks] = await Promise.all([
    getDocs(workoutsCol(uid)),
    getDocs(prsCol(uid)),
    getDocs(dayMarksCol(uid)),
  ]);

  const docs = [...workouts.docs, ...records.docs, ...dayMarks.docs];

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
