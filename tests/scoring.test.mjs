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

/**
 * An open run is two numbers — how far, and how long — and neither is the
 * result on its own. `distance_metres` ranks the metres and carries the seconds
 * alongside in `durationSeconds`, rather than packing them together the way the
 * time cap and `rounds_reps` pack theirs. What is worth pinning down is that
 * the second number never leaks into the first, in either direction.
 */
describe("distance scoring", () => {
  const metric = "metric";
  const imperial = "imperial";

  function distanceDraft(overrides = {}) {
    return { ...emptyDraft(metric), ...overrides };
  }

  it("ranks on the distance, not the time", () => {
    // Further is better, so the ordinary "higher wins" comparison applies —
    // the same one `reps` and `weight` use.
    assert.equal(isLowerBetter("distance_metres"), false);
    assert.equal(beatsRecord("distance_metres", 10000, 5000), true);
    assert.equal(beatsRecord("distance_metres", 5000, 10000), false);
  });

  it("stores metres, whichever unit was typed in", () => {
    const km = resolveScore(
      distanceDraft({ distance: "5", distanceUnit: metric }),
      "distance_metres",
      metric,
    );
    assert.equal(km.scoreValue, 5000);

    const miles = resolveScore(
      distanceDraft({ distance: "5", distanceUnit: imperial }),
      "distance_metres",
      metric,
    );
    assert.equal(miles.scoreValue, 8047);
  });

  it("keeps the time beside the score rather than inside it", () => {
    const resolved = resolveScore(
      distanceDraft({
        distance: "8",
        distanceMinutes: "42",
        distanceSeconds: "10",
      }),
      "distance_metres",
      metric,
    );

    assert.equal(resolved.scoreValue, 8000);
    assert.equal(resolved.durationSeconds, 2530);
    assert.equal(resolved.scoreDisplay, "8.00 km · 42:10 (05:16 /km)");
  });

  it("counts a distance with no time as a complete result", () => {
    // A route walked to recce it is still a distance worth keeping, so the
    // time is optional — unlike the distance, which is the score.
    const draft = distanceDraft({ distance: "12" });
    assert.equal(isScoreComplete(draft, "distance_metres"), true);

    const resolved = resolveScore(draft, "distance_metres", metric);
    assert.equal(resolved.durationSeconds, null);
    assert.equal(resolved.scoreDisplay, "12.00 km");
  });

  it("leaves a session with no distance unscored", () => {
    // A time on its own is a `time_seconds` workout, not a distance one.
    const draft = distanceDraft({ distanceMinutes: "42" });
    assert.equal(isScoreComplete(draft, "distance_metres"), false);
    assert.equal(
      resolveScore(draft, "distance_metres", metric).scoreValue,
      null,
    );
  });

  it("drops a pace that would be noise", () => {
    // 25 minutes for a kilometre is walking or standing still, and a "pace"
    // there says nothing. The distance and the time both survive.
    assert.equal(
      formatScore("distance_metres", 1000, metric, { durationSeconds: 1500 }),
      "1.00 km · 25:00",
    );
  });

  it("reads short distances in metres, and imperial in miles", () => {
    assert.equal(formatScore("distance_metres", 400, metric), "400 m");
    assert.equal(formatScore("distance_metres", 5000, imperial), "3.11 mi");
    assert.equal(
      formatScore("distance_metres", 5000, imperial, { durationSeconds: 1500 }),
      "3.11 mi · 25:00 (08:03 /mi)",
    );
  });

  it("round-trips a stored session through the form unchanged", () => {
    const workout = {
      scoreType: "distance_metres",
      scoreValue: 8047,
      durationSeconds: 2530,
      reps: null,
    };

    const draft = draftFromWorkout(workout, metric);
    assert.equal(draft.distance, "8.05");
    assert.equal(draft.distanceMinutes, "42");
    assert.equal(draft.distanceSeconds, "10");

    // Reopening and saving unchanged must not move the score. 8.05 km is what
    // the form showed, so that is what it saves.
    const resolved = resolveScore(draft, "distance_metres", metric);
    assert.equal(resolved.scoreValue, 8050);
    assert.equal(resolved.durationSeconds, 2530);
  });

  it("does not carry a for-time score into a run's duration", () => {
    // The two share no fields, so switching type and back cannot smuggle a
    // time typed for a for-time workout in as a run's duration.
    const draft = distanceDraft({
      minutes: "18",
      seconds: "30",
      distance: "5",
    });

    assert.equal(
      resolveScore(draft, "distance_metres", metric).durationSeconds,
      null,
    );
  });
});
