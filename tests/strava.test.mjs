/**
 * Strava → FORGE mapping tests.
 *
 * `src/lib/strava/mapping.ts` is where a third party's record of a session
 * becomes a workout in someone's log, so the decisions it makes are worth
 * pinning down:
 *
 *   · a session is filed under the day the athlete trained, not the UTC day
 *   · gym activities are excluded, because Octiv describes those far better
 *   · a sport type nobody has seen before is not imported, rather than guessed at
 *   · everything arrives scored — unlike an Octiv import, this already happened
 *   · a personal record is claimed only by a race, at a standard distance
 *
 * That last one is the asymmetry worth testing hardest: linking wrongly writes a
 * Sunday jog into the record table as a 5 km best, which is quietly wrong and
 * survives until someone notices.
 *
 * The module imports types only, so Node's built-in type stripping runs it
 * directly and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:strava
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  RECORD_DISTANCE_TOLERANCE,
  STRAVA_DESCRIPTION_MAX,
  STRAVA_TITLE_MAX,
  activitiesToWorkoutInputs,
  benchmarkIdFor,
  dayKeyOf,
  durationOf,
  formatStravaDuration,
  isImportable,
  sportTypeOf,
  workoutTypeFor,
} = await import("../src/lib/strava/mapping.ts");

/**
 * Shaped like a real `GET /athlete/activities` element, trimmed to the fields
 * this app reads. Note `start_date_local` ending in a `Z` it does not mean —
 * that is Strava's own doing, and the reason `dayKeyOf` never parses it.
 */
function activity(overrides = {}) {
  return {
    id: 15450425037,
    name: "Evening Run",
    distance: 5023.7,
    moving_time: 1387,
    elapsed_time: 1402,
    sport_type: "Run",
    type: "Run",
    start_date_local: "2026-08-27T19:04:11Z",
    start_date: "2026-08-27T17:04:11Z",
    workout_type: 0,
    total_elevation_gain: 42,
    average_heartrate: 154.2,
    manual: false,
    trainer: false,
    ...overrides,
  };
}

describe("dayKeyOf", () => {
  it("takes the local date, so an evening session stays on its own day", () => {
    // 19:04 local on the 27th. Parsed as UTC it would be 19:04Z, which for an
    // athlete in UTC+7 is already the 28th — the bug this guards.
    assert.equal(dayKeyOf(activity()), "2026-08-27");
  });

  it("ignores start_date, which is UTC and can name a different day", () => {
    const late = activity({
      start_date_local: "2026-08-27T23:30:00Z",
      start_date: "2026-08-28T02:30:00Z",
    });
    assert.equal(dayKeyOf(late), "2026-08-27");
  });

  it("is empty when Strava sent no local date, rather than guessing", () => {
    assert.equal(dayKeyOf(activity({ start_date_local: null })), "");
  });
});

describe("sportTypeOf", () => {
  it("prefers sport_type", () => {
    const ride = activity({ sport_type: "GravelRide", type: "Ride" });
    assert.equal(sportTypeOf(ride), "GravelRide");
  });

  it("falls back to type, for activities recorded before sport_type existed", () => {
    assert.equal(sportTypeOf(activity({ sport_type: null })), "Run");
  });
});

describe("durationOf", () => {
  it("prefers moving time, which is the honest figure for a session", () => {
    assert.equal(durationOf(activity()), 1387);
  });

  it("falls back to elapsed time when moving time is missing", () => {
    assert.equal(durationOf(activity({ moving_time: null })), 1402);
  });

  it("is zero when neither is usable", () => {
    assert.equal(durationOf(activity({ moving_time: 0, elapsed_time: null })), 0);
  });
});

describe("isImportable", () => {
  it("accepts an ordinary recorded run", () => {
    assert.equal(isImportable(activity()), true);
  });

  it("excludes gym sport types, which Octiv describes far better", () => {
    for (const sport of ["WeightTraining", "Crossfit", "Workout", "Yoga"]) {
      assert.equal(
        isImportable(activity({ sport_type: sport })),
        false,
        `${sport} should not be imported`,
      );
    }
  });

  it("excludes a sport type nobody has seen, rather than guessing at it", () => {
    assert.equal(isImportable(activity({ sport_type: "Quidditch" })), false);
  });

  it("excludes manual entries — typed in, not measured", () => {
    assert.equal(isImportable(activity({ manual: true })), false);
  });

  it("excludes an activity with no duration, which has nothing to score", () => {
    assert.equal(
      isImportable(activity({ moving_time: 0, elapsed_time: 0 })),
      false,
    );
  });

  it("excludes an activity with no id, which could never be deduped", () => {
    assert.equal(isImportable(activity({ id: null })), false);
  });

  it("accepts the other endurance kinds a hybrid athlete trains", () => {
    for (const sport of ["TrailRun", "Ride", "Rowing", "Swim", "Hike"]) {
      assert.equal(
        isImportable(activity({ sport_type: sport })),
        true,
        `${sport} should be imported`,
      );
    }
  });
});

describe("workoutTypeFor", () => {
  it("labels running as Run", () => {
    assert.equal(workoutTypeFor("Run"), "Run");
    assert.equal(workoutTypeFor("TrailRun"), "Run");
  });

  it("labels everything else Custom, never ForTime", () => {
    // ForTime means done against the clock for a result. A two-hour ride is not
    // that, and the badge should not put it beside benchmark efforts.
    assert.equal(workoutTypeFor("Ride"), "Custom");
    assert.equal(workoutTypeFor("Rowing"), "Custom");
  });
});

describe("formatStravaDuration", () => {
  it("omits the hour below an hour", () => {
    assert.equal(formatStravaDuration(275), "04:35");
    assert.equal(formatStravaDuration(1387), "23:07");
  });

  it("includes it above", () => {
    assert.equal(formatStravaDuration(4521), "1:15:21");
  });

  it("rounds rather than truncating, and never goes negative", () => {
    assert.equal(formatStravaDuration(59.6), "01:00");
    assert.equal(formatStravaDuration(-5), "00:00");
  });
});

describe("activitiesToWorkoutInputs", () => {
  it("imports a run already scored, unlike an Octiv import", () => {
    const [workout] = activitiesToWorkoutInputs([activity()], "2026-08-27");

    assert.equal(workout.scoreType, "time_seconds");
    assert.equal(workout.scoreValue, 1387);
    assert.equal(workout.scoreDisplay, "23:07");
    assert.equal(workout.type, "Run");
    assert.equal(workout.title, "Evening Run");
    assert.equal(workout.date, "2026-08-27");
    assert.equal(workout.stravaActivityId, "15450425037");
    // Asserted by the record recompute, never here.
    assert.equal(workout.isPR, false);
  });

  it("writes what Strava measured into the description", () => {
    const [workout] = activitiesToWorkoutInputs([activity()], "2026-08-27");

    assert.match(workout.description, /Distance: 5\.02 km/);
    assert.match(workout.description, /Pace: 04:36 \/km/);
    assert.match(workout.description, /Elevation: 42 m/);
    assert.match(workout.description, /Avg HR: 154 bpm/);
  });

  it("omits measurements Strava did not send", () => {
    const treadmill = activity({
      distance: null,
      total_elevation_gain: null,
      average_heartrate: null,
      trainer: true,
    });
    const [workout] = activitiesToWorkoutInputs([treadmill], "2026-08-27");

    // A treadmill run with no GPS must not get a line reading "0.00 km".
    assert.doesNotMatch(workout.description, /Distance/);
    assert.doesNotMatch(workout.description, /Elevation/);
    assert.doesNotMatch(workout.description, /Avg HR/);
    assert.match(workout.description, /Indoor/);
  });

  it("omits a pace that would be noise — a walk, or time spent stopped", () => {
    const crawl = activity({ distance: 1000, moving_time: 25 * 60 });
    const [workout] = activitiesToWorkoutInputs([crawl], "2026-08-27");

    assert.match(workout.description, /Distance: 1\.00 km/);
    assert.doesNotMatch(workout.description, /Pace/);
  });

  it("drops activities from the days either side of the one asked for", () => {
    // The request window is widened by a day in each direction — see client.ts —
    // so neighbours always come back and must be filtered here.
    const days = [
      activity({ id: 1, start_date_local: "2026-08-26T18:00:00Z" }),
      activity({ id: 2, start_date_local: "2026-08-27T18:00:00Z" }),
      activity({ id: 3, start_date_local: "2026-08-28T06:00:00Z" }),
    ];

    const inputs = activitiesToWorkoutInputs(days, "2026-08-27");
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0].stravaActivityId, "2");
  });

  it("puts the day in the order it happened, not the order Strava sent", () => {
    // Strava returns newest first.
    const newestFirst = [
      activity({ id: 2, start_date_local: "2026-08-27T18:00:00Z", name: "Evening" }),
      activity({ id: 1, start_date_local: "2026-08-27T06:30:00Z", name: "Morning" }),
    ];

    const inputs = activitiesToWorkoutInputs(newestFirst, "2026-08-27");
    assert.deepEqual(
      inputs.map((input) => input.title),
      ["Morning", "Evening"],
    );
  });

  it("keeps titles and descriptions inside the caps in firestore.rules", () => {
    const long = activity({ name: "R".repeat(400) });
    const [workout] = activitiesToWorkoutInputs([long], "2026-08-27");

    assert.equal(workout.title.length, STRAVA_TITLE_MAX);
    assert.ok(workout.description.length <= STRAVA_DESCRIPTION_MAX);
  });

  it("falls back to the sport type when an activity has no name", () => {
    const unnamed = activity({ name: null, sport_type: "Rowing" });
    const [workout] = activitiesToWorkoutInputs([unnamed], "2026-08-27");
    assert.equal(workout.title, "Rowing");
  });

  it("returns nothing for an empty or absent day", () => {
    assert.deepEqual(activitiesToWorkoutInputs([], "2026-08-27"), []);
    assert.deepEqual(activitiesToWorkoutInputs(null, "2026-08-27"), []);
    assert.deepEqual(activitiesToWorkoutInputs(undefined, "2026-08-27"), []);
  });
});

describe("benchmarkIdFor — what may claim a personal record", () => {
  /** A 5 km race: flagged as a race by the athlete, and the right distance. */
  const race = activity({ workout_type: 1, distance: 5023.7 });

  it("links a race at a standard distance", () => {
    assert.equal(benchmarkIdFor(race, "Run"), "run_5k");
  });

  it("refuses a run that was not flagged as a race, however far it went", () => {
    // The whole point. A 5.02 km Sunday jog is not a 5 km personal best, and
    // linking it would put a jog time in the record table.
    assert.equal(benchmarkIdFor(activity({ workout_type: 0 }), "Run"), null);
    assert.equal(benchmarkIdFor(activity({ workout_type: 2 }), "Run"), null);
    assert.equal(benchmarkIdFor(activity({ workout_type: 3 }), "Run"), null);
  });

  it("refuses when workout_type is absent — the field is undocumented", () => {
    // If Strava ever changes those numbers, races stop auto-linking and nothing
    // false is recorded. That is the failure this asserts is safe.
    assert.equal(benchmarkIdFor(activity({ workout_type: null }), "Run"), null);
  });

  it("refuses a race at a distance no benchmark names", () => {
    const eightK = activity({ workout_type: 1, distance: 8000 });
    assert.equal(benchmarkIdFor(eightK, "Run"), null);
  });

  it("accepts drift up to the tolerance and refuses just past it", () => {
    const justInside = 5000 * (1 + RECORD_DISTANCE_TOLERANCE - 0.0001);
    const justOutside = 5000 * (1 + RECORD_DISTANCE_TOLERANCE + 0.0001);

    assert.equal(
      benchmarkIdFor(activity({ workout_type: 1, distance: justInside }), "Run"),
      "run_5k",
    );
    assert.equal(
      benchmarkIdFor(activity({ workout_type: 1, distance: justOutside }), "Run"),
      null,
    );
  });

  it("is symmetric — a course measured a little short still counts", () => {
    const short = activity({ workout_type: 1, distance: 4950 });
    assert.equal(benchmarkIdFor(short, "Run"), "run_5k");
  });

  it("refuses anything that is not running", () => {
    // A 5 km row is not a 5 km run, and rowing benchmarks are their own distances.
    const row = activity({ workout_type: 1, distance: 5000 });
    assert.equal(benchmarkIdFor(row, "Rowing"), null);
    assert.equal(benchmarkIdFor(row, "Ride"), null);
  });

  it("matches every standard distance the library names", () => {
    const cases = [
      [400, "run_400m"],
      [1000, "run_1k"],
      [5000, "run_5k"],
      [10000, "run_10k"],
      [21097, "half_marathon"],
    ];

    for (const [metres, id] of cases) {
      assert.equal(
        benchmarkIdFor(activity({ workout_type: 1, distance: metres }), "Run"),
        id,
        `${metres} m should link to ${id}`,
      );
    }
  });

  it("reaches the workout, so an imported race can set a record", () => {
    const [workout] = activitiesToWorkoutInputs([race], "2026-08-27");
    assert.equal(workout.linkedBenchmarkId, "run_5k");
  });

  it("leaves an ordinary run unlinked, for the edit form to attach by hand", () => {
    const [workout] = activitiesToWorkoutInputs([activity()], "2026-08-27");
    assert.equal(workout.linkedBenchmarkId, null);
  });
});
