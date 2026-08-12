/**
 * Share card tests.
 *
 * `src/lib/share-card.ts` decides what goes on the image an athlete posts to
 * Instagram. The drawing itself needs a browser canvas and is judged by eye, but
 * the decisions in front of it do not and should not be:
 *
 *   · a WOD is clamped by *line*, so a truncated description still reads as a
 *     workout rather than stopping mid-movement
 *   · the ellipsis appears only when something was actually dropped
 *   · filenames survive accents and punctuation in a user-typed workout title
 *   · both builders produce a complete card, because a missing field renders as
 *     a blank region on a poster somebody is about to publish
 *
 * The module imports nothing, so Node's built-in type stripping runs it directly
 * and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:share
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  DESCRIPTION_MAX_LINES,
  SHARE_FORMATS,
  buildPrCard,
  buildWorkoutCard,
  clampLines,
  shareCaption,
  shareFilename,
} = await import("../src/lib/share-card.ts");

describe("SHARE_FORMATS", () => {
  it("uses Instagram's story and feed dimensions", () => {
    assert.equal(SHARE_FORMATS.story.width, 1080);
    assert.equal(SHARE_FORMATS.story.height, 1920);
    assert.equal(SHARE_FORMATS.post.width, 1080);
    assert.equal(SHARE_FORMATS.post.height, 1350);
  });

  it("declares an aspect ratio matching its pixel dimensions", () => {
    for (const [name, format] of Object.entries(SHARE_FORMATS)) {
      const [w, h] = format.aspectRatio.split("/").map((n) => Number(n.trim()));
      assert.ok(
        Math.abs(w / h - format.width / format.height) < 0.001,
        `${name} aspectRatio "${format.aspectRatio}" does not match ${format.width}x${format.height}`,
      );
    }
  });
});

describe("clampLines", () => {
  it("returns text unchanged when it is under the cap", () => {
    assert.equal(clampLines("21-15-9\nThrusters\nPull-ups", 6), "21-15-9\nThrusters\nPull-ups");
  });

  it("keeps exactly the cap without adding an ellipsis", () => {
    const text = ["a", "b", "c"].join("\n");
    assert.equal(clampLines(text, 3), "a\nb\nc");
  });

  it("adds an ellipsis only when lines were dropped", () => {
    const text = ["a", "b", "c", "d"].join("\n");
    assert.equal(clampLines(text, 3), "a\nb\nc\n…");
  });

  it("collapses blank lines rather than spending the budget on them", () => {
    // Double-spaced WOD text would otherwise lose half its allowance to gaps.
    const text = "21-15-9\n\n\nThrusters 43kg\n\nPull-ups";
    assert.equal(clampLines(text, 6), "21-15-9\nThrusters 43kg\nPull-ups");
  });

  it("trims trailing whitespace on each line", () => {
    assert.equal(clampLines("  Row 500m  \n\tBurpees\t", 4), "Row 500m\nBurpees");
  });

  it("returns an empty string for text that is only whitespace", () => {
    assert.equal(clampLines("   \n\n  \t ", 4), "");
    assert.equal(clampLines("", 4), "");
  });
});

describe("buildWorkoutCard", () => {
  const base = {
    title: "Fran",
    typeLabel: "For Time",
    rxOrScaled: "RX",
    isPR: false,
    description: "21-15-9\nThrusters 43kg\nPull-ups",
    value: "4:15",
    valueLabel: "Time",
    dateLabel: "12 Aug 2026",
    dateKey: "2026-08-12",
  };

  it("produces a complete card", () => {
    const card = buildWorkoutCard(base);
    assert.equal(card.eyebrow, "Workout");
    assert.equal(card.title, "Fran");
    assert.equal(card.value, "4:15");
    assert.equal(card.valueLabel, "Time");
    assert.equal(card.dateLabel, "12 Aug 2026");
    assert.deepEqual(card.badges, ["For Time", "RX"]);
  });

  it("adds a PR badge and the highlight treatment for a record", () => {
    const card = buildWorkoutCard({ ...base, isPR: true });
    assert.deepEqual(card.badges, ["For Time", "RX", "PR"]);
    assert.equal(card.highlight, true);
  });

  it("leaves a non-record unhighlighted", () => {
    assert.equal(buildWorkoutCard(base).highlight, false);
  });

  it("drops an empty description rather than reserving space for it", () => {
    // An undefined description lets the renderer skip the block entirely; an
    // empty string would leave a gap where the WOD should be.
    assert.equal(buildWorkoutCard({ ...base, description: "" }).description, undefined);
    assert.equal(buildWorkoutCard({ ...base, description: "\n \n" }).description, undefined);
  });

  it("clamps a long description to the documented cap", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Line ${i}`).join("\n");
    const card = buildWorkoutCard({ ...base, description: long });
    const lines = card.description.split("\n");
    assert.equal(lines.length, DESCRIPTION_MAX_LINES + 1);
    assert.equal(lines.at(-1), "…");
  });
});

describe("buildPrCard", () => {
  const base = {
    name: "Back Squat",
    category: "Lift",
    type: "Strength",
    value: "140 kg",
    valueLabel: "Load",
    dateLabel: "12 Aug 2026",
    dateKey: "2026-08-12",
  };

  it("produces a complete, highlighted card", () => {
    const card = buildPrCard(base);
    assert.equal(card.eyebrow, "Personal record");
    assert.equal(card.title, "Back Squat");
    assert.equal(card.value, "140 kg");
    assert.equal(card.highlight, true);
    assert.deepEqual(card.badges, ["Lift", "Strength"]);
  });

  it("carries no description — the movement name is the whole story", () => {
    assert.equal(buildPrCard(base).description, undefined);
  });

  it("collapses a category and type that say the same thing", () => {
    // Two identical pills side by side read as a rendering fault.
    assert.deepEqual(buildPrCard({ ...base, type: "lift" }).badges, ["Lift"]);
  });

  it("survives a record with no date on it", () => {
    const card = buildPrCard({ ...base, dateLabel: undefined, dateKey: undefined });
    assert.equal(card.dateLabel, undefined);
    assert.equal(shareFilename(card), "forge-back-squat.png");
  });
});

describe("shareFilename", () => {
  const card = (title, dateKey) =>
    buildPrCard({
      name: title,
      category: "Lift",
      type: "Strength",
      value: "100 kg",
      valueLabel: "Load",
      dateKey,
    });

  it("slugs the title and appends the date", () => {
    assert.equal(
      shareFilename(card("Bench Press", "2026-08-12")),
      "forge-bench-press-2026-08-12.png",
    );
  });

  it("folds accents to ASCII instead of dropping the letter", () => {
    assert.equal(shareFilename(card("Épaulé Jeté", "2026-08-12")), "forge-epaule-jete-2026-08-12.png");
  });

  it("collapses punctuation and leaves no stray separators", () => {
    const name = shareFilename(card("  Clean & Jerk!! (heavy)  ", "2026-08-12"));
    assert.equal(name, "forge-clean-jerk-heavy-2026-08-12.png");
    assert.ok(!name.includes("--"), `"${name}" should not contain a double dash`);
  });

  it("falls back to a generic name when the title slugs to nothing", () => {
    assert.equal(shareFilename(card("♥♥♥", "2026-08-12")), "forge-result-2026-08-12.png");
  });

  it("caps the slug without leaving a trailing dash", () => {
    const name = shareFilename(card("a".repeat(40) + " " + "b".repeat(40), "2026-08-12"));
    assert.ok(!name.includes("-.png"), `"${name}" should not end its slug on a dash`);
    assert.ok(name.length < 90, `"${name}" is too long for a filename`);
  });
});

describe("shareCaption", () => {
  const url = "https://workout-forge-7f364.web.app";

  it("leads with the record for a PR card", () => {
    const caption = shareCaption(
      buildPrCard({
        name: "Back Squat",
        category: "Lift",
        type: "Strength",
        value: "140 kg",
        valueLabel: "Load",
      }),
      url,
    );
    assert.match(caption, /^New PR — Back Squat: 140 kg/);
  });

  it("leads with the workout for a session card", () => {
    const caption = shareCaption(
      buildWorkoutCard({
        title: "Fran",
        typeLabel: "For Time",
        rxOrScaled: "RX",
        isPR: false,
        description: "21-15-9",
        value: "4:15",
        valueLabel: "Time",
      }),
      url,
    );
    assert.match(caption, /^Fran — 4:15/);
  });

  it("always carries the app link, since that is the only link Instagram drops", () => {
    const caption = shareCaption(
      buildPrCard({
        name: "Deadlift",
        category: "Lift",
        type: "Strength",
        value: "200 kg",
        valueLabel: "Load",
      }),
      url,
    );
    assert.ok(caption.includes(url), "the caption must end with the app URL");
  });
});
