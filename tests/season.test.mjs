/**
 * Season tests.
 *
 * `src/lib/season.ts` decides when the share sheet offers a festive background
 * and when the date strip dresses up. The edges are the whole point — the last
 * day of October, Epiphany — so those are what is pinned here.
 *
 *   npm run test:season
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { holidayOn, seasonOn } = await import("../src/lib/season.ts");

const on = (fn, y, m, d) => fn(new Date(y, m - 1, d));

describe("seasonOn", () => {
  it("is halloween through October only", () => {
    assert.equal(on(seasonOn, 2026, 9, 30), null);
    assert.equal(on(seasonOn, 2026, 10, 1), "halloween");
    assert.equal(on(seasonOn, 2026, 10, 31), "halloween");
  });

  it("is christmas from 1 November to 6 January", () => {
    assert.equal(on(seasonOn, 2026, 11, 1), "christmas");
    assert.equal(on(seasonOn, 2026, 12, 25), "christmas");
    assert.equal(on(seasonOn, 2027, 1, 6), "christmas");
    assert.equal(on(seasonOn, 2027, 1, 7), null);
  });

  it("is nothing in the rest of the year", () => {
    assert.equal(on(seasonOn, 2026, 7, 15), null);
  });
});

describe("holidayOn", () => {
  it("marks Halloween, Christmas Eve and Day, and New Year's Eve", () => {
    assert.equal(on(holidayOn, 2026, 10, 31)?.emoji, "🎃");
    assert.equal(on(holidayOn, 2026, 12, 24)?.emoji, "🎄");
    assert.equal(on(holidayOn, 2026, 12, 25)?.emoji, "🎄");
    assert.equal(on(holidayOn, 2026, 12, 31)?.emoji, "🎆");
  });

  it("leaves ordinary days alone", () => {
    assert.equal(on(holidayOn, 2026, 10, 30), null);
    assert.equal(on(holidayOn, 2026, 12, 26), null);
  });
});
