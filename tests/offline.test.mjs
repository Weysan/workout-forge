/**
 * Offline write-acceptance tests.
 *
 * `src/lib/offline.ts` decides whether a write counts as confirmed or queued, and
 * who reports a failure. It is the piece that stops a save button spinning forever
 * with no signal, so its edge cases are worth pinning down:
 *
 *   · a write the server confirms quickly behaves exactly as a normal await
 *   · a write that does not come back is accepted as queued, not left hanging
 *   · a rejection is reported once — never twice, never zero times
 *
 * The module imports nothing, so Node's built-in type stripping runs it directly
 * and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:offline
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  acceptWrite,
  getPendingWriteCount,
  setWriteRejectionHandler,
  readWithCacheFallback,
} = await import("../src/lib/offline.ts");

/** The grace period in the module; tests stay well clear of it either way. */
const GRACE_MS = 2_500;

/**
 * Lets a test pretend the browser is offline.
 *
 * Node ships its own read-only `navigator`, so plain assignment throws — it has to
 * be redefined.
 */
function setOnline(value) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: value },
    configurable: true,
    writable: true,
  });
}

/** Waits for the microtask queue plus a real delay. */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let rejections;

beforeEach(() => {
  setOnline(true);
  rejections = [];
  setWriteRejectionHandler((error, label) => rejections.push({ error, label }));
});

afterEach(() => {
  setWriteRejectionHandler(null);
});

describe("acceptWrite — online", () => {
  it("reports a fast server ack as confirmed", async () => {
    const outcome = await acceptWrite("fast", Promise.resolve("ok"));
    assert.equal(outcome.acked, true);
  });

  it("propagates a fast rejection to the caller", async () => {
    await assert.rejects(
      () => acceptWrite("denied", Promise.reject(new Error("permission-denied"))),
      /permission-denied/,
    );
  });

  it("does not also report a fast rejection globally", async () => {
    // Otherwise one failed write produces two error toasts: the caller's own
    // handling plus the global one.
    await acceptWrite("denied", Promise.reject(new Error("nope"))).catch(() => {});
    await wait(20);
    assert.deepEqual(rejections, []);
  });

  it("treats a write that never comes back as queued rather than hanging", async () => {
    // A pending-forever promise is exactly what Firestore returns with no signal.
    const started = Date.now();
    const outcome = await acceptWrite("slow", new Promise(() => {}));
    const elapsed = Date.now() - started;

    assert.equal(outcome.acked, false);
    assert.ok(
      elapsed >= GRACE_MS - 200,
      `resolved after ${elapsed}ms, expected to wait out the grace period`,
    );
  });
});

describe("acceptWrite — offline", () => {
  it("accepts immediately without waiting out the grace period", async () => {
    setOnline(false);

    const started = Date.now();
    const outcome = await acceptWrite("offline", new Promise(() => {}));
    const elapsed = Date.now() - started;

    assert.equal(outcome.acked, false);
    // The whole point: no spinner, no delay, the write is simply accepted.
    assert.ok(elapsed < 300, `took ${elapsed}ms, expected to return at once`);
  });

  it("reports a late rejection globally, since the caller was told it saved", async () => {
    setOnline(false);

    let reject;
    const write = new Promise((_, r) => {
      reject = r;
    });

    const outcome = await acceptWrite("late-failure", write);
    assert.equal(outcome.acked, false);

    // The server refuses it once the connection is back.
    reject(new Error("permission-denied"));
    await wait(20);

    assert.equal(rejections.length, 1);
    assert.equal(rejections[0].label, "late-failure");
  });
});

describe("pending write count", () => {
  it("returns to zero once a write settles", async () => {
    const before = getPendingWriteCount();

    let resolve;
    const write = new Promise((r) => {
      resolve = r;
    });

    const outcome = acceptWrite("counted", write);
    assert.equal(getPendingWriteCount(), before + 1);

    resolve("ok");
    await outcome;
    await wait(20);

    assert.equal(getPendingWriteCount(), before);
  });

  it("returns to zero after a rejected write too", async () => {
    const before = getPendingWriteCount();

    await acceptWrite("rejected", Promise.reject(new Error("x"))).catch(() => {});
    await wait(20);

    assert.equal(getPendingWriteCount(), before);
  });
});

describe("readWithCacheFallback", () => {
  it("uses the server when it answers", async () => {
    const value = await readWithCacheFallback(
      async () => "server",
      async () => "cache",
    );
    assert.equal(value, "server");
  });

  it("goes straight to cache when offline, without touching the server", async () => {
    setOnline(false);

    let serverCalled = false;
    const value = await readWithCacheFallback(
      async () => {
        serverCalled = true;
        return "server";
      },
      async () => "cache",
    );

    assert.equal(value, "cache");
    assert.equal(serverCalled, false);
  });

  it("falls back to cache when the server read fails", async () => {
    const value = await readWithCacheFallback(
      async () => {
        throw new Error("network");
      },
      async () => "cache",
    );
    assert.equal(value, "cache");
  });
});
