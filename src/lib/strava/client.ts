/**
 * Strava, called from the browser — with one exception.
 *
 * The activity reads go straight to `www.strava.com/api/v3`, which is possible
 * for the same reason the Octiv integration needs no server: Strava sends
 * `access-control-allow-origin: *` and allows the `authorization` header.
 *
 * The two OAuth calls cannot. Strava has no PKCE, so both the code exchange and
 * every refresh require `client_secret`, and FORGE is a static export — a secret
 * in the client is a secret in the bundle. Those two calls go through the Worker
 * in `worker/`, which holds the secret and nothing else.
 *
 * Read-only, and unaware of Firestore: it takes a connection and returns data.
 * Persisting tokens is `lib/firestore/profile.ts`'s job, which is why the refresh
 * below takes a `persist` callback rather than reaching for the database itself.
 */

import type { StravaConnection } from "@/lib/types";
import { readCachedActivities, writeCachedActivities } from "./cache";
import type { StravaActivity, StravaTokenResponse } from "./types";

const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";

/**
 * What FORGE asks for.
 *
 * `activity:read_all` rather than `activity:read` so activities the athlete marked
 * "Only You" are visible — a private morning run is still a session worth logging.
 * They can untick it on the consent screen, which is why the granted scope is
 * stored on the connection rather than assumed.
 */
export const STRAVA_SCOPE = "activity:read_all";

/** Same reasoning as `REQUEST_TIMEOUT_MS` in lib/octiv/client.ts. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * How long before the stated expiry a token is treated as spent.
 *
 * Refreshing early rather than reacting to a 401 keeps a request from failing on
 * a clock difference between this device and Strava, and means the athlete never
 * sees a day fail to load for a reason that fixes itself.
 */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Credentials were refused, or the connection is no longer good.
 *
 * Separated from every other failure for the same reason as Octiv's: it is the
 * only one the athlete can act on — "connect Strava again", not "try later".
 */
export class StravaAuthError extends Error {
  constructor(message = "Strava rejected this connection") {
    super(message);
    this.name = "StravaAuthError";
  }
}

/** Anything else: offline, DNS, a 500, a body that is not JSON. */
export class StravaRequestError extends Error {
  constructor(message = "Strava could not be reached") {
    super(message);
    this.name = "StravaRequestError";
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ?? "";
const WORKER_URL = (process.env.NEXT_PUBLIC_STRAVA_WORKER_URL ?? "").replace(
  /\/$/,
  "",
);

/**
 * Whether this build can talk to Strava at all.
 *
 * Both values are build-time public config, so a deployment with either missing
 * has no working integration. The connect card checks this and says so, rather
 * than offering a button that leads to a Strava error page.
 */
export function isStravaConfigured(): boolean {
  return CLIENT_ID.length > 0 && WORKER_URL.length > 0;
}

/**
 * Where the browser is sent to ask the athlete for access.
 *
 * `redirect_uri` is built from the live origin rather than from
 * `NEXT_PUBLIC_APP_URL`, so localhost, a preview deploy and production each send
 * the athlete back to themselves with no extra configuration. Strava validates it
 * against the callback domain registered for the application, and whitelists
 * `localhost` for development, so one registered app covers every environment.
 *
 * `approval_prompt=auto` means an athlete who has already granted access is not
 * asked twice — reconnecting an expired connection is then a redirect they barely
 * see.
 */
export function buildAuthorizeUrl(state: string): string {
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${window.location.origin}/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
    state,
  });

  return `${AUTHORIZE_URL}?${query}`;
}

async function callBroker(
  path: "/exchange" | "/refresh",
  body: Record<string, string>,
): Promise<StravaTokenResponse> {
  // Refused here rather than attempted, because an unset `WORKER_URL` is the
  // empty string and `fetch("/refresh")` is then a same-origin POST — which
  // Firebase Hosting answers with a 404, which the status check below would read
  // as Strava refusing the connection. That would mark a perfectly good
  // connection revoked on the user document, and reconnecting would not fix it.
  //
  // Deliberately a request error and never an auth one: a build variable nobody
  // set is not the athlete's credentials going bad.
  if (!isStravaConfigured()) {
    throw new StravaRequestError("Strava is not configured for this build");
  }

  // AbortSignal.timeout() is not on every iOS version this PWA is installed on.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${WORKER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new StravaRequestError();
  } finally {
    clearTimeout(timer);
  }

  // The Worker passes Strava's status through, so the split is the same one it
  // would be against Strava directly: 4xx is this connection's fault, 5xx is not.
  if (response.status >= 400 && response.status < 500) {
    throw new StravaAuthError(
      path === "/exchange"
        ? "Strava would not complete the connection"
        : "Strava would not renew this connection",
    );
  }
  if (!response.ok) {
    throw new StravaRequestError(`Strava responded with ${response.status}`);
  }

  try {
    return (await response.json()) as StravaTokenResponse;
  } catch {
    throw new StravaRequestError("Strava sent a response that could not be read");
  }
}

/** Epoch seconds → ISO instant, with a fallback of six hours from now. */
function expiryFrom(expiresAt: number | null | undefined): string {
  if (typeof expiresAt === "number" && expiresAt > 0) {
    return new Date(expiresAt * 1000).toISOString();
  }
  // Strava's documented lifetime. Keeps a missing value from producing a
  // connection that is already expired the moment it is stored.
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
}

function tokensFrom(body: StravaTokenResponse) {
  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;

  // A 200 without both tokens is not a usable connection, whatever the status
  // says. Without the refresh token especially: it would work for six hours and
  // then be beyond repair.
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new StravaAuthError("Strava did not return an access token");
  }
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    throw new StravaAuthError("Strava did not return a refresh token");
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: expiryFrom(body.expires_at),
  };
}

/** Shown as "connected as": Strava's username, or the athlete's name. */
function displayNameFor(body: StravaTokenResponse): string {
  const athlete = body.athlete;
  const username = athlete?.username;
  if (typeof username === "string" && username.length > 0) return username;

  const name = [athlete?.firstname, athlete?.lastname]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");

  return name;
}

/**
 * Turn the authorization code from the callback into a stored connection.
 *
 * `scope` comes from the callback URL rather than from this response: Strava
 * reports what was actually granted as a query parameter on the redirect, and the
 * token response does not repeat it.
 */
export async function exchangeCode(
  code: string,
  grantedScope: string,
): Promise<StravaConnection> {
  const body = await callBroker("/exchange", { code });

  return {
    ...tokensFrom(body),
    athleteId:
      typeof body.athlete?.id === "number" ? body.athlete.id : 0,
    username: displayNameFor(body),
    scope: grantedScope,
  };
}

/** True when the access token is spent, or close enough to it. */
export function isAccessTokenStale(
  connection: StravaConnection | null | undefined,
): boolean {
  if (!connection) return true;

  const expiry = Date.parse(connection.expiresAt);
  // An unparseable expiry is treated as stale, the opposite of the Octiv case:
  // there the alternative was locking the athlete out of a year-long token, here
  // a needless refresh costs one request and produces a connection that works.
  if (!Number.isFinite(expiry)) return true;

  return expiry - REFRESH_SKEW_MS <= Date.now();
}

/**
 * A refresh already under way, so concurrent callers join it instead of racing.
 *
 * Strava invalidates a refresh token as soon as it issues a new one, so two
 * refreshes started from the same connection mean the second one presents a token
 * that has just been killed — a connection that breaks itself under exactly the
 * load it is meant to handle (a day view mounting several panels at once).
 */
let inFlight: Promise<StravaConnection> | null = null;

/**
 * The last completed refresh, keyed by the refresh token it consumed.
 *
 * `inFlight` alone is not enough. React Query hands each caller whatever
 * connection its cache held when it rendered, so a caller can arrive with a
 * *stale* connection object moments after a refresh has finished and cleared
 * `inFlight` — and its refresh token is the one that was just invalidated.
 * Recognising it here returns the connection that replaced it, rather than
 * spending a request to be told it is dead.
 */
let lastExchange: { consumed: string; result: StravaConnection } | null = null;

/**
 * A connection with a usable access token, refreshing first if needed.
 *
 * `persist` is called with the new tokens *before* this returns, so a token is
 * never used before it is stored. The order matters: Strava may rotate the
 * refresh token, and a rotation that is used but not saved is a connection lost
 * to the next reload.
 */
export async function ensureFreshConnection(
  connection: StravaConnection,
  persist: (tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  }) => Promise<StravaConnection>,
): Promise<StravaConnection> {
  if (!isAccessTokenStale(connection)) return connection;

  if (lastExchange?.consumed === connection.refreshToken) {
    return lastExchange.result;
  }

  if (inFlight) return inFlight;

  const consumed = connection.refreshToken;

  inFlight = (async () => {
    try {
      const body = await callBroker("/refresh", { refresh_token: consumed });
      const result = await persist(tokensFrom(body));
      lastExchange = { consumed, result };
      return result;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Forget the module-level refresh state.
 *
 * Called on disconnect. Without it, connecting a *different* Strava account in the
 * same session could be handed the previous account's connection by the memo
 * above — unlikely, but the kind of thing that is baffling when it happens.
 */
export function resetRefreshState(): void {
  inFlight = null;
  lastExchange = null;
}

// --- Activities ----------------------------------------------------------

const API = "https://www.strava.com/api/v3";

/**
 * Enough of a margin either side of the requested day to be sure of catching it.
 *
 * Strava filters `after`/`before` on `start_date`, which is UTC, while a session
 * belongs to the day the athlete trained by — `start_date_local`. A day's worth
 * of slack covers every timezone in both directions; the extra activities that
 * come back are dropped by `mapping.ts`, which does the bucketing properly.
 */
const WINDOW_SLACK_SECONDS = 24 * 60 * 60;

/** `YYYY-MM-DD` → the epoch second of local midnight that begins it. */
function dayStartEpochSeconds(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  // Local midnight, matching how the rest of the app reads a date key.
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
}

/**
 * One calendar day of the athlete's activities.
 *
 * Answers are cached locally — see `cache.ts` — for the same reason as the Octiv
 * WOD read, plus one more: Strava's rate limit is 200 requests per fifteen
 * minutes for the whole application, so an uncached calendar scroll would spend
 * it. Pass `{ refresh: true }` to go to the network regardless, which also
 * refreshes the entry.
 *
 * Returns everything in the window, unfiltered. Deciding which of these belong to
 * `dateKey`, and which are worth importing at all, is `mapping.ts`'s job — kept
 * separate so it can be tested without a network.
 */
export async function fetchStravaActivities(
  connection: StravaConnection,
  dateKey: string,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<StravaActivity[]> {
  const cacheParams = { athleteId: connection.athleteId, dateKey };

  if (!refresh) {
    const cached = readCachedActivities(cacheParams);
    if (cached) return cached.activities;
  }

  const start = dayStartEpochSeconds(dateKey);

  const query = new URLSearchParams({
    after: String(start - WINDOW_SLACK_SECONDS),
    before: String(start + 24 * 60 * 60 + WINDOW_SLACK_SECONDS),
    // Three days of one athlete's activities. Nobody records thirty sessions in
    // three days, so this is a ceiling rather than a page size to iterate.
    per_page: "30",
  });

  // AbortSignal.timeout() is not on every iOS version this PWA is installed on.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API}/athlete/activities?${query}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${connection.accessToken}`,
      },
      signal: controller.signal,
    });
  } catch {
    throw new StravaRequestError();
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    // The caller refreshes before getting here, so a rejection at this point is
    // the connection itself — revoked, or a scope the athlete withdrew.
    throw new StravaAuthError();
  }
  if (response.status === 429) {
    // Worth its own message: this is the app's shared rate limit, not the
    // athlete's fault and not something retrying sooner will fix.
    throw new StravaRequestError("Strava's rate limit was reached. Try shortly.");
  }
  if (!response.ok) {
    throw new StravaRequestError(`Strava responded with ${response.status}`);
  }

  let activities: StravaActivity[];
  try {
    const body: unknown = await response.json();
    // Strava returns a bare array here. Anything else is not an answer.
    activities = Array.isArray(body) ? (body as StravaActivity[]) : [];
  } catch {
    throw new StravaRequestError("Strava sent a response that could not be read");
  }

  // Only a successful read is cached. A failure — offline, a 500, a rejected
  // token — leaves the entry alone, so the next attempt is a real one.
  writeCachedActivities(cacheParams, activities);

  return activities;
}
