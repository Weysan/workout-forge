/**
 * Strava client tests: configuration and token refresh.
 *
 * `src/lib/strava/client.ts` holds the two pieces of this integration that fail
 * in ways nobody would notice until a connection was already broken:
 *
 *   · a build with no broker URL must fail as *transport*, never as auth — an
 *     auth failure is recorded on the user document as a revoked connection, and
 *     reconnecting does not clear a revocation caused by a missing env var
 *   · a refresh must happen once, however many callers ask at once, because
 *     Strava invalidates a refresh token the moment it issues a new one
 *
 * Unlike the mapping and cache suites, this module has a *runtime* import, so
 * Node's resolver needs the small hook in `tests/helpers/ts-resolver.mjs` to load
 * it. Nothing in the app is written differently for the sake of this.
 *
 *   npm run test:strava-client
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./helpers/ts-resolver.mjs", import.meta.url);

// --- Two module instances, because the config is read at load -----------
// The env is read once, when the module is evaluated, so the configured and
// unconfigured cases cannot share an instance. A query suffix gives Node a
// distinct module key and so a second evaluation.

const unconfigured = await import("../src/lib/strava/client.ts");

process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID = "12345";
process.env.NEXT_PUBLIC_STRAVA_WORKER_URL = "https://broker.example.workers.dev";

const configured = await import("../src/lib/strava/client.ts?configured");

/** Expired an hour ago, so every call below actually attempts a refresh. */
function staleConnection(overrides = {}) {
  return {
    accessToken: "stale.access",
    refreshToken: "the.refresh.token",
    expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    athleteId: 12345,
    username: "athlete",
    scope: "read,activity:read_all",
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("a build with no broker configured", () => {
  let fetched;

  beforeEach(() => {
    unconfigured.resetRefreshState();
    fetched = [];
    // Answers the way Firebase Hosting answers a POST to a path it does not
    // serve. This is the shape that made the bug: a *thrown* fetch would produce
    // a transport error on its own and the assertions below would pass whether
    // or not the guard existed.
    globalThis.fetch = async (url) => {
      fetched.push(String(url));
      return { ok: false, status: 404, json: async () => ({}) };
    };
  });

  it("knows it is not configured", () => {
    assert.equal(unconfigured.isStravaConfigured(), false);
  });

  it("fails a refresh as transport, never as auth", async () => {
    // The whole reason this test exists. An unset NEXT_PUBLIC_STRAVA_WORKER_URL
    // is the empty string, so the request would have gone to "/refresh" on the
    // app's own origin — a 404, which the status check reads as Strava refusing
    // the connection, which is then written to the user document as revoked.
    await assert.rejects(
      () => unconfigured.ensureFreshConnection(staleConnection(), async () => {
        throw new Error("persist must not be reached");
      }),
      (error) => {
        assert.equal(error.name, "StravaRequestError");
        assert.ok(
          !(error instanceof unconfigured.StravaAuthError),
          "an unconfigured build must never produce a StravaAuthError",
        );
        return true;
      },
    );

    // The stronger assertion: the request was never made. Without the guard this
    // would be ["/refresh"] — a POST to the app's own origin.
    assert.deepEqual(fetched, [], "an unconfigured build must not reach the network");
  });

  it("fails an exchange the same way", async () => {
    await assert.rejects(
      () => unconfigured.exchangeCode("a-code", "activity:read_all"),
      (error) => {
        assert.equal(error.name, "StravaRequestError");
        return true;
      },
    );

    assert.deepEqual(fetched, []);
  });

  it("still hands back a connection whose token is not yet stale", async () => {
    // Short-circuits before the guard: a build that cannot refresh can still use
    // an access token it already has, for as long as that token lasts.
    const live = staleConnection({
      expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    });

    const result = await unconfigured.ensureFreshConnection(live, async () => {
      throw new Error("persist must not be reached");
    });

    assert.deepEqual(result, live);
  });
});

describe("refreshing a token", () => {
  let calls;

  /** A broker that answers slowly enough for a second caller to arrive. */
  function stubBroker({ delayMs = 10 } = {}) {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: `fresh.access.${calls.length}`,
          refresh_token: `rotated.refresh.${calls.length}`,
          expires_at: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
          token_type: "Bearer",
        }),
      };
    };
  }

  /** Stands in for the Firestore write, returning the stored connection. */
  const persist = async (tokens) => ({ ...staleConnection(), ...tokens });

  beforeEach(() => {
    configured.resetRefreshState();
    stubBroker();
  });

  it("asks the broker once when several callers arrive at the same time", async () => {
    const connection = staleConnection();

    // A day view mounting more than one panel is exactly this shape. Without the
    // in-flight promise, the second refresh presents a token the first has just
    // had invalidated, and the connection breaks itself.
    const [a, b, c] = await Promise.all([
      configured.ensureFreshConnection(connection, persist),
      configured.ensureFreshConnection(connection, persist),
      configured.ensureFreshConnection(connection, persist),
    ]);

    assert.equal(calls.length, 1, "expected exactly one refresh request");
    assert.equal(a.accessToken, "fresh.access.1");
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
  });

  it("does not ask again for a caller still holding the old connection", async () => {
    const connection = staleConnection();

    const first = await configured.ensureFreshConnection(connection, persist);
    assert.equal(calls.length, 1);

    // React Query hands each caller whatever its cache held when it rendered, so
    // a caller can arrive with the *stale* object moments after the refresh
    // finished — carrying the refresh token that was just consumed. Asking again
    // with it would spend a request to be told it is dead.
    const second = await configured.ensureFreshConnection(connection, persist);

    assert.equal(calls.length, 1, "the consumed token must not be presented twice");
    assert.deepEqual(second, first);
  });

  it("sends the refresh token to the broker, and nothing else", async () => {
    await configured.ensureFreshConnection(staleConnection(), persist);

    assert.match(calls[0].url, /\/refresh$/);
    assert.deepEqual(calls[0].body, { refresh_token: "the.refresh.token" });
    // The secret is the Worker's business. It must never appear here.
    assert.ok(!("client_secret" in calls[0].body));
  });

  it("persists before returning, so a rotated token is never used unsaved", async () => {
    const order = [];

    const trackingPersist = async (tokens) => {
      order.push("persist");
      return { ...staleConnection(), ...tokens };
    };

    await configured.ensureFreshConnection(staleConnection(), trackingPersist);
    order.push("returned");

    // Strava may rotate the refresh token, and a rotation used but not saved is
    // a connection lost to the next reload.
    assert.deepEqual(order, ["persist", "returned"]);
  });

  it("refreshes again once the memo no longer matches the token in hand", async () => {
    const first = await configured.ensureFreshConnection(staleConnection(), persist);
    assert.equal(calls.length, 1);

    // A genuinely different connection — the athlete reconnected, say — is not
    // the one the memo describes, so it must go to the broker.
    const other = staleConnection({ refreshToken: "a.different.token" });
    await configured.ensureFreshConnection(other, persist);

    assert.equal(calls.length, 2);
    assert.equal(first.accessToken, "fresh.access.1");
  });

  it("clears the in-flight state after a failure, so the next attempt is real", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "worker_not_configured" }),
    });

    await assert.rejects(
      () => configured.ensureFreshConnection(staleConnection(), persist),
      (error) => {
        // A Worker missing its secret answers 500 on purpose: that is "try
        // later", not "these credentials are bad", so nothing is marked revoked.
        assert.equal(error.name, "StravaRequestError");
        return true;
      },
    );

    stubBroker();
    const recovered = await configured.ensureFreshConnection(
      staleConnection(),
      persist,
    );
    assert.equal(recovered.accessToken, "fresh.access.1");
  });

  it("reports a rejected refresh token as auth, which is what ends a connection", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: "Bad Request" }),
    });

    await assert.rejects(
      () => configured.ensureFreshConnection(staleConnection(), persist),
      (error) => {
        assert.equal(error.name, "StravaAuthError");
        return true;
      },
    );
  });
});
