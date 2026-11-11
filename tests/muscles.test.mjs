/**
 * Muscle map tests: free text → movements → muscle load → period colours.
 *
 * The parser is a set of static rules over whiteboard-style text, so the cases
 * below are the shapes athletes actually write — rep schemes, round headers,
 * AMRAP clocks, distances, abbreviations — plus the benchmark library as a
 * regression corpus: every benchmark must be read without leftovers.
 *
 *   npm run test:muscles
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./helpers/ts-resolver.mjs", import.meta.url);

const { parseWorkout, findMovements, normalizeText, readQuantity } = await import(
  "../src/lib/muscles/parse.ts"
);
const {
  summarisePeriod,
  periodRange,
  stepPeriod,
  fetchStartFor,
  muscleLoadOf,
  levelColor,
} = await import("../src/lib/muscles/load.ts");
const { MOVEMENTS, MUSCLES } = await import("../src/lib/muscles/catalog.ts");
const { BENCHMARK_SEED_DATA } = await import("../src/constants/seedData.ts");

const workout = (overrides = {}) => ({
  id: overrides.id ?? "w1",
  date: overrides.date ?? "2026-08-12",
  title: "",
  description: "",
  type: "ForTime",
  scoreType: "time_seconds",
  scoreValue: null,
  durationSeconds: null,
  ...overrides,
});

/** `{ movementId: quantity }` for compact assertions. Repeats are summed. */
const quantities = (parsed) => {
  const out = {};
  for (const m of parsed.movements) out[m.movementId] = (out[m.movementId] ?? 0) + m.quantity;
  return out;
};

const topMuscles = (parsed, n = 3) =>
  Object.entries(muscleLoadOf(parsed))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([muscle]) => muscle);

describe("catalog", () => {
  it("has unique movement ids", () => {
    const ids = MOVEMENTS.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("only weights known muscles, within 0–1", () => {
    const known = new Set(MUSCLES.map((m) => m.id));
    for (const movement of MOVEMENTS) {
      for (const [muscle, weight] of Object.entries(movement.muscles)) {
        assert.ok(known.has(muscle), `${movement.id}: unknown muscle ${muscle}`);
        assert.ok(weight > 0 && weight <= 1, `${movement.id}.${muscle} = ${weight}`);
      }
    }
  });

  it("gives no alias to two movements", () => {
    const owner = new Map();
    for (const movement of MOVEMENTS) {
      for (const alias of movement.aliases) {
        const key = normalizeText(alias);
        const previous = owner.get(key);
        assert.ok(
          previous === undefined || previous === movement.id,
          `"${alias}" is claimed by ${previous} and ${movement.id}`,
        );
        owner.set(key, movement.id);
      }
    }
  });
});

describe("normalisation and matching", () => {
  it("strips plurals, hyphens and ampersands", () => {
    assert.equal(normalizeText("Pull-ups"), "pull up");
    assert.equal(normalizeText("Clean & Jerks"), "clean and jerk");
    assert.equal(normalizeText("Snatches"), "snatch");
    assert.equal(normalizeText("Toes-to-Bar"), "toe to bar");
  });

  it("expands equipment abbreviations", () => {
    assert.deepEqual(findMovements("DB Snatch").map((m) => m.id), ["db_snatch"]);
    assert.deepEqual(findMovements("KB swings").map((m) => m.id), ["kb_swing"]);
  });

  it("prefers the longest name over one nested inside it", () => {
    assert.deepEqual(findMovements("Hang Power Cleans").map((m) => m.id), ["power_clean"]);
    assert.deepEqual(findMovements("Bent over row").map((m) => m.id), ["row_strength"]);
    assert.deepEqual(findMovements("Squat snatch").map((m) => m.id), ["snatch"]);
    assert.deepEqual(findMovements("Burpee pull-ups").map((m) => m.id), ["burpee_pull_up"]);
  });

  it("reads common abbreviations", () => {
    for (const [text, id] of [
      ["T2B", "toes_to_bar"],
      ["C2B", "chest_to_bar"],
      ["HSPU", "hspu"],
      ["OHS", "overhead_squat"],
      ["DUs", "double_under"],
      ["RDL", "romanian_deadlift"],
      ["Wall balls", "wall_ball"],
    ]) {
      assert.deepEqual(findMovements(text).map((m) => m.id), [id], text);
    }
  });

  it("matches whole words only", () => {
    assert.deepEqual(findMovements("Hip thrusts").map((m) => m.id), ["hip_thrust"]);
    assert.deepEqual(findMovements("Skipping").map((m) => m.id), ["double_under"]);
  });
});

describe("quantities", () => {
  it("reads leading counts, distances and calories", () => {
    assert.deepEqual(readQuantity("21 KB Swings"), { value: 21, unit: "rep" });
    assert.deepEqual(readQuantity("400m Run"), { value: 400, unit: "metre" });
    assert.deepEqual(readQuantity("1,000m Row"), { value: 1000, unit: "metre" });
    assert.deepEqual(readQuantity("5 km run"), { value: 5000, unit: "metre" });
    assert.deepEqual(readQuantity("30/25 cal Echo Bike"), { value: 30, unit: "cal" });
    assert.deepEqual(readQuantity("1 mile Run"), { value: 1609, unit: "metre" });
  });

  it("reads sets × reps anywhere on the line", () => {
    assert.deepEqual(readQuantity("Back squat 5x5 @ 80%"), { value: 25, unit: "rep" });
    assert.deepEqual(readQuantity("8 x 1km Run"), { value: 8000, unit: "metre" });
  });

  it("never reads a load as a quantity", () => {
    assert.equal(readQuantity("Deadlift 100kg"), null);
    assert.equal(readQuantity("Thrusters 43 kg"), null);
  });

  it("reads units that do not need a space", () => {
    assert.deepEqual(readQuantity("Run 400m"), { value: 400, unit: "metre" });
    assert.deepEqual(readQuantity("Plank 60s"), { value: 60, unit: "second" });
  });
});

describe("workout structure", () => {
  it("applies a rep scheme to the lines below it", () => {
    const fran = parseWorkout(
      workout({ description: "21-15-9\nThrusters (95/65 lbs)\nPull-ups" }),
    );
    assert.deepEqual(quantities(fran), { thruster: 45, pull_up: 45 });
    assert.deepEqual(fran.unrecognised, []);
  });

  it("multiplies the lines under a rounds header", () => {
    const helen = parseWorkout(
      workout({
        description: "3 Rounds For Time:\n400m Run\n21 KB Swings (1.5/1 pood)\n12 Pull-ups",
      }),
    );
    assert.deepEqual(quantities(helen), { run: 1200, kb_swing: 63, pull_up: 36 });
  });

  it("closes a block at a blank line or a 'Then'", () => {
    const parsed = parseWorkout(
      workout({
        description: "3 rounds:\n10 burpees\n\n20 air squats\nThen 2 rounds of:\n5 pull-ups",
      }),
    );
    assert.deepEqual(quantities(parsed), { burpee: 30, air_squat: 20, pull_up: 10 });
  });

  it("splits '+' into separate movements", () => {
    const parsed = parseWorkout(workout({ description: "5 rounds: 10 push-ups + 200m run" }));
    assert.deepEqual(quantities(parsed), { push_up: 50, run: 1000 });
  });

  it("reads calories off a unit-only line under a scheme", () => {
    const parsed = parseWorkout(
      workout({ description: "21-18-15 For Time:\ncal Echo Bike\nThrusters" }),
    );
    assert.equal(parsed.movements.find((m) => m.movementId === "bike").unit, "cal");
    assert.deepEqual(quantities(parsed), { bike: 54, thruster: 54 });
  });

  it("does not read the AMRAP clock as a quantity", () => {
    const parsed = parseWorkout(
      workout({ type: "AMRAP", description: "AMRAP 12 min: 10 burpees" }),
    );
    assert.deepEqual(quantities(parsed), { burpee: 10 });
  });

  it("ignores notes written as sentences", () => {
    const parsed = parseWorkout(
      workout({
        description:
          "Team of 2 — both partners run every kilometre, station work split freely.\n50 wall balls",
      }),
    );
    assert.deepEqual(quantities(parsed), { wall_ball: 50 });
  });

  it("reports lines it could not read, and not headers", () => {
    const parsed = parseWorkout(
      workout({ description: "For Time:\n20 zercher carries\n30 flamingo hops\nRest 2 min" }),
    );
    assert.deepEqual(parsed.unrecognised, ["30 flamingo hops"]);
  });

  it("assumes a default when nothing is written, and says so", () => {
    const parsed = parseWorkout(workout({ type: "Strength", description: "Back squat" }));
    assert.equal(parsed.movements[0].quantity, 25);
    assert.equal(parsed.movements[0].estimated, true);
  });
});

describe("title fallback", () => {
  it("reads the title when the description names nothing", () => {
    const parsed = parseWorkout(
      workout({ type: "Strength", title: "Back Squat", description: "5x5 @ 80%" }),
    );
    assert.deepEqual(quantities(parsed), { back_squat: 25 });
  });

  it("reads a Strava run from its title and distance line", () => {
    const parsed = parseWorkout(
      workout({
        type: "Run",
        title: "Morning Run",
        description: "Distance: 8.02 km\nPace: 5:15 /km",
        scoreType: "distance_metres",
        scoreValue: 8020,
        durationSeconds: 2530,
      }),
    );
    assert.deepEqual(quantities(parsed), { run: 8020 });
    assert.equal(Math.round(parsed.movements[0].seconds), 2530);
    assert.deepEqual(parsed.unrecognised, []);
  });

  it("does not read the title when the description has work in it", () => {
    const parsed = parseWorkout(
      workout({ title: "Squat day", description: "5x5 front squat" }),
    );
    assert.deepEqual(quantities(parsed), { front_squat: 25 });
  });
});

describe("time scaling", () => {
  it("fills an AMRAP's clock", () => {
    const parsed = parseWorkout(
      workout({
        type: "AMRAP",
        description: "20 min AMRAP:\n5 Pull-ups\n10 Push-ups\n15 Air Squats",
      }),
    );
    const total = parsed.movements.reduce((sum, m) => sum + m.seconds, 0);
    assert.equal(Math.round(total), 1200);
  });

  it("fits a for-time result, but not a capped one", () => {
    const base = { description: "21-15-9\nThrusters\nPull-ups" };
    const timed = parseWorkout(workout({ ...base, scoreValue: 300 }));
    assert.equal(Math.round(timed.movements.reduce((s, m) => s + m.seconds, 0)), 300);

    const capped = parseWorkout(workout({ ...base, scoreValue: 999_990 }));
    assert.notEqual(Math.round(capped.movements.reduce((s, m) => s + m.seconds, 0)), 999_990);
  });

  it("leaves strength sessions unscaled", () => {
    const a = parseWorkout(workout({ type: "Strength", description: "5x5 back squat" }));
    const b = parseWorkout(
      workout({ type: "Strength", description: "5x5 back squat", durationSeconds: 3600 }),
    );
    assert.equal(a.movements[0].seconds, b.movements[0].seconds);
  });
});

describe("muscle load", () => {
  it("puts the obvious muscles on top", () => {
    const bench = parseWorkout(workout({ type: "Strength", description: "5x5 bench press" }));
    assert.equal(topMuscles(bench, 1)[0], "chest");

    const run = parseWorkout(workout({ description: "5 km run" }));
    assert.equal(topMuscles(run, 1)[0], "calves");

    const pull = parseWorkout(workout({ description: "50 strict pull-ups" }));
    assert.equal(topMuscles(pull, 1)[0], "lats");
  });

  it("weighs a long run above a few squats", () => {
    const parsed = parseWorkout(workout({ description: "10 air squats\n5 km run" }));
    const load = muscleLoadOf(parsed);
    assert.ok(load.calves > load.quads * 0.5);
  });
});

describe("benchmark library", () => {
  for (const benchmark of BENCHMARK_SEED_DATA) {
    it(`reads ${benchmark.name}`, () => {
      const parsed = parseWorkout({
        title: benchmark.name,
        description: benchmark.description,
        type: benchmark.type,
        scoreType: benchmark.scoreType,
        scoreValue: null,
      });
      assert.ok(parsed.movements.length > 0, "no movements found");
      // Hyrox sims list "8 Hyrox Stations"; everything else must be read fully.
      assert.deepEqual(parsed.unrecognised, []);
    });
  }
});

describe("periods", () => {
  it("runs weeks Monday to Sunday", () => {
    // 2026-08-12 is a Wednesday.
    assert.deepEqual(periodRange("week", "2026-08-12"), {
      start: "2026-08-10",
      end: "2026-08-16",
    });
  });

  it("covers a whole calendar month", () => {
    assert.deepEqual(periodRange("month", "2026-02-14"), {
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("steps by one period", () => {
    assert.equal(stepPeriod("day", "2026-08-12", 1), "2026-08-13");
    assert.equal(stepPeriod("week", "2026-08-12", -1), "2026-08-05");
    assert.equal(stepPeriod("month", "2026-01-31", 1), "2026-02-01");
  });

  it("fetches the baseline window before the period", () => {
    assert.equal(fetchStartFor("week", "2026-08-12"), "2026-05-18");
  });
});

describe("period summary", () => {
  const squats = (id, date) =>
    workout({ id, date, type: "Strength", description: "5x5 back squat" });
  const presses = (id, date) =>
    workout({ id, date, type: "Strength", description: "5x5 strict press" });

  it("colours a day relative to its busiest muscle", () => {
    const summary = summarisePeriod({
      period: "day",
      anchor: "2026-08-12",
      today: "2026-08-12",
      workouts: [squats("a", "2026-08-12")],
    });
    assert.equal(summary.mode, "relative");
    assert.equal(summary.muscles[0].muscle, "quads");
    assert.equal(summary.muscles[0].level, 1);
    const chest = summary.muscles.find((m) => m.muscle === "chest");
    assert.equal(chest.level, null);
  });

  it("falls back to relative colouring without enough history", () => {
    const summary = summarisePeriod({
      period: "week",
      anchor: "2026-08-12",
      today: "2026-08-16",
      workouts: [squats("a", "2026-08-12"), squats("b", "2026-08-05")],
    });
    assert.equal(summary.mode, "relative");
  });

  it("compares a week with the athlete's usual week", () => {
    // Squats twice a week for twelve weeks, then a week with four squat
    // sessions and a press session nobody usually does.
    const history = [];
    for (let week = 1; week <= 12; week += 1) {
      const monday = stepPeriod("week", "2026-08-10", -week);
      history.push(squats(`h${week}a`, monday), squats(`h${week}b`, stepPeriod("day", monday, 2)));
    }
    const thisWeek = [
      squats("t1", "2026-08-10"),
      squats("t2", "2026-08-11"),
      squats("t3", "2026-08-12"),
      squats("t4", "2026-08-13"),
      presses("t5", "2026-08-14"),
    ];
    const summary = summarisePeriod({
      period: "week",
      anchor: "2026-08-12",
      today: "2026-08-16",
      workouts: [...history, ...thisWeek],
    });

    assert.equal(summary.mode, "baseline");
    const quads = summary.muscles.find((m) => m.muscle === "quads");
    // Twice the usual squat volume: well past "as usual".
    assert.ok(quads.level > 0.6, `quads level ${quads.level}`);
    // Pressing never happens normally, so any of it is maximal.
    const delts = summary.muscles.find((m) => m.muscle === "front_delts");
    assert.equal(delts.level, 1);
    assert.equal(summary.workouts.length, 5);
    assert.deepEqual(
      quads.contributors.map((c) => c.workoutId).sort(),
      ["t1", "t2", "t3", "t4"],
    );
  });

  it("judges a week in progress at its pace so far", () => {
    const history = [];
    for (let day = 1; day <= 84; day += 1) {
      history.push(squats(`h${day}`, stepPeriod("day", "2026-08-10", -day)));
    }
    // Tuesday: two squat sessions so far, exactly the usual daily rate.
    const summary = summarisePeriod({
      period: "week",
      anchor: "2026-08-11",
      today: "2026-08-11",
      workouts: [...history, squats("t1", "2026-08-10"), squats("t2", "2026-08-11")],
    });
    const quads = summary.muscles.find((m) => m.muscle === "quads");
    assert.ok(Math.abs(quads.level - 0.5) < 0.01, `quads level ${quads.level}`);
  });

  it("lists workouts with unread lines", () => {
    const summary = summarisePeriod({
      period: "day",
      anchor: "2026-08-12",
      today: "2026-08-12",
      workouts: [workout({ id: "x", title: "Odd", description: "30 flamingo hops" })],
    });
    assert.deepEqual(summary.unrecognised, [
      { workoutId: "x", title: "Odd", lines: ["30 flamingo hops"] },
    ]);
  });
});

describe("colour scale", () => {
  it("runs green to red", () => {
    assert.equal(levelColor(0), "hsl(130 75% 48%)");
    assert.equal(levelColor(1), "hsl(0 75% 48%)");
    assert.equal(levelColor(5), "hsl(0 75% 48%)");
  });
});
