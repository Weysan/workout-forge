import {
  deleteDoc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { acceptWrite, readWithCacheFallback } from "@/lib/offline";
import type { DayMark, DayMarkInput, DayStatus } from "@/lib/types";
import { dayMarkDoc, dayMarksCol } from "./paths";
import type { WriteResult } from "./workouts";

/**
 * Rest and injury days.
 *
 * `users/{uid}/days/{dateKey}` records the days the athlete accounted for
 * without training. An empty day and a deliberate rest day look identical in a
 * training log otherwise, which makes recovery read as a lapse.
 *
 * The document id is the date key, so writes are upserts and there can only ever
 * be one marker per day. Nothing here is derived from the workout log and
 * nothing derives from it, which is what keeps `scoring.ts` and `records.ts`
 * unaware that rest days exist at all.
 */

const STATUSES: readonly DayStatus[] = ["rest", "injured"];

function toDayMark(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): DayMark | null {
  const data = snapshot.data();
  const status = data.status as DayStatus;

  // An unrecognised status is not something the UI can render — a document
  // written by a future version, say — so it reads as "no mark" rather than
  // being coerced into "rest" and quietly changing what the day means.
  if (!STATUSES.includes(status)) return null;

  return {
    // The id is authoritative: it is what the rules pin the `date` field to.
    date: snapshot.id,
    status,
    note: data.note ?? "",
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

export async function fetchDayMark(
  uid: string,
  dateKey: string,
): Promise<DayMark | null> {
  const ref = dayMarkDoc(uid, dateKey);

  const snapshot = await readWithCacheFallback(
    () => getDoc(ref),
    // getDocFromCache rejects outright for a document that was never cached,
    // which for a read is "not marked" rather than a failure.
    () => getDocFromCache(ref).catch(() => null),
  );

  if (!snapshot?.exists()) return null;
  return toDayMark(snapshot as QueryDocumentSnapshot<DocumentData>);
}

/**
 * Every marked day in a range. Queries the duplicated `date` field rather than
 * the document id: a single-field range needs no composite index, and comparing
 * `__name__` would mean building full document paths to compare against.
 */
export async function fetchDayMarksInRange(
  uid: string,
  startKey: string,
  endKey: string,
): Promise<DayMark[]> {
  const snapshot = await readQuery(
    query(
      dayMarksCol(uid),
      where("date", ">=", startKey),
      where("date", "<=", endKey),
    ),
  );

  return snapshot.docs
    .map(toDayMark)
    .filter((mark): mark is DayMark => mark !== null);
}

/** Upsert — the document id is the date, so re-marking a day replaces it. */
export async function setDayMark(
  uid: string,
  input: DayMarkInput,
): Promise<WriteResult> {
  const outcome = await acceptWrite(
    `mark ${input.date} as ${input.status}`,
    setDoc(dayMarkDoc(uid, input.date), {
      date: input.date,
      status: input.status,
      note: input.note,
      createdAt: serverTimestamp(),
    }),
  );

  return { id: input.date, queued: !outcome.acked };
}

export async function clearDayMark(
  uid: string,
  dateKey: string,
): Promise<WriteResult> {
  const outcome = await acceptWrite(
    `clear day mark ${dateKey}`,
    deleteDoc(dayMarkDoc(uid, dateKey)),
  );

  return { id: dateKey, queued: !outcome.acked };
}
