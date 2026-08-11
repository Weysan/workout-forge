# FORGE

A mobile-first PWA training log for CrossFit, Hyrox and hybrid athletes. Log
WODs, track personal records, and benchmark yourself against the classic girls,
hero WODs, barbell lifts and Hyrox stations.

```
Next.js 15 (App Router, static export) · TypeScript · Tailwind v4
Firebase Auth + Firestore · Firebase Hosting · GitHub Actions
```

---

## Quick start

You need **Docker** and **Node 22+**. You do *not* need Java or the Firebase CLI
— the emulator image bundles its own JRE.

```bash
make setup     # creates .env.local, installs dependencies
make dev       # starts the app + Firebase emulator
```

| | |
|---|---|
| App | http://localhost:3000 |
| Emulator UI | http://localhost:4000 |

`make dev` runs entirely against the local emulator, so it works on a clean
machine with no Firebase project and no network. Sign-in opens the emulator's
fake account picker — no real Google or Apple account is involved. A **LOCAL**
badge in the app header tells you which backend you are on.

Run `make` on its own to list every target.

### Working without Docker

If you would rather run Next.js on the host (faster file watching on macOS):

```bash
make emulator    # emulator in Docker
npm run dev      # app on the host
```

Set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` in `.env.local` first, otherwise the
host app will try to reach a real Firebase project.

---

## Architecture

### Data model

Everything is scoped under `users/{uid}`, which makes the security rules a single
owner check and means there is no shared or public data to reason about.

```
users/{uid}                     profile, unit preference, gender
users/{uid}/workouts/{id}       one logged session
users/{uid}/prs/{movementId}    derived personal records
```

### Three storage invariants

These are the rules that keep the app coherent, and the reason most bugs in an
app like this never happen here:

1. **Loads are stored in kilograms. Durations are stored in seconds.** Imperial
   is a render-time concern only (`src/lib/units.ts`), so a user can flip
   kg → lbs at any time and their entire history follows without a migration.
2. **`scoreValue` is always the comparable number**, whatever the score type
   (`src/lib/scoring.ts`). Records, sorting and PR detection never branch on
   score type at the query layer. `rounds_reps` packs two numbers as
   `rounds * 1000 + partialReps`, which sorts correctly by rounds then reps.

   The one exception is `null`, which means *logged but not scored yet* — a
   session written down in advance. It is deliberately not `0`, because zero is a
   real result (a `pass_fail` DNF, a 0-rep attempt) and the two must never be
   confused. Readers narrow with `isScored()` so TypeScript forces every view to
   decide what to render in the meantime, and the record recompute skips unscored
   sessions, so a plan can never win a PR. `ScoreSheet` fills the result in later
   straight from the card on the log.
3. **`prs/` is derived data.** The workout log is the source of truth, and
   `syncRecordForBenchmark` recomputes a record from scratch after any write
   that could change it. This is what makes editing a score downwards or
   deleting the session that set a record behave correctly — the record falls
   back to the next-best attempt instead of being stranded.

   It is also why logging a result from the Performance page needs no special
   handling: `QuickLogForm` writes an ordinary workout document, so the result
   appears on the calendar for its date and the record recomputes itself. There is
   no record-only write path to keep in sync. Because the recompute picks the best
   *score* rather than the most recent one, backdating a result that is slower than
   your current best does not steal the PR badge — and backdating one that beats it
   correctly takes the record, dated to when it actually happened.

### Layout

```
src/
  app/
    (app)/            signed-in routes with header + bottom nav
      page.tsx          calendar / daily log
      performance/      PR grid + attempt history
      helpers/          barbell loader + kg/lbs converter
      profile/          settings, sign out, delete account
    login/            SSO landing
    onboarding/       first-run profile setup
    workout/          new/ and edit/ — full-screen form
    offline/          served by the service worker when offline
  components/
    ui/               shadcn-style primitives (hand-vendored, no CLI needed)
  lib/
    firebase.ts       lazy client singletons + emulator wiring
    scoring.ts        score normalisation, PR comparison, formatting
    units.ts          kg ↔ lbs
    percentages.ts    percentage-of-max table off a logged best
    barbell.ts        fewest-plates loading and warm-up ladders
    score-draft.ts    form-state model for the dynamic score inputs
    firestore/        data access, one module per collection
    hooks/            React Query hooks
  constants/
    seedData.ts       the benchmark library (bundled, never fetched)
```

### Notable decisions

- **The site is a static export** (`output: "export"` → `out/`). Every page is
  client-rendered and talks to Firebase directly from the browser, so there was
  never server work to do, and Firebase Hosting serves the result from a CDN with
  no cold starts. The constraint this imposes: **no dynamic route segments**,
  which is why editing a workout is `/workout/edit?id=…` rather than
  `/workout/[id]/edit` — Next would need every workout id at build time. Route
  handlers, server actions, middleware and ISR are likewise unavailable.
- **Offline is a normal operating mode, not an error state.** See the section
  below — it is the constraint that shapes the whole write path.
- **Auth guarding is client-side** (`src/components/auth-gate.tsx`). Firebase
  keeps its session in IndexedDB, not a cookie the server can read, so a server
  guard would mean building a session-cookie layer. Access is already enforced by
  Firestore rules, so the guard is a UX concern and the cost is a brief loading
  state on first paint.
- **Firestore offline persistence is on.** Reads are served locally and writes
  queue until the connection returns — the difference between a usable and
  useless app on gym wifi.
- **The service worker is hand-written** (`public/sw.js`). Firestore already
  handles offline *data*, so the worker only guarantees the app *shell* loads,
  which is ~100 lines and no build plugin. It is disabled in development, where a
  cached shell fights hot reload.
- **UI primitives are vendored, not installed.** They are ordinary files you can
  edit; there is no `shadcn` CLI step and no network dependency to set up.

---

## Local development

| Command | What it does |
|---|---|
| `make dev` | App + emulator, foreground |
| `make up` / `make down` | Same, detached / stop |
| `make emulator` | Emulator only |
| `make check` | Everything CI runs: typecheck, lint, build, rules tests |
| `make test` | Firestore security-rules tests |
| `make preview` | Build, then serve it exactly as Hosting will (port 5050) |
| `make logs` | Tail all service logs |
| `make shell` | Shell inside the web container |
| `make reset-emulator` | Wipe local users and workouts |
| `make icons` | Regenerate PWA icons from the brand mark |
| `make nuke` | Remove containers, volumes, `node_modules` |

Emulator state persists in `.emulator-data/data/` between restarts — exported on
shutdown, imported on boot, so your test account and workouts survive a
`make down`. That directory is git-ignored.

The `data/` nesting is load-bearing: `--export-on-exit` recreates its target
directory, so pointing it at the bind-mount point itself makes every export fail
with `EBUSY` — silently, since the emulator is already shutting down.

`node_modules` and `.next` live in named volumes rather than being bind-mounted
from the host, because Tailwind v4 ships platform-native binaries
(`@tailwindcss/oxide`, `lightningcss`) and macOS builds do not run in a Linux
container. Docker only seeds a named volume when it is empty, so after a
dependency change the volume would otherwise keep serving the old packages — the
web container checksums `package-lock.json` on start and reinstalls when it has
drifted (`docker/web-entrypoint.sh`).

### Changing dependencies

`make install` (and so `make setup`) runs **`npm ci`**, which installs exactly the
lockfile and never rewrites it. Only an explicit `npm install <pkg>` /
`npm uninstall <pkg>` should ever change `package-lock.json`.

After adding or removing a package, run `make dev` (or `docker compose build web`)
before pushing. The container installs with `npm ci`, which is stricter than the
`npm install` you just ran on the host, and CI installs the same way.

If it fails with `Missing <pkg> from lock file`, the lockfile lost its Linux-only
entries. Recover it with git if the change is not yours to keep:

```bash
git checkout -- package-lock.json
```

Otherwise regenerate the full tree — an incremental install cannot repair it:

```bash
rm -rf node_modules package-lock.json && npm install
```

Why this happens: several build dependencies ship per-platform native binaries
(`@tailwindcss/oxide`, `lightningcss`, and `sharp`, which Next pulls in as an
optional dependency). An incremental `npm install <pkg>` or `npm uninstall <pkg>`
on macOS can prune hoisted entries that only Linux resolution needs — notably
`@emnapi/*`, required by `@img/sharp-wasm32`. The result installs fine on the host
and fails in the container. A full reinstall writes the complete tree for every
platform.

### Tests

`make test` runs every suite. Plain ESM on Node's built-in test runner, so there
is no test framework to configure.

| Suite | Command | Covers |
|---|---|---|
| `tests/offline.test.mjs` | `make test-offline` | 11 assertions on write acceptance, queueing and cache fallback |
| `tests/percentages.test.mjs` | `make test-percentages` | 9 tests on the percentage-of-max arithmetic and step ordering |
| `tests/firestore.rules.test.mjs` | `make test-rules` | 28 assertions on the owner boundary and document validation |
| `tests/service-worker.test.mjs` | `make test-sw` | 15 assertions that the built worker can serve every route offline |

The rules suite runs against an isolated emulator project, so it is safe to run
while `make dev` is up — your local workouts are not touched. The service-worker
suite runs against the *built* `out/sw.js`, because the thing worth testing is the
artefact including its generated precache manifest. The offline and percentage
suites import `src/lib/offline.ts` and `src/lib/percentages.ts` directly via Node's
built-in type stripping — neither module has imports of its own, which is what
makes them testable without a bundler.

---

## Offline

The gym has no signal. That is the normal case for this app, so offline is a
supported operating mode rather than an error state.

| | Offline behaviour |
|---|---|
| Opening the app | Works. The whole shell is precached, including every route |
| Reading workouts and PRs | Works, from the local Firestore cache |
| Logging / editing / deleting | Accepted immediately, uploaded when the connection returns |
| Changing profile settings | Same — accepted and queued |
| Signing in | **Requires a connection.** The buttons say so and are disabled |
| Deleting your account | **Requires a connection.** Refused up front, with a reason |

### The one thing that makes this work

Firestore applies a write to its local cache *synchronously*, but the promise
returned by `setDoc` / `updateDoc` / `commit` resolves only when the **server**
acknowledges it. Offline, that promise never settles.

So `await setDoc(...)` — the obvious code — leaves a save button spinning forever
on a write that has already succeeded locally. That is the single biggest trap in
building an offline-capable Firestore app, and it is why writes go through
`acceptWrite` in `src/lib/offline.ts` instead of being awaited directly:

- The write is registered as pending and issued.
- If the server acknowledges within a short grace period, behaviour is exactly as
  before — **including surfacing rules rejections**, which is what would be lost by
  simply not awaiting at all.
- Otherwise it is reported as accepted-and-queued, and the UI says "saved offline".
- A queued write that the server later *refuses* triggers a toast and a refetch,
  because by then the user has been told it was saved.

Reads use `readWithCacheFallback`, which races the server against a 4s timeout and
then falls back to `getDocsFromCache`. The timeout is for the case Firestore cannot
detect on its own: wifi that associates but routes nowhere — a gym guest network,
in other words — where a server read would otherwise hang far longer than anyone
will wait.

Because the local cache already reflects a write the moment it is applied, the PR
recompute after logging a workout reaches the same answer offline as online. PR
badges update immediately with no connection.

### Sync status is visible

`SyncIndicator` in the header shows **Offline**, **Syncing**, or a brief
**Synced** confirmation, and `OfflineBanner` states the contract in words the
first time it matters. Both render nothing in the ordinary online-and-settled
case. Silence about queued writes is what makes offline apps feel untrustworthy.

One honest limitation: the pending-write count is in-memory. Close the tab with
writes queued and Firestore still uploads them on next launch — its queue is
durable in IndexedDB — but the counter restarts at zero, so the indicator will not
show them.

### The app shell is precached, not opportunistically cached

`scripts/generate-precache.mjs` runs as `postbuild`, enumerates `out/`, and injects
the real asset list into `out/sw.js`. Caching pages only as they are visited would
mean a route the athlete had not opened before losing signal simply would not load.

The list is generated because Next fingerprints chunk filenames on every build — a
hand-written list would be stale immediately, and the failure is silent. That is
what `make test-sw` guards: it checks the generated manifest and the worker's own
path handling still agree, so a navigation to `/performance` offline finds its HTML
instead of falling through to the offline page.

Firebase and Google hosts are explicitly never intercepted. Firestore owns its
durable write queue; caching that traffic would break the guarantee that a workout
logged offline is uploaded later.

---

## Deploying

Merging to `main` deploys to **Firebase Hosting**. Two workflows:

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | pull requests, push to `main` | typecheck, lint, build, Firestore rules tests |
| `deploy.yml` | push to `main`, or manual | verify, build with real config, deploy hosting + rules + indexes |

One `firebase deploy` ships all three: the static site from `out/`, the Firestore
rules, and the composite indexes.

### The one thing to understand first

`next build` **bakes** the Firebase config into the JavaScript bundle. There is no
server at runtime to read environment variables from, so the config has to be
correct at *build* time — inside the GitHub Actions run.

That is why the Firebase web config below is stored as GitHub **variables**, not
secrets. Those values are public by design: they ship to every browser that loads
the app, and the actual access boundary is `firestore.rules` (tested in CI), not
the secrecy of an API key. The only genuine secret is the service-account key
that authorises the deploy.

If a variable is missing, the deploy fails fast with a clear message rather than
publishing a site that throws `Firebase config is incomplete` in every visitor's
browser.

---

### Step 1 — Prepare the Firebase project

In the [console](https://console.firebase.google.com/), for your project:

1. **Firestore Database** → *Create database* → production mode, pick a region.
   This is a separate step from creating the project, and rules cannot deploy
   without it.
2. **Authentication** → *Get started* → enable **Google** (and **Apple** if you
   want it).
3. **Project settings → General → Your apps** → **</>** to register a web app, if
   there is not one already.

Hosting needs no console setup — the first deploy creates the site.

### Step 2 — Link this checkout to the project

```bash
make firebase-login
make firebase-link PROJECT_ID=your-project-id
```

That writes `.firebaserc`, writes `.env.production.local` for local production
builds, and prints the exact GitHub variables to set. It reads the config from the
project itself rather than having you transcribe six values from the console —
which is where this setup usually goes quietly wrong, since one wrong character
produces a site that builds cleanly and then fails in every visitor's browser.

### Step 3 — Create a deploy service account

Google Cloud console → **IAM & Admin** → **Service Accounts** → **Create service
account** (same project as Firebase).

Name it something like `github-deployer`, then grant these roles:

| Role | Why |
|---|---|
| `Firebase Hosting Admin` | upload and release the site |
| `Firebase Rules Admin` | deploy `firestore.rules` |
| `Cloud Datastore Index Admin` | deploy `firestore.indexes.json` |
| `Service Usage Consumer` | lets the CLI call the APIs |
| `Firebase Viewer` | read project metadata |

Then **Keys** → **Add key** → **Create new key** → **JSON**. A file downloads —
that is the secret. Copy its entire contents, including the braces.

> Prefer no long-lived key? Swap the *Authenticate to Firebase* step in
> `deploy.yml` for `google-github-actions/auth@v2` with Workload Identity
> Federation, and change the secret to the WIF provider path. Everything else
> stays the same.

### Step 4 — Add the secret and variables to GitHub

Once the repository exists on GitHub:

```bash
make gh-config                       # the six variables, from .env.production.local
make gh-secret KEY=~/Downloads/<project>-<hash>.json
rm ~/Downloads/<project>-<hash>.json # the key is in GitHub now; do not keep a copy
```

`gh-config` reads the values `firebase-link` generated, so GitHub cannot end up
holding a different config from the one this checkout builds with.

To do it by hand instead: Repository → **Settings** → **Secrets and variables** →
**Actions**.

#### 🔒 Secrets tab — 1 entry

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The **entire JSON** file from step 3, pasted as-is |

#### 📋 Variables tab — 6 entries

| Name | Example |
|---|---|
| `FIREBASE_PROJECT_ID` | `forge-app-prod` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSy…` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `forge-app-prod.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `forge-app-prod.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:123456789012:web:abc123def456` |

`NEXT_PUBLIC_FIREBASE_PROJECT_ID` is **not** a separate entry — the workflow
derives it from `FIREBASE_PROJECT_ID` so there is only one place to change it.

### Step 5 — Check the sign-in domain

Firebase console → **Authentication** → **Settings** → **Authorized domains**:
confirm `<PROJECT_ID>.web.app` is listed, plus any custom domain you add later.
Sign-in popups are rejected from unlisted domains, and the failure looks like a
broken button rather than a configuration problem.

Apple sign-in additionally needs an Apple Developer account and a Services ID.
Until that exists the Apple button returns `auth/operation-not-allowed`, which the
login screen reports plainly rather than failing silently — so it is safe to ship
with Google only and add Apple later.

### Step 6 — Deploy once by hand, then let CI take over

Deploy from your machine first. It validates the project setup with a short
feedback loop, and gives you a working URL before any CI configuration is in play —
so if something is wrong you know it is the project, not the pipeline.

```bash
make deploy      # builds, then deploys hosting + rules + indexes
```

Then push, and every later merge to `main` deploys on its own:

```bash
git push origin main
```

Watch it under the repository's **Actions** tab. The run does:

1. **verify** — typecheck, lint, Firestore rules tests
2. **deploy** — assert config present → build with real config → sanity-check
   `out/` → deploy

You can also trigger it manually from **Actions** → **Deploy** → **Run workflow**,
which offers a *hosting only* checkbox that leaves Firestore rules and indexes
untouched.

### Checking it before you push

`make preview` builds the site and serves it through the Firebase Hosting
emulator on <http://localhost:5050>, using the real `firebase.json` — so
`cleanUrls`, cache headers and 404 handling behave exactly as they will in
production.

> Port 5050, not Firebase's usual 5000: on macOS the AirPlay Receiver holds
> port 5000 and answers requests with `403`, which looks exactly like a broken
> deploy.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `Missing repository configuration: …` | A variable or the secret is unset. The message names which. |
| `Firebase config is incomplete` in the browser | Site was built without the variables — check the deploy job's build step, not the CI job's. |
| `auth/unauthorized-domain` on sign-in | Add the domain under Authentication → Settings → Authorized domains. |
| `auth/operation-not-allowed` | That provider is not enabled in the console. |
| Old version persists after deploy | Hard-reload once. The service worker takes over on the next navigation; `sw.js` itself is served `no-store` so it always updates. |
| `HTTP 403` from `localhost:5000` | macOS AirPlay Receiver. Use `make preview` on 5050. |
| `npm ci` fails in Docker or CI with `Missing … from lock file` | See *Changing dependencies* below. |

---

## Environment variables

Every `NEXT_PUBLIC_*` value is embedded in the client bundle. That is expected
for Firebase web config — these are public identifiers, and access is enforced by
`firestore.rules`, not by keeping them secret.

See `.env.example`. For local emulator work the defaults in `docker-compose.yml`
are sufficient and nothing needs filling in.

---

## Things worth knowing before extending this

- **Benchmark ids in `seedData.ts` are permanent.** A workout references one via
  `linkedBenchmarkId`, and a PR document's id *is* the benchmark id, so renaming
  an id orphans existing user data.
- **Dates are `YYYY-MM-DD` strings in the browser's timezone**, derived from
  local date parts, never `toISOString()` — see `toDateKey` in `src/lib/utils.ts`.
  A workout logged at 9pm in New York belongs to that day, not tomorrow.
- **A record requires a strictly better score.** Matching a best is not beating
  it, and treating equality as a PR would re-badge every repeat of a `pass_fail`
  workout.
- **`firestore.rules` validates the same shapes the client writes.** Change one
  and change the other, or writes start failing in production only — the rules
  suite will catch the mismatch if you extend it alongside.
- **Response headers live in `firebase.json`, not `next.config.ts`.** `headers()`
  is silently ignored under `output: "export"` — there is no server to apply it.
  Note also that Hosting matches header globs against the *request path*, and
  `cleanUrls` makes those extensionless: a `**/*.html` rule never fires for
  `/login`. The config therefore sets a safe `must-revalidate` default on `**` and
  lets the more specific asset rules override it.
- **Adding a route means adding a page file.** With no server there is no
  catch-all rewrite, so an unknown path serves `404.html`. Verify new routes with
  `make preview`, not just `npm run dev` — the dev server resolves paths more
  loosely than Hosting does.
- **Test coverage stops at the rules.** The highest-value additions next are unit
  tests for `scoring.ts` and `score-draft.ts` — both pure, and where the domain
  rules actually live (score packing, PR comparison, unit round-tripping) — and
  a browser-level smoke test of the log → PR flow, which is the one path these
  checks cannot reach.
