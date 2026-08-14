/**
 * The order a day's sessions appear in.
 *
 * A day is logged as it happens — warm-up, then the strength piece, then the
 * WOD — but the log reads newest first, which is that sequence backwards. Rather
 * than guess at chronology from `createdAt` (a backdated import or a session
 * typed up in the evening would both be wrong), the athlete places the day in
 * the order it was actually trained, and that arrangement is stored as an
 * `order` field on each workout.
 *
 * The rules that follow from this:
 *
 *   · a day is either arranged or it is not — saving an order numbers *every*
 *     session on the day from 0, so there are no gaps to reason about later
 *   · a session with no `order` is one logged since the day was arranged. It
 *     goes to the end, which is where a session done later belongs
 *   · a day nobody has touched sorts exactly as it always did, newest first
 *
 * This module imports nothing, so `node --test` runs it directly through type
 * stripping — the same arrangement as lib/share-card.ts and lib/barbell.ts.
 */

/** The part of a workout this module needs to see. */
export interface Orderable {
  id: string;
  /** Position within its day, from 0. Absent on anything never arranged. */
  order?: number | null;
}

/** True when at least one session on the day carries a stored position. */
export function hasManualOrder(items: readonly Orderable[]): boolean {
  return items.some((item) => typeof item.order === "number");
}

/**
 * Sorts a day's sessions for display.
 *
 * `items` is expected in the order the query returned them — newest first — and
 * that order is preserved among sessions with no stored position, so a day that
 * has never been arranged comes back unchanged. Stable throughout: equal
 * positions keep their incoming order rather than swapping between renders.
 */
export function sortDayOrder<T extends Orderable>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = typeof a.item.order === "number" ? a.item.order : null;
      const right = typeof b.item.order === "number" ? b.item.order : null;

      if (left !== null && right !== null) {
        return left - right || a.index - b.index;
      }
      if (left === null && right === null) return a.index - b.index;
      // Anything unplaced sits below everything placed.
      return left === null ? 1 : -1;
    })
    .map(({ item }) => item);
}

/**
 * Moves the item at `from` to `to`, returning a new array.
 *
 * Out-of-range indices return the list untouched rather than throwing: the
 * callers are an "up" and a "down" button on the first and last rows, and
 * clamping here is what lets them stay simple.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The positions to write for a day, in the order the athlete arranged it.
 *
 * Numbered from 0 with no gaps, which keeps a later "move up" a matter of
 * swapping two integers, and keeps `order` readable in the Firestore console.
 */
export function assignOrder(ids: readonly string[]): Array<{
  id: string;
  order: number;
}> {
  return ids.map((id, index) => ({ id, order: index }));
}

/**
 * Whether an arrangement is worth a write.
 *
 * Opening the reorder panel and closing it again should cost nothing, and
 * neither should dragging a row back where it came from. A day that has never
 * been arranged *is* a change even when the sequence matches, because the
 * positions still have to be written down for the next session to land after
 * them.
 */
export function orderChanged(
  items: readonly Orderable[],
  ids: readonly string[],
): boolean {
  if (!hasManualOrder(items)) return true;
  if (items.length !== ids.length) return true;

  return items.some((item, index) => item.id !== ids[index] || item.order !== index);
}
