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
