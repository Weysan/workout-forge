/**
 * Octiv speaks snake_case. Everything downstream of it here speaks camelCase.
 *
 * Both endpoints send snake_case, for unrelated reasons: `/api/login` because a
 * token response is `access_token` and `expires_in` by RFC 6749, and `/api/wods`
 * because it is Laravel handing back its column names — `warm_up`,
 * `wod_exercises`, `is_active`, `measuring_unit`. Rather than spell that
 * convention across `types.ts` and thread it through `mapping.ts`, every
 * response is normalised once on the way in.
 *
 * Keys only. Values are passed through untouched, so the line breaks Octiv
 * writes its programming with survive — those breaks are the formatting.
 *
 * This module imports nothing, so Node's type stripping runs it directly and
 * `tests/octiv.test.mjs` exercises the real implementation rather than a copy.
 */

/** `wod_exercises` → `wodExercises`. A key already in camelCase is unchanged. */
function toCamelCase(key: string): string {
  return key.replace(/_+([a-z0-9])/gi, (_match, char: string) =>
    char.toUpperCase(),
  );
}

function transform(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(transform);

  // `typeof null` is "object", hence the null check. Anything else non-object is
  // a string, number, boolean or null — a leaf, returned as it came.
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[toCamelCase(key)] = transform(item);
    }
    return result;
  }

  return value;
}

/**
 * A parsed JSON response with every key camelCased, at any depth.
 *
 * The cast is the same act of faith as the `as T` it replaces in `client.ts`:
 * this is a third party's JSON, and `types.ts` treats every field as optional
 * and nullable precisely because nothing here can be verified at compile time.
 */
export function camelizeKeys<T>(value: unknown): T {
  return transform(value) as T;
}
