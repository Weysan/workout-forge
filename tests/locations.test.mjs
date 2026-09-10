/**
 * Place tests.
 *
 * `src/lib/locations.ts` is the whole of the place feature that has any logic in
 * it. The things worth pinning down:
 *
 *   · an untagged session and one tagged with spaces are the same thing — `null`
 *   · re-tagging the same box with different capitalisation moves it, rather than
 *     adding a second entry beside it, and the newest spelling wins
 *   · the same box twice in a row is detected as "nothing to write", because the
 *     caller skips the network round trip on that
 *   · the remembered list stays capped, and survives whatever is actually in the
 *     document — it is validated by rules that cannot walk a list's elements
 *   · a suggestion that would change nothing is not offered
 *
 * The module imports nothing, so Node's built-in type stripping runs it directly
 * and these exercise the real implementation rather than a copy.
 *
 *   npm run test:locations
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  MAX_LOCATION_LENGTH,
  MAX_REMEMBERED_LOCATIONS,
  normalizeLocation,
  readLocations,
  rememberLocation,
  suggestLocations,
} = await import("../src/lib/locations.ts");

describe("normalizeLocation", () => {
  it("trims a typed place", () => {
    assert.equal(normalizeLocation("  CrossFit Berlin "), "CrossFit Berlin");
  });

  // The field is optional, so "empty" has to be one value rather than two: a
  // session nobody tagged and one tagged with a stray space must be identical in
  // storage, or the card has to decide which of them counts as untagged.
  it("reads an empty or whitespace-only place as null", () => {
    assert.equal(normalizeLocation(""), null);
    assert.equal(normalizeLocation("   "), null);
    assert.equal(normalizeLocation(null), null);
    assert.equal(normalizeLocation(undefined), null);
  });

  it("ignores anything that is not a string", () => {
    assert.equal(normalizeLocation(42), null);
    assert.equal(normalizeLocation({}), null);
  });

  it("caps the length, and does not leave a space at the cut", () => {
    const long = `${"a".repeat(MAX_LOCATION_LENGTH - 1)} bcdef`;
    const capped = normalizeLocation(long);

    assert.equal(capped.length, MAX_LOCATION_LENGTH - 1);
    assert.equal(capped, "a".repeat(MAX_LOCATION_LENGTH - 1));
  });
});

describe("readLocations", () => {
  it("returns an empty list for a document that has no places", () => {
    assert.deepEqual(readLocations(undefined), []);
    assert.deepEqual(readLocations(null), []);
    assert.deepEqual(readLocations("CrossFit Berlin"), []);
  });

  // firestore.rules pins the field to a list of a bounded size but cannot check
  // what is in it, so this is the only thing standing between a hand-edited
  // document and the suggestion chips.
  it("drops entries that are not usable places", () => {
    assert.deepEqual(
      readLocations(["CrossFit Berlin", "", "   ", null, 7, { a: 1 }, "Home"]),
      ["CrossFit Berlin", "Home"],
    );
  });

  it("keeps the first spelling of a duplicate, and drops the rest", () => {
    assert.deepEqual(readLocations(["CrossFit Berlin", "crossfit berlin"]), [
      "CrossFit Berlin",
    ]);
  });

  it("caps a list that arrived too long", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Box ${i}`);
    assert.equal(readLocations(many).length, MAX_REMEMBERED_LOCATIONS);
  });
});

describe("rememberLocation", () => {
  it("puts a new place at the front", () => {
    assert.deepEqual(rememberLocation(["Home"], "CrossFit Berlin"), [
      "CrossFit Berlin",
      "Home",
    ]);
  });

  // The signal the caller uses to skip the write entirely: the common case is
  // the same box for the tenth time, and that should cost no bandwidth.
  it("returns the list unchanged when the place is already at the front", () => {
    const list = ["CrossFit Berlin", "Home"];
    assert.deepEqual(rememberLocation(list, "CrossFit Berlin"), list);
  });

  it("moves an existing place to the front instead of duplicating it", () => {
    assert.deepEqual(
      rememberLocation(["Home", "CrossFit Berlin", "Track"], "CrossFit Berlin"),
      ["CrossFit Berlin", "Home", "Track"],
    );
  });

  // Whichever way the athlete typed their own gym's name this time is the way
  // they want to see it — the older spelling is not more correct for being older.
  it("replaces a differently-cased spelling with the one just typed", () => {
    assert.deepEqual(rememberLocation(["CrossFit Berlin"], "crossfit berlin"), [
      "crossfit berlin",
    ]);
  });

  it("leaves the list alone when there is no place to remember", () => {
    assert.deepEqual(rememberLocation(["Home"], null), ["Home"]);
    assert.deepEqual(rememberLocation(["Home"], "  "), ["Home"]);
  });

  it("drops the oldest place once the list is full", () => {
    const full = Array.from(
      { length: MAX_REMEMBERED_LOCATIONS },
      (_, i) => `Box ${i}`,
    );
    const next = rememberLocation(full, "New Box");

    assert.equal(next.length, MAX_REMEMBERED_LOCATIONS);
    assert.equal(next[0], "New Box");
    assert.ok(!next.includes(`Box ${MAX_REMEMBERED_LOCATIONS - 1}`));
  });
});

describe("suggestLocations", () => {
  const list = ["CrossFit Berlin", "Home garage", "Tempelhofer Feld"];

  it("offers everything for an empty field", () => {
    assert.deepEqual(suggestLocations(list, ""), list);
  });

  it("narrows on what has been typed, anywhere in the name", () => {
    assert.deepEqual(suggestLocations(list, "ber"), ["CrossFit Berlin"]);
    assert.deepEqual(suggestLocations(list, "GARAGE"), ["Home garage"]);
  });

  // A chip that would set the field to what it already says is a button that
  // does nothing, so it is not shown.
  it("does not offer what the field already says", () => {
    assert.deepEqual(suggestLocations(list, "home garage"), []);
    assert.deepEqual(suggestLocations(list, " Home Garage "), []);
  });

  it("offers nothing when nothing matches", () => {
    assert.deepEqual(suggestLocations(list, "reykjavik"), []);
  });

  it("respects the limit", () => {
    assert.equal(suggestLocations(list, "", 2).length, 2);
  });
});
