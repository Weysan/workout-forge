/**
 * Training habit statistics tests.
 *
 * `src/lib/stats.ts` turns the log into the four numbers on the profile screen.
 * They are the app's only claim about the athlete's behaviour rather than their
 * results, so the definitions are worth pinning down:
 *
 *   · a rest day keeps the streak alive; an unaccounted day ends it
 *   · a blank today does not break a streak that was alive yesterday
 *   · the week in progress is excluded from the averages
 *   · a new account is divided by the weeks it has existed, not by twelve
 *   · a workout planned for a future day changes nothing
 *
 * The module imports nothing, so Node's built-in type stripping runs it directly
 * and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:stats
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  AVERAGE_WINDOW_WEEKS,
  STATS_WINDOW_DAYS,
  computeTrainingStats,
  shiftDayKey,
} = await import("../src/lib/stats.ts");

/**
 * A Wednesday, so "this week" is genuinely partial and the Monday-start week
 * arithmetic is exercised away from its boundaries.
 *   2026-08-12 is a Wednesday; its week runs Mon 2026-08-10 – Sun 2026-08-16.
 */
const WEDNESDAY = "2026-08-12";

const stats = (overrides = {}) =>
  computeTrainingStats({
    todayKey: WEDNESDAY,
    workoutDates: [],
    dayMarks: [],
    ...overrides,
  });

const rest = (date) => ({ date, status: "rest" });
const injured = (date) => ({ date, status: "injured" });

/** `count` consecutive day keys ending at `endKey`, most recent first. */
const runBack = (endKey, count) =>
  Array.from({ length: count }, (_, index) => shiftDayKey(endKey, -index));

describe("shiftDayKey", () => {
  it("moves forwards and backwards by whole days", () => {
    assert.equal(shiftDayKey("2026-08-12", 1), "2026-08-13");
    assert.equal(shiftDayKey("2026-08-12", -1), "2026-08-11");
  });

  it("rolls over month and year boundaries", () => {
    assert.equal(shiftDayKey("2026-08-31", 1), "2026-09-01");
    assert.equal(shiftDayKey("2026-01-01", -1), "2025-12-31");
    assert.equal(shiftDayKey("2026-12-31", 1), "2027-01-01");
  });

  it("handles a leap day", () => {
    assert.equal(shiftDayKey("2028-02-28", 1), "2028-02-29");
    assert.equal(shiftDayKey("2028-02-29", 1), "2028-03-01");
  });
});

describe("log streak", () => {
  it("is zero with nothing logged", () => {
    assert.equal(stats().logStreak, 0);
  });

  it("counts today when today has a workout", () => {
    assert.equal(stats({ workoutDates: [WEDNESDAY] }).logStreak, 1);
  });

  it("counts consecutive workout days", () => {
    assert.equal(
      stats({ workoutDates: runBack(WEDNESDAY, 5) }).logStreak,
      5,
    );
  });

  // The whole reason a rest day is worth recording: the streak measures the
  // habit of keeping the log honest, not the habit of training.
  it("is kept alive by a rest day in the middle", () => {
    assert.equal(
      stats({
        workoutDates: [WEDNESDAY, "2026-08-11", "2026-08-09"],
        dayMarks: [rest("2026-08-10")],
      }).logStreak,
      4,
    );
  });

  it("is kept alive by an injury day", () => {
    assert.equal(
      stats({
        workoutDates: [WEDNESDAY, "2026-08-10"],
        dayMarks: [injured("2026-08-11")],
      }).logStreak,
      3,
    );
  });

  // At 8am today is legitimately blank. Breaking the streak there would report a
  // lapse that has not happened.
  it("survives a blank today when yesterday was logged", () => {
    assert.equal(
      stats({ workoutDates: runBack("2026-08-11", 3) }).logStreak,
      3,
    );
  });

  it("ends at the first unaccounted day", () => {
    assert.equal(
      stats({
        // Gap on 2026-08-10.
        workoutDates: [WEDNESDAY, "2026-08-11", "2026-08-09", "2026-08-08"],
      }).logStreak,
      2,
    );
  });

  it("is zero when neither today nor yesterday is logged", () => {
    assert.equal(stats({ workoutDates: ["2026-08-10"] }).logStreak, 0);
  });

  it("is not inflated by a session planned for tomorrow", () => {
    assert.equal(
      stats({ workoutDates: ["2026-08-13", "2026-08-14"] }).logStreak,
      0,
    );
  });

  it("is bounded by the window that was actually fetched", () => {
    // Every day for well over the window: absent days beyond it mean "not
    // loaded", so counting past the boundary would be a guess.
    const everyDay = runBack(WEDNESDAY, STATS_WINDOW_DAYS + 50);
    assert.equal(stats({ workoutDates: everyDay }).logStreak, STATS_WINDOW_DAYS);
  });
});

describe("weekly averages", () => {
  it("reports no average with nothing logged", () => {
    const result = stats();
    assert.equal(result.avgWorkoutDaysPerWeek, null);
    assert.equal(result.avgRestDaysPerWeek, null);
    assert.equal(result.averagedOverWeeks, 0);
  });

  // A Monday-morning average that counts the two days so far as a full week
  // would read as a collapse every week.
  it("excludes the week in progress", () => {
    const result = stats({
      // Mon–Wed of the current week only.
      workoutDates: ["2026-08-10", "2026-08-11", "2026-08-12"],
    });
    assert.equal(result.avgWorkoutDaysPerWeek, null);
    assert.equal(result.averagedOverWeeks, 0);
  });

  it("averages over the single complete week of a new account", () => {
    const result = stats({
      // Previous week: Mon 2026-08-03 – Sun 2026-08-09.
      workoutDates: ["2026-08-03", "2026-08-05", "2026-08-07"],
      dayMarks: [rest("2026-08-04"), rest("2026-08-06")],
    });
    assert.equal(result.averagedOverWeeks, 1);
    assert.equal(result.avgWorkoutDaysPerWeek, 3);
    assert.equal(result.avgRestDaysPerWeek, 2);
  });

  it("divides by the weeks the account has existed, not the full window", () => {
    const result = stats({
      // Two complete weeks: Mon 2026-07-27 – Sun 2026-08-09.
      workoutDates: ["2026-07-27", "2026-07-29", "2026-08-03", "2026-08-05"],
    });
    assert.equal(result.averagedOverWeeks, 2);
    assert.equal(result.avgWorkoutDaysPerWeek, 2);
  });

  it("caps the window at AVERAGE_WINDOW_WEEKS complete weeks", () => {
    // One workout on every Monday going back two years — far beyond the cap.
    const mondays = Array.from({ length: 104 }, (_, index) =>
      shiftDayKey("2026-08-03", -7 * index),
    );
    const result = stats({ workoutDates: mondays });
    assert.equal(result.averagedOverWeeks, AVERAGE_WINDOW_WEEKS);
    assert.equal(result.avgWorkoutDaysPerWeek, 1);
  });

  it("rounds to a single decimal", () => {
    const result = stats({
      // 3 workout days across 2 complete weeks → 1.5.
      workoutDates: ["2026-07-27", "2026-07-28", "2026-08-04"],
    });
    assert.equal(result.averagedOverWeeks, 2);
    assert.equal(result.avgWorkoutDaysPerWeek, 1.5);
  });

  it("ignores days planned in the future", () => {
    const result = stats({
      workoutDates: ["2026-08-03", "2026-09-01", "2026-09-02"],
      dayMarks: [rest("2026-09-03")],
    });
    assert.equal(result.averagedOverWeeks, 1);
    assert.equal(result.avgWorkoutDaysPerWeek, 1);
    assert.equal(result.avgRestDaysPerWeek, 0);
  });

  // The UI keeps the two exclusive, but a stale marker must not let the two
  // averages sum past seven days a week.
  it("counts a day that is both trained and rested only as trained", () => {
    const result = stats({
      workoutDates: ["2026-08-03"],
      dayMarks: [rest("2026-08-03"), rest("2026-08-04")],
    });
    assert.equal(result.avgWorkoutDaysPerWeek, 1);
    assert.equal(result.avgRestDaysPerWeek, 1);
  });

  it("does not count injury days as rest", () => {
    const result = stats({
      dayMarks: [injured("2026-08-03"), injured("2026-08-04")],
    });
    assert.equal(result.avgRestDaysPerWeek, 0);
    assert.equal(result.avgWorkoutDaysPerWeek, 0);
    assert.equal(result.averagedOverWeeks, 1);
  });
});

describe("injured days this month", () => {
  it("is zero with no injuries", () => {
    assert.equal(stats().injuredDaysThisMonth, 0);
  });

  it("counts injury days in the current calendar month", () => {
    assert.equal(
      stats({
        dayMarks: [injured("2026-08-01"), injured("2026-08-11"), rest("2026-08-05")],
      }).injuredDaysThisMonth,
      2,
    );
  });

  it("excludes injuries from a previous month", () => {
    assert.equal(
      stats({
        dayMarks: [injured("2026-07-31"), injured("2026-08-02")],
      }).injuredDaysThisMonth,
      1,
    );
  });

  // Unlike the averages, this counts the whole month including days still to
  // come — an injury logged earlier today is already part of this month.
  it("counts an injury logged today", () => {
    assert.equal(
      stats({ dayMarks: [injured(WEDNESDAY)] }).injuredDaysThisMonth,
      1,
    );
  });
});
