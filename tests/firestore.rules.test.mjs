/**
 * Firestore security rules tests.
 *
 * These assert the actual access boundary of the app. The Firebase web config is
 * public by design, so firestore.rules — not the config — is what stops one
 * athlete reading another's training data. That makes it worth testing directly.
 *
 * Plain ESM on Node's built-in test runner, so there is no test framework to
 * install or configure. Run through the emulator, which supplies the rules
 * engine:
 *
 *   npm run test:rules
 */

import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

const ALICE = "alice-uid";
const BOB = "bob-uid";

// Configurable so the suite can run either against an emulator started by
// `firebase emulators:exec` (CI) or against the one already running in Docker
// from `make dev`, whose project id comes from docker-compose.
const PROJECT_ID = process.env.FIRESTORE_TEST_PROJECT_ID ?? "forge-rules-test";
const [EMULATOR_HOST, EMULATOR_PORT] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"
).split(":");

/** A profile that satisfies every validation rule. */
const validProfile = (uid) => ({
  uid,
  email: "athlete@example.com",
  displayName: "Alex",
  photoURL: null,
  gender: "non_binary",
  unitSystem: "metric",
  createdAt: new Date(),
});

/** A workout that satisfies every validation rule. */
const validWorkout = (overrides = {}) => ({
  date: "2026-08-11",
  title: "Fran",
  type: "ForTime",
  description: "21-15-9 Thrusters / Pull-ups",
  scoreType: "time_seconds",
  scoreValue: 255,
  scoreDisplay: "04:15",
  rxOrScaled: "RX",
  isPR: true,
  linkedBenchmarkId: "fran",
  reps: null,
  notes: "",
  createdAt: new Date(),
  ...overrides,
});

/** A rest/injury day marker that satisfies every validation rule. */
const validDayMark = (date, overrides = {}) => ({
  date,
  status: "rest",
  note: "",
  createdAt: new Date(),
  ...overrides,
});

const validRecord = (movementId, overrides = {}) => ({
  movementId,
  name: "Fran",
  category: "Benchmark",
  scoreType: "time_seconds",
  bestValue: 255,
  bestDisplay: "04:15",
  achievedOn: "2026-08-11",
  updatedAt: new Date(),
  ...overrides,
});

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: EMULATOR_HOST,
      port: Number(EMULATOR_PORT),
    },
  });

  // Start from a clean slate: a leftover document from an earlier run could
  // make an "allow create" assertion pass for the wrong reason.
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv?.cleanup();
});

/** Firestore handle for a signed-in user. */
const as = (uid) => testEnv.authenticatedContext(uid).firestore();
/** Firestore handle for a visitor with no session. */
const anon = () => testEnv.unauthenticatedContext().firestore();

describe("profiles", () => {
  it("lets a user create their own profile", async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), "users", ALICE), validProfile(ALICE)),
    );
  });

  it("refuses a profile written to someone else's uid", async () => {
    await assertFails(
      setDoc(doc(as(ALICE), "users", BOB), validProfile(BOB)),
    );
  });

  it("refuses a profile whose uid field does not match its path", async () => {
    await assertFails(
      setDoc(doc(as(BOB), "users", BOB), validProfile(ALICE)),
    );
  });

  it("refuses an unrecognised gender", async () => {
    await assertFails(
      setDoc(doc(as(BOB), "users", BOB), {
        ...validProfile(BOB),
        gender: "other",
      }),
    );
  });

  it("refuses an unrecognised unit system", async () => {
    await assertFails(
      setDoc(doc(as(BOB), "users", BOB), {
        ...validProfile(BOB),
        unitSystem: "stones",
      }),
    );
  });

  it("refuses an empty display name", async () => {
    await assertFails(
      setDoc(doc(as(BOB), "users", BOB), {
        ...validProfile(BOB),
        displayName: "",
      }),
    );
  });

  it("refuses an anonymous read", async () => {
    await assertFails(getDoc(doc(anon(), "users", ALICE)));
  });

  it("refuses reading another user's profile", async () => {
    await assertFails(getDoc(doc(as(BOB), "users", ALICE)));
  });

  it("refuses changing uid on update", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), { uid: BOB }),
    );
  });

  it("allows updating own settings", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        displayName: "Alex R",
        gender: "female",
        unitSystem: "imperial",
      }),
    );
  });

  // The Octiv bearer token lives on the profile. It is a credential for a third
  // party's API, so it is only ever readable by its owner — which the profile
  // rules above already establish — and has to arrive in a usable shape.
  it("allows storing an Octiv connection", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        octiv: {
          accessToken: "eyJ0eXAiOiJKV1Qi.token",
          tokenType: "Bearer",
          expiresAt: "2027-08-13T14:30:43.000Z",
          username: "athlete@example.com",
        },
      }),
    );
  });

  it("refuses an Octiv connection with no token", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        octiv: { accessToken: "", expiresAt: "2027-08-13T14:30:43.000Z" },
      }),
    );
  });

  it("refuses an Octiv connection that is not a map", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), { octiv: "a-bare-token" }),
    );
  });

  it("allows storing a Strava connection", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        strava: {
          accessToken: "a1b2c3.access",
          refreshToken: "d4e5f6.refresh",
          expiresAt: "2026-08-28T00:30:43.000Z",
          athleteId: 12345,
          username: "athlete",
          scope: "read,activity:read_all",
        },
      }),
    );
  });

  // The difference from Octiv that matters. A Strava access token lasts six
  // hours, so a connection without a refresh token is dead within the day and
  // nothing can renew it — better refused at the boundary than stored.
  it("refuses a Strava connection with no refresh token", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        strava: {
          accessToken: "a1b2c3.access",
          refreshToken: "",
          expiresAt: "2026-08-28T00:30:43.000Z",
          athleteId: 12345,
        },
      }),
    );
  });

  it("refuses a Strava connection with no access token", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        strava: {
          accessToken: "",
          refreshToken: "d4e5f6.refresh",
          expiresAt: "2026-08-28T00:30:43.000Z",
          athleteId: 12345,
        },
      }),
    );
  });

  it("refuses a Strava athleteId that is not a number", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        strava: {
          accessToken: "a1b2c3.access",
          refreshToken: "d4e5f6.refresh",
          expiresAt: "2026-08-28T00:30:43.000Z",
          athleteId: "12345",
        },
      }),
    );
  });

  it("refuses a Strava connection that is not a map", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), { strava: "a-bare-token" }),
    );
  });

  // Both integrations live on the same document as sibling fields, so the two
  // validators have to hold at once rather than one masking the other.
  it("allows both connections at the same time", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        octiv: {
          accessToken: "eyJ0eXAiOiJKV1Qi.token",
          tokenType: "Bearer",
          expiresAt: "2027-08-13T14:30:43.000Z",
          username: "athlete@example.com",
        },
        strava: {
          accessToken: "a1b2c3.access",
          refreshToken: "d4e5f6.refresh",
          expiresAt: "2026-08-28T00:30:43.000Z",
          athleteId: 12345,
          username: "athlete",
          scope: "read,activity:read_all",
        },
      }),
    );
  });

  it("refuses a bad Strava connection even when Octiv is valid", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        octiv: {
          accessToken: "eyJ0eXAiOiJKV1Qi.token",
          tokenType: "Bearer",
          expiresAt: "2027-08-13T14:30:43.000Z",
          username: "athlete@example.com",
        },
        strava: { accessToken: "a1b2c3.access" },
      }),
    );
  });

  // The places the athlete has tagged sessions with, kept on the profile so the
  // workout form gets its suggestions without a second query.
  it("lets a user remember the places they train at", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        locations: ["CrossFit Berlin", "Home garage"],
      }),
    );
  });

  it("lets a user clear their remembered places", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE), { locations: [] }),
    );
  });

  it("refuses remembered places that are not a list", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        locations: "CrossFit Berlin",
      }),
    );
  });

  // The rules cap the list's length but cannot walk its elements — see
  // isValidLocations, and readLocations in src/lib/locations.ts, which is what
  // actually guarantees the contents.
  it("refuses an unbounded list of remembered places", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        locations: Array.from({ length: 13 }, (_, i) => `Box ${i}`),
      }),
    );
  });
});

describe("workouts", () => {
  it("lets a user log their own workout", async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), "users", ALICE, "workouts", "w1"), validWorkout()),
    );
  });

  // A session can be written down before it is done, so a null score has to be
  // accepted — while a wrong *type* of score still is not.
  it("lets a user log a workout with no score yet", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "unscored"),
        validWorkout({ scoreValue: null, scoreDisplay: "", isPR: false }),
      ),
    );
  });

  it("lets a user fill in the score afterwards", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE, "workouts", "unscored"), {
        scoreValue: 255,
        scoreDisplay: "04:15",
      }),
    );
  });

  // A session imported from Octiv is an ordinary workout carrying the id of the
  // programming it came from, so the same day is not offered for import twice.
  it("lets a user log a workout imported from Octiv", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "imported"),
        validWorkout({ octivExerciseId: "1780164" }),
      ),
    );
  });

  it("refuses an Octiv id that is not a string", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "bad-octiv-id"),
        validWorkout({ octivExerciseId: 1780164 }),
      ),
    );
  });

  it("lets a user log a workout imported from Strava", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "from-strava"),
        validWorkout({ stravaActivityId: "15450425037", type: "Run" }),
      ),
    );
  });

  // Strava's activity ids are already past 2^53, so they cannot survive a round
  // trip through JSON as numbers and are stored as strings.
  it("refuses a Strava id that is not a string", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "bad-strava-id"),
        validWorkout({ stravaActivityId: 15450425037 }),
      ),
    );
  });

  // Where the session was trained. Optional, so both a tagged and an untagged
  // session have to be accepted — `validWorkout()` above is the untagged case.
  it("lets a user tag a workout with a place", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "at-the-box"),
        validWorkout({ location: "CrossFit Berlin" }),
      ),
    );
  });

  it("refuses a place that is not a string", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "bad-location"),
        validWorkout({ location: { name: "CrossFit Berlin" } }),
      ),
    );
  });

  it("refuses a place longer than the field allows", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "long-location"),
        validWorkout({ location: "b".repeat(121) }),
      ),
    );
  });

  it("accepts the Run workout type", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "a-run"),
        validWorkout({ type: "Run" }),
      ),
    );
  });

  // An open run: metres as the score, with the time it took beside it.
  it("accepts a distance score and the duration that goes with it", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "open-run"),
        validWorkout({
          type: "Run",
          scoreType: "distance_metres",
          scoreValue: 8000,
          scoreDisplay: "8.00 km · 42:10 (05:16 /km)",
          durationSeconds: 2530,
        }),
      ),
    );
  });

  // The time is optional even on a distance session — a route walked to recce
  // it is still a distance worth keeping.
  it("accepts a distance logged without a time", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "untimed-run"),
        validWorkout({
          type: "Run",
          scoreType: "distance_metres",
          scoreValue: 12000,
          scoreDisplay: "12.00 km",
          durationSeconds: null,
        }),
      ),
    );
  });

  it("refuses a duration that is not a number", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "bad-duration"),
        validWorkout({ durationSeconds: "42:10" }),
      ),
    );
  });

  it("refuses a negative duration", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "negative-duration"),
        validWorkout({ durationSeconds: -1 }),
      ),
    );
  });

  // The position a session holds within its day, written for a whole day at a
  // time by the reorder panel.
  it("lets a user arrange a session within its day", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE, "workouts", "w1"), { order: 0 }),
    );
  });

  it("refuses a negative or non-integer position", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE, "workouts", "w1"), { order: -1 }),
    );
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE, "workouts", "w1"), { order: 1.5 }),
    );
  });

  it("refuses writing into another user's log", async () => {
    await assertFails(
      setDoc(doc(as(BOB), "users", ALICE, "workouts", "w2"), validWorkout()),
    );
  });

  it("refuses reading another user's log", async () => {
    await assertFails(
      getDocs(collection(as(BOB), "users", ALICE, "workouts")),
    );
  });

  it("refuses a malformed date", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "bad-date"),
        validWorkout({ date: "11-08-2026" }),
      ),
    );
  });

  it("refuses an unknown workout type", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "bad-type"),
        validWorkout({ type: "Tabata" }),
      ),
    );
  });

  it("refuses an unknown score type", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "bad-score-type"),
        validWorkout({ scoreType: "calories" }),
      ),
    );
  });

  it("refuses a negative score", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "negative"),
        validWorkout({ scoreValue: -1 }),
      ),
    );
  });

  it("refuses a non-numeric score", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "text-score"),
        validWorkout({ scoreValue: "04:15" }),
      ),
    );
  });

  it("refuses an invalid RX flag", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "bad-rx"),
        validWorkout({ rxOrScaled: "Rx+" }),
      ),
    );
  });

  it("refuses an empty title", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "workouts", "no-title"),
        validWorkout({ title: "" }),
      ),
    );
  });

  it("lets a user delete their own workout", async () => {
    await assertSucceeds(
      deleteDoc(doc(as(ALICE), "users", ALICE, "workouts", "w1")),
    );
  });

  it("refuses deleting another user's workout", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "users", ALICE, "workouts", "victim"),
        validWorkout(),
      );
    });

    await assertFails(
      deleteDoc(doc(as(BOB), "users", ALICE, "workouts", "victim")),
    );
  });
});

describe("rest and injury days", () => {
  it("lets a user mark their own rest day", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "days", "2026-08-10"),
        validDayMark("2026-08-10"),
      ),
    );
  });

  it("lets a user mark an injury with a note", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "days", "2026-08-09"),
        validDayMark("2026-08-09", {
          status: "injured",
          note: "Tweaked my lower back on the second set.",
        }),
      ),
    );
  });

  it("lets a user re-mark a day, replacing the previous marker", async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), "users", ALICE, "days", "2026-08-10"),
        validDayMark("2026-08-10", { status: "injured" }),
      ),
    );
  });

  // The document id is the source of truth for which day this is; the field only
  // exists so ranges are queryable. They must never disagree.
  it("refuses a date field that disagrees with the document id", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "days", "2026-08-10"),
        validDayMark("2026-08-11"),
      ),
    );
  });

  it("refuses a malformed document id", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "days", "10-08-2026"),
        validDayMark("10-08-2026"),
      ),
    );
  });

  it("refuses an unknown status", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "days", "2026-08-08"),
        validDayMark("2026-08-08", { status: "deload" }),
      ),
    );
  });

  it("refuses an over-long note", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "days", "2026-08-08"),
        validDayMark("2026-08-08", { note: "x".repeat(501) }),
      ),
    );
  });

  it("refuses writing into another user's days", async () => {
    await assertFails(
      setDoc(
        doc(as(BOB), "users", ALICE, "days", "2026-08-07"),
        validDayMark("2026-08-07"),
      ),
    );
  });

  it("refuses reading another user's days", async () => {
    await assertFails(getDocs(collection(as(BOB), "users", ALICE, "days")));
  });

  it("lets a user clear their own marker", async () => {
    await assertSucceeds(
      deleteDoc(doc(as(ALICE), "users", ALICE, "days", "2026-08-10")),
    );
  });

  it("refuses clearing another user's marker", async () => {
    await assertFails(
      deleteDoc(doc(as(BOB), "users", ALICE, "days", "2026-08-09")),
    );
  });
});

describe("personal records", () => {
  it("lets a user write their own record", async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), "users", ALICE, "prs", "fran"), validRecord("fran")),
    );
  });

  it("refuses a record whose movementId disagrees with its document id", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "prs", "fran"),
        validRecord("grace"),
      ),
    );
  });

  it("refuses an unknown category", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "prs", "fran"),
        validRecord("fran", { category: "Gymnastics" }),
      ),
    );
  });

  it("refuses a negative best value", async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), "users", ALICE, "prs", "fran"),
        validRecord("fran", { bestValue: -5 }),
      ),
    );
  });

  it("refuses reading another user's records", async () => {
    await assertFails(getDocs(collection(as(BOB), "users", ALICE, "prs")));
  });
});

describe("everything else", () => {
  it("refuses reads and writes outside users/{uid}", async () => {
    await assertFails(setDoc(doc(as(ALICE), "leaderboards", "global"), { x: 1 }));
    await assertFails(getDoc(doc(as(ALICE), "leaderboards", "global")));
    await assertFails(getDocs(collection(as(ALICE), "users")));
  });
});
