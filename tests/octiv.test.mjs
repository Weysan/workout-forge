/**
 * Octiv → FORGE mapping tests.
 *
 * `src/lib/octiv/mapping.ts` is where a third party's data becomes workouts in
 * someone's log, so the decisions it makes are worth pinning down:
 *
 *   · each piece of a WOD becomes its own workout, scored on its own unit
 *   · a unit FORGE cannot represent falls back to completion, not to a wrong number
 *   · sessions are filed under the day being viewed, not the day Octiv wrote
 *   · everything arrives unscored — importing is not doing
 *   · titles and descriptions stay inside the caps in firestore.rules
 *
 * The module imports types only, so Node's built-in type stripping runs it
 * directly and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:octiv
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { inferWorkoutType, scoreTypeForUnit, wodToWorkoutInputs } = await import(
  "../src/lib/octiv/mapping.ts"
);

const { camelizeKeys } = await import("../src/lib/octiv/camelize.ts");

/**
 * Trimmed from a real response for 2026-08-13, as `client.ts` hands it on:
 * camelCase, after `camelize.ts` has normalised the snake_case off the wire.
 */
const SAMPLE_WOD = {
  id: 660834,
  name: null,
  date: "2026-08-13",
  tenantId: 101219,
  wodExercises: [
    {
      id: 1780164,
      isActive: 1,
      order: 1,
      exercise: {
        id: 1610237,
        name: "Pull Superset",
        description: "10 min for Quality\n10-12 Dumbbell Pull Overs",
        measuringUnit: { id: 1, name: "For Weight - kg", unit: "kg" },
      },
      prefix: null,
    },
    {
      id: 1780165,
      isActive: 1,
      order: 2,
      exercise: {
        id: 1610238,
        name: "Thursday Sweat",
        description: "Partner Workout, You go/I go\nEvery 4:00 x 6 sets",
        measuringUnit: { id: 14, name: "For Time - min", unit: "mm.ss" },
      },
      prefix: null,
    },
  ],
};

describe("scoreTypeForUnit", () => {
  it("reads the two units the box actually programmes in", () => {
    assert.equal(
      scoreTypeForUnit({ name: "For Weight - kg", unit: "kg" }),
      "weight",
    );
    assert.equal(
      scoreTypeForUnit({ name: "For Time - min", unit: "mm.ss" }),
      "time_seconds",
    );
  });

  it("puts rounds before reps, since 'Rounds + Reps' contains both", () => {
    assert.equal(
      scoreTypeForUnit({ name: "For Rounds + Reps", unit: "rounds" }),
      "rounds_reps",
    );
    assert.equal(scoreTypeForUnit({ name: "For Reps", unit: "reps" }), "reps");
  });

  it("falls back to completion rather than inventing a number", () => {
    // Distance and calories are real scores FORGE has no type for. Recording
    // "done" is honest; filing 1200 metres under "reps" would not be.
    assert.equal(
      scoreTypeForUnit({ name: "For Distance - m", unit: "m" }),
      "pass_fail",
    );
    assert.equal(scoreTypeForUnit(null), "pass_fail");
    assert.equal(scoreTypeForUnit(undefined), "pass_fail");
    assert.equal(scoreTypeForUnit({}), "pass_fail");
  });
});

describe("inferWorkoutType", () => {
  it("derives a sensible default from the score type", () => {
    assert.equal(inferWorkoutType("weight", ""), "Strength");
    assert.equal(inferWorkoutType("time_seconds", ""), "ForTime");
    assert.equal(inferWorkoutType("rounds_reps", ""), "AMRAP");
    assert.equal(inferWorkoutType("pass_fail", ""), "Custom");
  });

  it("believes the description when it names a format", () => {
    assert.equal(inferWorkoutType("time_seconds", "EMOM 12"), "EMOM");
    assert.equal(
      inferWorkoutType("time_seconds", "Every 4:00 x 6 sets"),
      "EMOM",
    );
    assert.equal(inferWorkoutType("time_seconds", "20 min AMRAP:"), "AMRAP");
  });
});

describe("wodToWorkoutInputs", () => {
  it("turns one day of programming into one workout per piece", () => {
    const inputs = wodToWorkoutInputs(SAMPLE_WOD, "2026-08-13");

    assert.equal(inputs.length, 2);
    assert.deepEqual(
      inputs.map((input) => input.title),
      ["Pull Superset", "Thursday Sweat"],
    );
    assert.deepEqual(
      inputs.map((input) => input.scoreType),
      ["weight", "time_seconds"],
    );
    assert.deepEqual(
      inputs.map((input) => input.type),
      ["Strength", "EMOM"],
    );
    assert.deepEqual(
      inputs.map((input) => input.octivExerciseId),
      ["1780164", "1780165"],
    );
  });

  it("imports everything unscored — importing is not doing", () => {
    for (const input of wodToWorkoutInputs(SAMPLE_WOD, "2026-08-13")) {
      assert.equal(input.scoreValue, null);
      assert.equal(input.scoreDisplay, "");
      assert.equal(input.isPR, false);
      assert.equal(input.reps, null);
      assert.equal(input.linkedBenchmarkId, null);
      assert.equal(input.rxOrScaled, "RX");
    }
  });

  it("files sessions under the day being viewed, not the day Octiv wrote", () => {
    // The panel offered this WOD on the 14th; that is the day it belongs to.
    const inputs = wodToWorkoutInputs(SAMPLE_WOD, "2026-08-14");
    assert.deepEqual(
      inputs.map((input) => input.date),
      ["2026-08-14", "2026-08-14"],
    );
  });

  it("orders by the coach's order, not by array position", () => {
    const shuffled = {
      ...SAMPLE_WOD,
      wodExercises: [...SAMPLE_WOD.wodExercises].reverse(),
    };
    assert.deepEqual(
      wodToWorkoutInputs(shuffled, "2026-08-13").map((input) => input.title),
      ["Pull Superset", "Thursday Sweat"],
    );
  });

  it("keeps the section marker in the title when the box uses one", () => {
    const withPrefix = {
      ...SAMPLE_WOD,
      wodExercises: [{ ...SAMPLE_WOD.wodExercises[0], prefix: "A" }],
    };
    assert.equal(
      wodToWorkoutInputs(withPrefix, "2026-08-13")[0].title,
      "A. Pull Superset",
    );
  });

  it("names an unnamed piece after the WOD it came from", () => {
    const unnamed = {
      ...SAMPLE_WOD,
      name: "Murph",
      wodExercises: [
        {
          id: 1,
          order: 1,
          exercise: { name: null, description: "1 mile run" },
        },
      ],
    };
    assert.equal(wodToWorkoutInputs(unnamed, "2026-08-13")[0].title, "Murph");
  });

  it("skips pieces that carry nothing worth logging", () => {
    const noisy = {
      ...SAMPLE_WOD,
      wodExercises: [
        // Pulled from the day by the coach.
        { ...SAMPLE_WOD.wodExercises[0], isActive: 0 },
        // No name and no description: a blank card with nothing to fill in.
        { id: 99, order: 2, exercise: { name: "  ", description: null } },
        // No id, so an import could never be recognised as one.
        { id: null, order: 3, exercise: { name: "Ghost", description: "x" } },
      ],
    };
    assert.deepEqual(wodToWorkoutInputs(noisy, "2026-08-13"), []);
  });

  it("stays inside the caps the security rules enforce", () => {
    const long = {
      ...SAMPLE_WOD,
      wodExercises: [
        {
          id: 7,
          order: 1,
          exercise: { name: "N".repeat(400), description: "D".repeat(9000) },
        },
      ],
    };
    const [input] = wodToWorkoutInputs(long, "2026-08-13");
    assert.equal(input.title.length, 120);
    assert.equal(input.description.length, 5000);
  });

  it("has nothing to import from an empty or missing day", () => {
    assert.deepEqual(wodToWorkoutInputs(null, "2026-08-13"), []);
    assert.deepEqual(wodToWorkoutInputs(undefined, "2026-08-13"), []);
    assert.deepEqual(wodToWorkoutInputs({ wodExercises: [] }, "2026-08-13"), []);
    assert.deepEqual(wodToWorkoutInputs({}, "2026-08-13"), []);
  });
});

describe("camelizeKeys", () => {
  it("renames keys at every depth and leaves values alone", () => {
    assert.deepEqual(
      camelizeKeys({
        warm_up: null,
        wod_exercises: [{ is_active: 1, measuring_unit: { id: 1 } }],
      }),
      { warmUp: null, wodExercises: [{ isActive: 1, measuringUnit: { id: 1 } }] },
    );
  });

  it("does not touch the line breaks Octiv formats its programming with", () => {
    const description = "Every 4:00 x 6 sets\n\nA: 600 m Erg\nB: Farmers Carry";
    const { exercise } = camelizeKeys({ exercise: { description } });
    assert.equal(exercise.description, description);
  });

  it("leaves keys that are already camelCase as they are", () => {
    assert.deepEqual(camelizeKeys({ wodExercises: [], id: 1 }), {
      wodExercises: [],
      id: 1,
    });
  });

  // The bug this exists to prevent: a snake_case WOD mapped to nothing at all,
  // so the panel silently rendered as if the box had programmed no day.
  it("turns a raw Octiv day into importable workouts", () => {
    const raw = {
      data: [
        {
          id: 660834,
          date: "2026-08-13",
          warm_up: null,
          tenant_id: 101219,
          wod_exercises: [
            {
              id: 1780164,
              is_active: 1,
              order: 1,
              wod_id: 660834,
              exercise_id: 1610237,
              exercise: {
                id: 1610237,
                name: "Pull Superset",
                description: "10 min for Quality",
                measuring_unit_id: 1,
                measuring_unit: { id: 1, name: "For Weight - kg", unit: "kg" },
              },
              prefix: null,
            },
            {
              id: 1780165,
              is_active: 1,
              order: 2,
              exercise: {
                id: 1610238,
                name: "Thursday Sweat",
                description: "Every 4:00 x 6 sets",
                measuring_unit: { id: 14, name: "For Time - min", unit: "mm.ss" },
              },
            },
          ],
        },
      ],
      meta: { current_page: 1, total: 1 },
    };

    const [wod] = camelizeKeys(raw).data;
    const inputs = wodToWorkoutInputs(wod, "2026-08-13");

    assert.equal(inputs.length, 2);
    assert.deepEqual(
      inputs.map((input) => [input.title, input.scoreType, input.type]),
      [
        ["Pull Superset", "weight", "Strength"],
        ["Thursday Sweat", "time_seconds", "EMOM"],
      ],
    );
    assert.deepEqual(
      inputs.map((input) => input.octivExerciseId),
      ["1780164", "1780165"],
    );
  });
});
