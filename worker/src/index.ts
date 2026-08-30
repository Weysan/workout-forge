/**
 * FORGE's Strava token broker.
 *
 * The one piece of server in this project, and it exists for exactly one reason:
 * Strava has no PKCE, so `client_secret` is required both to exchange an
 * authorization code and to refresh an access token. FORGE is a static export
 * (`output: "export"` — see next.config.ts), so a secret in the client would be
 * a secret in the bundle, readable by anyone who opens devtools.
 *
 * So the two calls that need the secret happen here, and nothing else does. The
 * activity reads still go straight from the browser to `www.strava.com/api/v3`,
 * which is possible because Strava sends `access-control-allow-origin: *` —
 * exactly the property that let the Octiv integration skip a server entirely.
 *
 * Stateless: no storage, no KV, no logging of tokens. A request carries a code
 * or a refresh token, and the response is what Strava said about it.
 *
 *   wrangler secret put STRAVA_CLIENT_SECRET
 *   wrangler deploy
 */

interface Env {
  /** Public — the same value the client bundle carries. */
  STRAVA_CLIENT_ID: string;
  /** Secret, set with `wrangler secret put`. Never in the repo. */
  STRAVA_CLIENT_SECRET: string;
  /** Comma-separated origins allowed to call this. */
  ALLOWED_ORIGINS: string;
}

const TOKEN_URL = "https://www.strava.com/oauth/token";

/**
 * Strava's own timeout is longer than anything worth waiting for here, and a
 * hung upstream would hold the Worker request open to its own limit. Same
 * reasoning as `REQUEST_TIMEOUT_MS` in src/lib/octiv/client.ts.
 */
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * The echoed origin, or null when it is not on the list.
 *
 * Echoed rather than `*` because these responses carry bearer tokens: a
 * wildcard would let any page on the internet read the result of a call it
 * made. Not a real security boundary — a non-browser client ignores CORS
 * entirely — but it is what stops a hostile *page* from using this quietly.
 */
function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    // The allowed origin varies by request, so a shared cache must not serve one
    // origin's response to another.
    Vary: "Origin",
  };
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // A token response is per-user and single-use. Nothing should keep it.
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

/**
 * Ask Strava for tokens, with the secret added.
 *
 * Strava's status is passed through untouched: the client tells "these
 * credentials are no good" (4xx → re-connect) from "Strava could not be
 * reached" (5xx, timeout → try later) by status alone, the same split
 * `octiv/client.ts` makes.
 */
async function callStrava(
  env: Env,
  grant: Record<string, string>,
  origin: string | null,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        ...grant,
      }),
      signal: controller.signal,
    });
  } catch {
    return json({ error: "strava_unreachable" }, 502, origin);
  } finally {
    clearTimeout(timer);
  }

  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    return json({ error: "strava_sent_unreadable_response" }, 502, origin);
  }

  // Strava's error bodies name the offending field ("client_id", "code") without
  // echoing values, so they are safe to forward and are genuinely useful when
  // the app is misconfigured.
  if (!upstream.ok) return json(body, upstream.status, origin);

  const token = body as Record<string, unknown>;
  const athlete = (token.athlete ?? null) as Record<string, unknown> | null;

  // Narrowed deliberately. Strava's payload carries the athlete's full profile —
  // location, follower counts, photos — none of which this app has any business
  // holding, and all of which would end up on the user document.
  return json(
    {
      access_token: token.access_token ?? null,
      refresh_token: token.refresh_token ?? null,
      expires_at: token.expires_at ?? null,
      token_type: token.token_type ?? "Bearer",
      // Absent on a refresh — Strava only sends the athlete on the first
      // exchange. The client keeps what it already stored in that case.
      athlete: athlete
        ? {
            id: athlete.id ?? null,
            username: athlete.username ?? null,
            firstname: athlete.firstname ?? null,
            lastname: athlete.lastname ?? null,
          }
        : null,
    },
    200,
    origin,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      // 204 with the headers, or 403 with none — a preflight from an origin that
      // is not allowed should fail as a preflight, not as the POST behind it.
      return origin
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : new Response(null, { status: 403 });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, origin);
    }

    if (!origin) {
      return json({ error: "origin_not_allowed" }, 403, null);
    }

    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
      // Worth its own status: this is a deployment that was never finished, and
      // it would otherwise surface as Strava rejecting an empty client_id.
      return json({ error: "worker_not_configured" }, 500, origin);
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_json" }, 400, origin);
    }

    if (pathname === "/exchange") {
      const code = payload.code;
      if (typeof code !== "string" || code.length === 0) {
        return json({ error: "code_required" }, 400, origin);
      }
      return callStrava(
        env,
        { code, grant_type: "authorization_code" },
        origin,
      );
    }

    if (pathname === "/refresh") {
      const refreshToken = payload.refresh_token;
      if (typeof refreshToken !== "string" || refreshToken.length === 0) {
        return json({ error: "refresh_token_required" }, 400, origin);
      }
      return callStrava(
        env,
        { refresh_token: refreshToken, grant_type: "refresh_token" },
        origin,
      );
    }

    return json({ error: "not_found" }, 404, origin);
  },
} satisfies ExportedHandler<Env>;
