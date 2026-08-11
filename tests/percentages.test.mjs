/**
 * Percentage-of-max tests.
 *
 * `src/lib/percentages.ts` turns a logged best into the loads a programme
 * prescribes ("5 × 3 @ 75%"). An athlete reads those numbers off a phone and
 * loads a bar to them, so the arithmetic is worth pinning down:
 *
 *   · the 100% row is the record itself, unchanged
 *   · a percentage of a fractional max does not leak float noise into the display
 *   · the steps stay descending and evenly spaced, which is what makes the table
 *     scannable mid-session
 *
 * The module imports nothing, so Node's built-in type stripping runs it directly
 * and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:percentages
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { PERCENTAGE_STEPS, buildPercentageTable, percentageOfMax } =
  await import("../src/lib/percentages.ts");

describe("PERCENTAGE_STEPS", () => {
  it("runs from 100% down to 40% in 5% steps", () => {
    assert.deepEqual(
      [...PERCENTAGE_STEPS],
      [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40],
    );
  });

  it("is strictly descending", () => {
    for (let i = 1; i < PERCENTAGE_STEPS.length; i += 1) {
      assert.ok(
        PERCENTAGE_STEPS[i] < PERCENTAGE_STEPS[i - 1],
        `step ${i} (${PERCENTAGE_STEPS[i]}) should be below ${PERCENTAGE_STEPS[i - 1]}`,
      );
    }
  });
});

describe("percentageOfMax", () => {
  it("returns the max itself at 100%", () => {
    assert.equal(percentageOfMax(120, 100), 120);
    // A stored load carries up to two decimals; 100% must not round them off.
    assert.equal(percentageOfMax(102.5, 100), 102.5);
    assert.equal(percentageOfMax(97.75, 100), 97.75);
  });

  it("scales a whole max exactly", () => {
    assert.equal(percentageOfMax(100, 75), 75);
    assert.equal(percentageOfMax(200, 40), 80);
    assert.equal(percentageOfMax(120, 85), 102);
  });

  it("keeps a fractional result to two decimals rather than float noise", () => {
    // 102.5 × 0.75 is 76.875 — the naive expression lands on 76.87499999999999.
    assert.equal(percentageOfMax(102.5, 75), 76.88);
    assert.equal(percentageOfMax(127.5, 65), 82.88);

    // Counted off the printed form on purpose: `value * 100` is itself lossy
    // (68.43 × 100 is 6843.000000000001), and what has to be clean here is the
    // number the athlete reads, which is this string.
    for (const max of [102.5, 97.75, 63.33, 181.44]) {
      for (const percent of PERCENTAGE_STEPS) {
        const value = percentageOfMax(max, percent);
        const decimals = (String(value).split(".")[1] ?? "").length;
        assert.ok(
          decimals <= 2,
          `${percent}% of ${max} produced more than two decimals: ${value}`,
        );
      }
    }
  });

  it("holds the zero case, so a table is never built on a missing record", () => {
    assert.equal(percentageOfMax(0, 75), 0);
  });
});

describe("buildPercentageTable", () => {
  it("returns one row per step, in the same order", () => {
    const rows = buildPercentageTable(120);
    assert.equal(rows.length, PERCENTAGE_STEPS.length);
    assert.deepEqual(
      rows.map((row) => row.percent),
      [...PERCENTAGE_STEPS],
    );
  });

  it("anchors the first row on the record", () => {
    const rows = buildPercentageTable(142.5);
    assert.deepEqual(rows[0], { percent: 100, kg: 142.5 });
  });

  it("descends in load as it descends in percent", () => {
    const rows = buildPercentageTable(140);
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(
        rows[i].kg < rows[i - 1].kg,
        `${rows[i].percent}% (${rows[i].kg}) should be lighter than ${rows[i - 1].percent}% (${rows[i - 1].kg})`,
      );
    }
  });
});
