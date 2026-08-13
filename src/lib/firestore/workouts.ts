import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { acceptWrite, readWithCacheFallback } from "@/lib/offline";
import type { Workout, WorkoutInput } from "@/lib/types";
import { clearDayMark, fetchDayMark } from "./day-marks";
import { workoutDoc, workoutsCol } from "./paths";
import { syncRecordForBenchmark } from "./records";

function toWorkout(snapshot: QueryDocumentSnapshot<DocumentData>): Workout {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    date: data.date ?? "",
    title: data.title ?? "",
    type: data.type ?? "Custom",
    description: data.description ?? "",
    scoreType: data.scoreType ?? "pass_fail",
    // Anything that is not a number reads as "not scored yet", which is also the
    // right answer for a document written before the field existed.
    scoreValue: typeof data.scoreValue === "number" ? data.scoreValue : null,
    scoreDisplay: data.scoreDisplay ?? "",
    rxOrScaled: data.rxOrScaled ?? "RX",
    isPR: Boolean(data.isPR),
    linkedBenchmarkId: data.linkedBenchmarkId ?? null,
    reps: typeof data.reps === "number" ? data.reps : null,
    notes: data.notes ?? "",
    createdAt: data.createdAt ?? null,
  };
}

/** Runs a query against the server, falling back to the local cache. */
function readQuery(q: Query<DocumentData>) {
  return readWithCacheFallback(
    () => getDocs(q),
    () => getDocsFromCache(q),
  );
}

/** All workouts logged on one calendar day, most recently entered first. */
export async function fetchWorkoutsByDate(
  uid: string,
  dateKey: string,
): Promise<Workout[]> {
  const snapshot = await readQuery(
    query(
      workoutsCol(uid),
      where("date", "==", dateKey),
      orderBy("createdAt", "desc"),
    ),
  );
  return snapshot.docs.map(toWorkout);
}

/**
 * Dates within a range that have at least one workout — drives the activity
 * dots on the date strip. Reads whole documents because Firestore has no
 * projection; the volume for a single month is trivial.
 */
export async function fetchWorkoutDatesInRange(
  uid: string,
  startKey: string,
  endKey: string,
): Promise<string[]> {
  const snapshot = await readQuery(
    query(
      workoutsCol(uid),
      where("date", ">=", startKey),
      where("date", "<=", endKey),
    ),
  );
  return Array.from(new Set(snapshot.docs.map((d) => d.data().date as string)));
}

export async function fetchWorkout(
  uid: string,
  workoutId: string,
): Promise<Workout | null> {
  const ref = workoutDoc(uid, workoutId);

  const snapshot = await readWithCacheFallback(
    () => getDoc(ref),
    // getDocFromCache rejects outright when the document was never cached, which
    // for a read is "not found" rather than a failure.
    () => getDocFromCache(ref).catch(() => null),
  );

  if (!snapshot?.exists()) return null;
  return toWorkout(snapshot as QueryDocumentSnapshot<DocumentData>);
}

/** Every attempt at one benchmark, newest first — the PR detail sheet. */
export async function fetchBenchmarkHistory(
  uid: string,
  benchmarkId: string,
  max = 100,
): Promise<Workout[]> {
  const snapshot = await readQuery(
    query(
      workoutsCol(uid),
      where("linkedBenchmarkId", "==", benchmarkId),
      orderBy("date", "desc"),
      limit(max),
    ),
  );
  return snapshot.docs.map(toWorkout);
}

export interface WriteResult {
  id: string;
  /** True when the write is applied locally but not yet confirmed by the server. */
  queued: boolean;
}

export async function createWorkout(
  uid: string,
  input: WorkoutInput,
): Promise<WriteResult> {
  // `doc(collection)` generates the id client-side, so it is available
  // immediately even with no connection. addDoc would only hand it back with the
  // promise that waits for the server.
  const ref = doc(workoutsCol(uid));

  const outcome = await acceptWrite(
    `create workout ${input.title}`,
    setDoc(ref, { ...input, createdAt: serverTimestamp() }),
  );

  await releaseRestDaySafely(uid, input.date);

  // The record table is derived data, so it is refreshed after every write that
  // could change it rather than being maintained by hand at each call site. This
  // reads through the local cache, which already reflects the write above, so it
  // produces the right answer offline too.
  if (input.linkedBenchmarkId) {
    await syncRecordsSafely(uid, [input.linkedBenchmarkId]);
  }

  return { id: ref.id, queued: !outcome.acked };
}

export async function updateWorkout(
  uid: string,
  workoutId: string,
  input: WorkoutInput,
  /** Passed when an edit moved the workout off a benchmark, so the old one is recomputed too. */
  previousBenchmarkId?: string | null,
): Promise<WriteResult> {
  const outcome = await acceptWrite(
    `update workout ${workoutId}`,
    updateDoc(workoutDoc(uid, workoutId), { ...input }),
  );

  // An edit can move a session onto a day that was marked as rest.
  await releaseRestDaySafely(uid, input.date);

  const affected = new Set(
    [input.linkedBenchmarkId, previousBenchmarkId].filter(
      (id): id is string => Boolean(id),
    ),
  );
  await syncRecordsSafely(uid, affected);

  return { id: workoutId, queued: !outcome.acked };
}

export async function deleteWorkout(
  uid: string,
  workoutId: string,
  benchmarkId: string | null,
): Promise<WriteResult> {
  const outcome = await acceptWrite(
    `delete workout ${workoutId}`,
    deleteDoc(workoutDoc(uid, workoutId)),
  );

  // Deleting the session that set a record must give the record back to the
  // next-best attempt, not leave a PR pointing at nothing.
  if (benchmarkId) {
    await syncRecordsSafely(uid, [benchmarkId]);
  }

  return { id: workoutId, queued: !outcome.acked };
}

/**
 * Drop the rest-day marker on a day that has just had a session written to it.
 *
 * A day cannot be both "rested" and "trained", and of the two the workout is the
 * stronger claim: it is a thing that happened, whereas the rest mark was a plan.
 * The UI stops you marking rest on a day that already has workouts, so this
 * covers the other direction — logging or re-dating a session onto a rest day.
 *
 * An injury mark is deliberately left alone: getting hurt during a session is
 * exactly when you would record one.
 *
 * Failure-tolerant for the same reason as `syncRecordsSafely` below — the
 * workout is already saved by the time this runs, so rejecting here would report
 * a saved session as an error and invite a retry that files a duplicate.
 */
async function releaseRestDaySafely(uid: string, dateKey: string) {
  try {
    const mark = await fetchDayMark(uid, dateKey);
    if (mark?.status === "rest") {
      await clearDayMark(uid, dateKey);
    }
  } catch (error) {
    console.warn(
      `[forge] the rest marker on ${dateKey} could not be cleared; ` +
        "the day will show as both rested and trained until it is re-marked.",
      error,
    );
  }
}

/**
 * Refresh the derived records for the given benchmarks, without letting a
 * failure fail the caller.
 *
 * The record sync necessarily runs after the workout write has been issued. If it
 * were allowed to reject, the mutation would surface as an error for a workout
 * that is already saved — and the natural response, retrying, would file a
 * duplicate. That is a real risk when entering historical results in bulk.
 *
 * Records are derived from the log and recomputed on every subsequent write, so
 * the worst case here is a briefly stale PR badge rather than lost data.
 */
async function syncRecordsSafely(uid: string, benchmarkIds: Iterable<string>) {
  for (const benchmarkId of benchmarkIds) {
    try {
      await syncRecordForBenchmark(uid, benchmarkId);
    } catch (error) {
      console.warn(
        `[forge] personal record for "${benchmarkId}" could not be recomputed; ` +
          "it will be corrected on the next write to this benchmark.",
        error,
      );
    }
  }
}
