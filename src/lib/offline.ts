/**
 * Offline behaviour.
 *
 * The gym has no signal. That is the normal case for this app, not an error
 * state, so the rules are:
 *
 *   reads   served from the local cache when the network is unavailable or slow
 *   writes  applied locally and accepted immediately, flushed by Firestore when
 *           the connection returns
 *
 * The subtlety that makes this necessary: Firestore applies a write to the local
 * cache synchronously, but the promise returned by setDoc/updateDoc/commit only
 * resolves once the *server* acknowledges it. Offline that promise stays pending
 * indefinitely. Awaiting it — the obvious thing to write — leaves a save button
 * spinning forever on a write that has, in fact, already succeeded locally.
 *
 * So writes here are awaited only for a short grace period. If the server acks
 * within it, we behave exactly as before and real errors (a rules rejection, say)
 * still surface. If it does not, the write is treated as accepted-and-queued, and
 * a late failure is reported through the registry below.
 */

/** How long to wait for a server read before falling back to the cache. */
const READ_TIMEOUT_MS = 4_000;

/** How long to wait for a write to be acknowledged before calling it queued. */
const WRITE_ACK_GRACE_MS = 2_500;

// --- Connectivity --------------------------------------------------------

export function isOnline(): boolean {
  // `navigator.onLine` only proves a link exists, not that anything is reachable
  // — captive-portal gym wifi reports true. It is a useful fast path for the
  // definitely-offline case; the timeouts below cover the lying-online case.
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

type Listener = () => void;

const connectivityListeners = new Set<Listener>();

export function subscribeToConnectivity(listener: Listener): () => void {
  connectivityListeners.add(listener);

  if (typeof window !== "undefined" && connectivityListeners.size === 1) {
    window.addEventListener("online", notifyConnectivity);
    window.addEventListener("offline", notifyConnectivity);
  }

  return () => {
    connectivityListeners.delete(listener);
    if (typeof window !== "undefined" && connectivityListeners.size === 0) {
      window.removeEventListener("online", notifyConnectivity);
      window.removeEventListener("offline", notifyConnectivity);
    }
  };
}

function notifyConnectivity() {
  for (const listener of connectivityListeners) listener();
}

// --- Pending write registry ---------------------------------------------

/**
 * Tracks writes that have been accepted locally but not yet acknowledged by the
 * server, so the UI can say so honestly.
 *
 * In-memory by design: Firestore owns the durable queue in IndexedDB and will
 * flush it on its own after a reload. This only powers the indicator.
 */
let pendingCount = 0;
const pendingListeners = new Set<Listener>();

/** Reported when a queued write is ultimately rejected by the server. */
let onWriteRejected: ((error: unknown, label: string) => void) | null = null;

export function setWriteRejectionHandler(
  handler: ((error: unknown, label: string) => void) | null,
) {
  onWriteRejected = handler;
}

export function getPendingWriteCount(): number {
  return pendingCount;
}

export function subscribeToPendingWrites(listener: Listener): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

function notifyPending() {
  for (const listener of pendingListeners) listener();
}

// --- Write helper --------------------------------------------------------

export interface WriteOutcome {
  /** True when the server confirmed the write before the grace period elapsed. */
  acked: boolean;
}

/**
 * Issue a write and wait only briefly for confirmation.
 *
 * Resolves `{ acked: true }` on a confirmed write, `{ acked: false }` when it has
 * been accepted locally and queued. Rejects only if the server refuses the write
 * *within* the grace period — which is what keeps online validation errors
 * visible instead of silently swallowed.
 */
export async function acceptWrite(
  label: string,
  write: Promise<unknown>,
): Promise<WriteOutcome> {
  pendingCount += 1;
  notifyPending();

  // Whether the caller has already been handed a successful "queued" result. It
  // decides who reports a failure, so that one rejected write never produces two
  // error messages: before the grace period elapses the rejection propagates to
  // the caller, and only after it does the global handler take over.
  let reportedAsQueued = false;

  write
    .catch((error: unknown) => {
      // Always logged, and always caught — an unhandled rejection here would be
      // reported by the browser as a crash.
      console.warn(`[forge] write "${label}" was rejected`, error);

      if (reportedAsQueued) {
        // The user was told this was saved, so their view is now wrong.
        onWriteRejected?.(error, label);
      }
    })
    .finally(() => {
      pendingCount -= 1;
      notifyPending();
    });

  // Offline is already known: do not stall the UI for the full grace period.
  if (!isOnline()) {
    reportedAsQueued = true;
    return { acked: false };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      write.then(() => "acked" as const),
      new Promise<"queued">((resolve) => {
        timer = setTimeout(() => resolve("queued"), WRITE_ACK_GRACE_MS);
      }),
    ]);

    if (result === "queued") reportedAsQueued = true;
    return { acked: result === "acked" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// --- Read helper ---------------------------------------------------------

/**
 * Read from the server, falling back to the local cache.
 *
 * Firestore already falls back when it knows it is offline. The timeout exists
 * for the case it cannot detect: wifi that associates but routes nowhere, where a
 * server read would otherwise hang for the SDK's own much longer timeout and the
 * screen would sit on a skeleton.
 */
export async function readWithCacheFallback<T>(
  fromServer: () => Promise<T>,
  fromCache: () => Promise<T>,
): Promise<T> {
  if (!isOnline()) {
    return fromCache();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      fromServer().then((value) => ({ ok: true as const, value })),
      new Promise<{ ok: false }>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false }), READ_TIMEOUT_MS);
      }),
    ]);

    if (result.ok) return result.value;
    return await fromCache();
  } catch {
    // The server read failed outright — cache is still better than an error.
    return fromCache();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
