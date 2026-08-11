/**
 * Barbell loading tests.
 *
 * `src/lib/barbell.ts` answers the question an athlete asks with a bar in front
 * of them — which plates, per side — so being wrong here means loading the wrong
 * weight. The properties worth pinning down:
 *
 *   · a loadable target comes back exact, with the fewest plates
 *   · an unloadable target under-loads and says by how much, rather than
 *     silently rounding up into a heavier lift than was asked for
 *   · plate maths never leaks float noise into the number that gets read
 *   · collars and the imperial set are part of the sum, not an afterthought
 *   · a warm-up ladder climbs, is loadable at every rung, and ends on the target
 *
 * The module has no runtime imports, so Node's built-in type stripping runs it
 * directly and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:barbell
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  BARS,
  COLLAR,
  PLATES,
  WARMUP_PERCENTAGES,
  buildWarmupLadder,
  loadBar,
  loadableStep,
  roundToLoadable,
} = await import("../src/lib/barbell.ts");

/** A men's kg bar with the standard plate set and no collars. */
const KG = { bar: 20, plates: PLATES.metric };
/** A men's lb bar with the standard plate set and no collars. */
const LB = { bar: 45, plates: PLATES.imperial };

/** `[[plate, count], …]`, which is far easier to read in an assertion. */
function pairs(loaded) {
  return loaded.perSide.map(({ plate, count }) => [plate, count]);
}

describe("plate and bar reference data", () => {
  it("lists plates heaviest first, in both units", () => {
    for (const set of [PLATES.metric, PLATES.imperial]) {
      for (let i = 1; i < set.length; i += 1) {
        assert.ok(
          set[i] < set[i - 1],
          `${set[i]} should come after ${set[i - 1]}`,
        );
      }
    }
  });

  it("offers a men's and a women's bar in both units", () => {
    for (const unit of ["metric", "imperial"]) {
      const ids = BARS[unit].map((bar) => bar.id);
      assert.ok(ids.includes("mens"), `${unit} is missing a men's bar`);
      assert.ok(ids.includes("womens"), `${unit} is missing a women's bar`);
    }
  });

  it("steps by a pair of the lightest plate", () => {
    assert.equal(loadableStep(PLATES.metric), 2.5);
    assert.equal(loadableStep(PLATES.imperial), 5);
    assert.equal(loadableStep([]), 0);
  });
});

describe("loadBar", () => {
  it("loads an exact target, heaviest plate first", () => {
    // 102.5 on a 20 kg bar is 41.25 a side. Three plates either way — 20+20+1.25
    // ties on count — so the tie-break towards the heavier plate decides it.
    const loaded = loadBar(102.5, KG);
    assert.deepEqual(pairs(loaded), [
      [25, 1],
      [15, 1],
      [1.25, 1],
    ]);
    assert.equal(loaded.total, 102.5);
    assert.equal(loaded.short, 0);
    assert.equal(loaded.belowBar, false);
  });

  it("takes the fewest plates it can", () => {
    // 60 kg is 20 a side: one 20, not two 10s or four 5s.
    assert.deepEqual(pairs(loadBar(60, KG)), [[20, 1]]);
    // 140 kg is 60 a side, which needs two 25s and a 10.
    assert.deepEqual(pairs(loadBar(140, KG)), [
      [25, 2],
      [10, 1],
    ]);
  });

  it("is never beaten by a smarter combination", () => {
    // Greedy is only optimal for well-behaved denominations, and both plate
    // sets are asserted rather than assumed: a future 3 kg plate could quietly
    // make heaviest-first the wrong answer.
    for (const [setup, unit] of [
      [KG, "kg"],
      [LB, "lb"],
    ]) {
      const step = loadableStep(setup.plates) / 2;
      const denominations = setup.plates.map((plate) => plate / step);

      // Fewest plates for every per-side load, by exhaustive search.
      const limit = 400;
      const best = [0, ...Array(limit).fill(Infinity)];
      for (let side = 1; side <= limit; side += 1) {
        for (const plate of denominations) {
          if (plate <= side) best[side] = Math.min(best[side], best[side - plate] + 1);
        }
      }

      for (let side = 1; side <= limit; side += 1) {
        const target = setup.bar + side * step * 2;
        const loaded = loadBar(target, setup);
        if (loaded.short !== 0) continue;

        const used = loaded.perSide.reduce((sum, { count }) => sum + count, 0);
        assert.equal(
          used,
          best[side],
          `${target} ${unit} took ${used} plates a side where ${best[side]} was possible`,
        );
      }
    }
  });

  it("under-loads an unreachable target and reports the gap", () => {
    // 101 kg is 40.5 a side; the smallest plate is 1.25, so 40 is as close as
    // the rack gets. Erring light is the safe direction.
    const loaded = loadBar(101, KG);
    assert.equal(loaded.total, 100);
    assert.equal(loaded.short, 1);
    assert.ok(loaded.total < 101, "must never load past the target");
  });

  it("returns the bare bar for a target at or under it", () => {
    const atBar = loadBar(20, KG);
    assert.deepEqual(pairs(atBar), []);
    assert.equal(atBar.total, 20);
    assert.equal(atBar.short, 0);
    assert.equal(atBar.belowBar, false);

    const under = loadBar(15, KG);
    assert.deepEqual(pairs(under), []);
    assert.equal(under.total, 20);
    assert.equal(under.belowBar, true);
    // Negative: the bar is heavier than what was asked for.
    assert.equal(under.short, -5);
  });

  it("counts both collars against the plates", () => {
    // 100 kg on a 20 kg bar is 40 a side. Add 2.5 kg collars — 5 kg of the
    // total — and only 37.5 a side is left for plates.
    const loaded = loadBar(100, { ...KG, collar: COLLAR.metric });
    assert.deepEqual(pairs(loaded), [
      [25, 1],
      [10, 1],
      [2.5, 1],
    ]);
    assert.equal(loaded.total, 100);
    assert.equal(loaded.short, 0);
  });

  it("loads a women's bar", () => {
    // 62.5 on a 15 kg bar is 23.75 a side — the odd quarter the men's bar
    // never produces, which is exactly where a halving bug would show.
    const loaded = loadBar(62.5, { bar: 15, plates: PLATES.metric });
    assert.deepEqual(pairs(loaded), [
      [20, 1],
      [2.5, 1],
      [1.25, 1],
    ]);
    assert.equal(loaded.total, 62.5);
    assert.equal(loaded.short, 0);
  });

  it("loads the imperial set in pounds", () => {
    const loaded = loadBar(225, LB);
    assert.deepEqual(pairs(loaded), [[45, 2]]);
    assert.equal(loaded.total, 225);
    assert.equal(loaded.short, 0);

    // 185 is 70 a side: 45 + 25.
    assert.deepEqual(pairs(loadBar(185, LB)), [
      [45, 1],
      [25, 1],
    ]);
  });

  it("keeps the printed total clean", () => {
    // What matters is the number the athlete reads, and `x / 2` on a decimal
    // target is exactly where float noise would show up.
    for (const target of [102.5, 61.25, 143.75, 97.5, 188.75]) {
      for (const setup of [KG, { ...KG, collar: COLLAR.metric }, LB]) {
        const { total, short } = loadBar(target, setup);
        for (const value of [total, short]) {
          const decimals = (String(value).split(".")[1] ?? "").length;
          assert.ok(
            decimals <= 2,
            `${target} produced ${value}, which has more than two decimals`,
          );
        }
      }
    }
  });

  it("never loads more than the target, whatever the target", () => {
    for (let target = 20; target <= 300; target += 0.25) {
      const { total } = loadBar(target, KG);
      assert.ok(
        total <= target + 1e-9,
        `${target} kg loaded to ${total} kg, which is over`,
      );
    }
  });
});

describe("roundToLoadable", () => {
  it("snaps to the nearest pair of the lightest plate", () => {
    // Plates go on in pairs, so from a 20 kg bar the grid is 2.5 kg apart —
    // 100 and 102.5 are loadable, everything between them is not.
    assert.equal(roundToLoadable(101, KG), 100);
    assert.equal(roundToLoadable(101.5, KG), 102.5);
    assert.equal(roundToLoadable(102.5, KG), 102.5);
  });

  it("never returns less than the bar and its collars", () => {
    assert.equal(roundToLoadable(5, KG), 20);
    assert.equal(roundToLoadable(5, { ...KG, collar: COLLAR.metric }), 25);
  });

  it("stays on the grid the bar sits on", () => {
    // With 2.5 kg collars the loadable weights are 25, 27.5, 30 … not 20, 22.5.
    const setup = { ...KG, collar: COLLAR.metric };
    for (const weight of [63, 88.9, 141.2]) {
      const rounded = roundToLoadable(weight, setup);
      assert.equal(loadBar(rounded, setup).short, 0, `${rounded} is not loadable`);
    }
  });
});

describe("buildWarmupLadder", () => {
  it("starts on the bar and ends on the target", () => {
    const ladder = buildWarmupLadder(140, KG);
    assert.equal(ladder[0].total, 20);
    assert.equal(ladder[ladder.length - 1].total, 140);
  });

  it("climbs, and every rung is loadable", () => {
    const ladder = buildWarmupLadder(142.5, KG);
    for (let i = 1; i < ladder.length; i += 1) {
      assert.ok(
        ladder[i].total > ladder[i - 1].total,
        `rung ${i} (${ladder[i].total}) should be above ${ladder[i - 1].total}`,
      );
    }
    for (const rung of ladder) {
      assert.equal(rung.short, 0, `${rung.total} is not exactly loadable`);
    }
  });

  it("offers one rung per percentage when they are far enough apart", () => {
    const ladder = buildWarmupLadder(200, KG);
    // The bar, each warm-up percentage, and the working set.
    assert.equal(ladder.length, WARMUP_PERCENTAGES.length + 2);
  });

  it("collapses rungs that round onto the same plates", () => {
    // A light target squeezes the percentages together; a repeated load is not
    // a warm-up set.
    const ladder = buildWarmupLadder(25, KG);
    const totals = ladder.map((rung) => rung.total);
    assert.deepEqual(totals, [...new Set(totals)]);
  });

  it("is just the bar when the target does not clear it", () => {
    const ladder = buildWarmupLadder(15, KG);
    assert.equal(ladder.length, 1);
    assert.equal(ladder[0].total, 20);
  });

  it("keeps collars on for every rung", () => {
    const setup = { ...KG, collar: COLLAR.metric };
    const ladder = buildWarmupLadder(120, setup);
    assert.equal(ladder[0].total, 25);
    for (const rung of ladder) {
      const plates = rung.perSide.reduce(
        (sum, { plate, count }) => sum + plate * count * 2,
        0,
      );
      assert.equal(rung.total, 25 + plates);
    }
  });
});
