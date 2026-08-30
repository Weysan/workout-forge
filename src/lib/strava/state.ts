/**
 * CSRF state for the Strava OAuth redirect.
 *
 * The value is generated before leaving for Strava and checked when the browser
 * comes back. Without it, someone could hand an athlete a callback URL carrying
 * *their* authorization code and quietly link their Strava account to the
 * athlete's FORGE log.
 *
 * Written to both storages on purpose. `sessionStorage` is the right scope — one
 * tab, one flow — but an installed PWA on iOS may hand the authorize step to
 * Safari, and the callback then lands in a context that never saw the write.
 * `localStorage` widens the odds of the value surviving without weakening
 * anything: it is a nonce, useless to anyone who does not also have a matching
 * code in flight.
 *
 * When neither storage has it, the callback page does not fail — it asks the
 * athlete to confirm instead, which defends the same thing this does (an act they
 * did not intend) without requiring the two contexts to share storage.
 */

const KEY = "forge.strava.oauth.state";

/** A fresh nonce, stored and returned for the authorize URL. */
export function createOAuthState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  // Either storage can be unavailable — private mode, a browser configured to
  // block it — and neither is worth failing the connection over.
  try {
    sessionStorage.setItem(KEY, state);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(KEY, state);
  } catch {
    /* ignore */
  }

  return state;
}

/** What was stored before the redirect, or `null` if this context never saw it. */
export function readOAuthState(): string | null {
  try {
    const fromSession = sessionStorage.getItem(KEY);
    if (fromSession) return fromSession;
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Single use: cleared as soon as it has been checked, whatever the verdict. */
export function clearOAuthState(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
