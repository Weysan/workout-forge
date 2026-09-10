/**
 * The places an athlete tags a session with.
 *
 * A place is a free-text label — "CrossFit Berlin", "home garage", "Tempelhofer
 * Feld" — and the remembered list exists only so the second session at the same
 * box does not have to be typed out again.
 *
 * A label rather than coordinates, deliberately. What belongs on a card is a
 * name, and the name is what the athlete already knows; turning GPS into one
 * would mean a permission prompt and a reverse-geocoding call, in an app whose
 * whole write path is built to work with no connection at all.
 *
 * Nothing queries, groups or filters by a place, which is what lets this stay as
 * simple as it is: there is no canonical place, no id, and nothing to migrate
 * when the athlete renames one. Two spellings of the same box cost a duplicate
 * suggestion and nothing else.
 *
 * Pure, and imports nothing, so the test runner loads it directly.
 */

/** Matches the ceiling enforced in firestore.rules. */
export const MAX_LOCATION_LENGTH = 120;

/**
 * How many places are remembered on the profile.
 *
 * Enough for a box, a second box, a home setup, a track and a holiday — more
 * than most logs ever hold. A suggestion list that grows without bound stops
 * being a suggestion list, and this one rides along on a document that is read
 * on every session.
 */
export const MAX_REMEMBERED_LOCATIONS = 12;

/** How many chips the form offers at once. Beyond this, typing narrows faster. */
export const MAX_LOCATION_SUGGESTIONS = 6;

/** Case- and whitespace-insensitive identity, so "Home " is "home". */
function key(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * A typed place, trimmed and length-capped, or `null` when there is nothing
 * there.
 *
 * `null` rather than `""` so an untagged session and one tagged with whitespace
 * are the same thing in storage, and `location` reads as absent for both. The
 * second trim catches a cut that landed mid-space.
 */
export function normalizeLocation(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim().slice(0, MAX_LOCATION_LENGTH).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The stored list, sanitised — anything that is not a usable place is dropped.
 *
 * Written for a field nothing validates element-by-element: firestore.rules can
 * pin the list's type and length but cannot walk its contents (rules have no way
 * to test every element), so the guarantee that these are non-empty, unique,
 * capped strings is made here, on the way in.
 */
export function readLocations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const places: string[] = [];

  for (const entry of value) {
    const name = normalizeLocation(typeof entry === "string" ? entry : null);
    if (name === null || seen.has(key(name))) continue;

    seen.add(key(name));
    places.push(name);

    if (places.length >= MAX_REMEMBERED_LOCATIONS) break;
  }

  return places;
}

/**
 * `list` with `name` at the front, most recently used first.
 *
 * Re-tagging "crossfit berlin" replaces the "CrossFit Berlin" already there
 * rather than sitting beside it, and the spelling that survives is the one just
 * typed — the athlete's latest intent about their own gym's name.
 *
 * Returns the list unchanged when there is nothing to move, so the caller can
 * skip the write: the common case is the same box for the tenth time, and that
 * should cost no bandwidth at all.
 */
export function rememberLocation(
  list: readonly string[],
  name: string | null | undefined,
): string[] {
  const place = normalizeLocation(name);
  if (place === null) return [...list];

  const existing = readLocations(list);
  if (existing.length > 0 && existing[0] === place) return existing;

  return [
    place,
    ...existing.filter((entry) => key(entry) !== key(place)),
  ].slice(0, MAX_REMEMBERED_LOCATIONS);
}

/**
 * Places worth offering for what has been typed so far.
 *
 * An exact match is dropped: once the field reads "CrossFit Berlin", a chip that
 * would set it to "CrossFit Berlin" is a button that does nothing. An empty
 * field offers the whole list, which is the case that saves the most typing.
 */
export function suggestLocations(
  list: readonly string[],
  query: string,
  limit: number = MAX_LOCATION_SUGGESTIONS,
): string[] {
  const needle = key(query);
  const places = readLocations(list);

  return places
    .filter((place) => {
      const candidate = key(place);
      if (candidate === needle) return false;
      return needle === "" || candidate.includes(needle);
    })
    .slice(0, limit);
}
