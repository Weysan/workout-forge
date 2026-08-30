# Strava token broker

Strava has no PKCE, so `client_secret` is required to exchange an authorization
code *and* to refresh an access token. FORGE is a static export with no server,
so a secret in the client would be a secret in the bundle.

This Worker holds the secret and does those two calls. Nothing else. The activity
reads go straight from the browser to `www.strava.com/api/v3`, which works because
Strava sends `access-control-allow-origin: *`.

## Setup

Register an application at https://www.strava.com/settings/api. Set its
**Authorization Callback Domain** to your app's host — `localhost` is whitelisted
by Strava for development, so one app covers both.

```sh
npm install
npx wrangler secret put STRAVA_CLIENT_SECRET
```

Put the client id and your app's origins in `wrangler.toml` under `[vars]`, then:

```sh
npx wrangler deploy
```

Set `NEXT_PUBLIC_STRAVA_WORKER_URL` in the app's `.env.local` to the deployed URL
(no trailing slash), or to `http://localhost:8787` when running `npm run dev` here.

## Endpoints

Both are `POST`, both take and return JSON, both require an `Origin` on the
`ALLOWED_ORIGINS` list.

| Route | Body | Returns |
|---|---|---|
| `/exchange` | `{ "code": "..." }` | `access_token`, `refresh_token`, `expires_at`, `token_type`, `athlete` |
| `/refresh` | `{ "refresh_token": "..." }` | the same, with `athlete: null` |

Strava's status is passed through unchanged, so the client can tell a credentials
problem (4xx) from an unreachable Strava (5xx).

## Check it

```sh
npx wrangler dev

curl -i -X POST localhost:8787/exchange \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  -d '{"code":"definitely-not-a-real-code"}'
```

Expect Strava's `400` with an `errors` array naming `code`, and an
`access-control-allow-origin: http://localhost:3000` header on the way back. A
`403` instead means the `Origin` is not on the list; a `500 worker_not_configured`
means the secret or the client id is missing.
