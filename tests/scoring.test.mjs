/**
 * Scoring tests, centred on the time cap.
 *
 * Most "for time" workouts carry a cap, and an athlete who reaches it unfinished
 * scores the reps they completed instead of a time — two units under one score
 * type, which the single-`scoreValue` invariant would seem to forbid.
 *
 * It does not, because the ranking is unambiguous: a finisher beats a cap-out,
 * and among cap-outs more reps is better. `scoring.ts` encodes that as a time
 * nobody could record, so ascending order *is* leaderboard order. What is worth
 * pinning down is that the encoding never collides with a real time, in either
 * direction:
 *
 *   · no plausible finish time — not even a 24-hour event — reads as capped
 *   · no capped result, however many reps, reads as a time
 *   · a finisher always beats a cap-out, and more reps always beats fewer
 *   · everything already stored keeps meaning exactly what it meant
 *
 * These modules import `./units` at runtime, so they need the resolver in
 * `tests/helpers/ts-resolver.mjs`.
 *
 *   npm run test:scoring
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./helpers/ts-resolver.mjs", import.meta.url);

const {
  MAX_CAPPED_REPS,
  TIME_CAP_BASE,
  beatsRecord,
  decodeCappedReps,
  encodeCappedReps,
  formatScore,
  isLowerBetter,
  isTimeCapped,
} = await import("../src/lib/scoring.ts");

const { draftFromWorkout, emptyDraft, isScoreComplete, resolveScore } =
  await import("../src/lib/score-draft.ts");

describe("the time-cap encoding", () => {
  it("round-trips the reps completed", () => {
    for (const reps of [1, 12, 87, 150, 999, 9999]) {
      assert.equal(decodeCappedReps(encodeCappedReps(reps)), reps);
    }
  });

  it("never reads a real finish time as capped", () => {
    const times = [
      0, // instant, nonsense but storable
      1,
      275, // 4:35
      4321, // a long Murph
      86_400, // a 24-hour event
      604_800, // a week, which no workout is
    ];
    for (const seconds of times) {
      assert.equal(
        isTimeCapped(seconds),
        false,
        `${seconds}s should read as a finish time`,
      );
    }
  });

  it("never reads a capped result as a time", () => {
    for (const reps of [0, 1, 500, MAX_CAPPED_REPS]) {
      assert.equal(
        isTimeCapped(encodeCappedReps(reps)),
        true,
        `${reps} reps should read as capped`,
      );
    }
  });

  it("clamps absurd reps rather than collapsing into the time range", () => {
    // Without the clamp this would encode below the threshold and be read back
    // as a finish time — the one way this encoding could corrupt a score.
    const absurd = encodeCappedReps(MAX_CAPPED_REPS * 10);
    assert.equal(isTimeCapped(absurd), true);
    assert.equal(decodeCappedReps(absurd), MAX_CAPPED_REPS);
  });

  it("stays positive, so the record recompute does not skip it", () => {
    // firestore/records.ts keeps only attempts with scoreValue > 0.
    assert.ok(encodeCappedReps(MAX_CAPPED_REPS) > 0);
    assert.equal(encodeCappedReps(0), TIME_CAP_BASE);
  });
});

describe("ranking a capped workout", () => {
  it("still treats lower as better for time", () => {
    assert.equal(isLowerBetter("time_seconds"), true);
  });

  it("puts any finisher ahead of any cap-out", () => {
    const slowest = 86_400; // a whole day
    const mostReps = encodeCappedReps(MAX_CAPPED_REPS);

    // Even the slowest imaginable finish beats the best possible cap-out, which
    // is how the Open ranks it: finishing is the achievement.
    assert.equal(beatsRecord("time_seconds", slowest, mostReps), true);
    assert.equal(beatsRecord("time_seconds", mostReps, slowest), false);
  });

  it("ranks cap-outs by reps, descending", () => {
    const better = encodeCappedReps(150);
    const worse = encodeCappedReps(120);

    assert.equal(beatsRecord("time_seconds", better, worse), true);
    assert.equal(beatsRecord("time_seconds", worse, better), false);
  });

  it("does not call an equal result a PR", () => {
    const same = encodeCappedReps(120);
    assert.equal(beatsRecord("time_seconds", same, same), false);
  });

  it("takes a cap-out as the first record when there is none", () => {
    assert.equal(beatsRecord("time_seconds", encodeCappedReps(90), null), true);
  });
});

describe("formatScore", () => {
  it("spells out a capped result", () => {
    assert.equal(
      formatScore("time_seconds", encodeCappedReps(120), "metric"),
      "120 reps (capped)",
    );
  });

  it("still formats a finish time as a duration", () => {
    assert.equal(formatScore("time_seconds", 275, "metric"), "04:35");
    assert.equal(formatScore("time_seconds", 4334, "metric"), "1:12:14");
  });

  it("leaves every other score type alone", () => {
    assert.equal(formatScore("reps", 120, "metric"), "120 reps");
    assert.equal(formatScore("rounds_reps", 8012, "metric"), "8 rnds + 12 reps");
    assert.equal(formatScore("pass_fail", 0, "metric"), "Did not finish");
  });
});

describe("the score form", () => {
  const unit = "metric";

  function cappedDraft(reps) {
    return { ...emptyDraft(unit), timeCapped: true, cappedReps: String(reps) };
  }

  it("resolves a cap-out to the encoded value and its display", () => {
    const resolved = resolveScore(cappedDraft(120), "time_seconds", unit);

    assert.equal(resolved.scoreValue, encodeCappedReps(120));
    assert.equal(resolved.scoreDisplay, "120 reps (capped)");
  });

  it("needs reps before a cap-out counts as filled in", () => {
    assert.equal(isScoreComplete(cappedDraft(0), "time_seconds"), false);
    assert.equal(isScoreComplete(cappedDraft(120), "time_seconds"), true);
  });

  it("ignores the time fields once the cap is selected", () => {
    // Kept rather than cleared, so toggling by mistake does not discard them —
    // but they must not leak into the result.
    const draft = { ...cappedDraft(120), minutes: "12", seconds: "30" };
    const resolved = resolveScore(draft, "time_seconds", unit);

    assert.equal(resolved.scoreValue, encodeCappedReps(120));
  });

  it("ignores the reps once a finishing time is selected", () => {
    const draft = {
      ...emptyDraft(unit),
      timeCapped: false,
      cappedReps: "120",
      minutes: "12",
      seconds: "30",
    };
    const resolved = resolveScore(draft, "time_seconds", unit);

    assert.equal(resolved.scoreValue, 750);
    assert.equal(resolved.scoreDisplay, "12:30");
  });

  it("reopens a stored cap-out in the capped mode", () => {
    const workout = {
      scoreType: "time_seconds",
      scoreValue: encodeCappedReps(87),
      reps: null,
    };

    const draft = draftFromWorkout(workout, unit);
    assert.equal(draft.timeCapped, true);
    assert.equal(draft.cappedReps, "87");
    // Editing and saving unchanged must not move the score.
    assert.equal(
      resolveScore(draft, "time_seconds", unit).scoreValue,
      workout.scoreValue,
    );
  });

  it("reopens a stored finish time as a time, not as a cap-out", () => {
    // The backward-compatibility case: every score written before the cap
    // existed is a count of seconds and has to keep reading as one.
    const workout = { scoreType: "time_seconds", scoreValue: 750, reps: null };

    const draft = draftFromWorkout(workout, unit);
    assert.equal(draft.timeCapped, false);
    assert.equal(draft.minutes, "12");
    assert.equal(draft.seconds, "30");
    assert.equal(resolveScore(draft, "time_seconds", unit).scoreValue, 750);
  });

  it("leaves an unscored session unscored in either mode", () => {
    assert.equal(
      resolveScore(emptyDraft(unit), "time_seconds", unit).scoreValue,
      null,
    );
    assert.equal(
      resolveScore(cappedDraft(0), "time_seconds", unit).scoreValue,
      null,
    );
  });
});
