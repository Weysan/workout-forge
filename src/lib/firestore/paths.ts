import { collection, doc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";

/**
 * Every path is rooted at `users/{uid}`, which is what makes the security rules
 * a single owner check. Centralised here so no query can accidentally address
 * another user's data.
 */

export const userDoc = (uid: string) => doc(getDb(), "users", uid);

export const workoutsCol = (uid: string) =>
  collection(getDb(), "users", uid, "workouts");

export const workoutDoc = (uid: string, workoutId: string) =>
  doc(getDb(), "users", uid, "workouts", workoutId);

export const dayMarksCol = (uid: string) =>
  collection(getDb(), "users", uid, "days");

/** The day-mark document id *is* the `YYYY-MM-DD` key — one marker per day. */
export const dayMarkDoc = (uid: string, dateKey: string) =>
  doc(getDb(), "users", uid, "days", dateKey);

export const prsCol = (uid: string) => collection(getDb(), "users", uid, "prs");

/** The PR document id *is* the movement id, which makes writes a natural upsert. */
export const prDoc = (uid: string, movementId: string) =>
  doc(getDb(), "users", uid, "prs", movementId);
