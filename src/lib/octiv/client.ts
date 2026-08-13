/**
 * The Octiv API, called straight from the browser.
 *
 * FORGE builds to a static export (`output: "export"` — no server anywhere), so
 * there is no route handler to proxy through. That is only possible because
 * Octiv sends `access-control-allow-origin: *` and allows the two headers this
 * needs: `content-type` on login and `authorization` on the WOD read.
 *
 * Read-only, and deliberately unaware of Firestore: it takes a connection and
 * returns data. Persisting the token is `lib/firestore/profile.ts`'s job.
 */

import { shiftDayKey } from "@/lib/stats";
import type { OctivConnection } from "@/lib/types";
import { camelizeKeys } from "./camelize";
import type { OctivLoginResponse, OctivWod, OctivWodsResponse } from "./types";

const API = "https://api.octivfitness.com/api";

/**
 * The box. Hardcoded for now — this integration exists for one gym's
 * programming, and asking for two opaque numeric ids in the connect form would
 * be worse than editing this line.
 */
export const OCTIV_TENANT_ID = 101219;
export const OCTIV_PROGRAMME_ID = 432;

/**
 * Gym wifi that associates but routes nowhere would otherwise leave a request
 * hanging for the browser's own much longer timeout. Same reasoning as
 * `READ_TIMEOUT_MS` in lib/offline.ts.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Credentials were refused, or the stored token is no longer good.
 *
 * Separated from every other failure because it is the only one the user can do
 * something about: it means "sign in to Octiv again", not "try later".
 */
export class OctivAuthError extends Error {
  constructor(message = "Octiv rejected those credentials") {
    super(message);
    this.name = "OctivAuthError";
  }
}

/** Anything else: offline, DNS, a 500, a body that is not JSON. */
export class OctivRequestError extends Error {
  constructor(message = "Octiv could not be reached") {
    super(message);
    this.name = "OctivRequestError";
  }
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  // AbortSignal.timeout() is not on every iOS version this PWA is installed on.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch {
    throw new OctivRequestError();
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new OctivAuthError();
  }
  // 422 is what Laravel returns for a login it did not like, which is a
  // credentials problem however it is spelled.
  if (response.status === 422) {
    throw new OctivAuthError("Check your Octiv username and password");
  }
  if (!response.ok) {
    throw new OctivRequestError(`Octiv responded with ${response.status}`);
  }

  try {
    // Octiv sends snake_case on every endpoint; the types below are camelCase.
    // See lib/octiv/camelize.ts.
    return camelizeKeys<T>(await response.json());
  } catch {
    throw new OctivRequestError("Octiv sent a response that could not be read");
  }
}

/**
 * Exchange credentials for a bearer token.
 *
 * The password is used here and nowhere else — it is never stored, and never
 * leaves this call.
 */
export async function octivLogin(
  username: string,
  password: string,
): Promise<OctivConnection> {
  const body = await request<OctivLoginResponse>(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const accessToken = body.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    // A 200 with no token is not a successful login, whatever the status says.
    throw new OctivAuthError("Octiv did not return an access token");
  }

  // `expiresIn` is seconds and has been a year in every response; the fallback
  // keeps a missing value from producing an already-expired connection.
  const expiresInSeconds =
    typeof body.expiresIn === "number" && body.expiresIn > 0
      ? body.expiresIn
      : 24 * 60 * 60;

  return {
    accessToken,
    tokenType: body.tokenType || "Bearer",
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    username,
  };
}

/** True when the token has passed its expiry and needs a fresh login. */
export function isConnectionExpired(
  connection: OctivConnection | null | undefined,
): boolean {
  if (!connection) return true;
  const expiry = Date.parse(connection.expiresAt);
  // An unparseable expiry is treated as still valid: the request itself will
  // return 401 if it is not, and that is a better answer than locking the user
  // out over a malformed string.
  return Number.isFinite(expiry) && expiry <= Date.now();
}

/**
 * The programming for one calendar day, or `null` when the box published none.
 *
 * The date filters are a half-open range — `startsAfter` the day itself,
 * `endsBefore` the next — which is what returns exactly one day. Every other
 * filter is fixed.
 */
export async function fetchOctivWod(
  connection: OctivConnection,
  dateKey: string,
): Promise<OctivWod | null> {
  const query = new URLSearchParams({
    "filter[tenantId]": String(OCTIV_TENANT_ID),
    "filter[startsAfter]": dateKey,
    "filter[endsBefore]": shiftDayKey(dateKey, 1),
    "filter[programmeIds]": String(OCTIV_PROGRAMME_ID),
    "filter[useWorkoutThreshold]": "1",
  });

  const body = await request<OctivWodsResponse>(`${API}/wods?${query}`, {
    method: "GET",
    headers: {
      Authorization: `${connection.tokenType || "Bearer"} ${connection.accessToken}`,
    },
  });

  return body.data?.[0] ?? null;
}
