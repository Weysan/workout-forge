import {
  deleteDoc,
  getDocs,
  getDocsFromCache,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { getBenchmark } from "@/constants/seedData";
import { getDb } from "@/lib/firebase";
import { acceptWrite, readWithCacheFallback } from "@/lib/offline";
import { beatsRecord } from "@/lib/scoring";
import type { PersonalRecord } from "@/lib/types";
import { prDoc, prsCol, workoutDoc, workoutsCol } from "./paths";

/**
 * Personal records.
 *
 * `users/{uid}/prs` is a *derived* collection: the workout log is the source of
 * truth, and every record can be recomputed from it. That choice matters when a
 * user edits a score downwards or deletes the session that set a record — the
 * record has to fall back to the next-best attempt, which is impossible if PRs
 * are only ever written forwards.
 */

function toRecord(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): PersonalRecord {
  const data = snapshot.data();
  return {
    movementId: snapshot.id,
    name: data.name ?? snapshot.id,
    category: data.category ?? "Benchmark",
    scoreType: data.scoreType ?? "time_seconds",
    bestValue: typeof data.bestValue === "number" ? data.bestValue : 0,
    bestDisplay: data.bestDisplay ?? "",
    achievedOn: data.achievedOn ?? "",
    updatedAt: data.updatedAt ?? null,
  };
}

/** Runs a query against the server, falling back to the local cache. */
function readQuery(q: Query<DocumentData>) {
  return readWithCacheFallback(
    () => getDocs(q),
    () => getDocsFromCache(q),
  );
}

export async function fetchRecords(uid: string): Promise<PersonalRecord[]> {
  const snapshot = await readQuery(prsCol(uid));
  return snapshot.docs.map(toRecord);
}

/**
 * Recompute the record for one benchmark from the workout log, and re-badge the
 * sessions that do or do not hold it.
 *
 * Called after any write that could change the standing best. Idempotent, so a
 * retry after a dropped connection is safe.
 */
export async function syncRecordForBenchmark(
  uid: string,
  benchmarkId: string,
): Promise<void> {
  const benchmark = getBenchmark(benchmarkId);

  // Reads through the cache when offline. The cache already reflects any write
  // just applied locally, so the recompute below reaches the same conclusion with
  // or without a connection.
  const attempts = await readQuery(
    query(workoutsCol(uid), where("linkedBenchmarkId", "==", benchmarkId)),
  );

  // No attempts left — the record no longer exists.
  if (attempts.empty) {
    await acceptWrite(
      `clear record ${benchmarkId}`,
      // Already absent is not a failure worth propagating.
      deleteDoc(prDoc(uid, benchmarkId)).catch(() => {}),
    );
    return;
  }

  const scoreType =
    benchmark?.scoreType ??
    (attempts.docs[0].data().scoreType as PersonalRecord["scoreType"]);

  // `pass_fail` and any score of 0 are not achievements worth recording as a
  // best, and a DNF must never become a "record time" of 00:00.
  //
  // The same test also excludes sessions that carry no score at all (`null`),
  // which is what keeps a workout planned in advance out of the record table
  // until its result is actually filled in.
  const scored = attempts.docs.filter((d) => {
    const value = d.data().scoreValue;
    return typeof value === "number" && value > 0;
  });

  if (scored.length === 0) {
    await acceptWrite(
      `clear record ${benchmarkId}`,
      deleteDoc(prDoc(uid, benchmarkId)).catch(() => {}),
    );
    return;
  }

  // Comparison goes through `beatsRecord` rather than an inline test, so the
  // "strictly better, ties do not count" rule lives in exactly one place.
  const best = scored.reduce((winner, candidate) =>
    beatsRecord(
      scoreType,
      candidate.data().scoreValue as number,
      winner.data().scoreValue as number,
    )
      ? candidate
      : winner,
  );

  const bestData = best.data();

  const record: Omit<PersonalRecord, "updatedAt"> = {
    movementId: benchmarkId,
    name: benchmark?.name ?? bestData.title ?? benchmarkId,
    category: benchmark?.category ?? "Benchmark",
    scoreType,
    bestValue: bestData.scoreValue as number,
    bestDisplay: (bestData.scoreDisplay as string) ?? "",
    achievedOn: (bestData.date as string) ?? "",
  };

  // One batch so the record and the PR badges can never disagree.
  const batch = writeBatch(getDb());

  batch.set(prDoc(uid, benchmarkId), {
    ...record,
    updatedAt: serverTimestamp(),
  });

  // Exactly one session holds the record. Re-badge only the documents whose
  // flag is actually wrong, to keep the batch small.
  for (const attempt of attempts.docs) {
    const shouldBePR = attempt.id === best.id;
    if (Boolean(attempt.data().isPR) !== shouldBePR) {
      batch.update(workoutDoc(uid, attempt.id), { isPR: shouldBePR });
    }
  }

  await acceptWrite(`record ${benchmarkId}`, batch.commit());
}
