/**
 * Day order tests.
 *
 * `src/lib/day-order.ts` decides the sequence a day's sessions are read in. The
 * things worth pinning down:
 *
 *   · a day nobody has arranged still reads newest first, exactly as before
 *   · a stored arrangement wins, and a session logged after it lands at the end
 *   · nudging the first row up, or the last row down, is a no-op rather than a
 *     crash — the buttons that do it are always on screen
 *   · closing the panel without moving anything writes nothing
 *
 * The module imports nothing, so Node's built-in type stripping runs it directly
 * and the tests exercise the real implementation rather than a copy.
 *
 *   npm run test:day-order
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { assignOrder, hasManualOrder, moveItem, orderChanged, sortDayOrder } =
  await import("../src/lib/day-order.ts");

/** A workout, reduced to what this module looks at. */
const session = (id, order) => (order === undefined ? { id } : { id, order });

const ids = (items) => items.map((item) => item.id);

describe("sortDayOrder", () => {
  it("leaves a day nobody has arranged in the order it arrived", () => {
    // Which is newest first — what the Firestore query returns.
    const day = [session("c"), session("b"), session("a")];
    assert.deepEqual(ids(sortDayOrder(day)), ["c", "b", "a"]);
  });

  it("follows the stored arrangement", () => {
    const day = [session("c", 2), session("b", 0), session("a", 1)];
    assert.deepEqual(ids(sortDayOrder(day)), ["b", "a", "c"]);
  });

  it("puts a session logged since the day was arranged at the end", () => {
    // A fourth piece typed up after the day was ordered belongs after the three
    // that were placed, not on top of them.
    const day = [session("new"), session("wod", 2), session("lift", 1), session("warmup", 0)];
    assert.deepEqual(ids(sortDayOrder(day)), ["warmup", "lift", "wod", "new"]);
  });

  it("keeps several unplaced sessions in their incoming order", () => {
    const day = [session("newer"), session("older"), session("placed", 0)];
    assert.deepEqual(ids(sortDayOrder(day)), ["placed", "newer", "older"]);
  });

  it("is stable when two sessions claim the same position", () => {
    // Only reachable through a write that half-landed, but a poster or a card
    // swapping places between renders is the worst possible symptom of it.
    const day = [session("a", 1), session("b", 1), session("c", 0)];
    assert.deepEqual(ids(sortDayOrder(day)), ["c", "a", "b"]);
  });

  it("treats a null order as unplaced, which is how Firestore hands it back", () => {
    const day = [session("a", null), session("b", 0)];
    assert.deepEqual(ids(sortDayOrder(day)), ["b", "a"]);
  });

  it("does not mutate its input", () => {
    const day = [session("a", 1), session("b", 0)];
    sortDayOrder(day);
    assert.deepEqual(ids(day), ["a", "b"]);
  });

  it("handles an empty day", () => {
    assert.deepEqual(sortDayOrder([]), []);
  });
});

describe("hasManualOrder", () => {
  it("is false for a day that has never been arranged", () => {
    assert.equal(hasManualOrder([session("a"), session("b", null)]), false);
  });

  it("is true as soon as one session carries a position", () => {
    assert.equal(hasManualOrder([session("a"), session("b", 0)]), true);
  });

  it("counts position zero, which is falsy", () => {
    assert.equal(hasManualOrder([session("a", 0)]), true);
  });
});

describe("moveItem", () => {
  it("moves an item down", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  });

  it("moves an item up", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  });

  it("swaps neighbours, which is what the arrow buttons do", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 1, 0), ["b", "a", "c"]);
  });

  it("returns the list unchanged for a move off either end", () => {
    assert.deepEqual(moveItem(["a", "b"], 0, -1), ["a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 1, 2), ["a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 0, 0), ["a", "b"]);
  });

  it("copies rather than mutating", () => {
    const list = ["a", "b"];
    assert.notEqual(moveItem(list, 0, 1), list);
    assert.deepEqual(list, ["a", "b"]);
  });
});

describe("assignOrder", () => {
  it("numbers from zero, with no gaps", () => {
    assert.deepEqual(assignOrder(["b", "a"]), [
      { id: "b", order: 0 },
      { id: "a", order: 1 },
    ]);
  });

  it("has nothing to write for an empty day", () => {
    assert.deepEqual(assignOrder([]), []);
  });
});

describe("orderChanged", () => {
  it("is true for a day that has never been arranged, even in the same sequence", () => {
    // The positions still have to be written down, or the next session logged
    // would have nothing to sort itself after.
    const day = [session("a"), session("b")];
    assert.equal(orderChanged(day, ["a", "b"]), true);
  });

  it("is false when an arranged day is left alone", () => {
    const day = [session("a", 0), session("b", 1)];
    assert.equal(orderChanged(day, ["a", "b"]), false);
  });

  it("is true when two sessions swap", () => {
    const day = [session("a", 0), session("b", 1)];
    assert.equal(orderChanged(day, ["b", "a"]), true);
  });

  it("is true when the positions have gaps to close", () => {
    // A day that lost a session leaves 0, 2 behind; renumbering it is a change.
    const day = [session("a", 0), session("b", 2)];
    assert.equal(orderChanged(day, ["a", "b"]), true);
  });

  it("is true when a session appeared or disappeared", () => {
    const day = [session("a", 0), session("b", 1)];
    assert.equal(orderChanged(day, ["a", "b", "c"]), true);
    assert.equal(orderChanged(day, ["a"]), true);
  });
});
