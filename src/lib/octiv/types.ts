/**
 * The shapes Octiv's API actually returns.
 *
 * Written from observed responses, not from a published schema, so every field
 * is treated as optional and nullable: the sample day alone has `name`,
 * `nickname`, `description`, `warmUp`, `coolDown` and `prefix` all null. Nothing
 * here is trusted beyond its type — `mapping.ts` does the narrowing.
 *
 * Named in camelCase, while the wire is snake_case: `client.ts` normalises every
 * response through `camelize.ts` before it is read as one of these. Fields Octiv
 * sends but nothing here uses (`wodId`, `rxMale`, `createdAt`, …) are left out.
 */

/** `POST /api/login` */
export interface OctivLoginResponse {
  tokenType?: string | null;
  /** Seconds until the access token expires — a year, in practice. */
  expiresIn?: number | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  mergeAccount?: boolean | null;
}

/** How an exercise is scored, e.g. `{ name: "For Weight - kg", unit: "kg" }`. */
export interface OctivMeasuringUnit {
  id?: number | null;
  name?: string | null;
  unit?: string | null;
  format?: string | null;
}

export interface OctivExercise {
  id?: number | null;
  name?: string | null;
  description?: string | null;
  measuringUnitId?: number | null;
  measuringUnit?: OctivMeasuringUnit | null;
}

/** One slot in the day's programming. `id` is the slot, not the exercise. */
export interface OctivWodExercise {
  id?: number | null;
  isActive?: number | null;
  /** Position within the WOD. Not guaranteed to arrive sorted. */
  order?: number | null;
  exerciseId?: number | null;
  exercise?: OctivExercise | null;
  /** Section marker such as "A" or "B", when the box uses them. */
  prefix?: string | null;
}

/** `GET /api/wods` — one day of programming. */
export interface OctivWod {
  id?: number | null;
  name?: string | null;
  nickname?: string | null;
  description?: string | null;
  /** `YYYY-MM-DD`. */
  date?: string | null;
  warmUp?: string | null;
  coolDown?: string | null;
  coachNotes?: string | null;
  memberNotes?: string | null;
  tenantId?: number | null;
  wodExercises?: OctivWodExercise[] | null;
}

export interface OctivWodsResponse {
  data?: OctivWod[] | null;
  meta?: Record<string, unknown> | null;
}
