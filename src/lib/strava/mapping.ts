/**
 * Strava activities → FORGE workouts.
 *
 * The mirror image of `octiv/mapping.ts`, and the differences are the point.
 * Octiv hands over programming that has not been done, so its imports arrive
 * unscored and the athlete fills in the result. Strava hands over sessions that
 * are finished and measured, so these arrive **scored** — the run happened, and
 * its time is not a guess.
 *
 * The result is a plain `WorkoutInput`: once imported, nothing about a workout
 * remembers it came from Strava except `stravaActivityId`, which exists only so
 * the same activity is not offered twice.
 *
 * This module imports types only, so Node's type stripping runs it directly and
 * `tests/strava.test.mjs` exercises the real implementation.
 */

import type { ScoreType, WorkoutInput, WorkoutType } from "@/lib/types";
import type { StravaActivity } from "./types";

/** Mirrors the caps in firestore.rules, so an import can never be rejected. */
export const STRAVA_TITLE_MAX = 120;
export const STRAVA_DESCRIPTION_MAX = 5000;

/**
 * The activity kinds worth logging as training.
 *
 * Deliberately a list of what is allowed rather than of what is not: Strava keeps
 * adding sport types, and a new one arriving as "not imported" is a much better
 * failure than a new one arriving as a mystery card in someone's log.
 */
const IMPORTED_SPORT_TYPES = new Set([
  "Run",
  "TrailRun",
  "VirtualRun",
  "Ride",
  "VirtualRide",
  "GravelRide",
  "MountainBikeRide",
  "EBikeRide",
  "Rowing",
  "VirtualRow",
  "Swim",
  "Elliptical",
  "StairStepper",
  "Walk",
  "Hike",
  "Snowshoe",
  "NordicSki",
  "BackcountrySki",
  "AlpineSki",
  "Canoeing",
  "Kayaking",
  "StandUpPaddling",
  "Velomobile",
  "Handcycle",
  "Wheelchair",
  "InlineSkate",
  "IceSkate",
  "RollerSki",
  "Skateboard",
  "Surfing",
  "Kitesurf",
  "Windsurf",
]);

/**
 * The kinds that are excluded even though they are training.
 *
 * This is the one exclusion that is not simply "not on the list", and it exists
 * because of the *other* integration: an athlete who records CrossFit class in
 * Strava and also imports the box's programming from Octiv would get the same
 * session twice, once from each. Octiv describes that session far better — it
 * knows the pieces and how each is scored — so Strava yields.
 *
 * Kept as an explicit set rather than left off `IMPORTED_SPORT_TYPES` so the
 * reason survives; without it, someone would eventually "fix" the omission.
 */
const GYM_SPORT_TYPES = new Set([
  "WeightTraining",
  "Crossfit",
  "Workout",
  "HighIntensityIntervalTraining",
  "Yoga",
  "Pilates",
]);

/** Sport types that read as running, for `WorkoutType` and for record matching. */
const RUN_SPORT_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/** `sport_type`, falling back to the older `type` for pre-2022 activities. */
export function sportTypeOf(activity: StravaActivity): string {
  return text(activity.sport_type) || text(activity.type);
}

/**
 * The `YYYY-MM-DD` the athlete trained on.
 *
 * Read off `start_date_local`, which Strava has already shifted into the
 * athlete's timezone, by taking the date part of the string and nothing else.
 * Deliberately *not* parsed into a `Date`: `start_date_local` ends in a `Z` it
 * does not mean, so `new Date(...)` would treat local time as UTC and move an
 * evening session to the next day for anyone east of Greenwich.
 */
export function dayKeyOf(activity: StravaActivity): string {
  const local = text(activity.start_date_local);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(local);
  return match ? match[1] : "";
}

/**
 * Whether this activity should become a workout at all.
 *
 * `manual` activities are excluded: they were typed into Strava by hand, carry no
 * measured result, and are exactly the kind of thing already logged in FORGE by
 * the person who typed them.
 */
export function isImportable(activity: StravaActivity): boolean {
  if (activity.id == null) return false;
  if (activity.manual === true) return false;

  const sport = sportTypeOf(activity);
  if (sport.length === 0) return false;
  if (GYM_SPORT_TYPES.has(sport)) return false;
  if (!IMPORTED_SPORT_TYPES.has(sport)) return false;

  // A session with no duration has nothing to score, and would import as a card
  // reading "00:00" — worse than not importing it.
  const seconds = durationOf(activity);
  return seconds > 0;
}

/** Moving time, or elapsed time when Strava did not supply it. Seconds. */
export function durationOf(activity: StravaActivity): number {
  const moving = activity.moving_time;
  if (typeof moving === "number" && moving > 0) return Math.round(moving);

  const elapsed = activity.elapsed_time;
  if (typeof elapsed === "number" && elapsed > 0) return Math.round(elapsed);

  return 0;
}

/**
 * The badge on the card.
 *
 * Running gets its own type; everything else is `Custom`. Notably *not*
 * `ForTime`, which in this app means a workout done against the clock for a
 * result — a two-hour Sunday ride is not that, and labelling it so would put it
 * beside benchmark efforts it has nothing to do with.
 */
export function workoutTypeFor(sportType: string): WorkoutType {
  return RUN_SPORT_TYPES.has(sportType) ? "Run" : "Custom";
}

/**
 * What an activity with no distance is scored on: the clock.
 *
 * Also what a *race* is scored on, even though it has one — see `scoreTypeFor`.
 */
export const STRAVA_SCORE_TYPE: ScoreType = "time_seconds";

/**
 * How this activity should be measured.
 *
 * A run or a ride is really two numbers, and `distance_metres` carries both:
 * the metres rank, the duration rides along, and the card works the pace out
 * from them. So anything Strava measured a distance for is scored that way.
 *
 * **Except a race.** A benchmark-linked session is compared against the
 * benchmark's own score type by the record recompute — `syncRecordForBenchmark`
 * reads `benchmark.scoreType` and hands the raw `scoreValue` to `beatsRecord` —
 * and every running benchmark in the library is scored on time. Import a 5 km
 * race as metres and the record table would compare 5000 against a stack of
 * seconds, with "lower is better" applied to it: the slowest 5 km on record
 * would win. The distance is prescribed for those anyway, which is what makes
 * the time the interesting half.
 *
 * A treadmill run with no GPS falls through to time as well — the only honest
 * answer when there is no distance to record.
 */
export function scoreTypeFor(
  activity: StravaActivity,
  benchmarkId: string | null,
): ScoreType {
  if (benchmarkId !== null) return STRAVA_SCORE_TYPE;
  return distanceOf(activity) > 0 ? "distance_metres" : STRAVA_SCORE_TYPE;
}

/** Metres covered, rounded, or 0 when Strava measured none. */
export function distanceOf(activity: StravaActivity): number {
  const distance = activity.distance;
  if (typeof distance !== "number" || distance <= 0) return 0;
  return Math.round(distance);
}

/** `4521` → `"01:15:21"`, `275` → `"04:35"`. */
export function formatStravaDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${pad(minutes)}:${pad(rest)}`;
}

/** `5012.4` → `"5.01 km"`. Metres in, kilometres out, because that is how it is talked about. */
function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  return `${km.toFixed(2)} km`;
}

/**
 * The `scoreDisplay` for a distance import — `"8.02 km · 42:10 (5:15 /km)"`.
 *
 * Deliberately a copy of what `formatScore("distance_metres", …)` produces in
 * metric, rather than a call to it: this module imports types only, which is
 * what lets `tests/strava.test.mjs` run the real implementation under Node's
 * type stripping. `formatStravaDuration` above duplicates `formatDuration` for
 * exactly the same reason.
 *
 * Metric, like every other stored value. `scoreDisplay` is a convenience copy —
 * the views re-format from `scoreValue` at render time, so an athlete on
 * imperial still reads miles.
 */
function formatDistanceScore(metres: number, seconds: number): string {
  const distance = formatDistance(metres);
  if (seconds <= 0) return distance;

  const time = formatStravaDuration(seconds);
  const secondsPerKm = seconds / (metres / 1000);
  // The same threshold `describe` uses below, and `formatPace` in lib/scoring.
  if (secondsPerKm <= 0 || secondsPerKm >= 20 * 60) {
    return `${distance} · ${time}`;
  }

  return `${distance} · ${time} (${formatStravaDuration(Math.round(secondsPerKm))} /km)`;
}

/**
 * What Strava measured, as lines under the title.
 *
 * Only fields that are actually present are written, so a treadmill run with no
 * GPS does not get a line reading "0.00 km". The average pace is computed rather
 * than taken from `average_speed`, because a pace per kilometre is what a runner
 * reads and metres per second is not.
 */
function describe(
  activity: StravaActivity,
  seconds: number,
  /**
   * False when the distance became the score. The description holds what the
   * score does not say, so repeating "8.02 km" under a card already headed
   * "8.02 km · 42:10 (5:15 /km)" is noise.
   */
  includeDistance: boolean,
): string {
  const lines: string[] = [];

  const distance = activity.distance;
  const hasDistance =
    includeDistance && typeof distance === "number" && distance > 0;

  if (hasDistance) {
    lines.push(`Distance: ${formatDistance(distance)}`);

    const secondsPerKm = seconds / (distance / 1000);
    // Above about 20 min/km the athlete was walking or stopped, and a "pace"
    // there is noise rather than information.
    if (secondsPerKm > 0 && secondsPerKm < 20 * 60) {
      lines.push(`Pace: ${formatStravaDuration(secondsPerKm)} /km`);
    }
  }

  const elevation = activity.total_elevation_gain;
  if (typeof elevation === "number" && elevation > 0) {
    lines.push(`Elevation: ${Math.round(elevation)} m`);
  }

  const heartrate = activity.average_heartrate;
  if (typeof heartrate === "number" && heartrate > 0) {
    lines.push(`Avg HR: ${Math.round(heartrate)} bpm`);
  }

  if (activity.trainer === true) {
    lines.push("Indoor");
  }

  return lines.join("\n");
}

function titleFor(activity: StravaActivity, sportType: string): string {
  // Strava always has a name, but it can be the default "Afternoon Run", which is
  // still better than a sport type on its own.
  return clamp(text(activity.name) || sportType || "Strava activity", STRAVA_TITLE_MAX);
}

/**
 * Every importable activity for one day, oldest first.
 *
 * `dateKey` filters as well as files: the request window has to be widened past
 * the day in question — see `client.ts` — so activities either side of it come
 * back too and are dropped here.
 *
 * Unlike the Octiv mapping, the day is taken from the activity rather than from
 * the view: a session's date is a matter of record here, not of where the athlete
 * happened to be looking.
 */
export function activitiesToWorkoutInputs(
  activities: readonly StravaActivity[] | null | undefined,
  dateKey: string,
): WorkoutInput[] {
  if (!activities || activities.length === 0) return [];

  return activities
    .filter((activity) => isImportable(activity) && dayKeyOf(activity) === dateKey)
    // Strava returns newest first; a day reads better in the order it happened.
    .slice()
    .sort((a, b) =>
      text(a.start_date_local).localeCompare(text(b.start_date_local)),
    )
    .map((activity) => {
      const sportType = sportTypeOf(activity);
      const seconds = durationOf(activity);
      const benchmarkId = benchmarkIdFor(activity, sportType);
      const scoreType = scoreTypeFor(activity, benchmarkId);
      const metres = distanceOf(activity);

      const scoredOnDistance = scoreType === "distance_metres";

      return {
        date: dateKey,
        title: titleFor(activity, sportType),
        type: workoutTypeFor(sportType),
        description: clamp(
          describe(activity, seconds, !scoredOnDistance),
          STRAVA_DESCRIPTION_MAX,
        ),
        scoreType,
        // The session is done and measured. This is the whole difference from an
        // Octiv import, which arrives with `null` here.
        scoreValue: scoredOnDistance ? metres : seconds,
        scoreDisplay: scoredOnDistance
          ? formatDistanceScore(metres, seconds)
          : formatStravaDuration(seconds),
        // Nothing about a recorded activity says whether it was scaled.
        rxOrScaled: "RX" as const,
        // Set by the record recompute if this turns out to be a best — see
        // firestore/records.ts. Never asserted here.
        isPR: false,
        linkedBenchmarkId: benchmarkId,
        reps: null,
        // The other half of a distance score. Never set on a time score, where
        // the duration *is* the score.
        durationSeconds: scoredOnDistance ? seconds : null,
        stravaActivityId: String(activity.id),
        notes: "",
      };
    });
}

/**
 * The standard distances a Strava run may claim a record at.
 *
 * Ids match the benchmark library in `constants/seedData.ts`; the metres are the
 * real distances those benchmarks name.
 */
const RECORD_DISTANCES: readonly { id: string; metres: number }[] = [
  { id: "run_400m", metres: 400 },
  { id: "run_1k", metres: 1000 },
  { id: "run_5k", metres: 5000 },
  { id: "run_10k", metres: 10000 },
  { id: "half_marathon", metres: 21097 },
];

/**
 * How far off a standard distance a run may be and still count as that distance.
 *
 * Tight on purpose. GPS drift over a measured 5 km course is a few tens of
 * metres, so 1.5% (75 m at 5 km) covers a real race without reaching a 5.2 km
 * training run.
 */
export const RECORD_DISTANCE_TOLERANCE = 0.015;

/** Strava's `workout_type` for a run that was a race. Observed, not documented. */
const WORKOUT_TYPE_RACE = 1;

/**
 * The benchmark this activity may set a record at, or `null`.
 *
 * Two conditions, and both are needed. **It must be flagged as a race** — the
 * athlete said so in Strava, and no heuristic can replace that. And **it must be
 * the right distance**, within a tight tolerance.
 *
 * The asymmetry is deliberate: linking wrongly writes a Sunday jog into the
 * record table as a 5 km personal best, which is quietly wrong and survives until
 * someone notices. Not linking leaves a workout the athlete can attach to a
 * benchmark in one tap from the edit form, which is a visible, trivial fix. So
 * when in doubt, this returns `null`.
 *
 * That also means the undocumented `workout_type` can only ever fail safe: if
 * Strava changes those numbers, races stop auto-linking and nothing false is
 * recorded.
 */
export function benchmarkIdFor(
  activity: StravaActivity,
  sportType: string,
): string | null {
  if (!RUN_SPORT_TYPES.has(sportType)) return null;
  if (activity.workout_type !== WORKOUT_TYPE_RACE) return null;

  const distance = activity.distance;
  if (typeof distance !== "number" || distance <= 0) return null;

  for (const candidate of RECORD_DISTANCES) {
    const drift = Math.abs(distance - candidate.metres) / candidate.metres;
    if (drift <= RECORD_DISTANCE_TOLERANCE) return candidate.id;
  }

  return null;
}
