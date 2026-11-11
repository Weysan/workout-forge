/**
 * Free-text workout → movements, by static rules. No network, no model.
 *
 * The text is read line by line, the way a whiteboard is read:
 *
 *   3 Rounds For Time:      ← header: multiplies the lines below it
 *   400m Run                ← quantity + movement
 *   21 KB Swings (1.5 pood) ← loads in brackets are ignored
 *
 *   21-15-9                 ← rep scheme: lines without a number get its sum
 *   Thrusters (95/65 lbs)
 *   Pull-ups
 *
 * Every recognised movement is turned into estimated *working seconds* (reps ×
 * seconds per rep, metres × seconds per metre, …). Time is what lets 400 m of
 * running and 21 swings be weighed against each other. When the real length of
 * the session is known — an AMRAP's clock, a for-time result, a Strava duration —
 * the estimates are scaled to fit it.
 *
 * Lines that name no known movement are returned as `unrecognised` rather than
 * guessed at, so the UI can say what it could not read.
 *
 * Imports only its sibling catalog, so the test runner loads it through
 * `tests/helpers/ts-resolver.mjs`.
 */

import {
  FALLBACK_SEC_PER_CAL,
  FALLBACK_SEC_PER_METRE,
  FALLBACK_SEC_PER_REP,
  MOVEMENTS,
  type Movement,
} from "./catalog";

export type QuantityUnit = "rep" | "metre" | "cal" | "second";

export interface ParsedMovement {
  movementId: string;
  /** In `unit`, after rounds and rep schemes are applied. */
  quantity: number;
  unit: QuantityUnit;
  /** Estimated working seconds, after scaling to the session's real length. */
  seconds: number;
  /** True when no quantity was written and a default was assumed. */
  estimated: boolean;
  /** The line it was read from, for display. */
  source: string;
}

export interface ParsedWorkout {
  movements: ParsedMovement[];
  /** Lines that looked like work but matched nothing in the catalog. */
  unrecognised: string[];
}

/** The fields of a `Workout` the parser reads. */
export interface ParsableWorkout {
  title: string;
  description: string;
  type: string;
  scoreType: string;
  scoreValue: number | null;
  durationSeconds?: number | null;
}

/**
 * Mirrors `TIME_CAP_THRESHOLD` in lib/scoring.ts: at or above this, a
 * `time_seconds` score is an encoded cap-out, not a finish time. Duplicated to
 * keep this module free of the app's path aliases.
 */
const TIME_CAP_THRESHOLD = 900_000;

/** Reps assumed for a movement written without any number. */
const DEFAULT_REPS = 15;
/** A strength session written as just "Back squat" is usually ~5×5. */
const DEFAULT_STRENGTH_REPS = 25;
/** Monostructural work written without a distance: ~5 minutes of it. */
const DEFAULT_CARDIO_SECONDS = 300;
/** An EMOM is not continuous work: roughly this share of the clock is spent moving. */
const EMOM_WORK_DENSITY = 0.6;

const CARDIO_IDS = new Set(["run", "walk", "row", "ski", "bike", "swim"]);

// --- Normalisation ---------------------------------------------------------

/** Abbreviations expanded before matching, so the catalog only lists full words. */
const TOKEN_EXPANSIONS: Readonly<Record<string, string>> = {
  db: "dumbbell",
  dbs: "dumbbell",
  kb: "kettlebell",
  kbs: "kettlebell swing",
  bb: "barbell",
  mb: "med ball",
  oh: "overhead",
  alt: "alternating",
};

/** Crude plural stripping, applied identically to aliases and text. */
function stem(word: string): string {
  // "pull-ups" → "pull ups": the one short plural that matters. Other short
  // words are left alone so "dus" (double-unders) and "abs" survive.
  if (word === "ups") return "up";
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * Lowercase words separated by single spaces, with plurals stripped. Digits are
 * kept so "c2b" and "t2b" survive.
 */
export function normalizeText(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  return words
    .flatMap((word) => (TOKEN_EXPANSIONS[word] ?? word).split(" "))
    .map(stem)
    .join(" ");
}

// --- Movement matching -----------------------------------------------------

interface AliasEntry {
  phrase: string;
  movement: Movement;
}

/** Every alias, normalised, longest first — so the most specific name wins. */
const ALIASES: readonly AliasEntry[] = MOVEMENTS.flatMap((movement) =>
  movement.aliases.map((alias) => ({ phrase: normalizeText(alias), movement })),
).sort((a, b) => b.phrase.length - a.phrase.length);

/**
 * The movements named in one segment of text, in the order they appear.
 * A matched phrase is blanked out so a shorter alias cannot match inside it —
 * "hang power clean" must not also count as a "clean".
 */
export function findMovements(text: string): Movement[] {
  let haystack = ` ${normalizeText(text)} `;
  const found: { index: number; movement: Movement }[] = [];

  for (const { phrase, movement } of ALIASES) {
    const needle = ` ${phrase} `;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      found.push({ index, movement });
      haystack =
        haystack.slice(0, index + 1) +
        "#".repeat(phrase.length) +
        haystack.slice(index + 1 + phrase.length);
      index = haystack.indexOf(needle);
    }
  }

  const seen = new Set<string>();
  return found
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.movement)
    .filter((movement) => {
      if (seen.has(movement.id)) return false;
      seen.add(movement.id);
      return true;
    });
}

// --- Quantities ------------------------------------------------------------

interface Quantity {
  value: number;
  unit: QuantityUnit;
}

const UNIT_PATTERN =
  "km|k|kilometers?|kilometres?|m|meters?|metres?|mi|miles?|ft|feet|foot|yd|yards?|cals?|calories?|kcal|s|secs?|seconds?|min|mins|minutes?|reps?";

/** Converts a written unit to one of ours. Unknown or missing means reps. */
function toQuantity(raw: number, unitText: string | undefined): Quantity {
  const unit = (unitText ?? "").toLowerCase();
  if (/^(km|k|kilomet)/.test(unit)) return { value: raw * 1000, unit: "metre" };
  if (/^(mi|miles?)$/.test(unit)) return { value: raw * 1609, unit: "metre" };
  if (/^(ft|feet|foot)$/.test(unit)) return { value: raw * 0.3048, unit: "metre" };
  if (/^(yd|yards?)$/.test(unit)) return { value: raw * 0.9144, unit: "metre" };
  if (/^(m|meters?|metres?)$/.test(unit)) return { value: raw, unit: "metre" };
  if (/^(cals?|calories?|kcal)$/.test(unit)) return { value: raw, unit: "cal" };
  if (/^(s|secs?|seconds?)$/.test(unit)) return { value: raw, unit: "second" };
  if (/^(min|mins|minutes?)$/.test(unit)) return { value: raw * 60, unit: "second" };
  return { value: raw, unit: "rep" };
}

/** "1,000" → "1000", and "30/25" (male/female) → "30". */
function cleanNumbers(text: string): string {
  return text
    .replace(/(\d),(\d{3})(?!\d)/g, "$1$2")
    .replace(/(\d+(?:\.\d+)?)\s*\/\s*\d+(?:\.\d+)?/g, "$1");
}

/**
 * The quantity written on a segment, if any. Tried in order:
 *   · sets × reps anywhere      "5x5 Back Squat", "8 x 1km Run", "Squat 5 x 3"
 *   · a leading number          "21 KB Swings", "400m Run", "60 cal Row"
 *   · a number with a unit      "Run 400m", "Row for 2,000 m"
 *   · a count before a word     "Min 1: 10 burpees"
 *
 * Loads ("135 lbs", "24 kg", "80%") are never read as quantities.
 */
export function readQuantity(segment: string): Quantity | null {
  const text = cleanNumbers(segment);

  const sets = new RegExp(
    `(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})?\\b`,
    "i",
  ).exec(text);
  if (sets) {
    const per = toQuantity(Number(sets[2]), sets[3]);
    return { value: Number(sets[1]) * per.value, unit: per.unit };
  }

  const leading = new RegExp(
    `^\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})?\\b(?!\\s*(?:kg|lb|lbs|pood|%|in\\b|"))`,
    "i",
  ).exec(text);
  if (leading) return toQuantity(Number(leading[1]), leading[2]);

  const withUnit = new RegExp(
    `(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})\\b`,
    "i",
  ).exec(text);
  if (withUnit) return toQuantity(Number(withUnit[1]), withUnit[2]);

  // "Min 1: 10 burpees" — a bare count in front of a word, loads excluded.
  const counted = /(?:^|[\s:])(\d+)\s+(?!kg\b|lbs?\b|pood\b|in\b)[a-z]/i.exec(text);
  if (counted) return { value: Number(counted[1]), unit: "rep" };

  return null;
}

/** "21-15-9", "50-40-30-20-10", "3-5-7" → their sum. */
function readScheme(text: string): number | null {
  const match = /^\s*(\d+(?:\s*-\s*\d+)+)(?=\s|$|:|\))/.exec(text);
  if (!match) return null;
  return match[1]
    .split("-")
    .map((n) => Number(n.trim()))
    .reduce((sum, n) => sum + n, 0);
}

/** "cal Echo Bike", "m Row": a unit written with its number left to the scheme. */
function unitWord(text: string): string | undefined {
  return /^\s*(cals?|calories?|m|meters?|metres?)\b/i.exec(text)?.[1];
}

function unitPrefix(text: string): QuantityUnit {
  const word = unitWord(text);
  return word === undefined ? "rep" : toQuantity(1, word).unit;
}

/** "20 min AMRAP", "EMOM 12", "(10 min cap)": block clocks, never a quantity. */
const TIME_BOX_PATTERN =
  /\d+\s*(?:min(?:ute)?s?|')\s*(?:amrap|emom|cap|time cap)\b|\b(?:amrap|emom)\s*(?:in|for|of|x)?\s*\d+\s*(?:min(?:ute)?s?|')?/gi;

/** "1-Rep Max", "1RM", "build to a heavy single": a working-up session. */
function isMaxEffort(text: string): boolean {
  return /\b1\s*-?\s*rep\s*-?\s*max\b|\b1\s*rm\b|\bheavy single\b|\bbuild to\b/i.test(
    text,
  );
}

function secondsFor(movement: Movement, quantity: Quantity): number {
  switch (quantity.unit) {
    case "second":
      return quantity.value;
    case "metre":
      return quantity.value * (movement.secPerMetre ?? FALLBACK_SEC_PER_METRE);
    case "cal":
      return quantity.value * (movement.secPerCal ?? FALLBACK_SEC_PER_CAL);
    case "rep":
      return quantity.value * (movement.secPerRep ?? FALLBACK_SEC_PER_REP);
  }
}

function defaultQuantity(movement: Movement, workoutType: string): Quantity {
  if (CARDIO_IDS.has(movement.id)) {
    return { value: DEFAULT_CARDIO_SECONDS, unit: "second" };
  }
  return {
    value: workoutType === "Strength" ? DEFAULT_STRENGTH_REPS : DEFAULT_REPS,
    unit: "rep",
  };
}

// --- Line structure --------------------------------------------------------

/**
 * Lines that set up the work rather than being work. Tested against the
 * normalised text, so plurals are already stripped ("rounds" → "round").
 */
const HEADER_PATTERN =
  /\b(for time|rft|time trial|max|working set|amrap|emom|e\d+mom|every|round|rd|rest|then|cap|score|for load|for rep|tabata|interval|minute|min|sec|team|partner|partition|repeat|immediately|starting|if completed|add|load|scaled|rx|buy in|cash out|warm ?up|cool ?down|weight|vest|optional|each|stay|station|of)\b/;

/** "Distance: 8.02 km" — a Strava summary line, label then value. */
const LABEL_VALUE_PATTERN = /^[a-z][a-z .]*:\s*\S/i;

/** List markers in front of a line: "-", "•", "1.", "a)". Not "21 burpees". */
const LIST_MARKER_PATTERN = /^\s*(?:[-*•–]|\d{1,2}[.)]|[a-z][.)])\s+/i;

interface Context {
  /** From "3 Rounds For Time:" — multiplies the lines below. */
  rounds: number;
  /** From "21-15-9" — the reps for lines that carry no number. */
  scheme: number | null;
}

interface RawItem {
  movement: Movement;
  quantity: Quantity;
  estimated: boolean;
  source: string;
}

/**
 * One line of text → the movements on it, updating the block context as it
 * goes. Pure apart from mutating `context`.
 */
function readLine(
  rawLine: string,
  context: Context,
  workoutType: string,
  unrecognised: string[],
): RawItem[] {
  let line = rawLine.replace(LIST_MARKER_PATTERN, "").trim();

  if (line === "") {
    // A blank line closes a block: "3 rounds of" above it no longer applies.
    context.rounds = 1;
    context.scheme = null;
    return [];
  }

  // Sentences are notes about the workout, not the workout: "Team of 2 — both
  // partners run every kilometre, station work split freely between them."
  if (/[.!?]$/.test(line) && line.split(/\s+/).length > 6) return [];

  // Brackets usually hold loads and notes — "(95/65 lbs)", "(10 min cap)" — and
  // are dropped. Two exceptions are read: a rep scheme for this line
  // ("Rope Climbs (3-5-7)"), and a list of stations ("(Sled Push, Sled Pull, …)").
  let lineScheme: number | null = null;
  const bracketed: string[] = [];
  line = line.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const scheme = readScheme(inner);
    if (scheme !== null && /^[\d\s-]+$/.test(inner.trim())) lineScheme = scheme;
    const items = inner.split(",").map((s) => s.trim());
    if (items.length >= 2 && items.every((item) => findMovements(item).length > 0)) {
      bracketed.push(...items);
    }
    return " ";
  });

  // Block headers. Checked on the whole line, since "3 rounds of 10 burpees"
  // carries a header and work at once.
  // "Then" closes the previous block before anything on its own line opens a
  // new one — "Then 5 Rounds of:" is five rounds, not one.
  if (/^\s*then\b/i.test(line)) {
    context.rounds = 1;
    context.scheme = null;
  }
  const rounds = /\b(\d+)\s*(?:rounds?|rds?|rft|sets?)\b/i.exec(line);
  if (rounds) context.rounds = Math.max(1, Number(rounds[1]));
  const scheme = readScheme(line);
  if (scheme !== null) context.scheme = scheme;

  const items: RawItem[] = [];
  const segments = line
    .split(/\s+\+\s+|\s*;\s*|\s+then\s+/i)
    .concat(bracketed)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const movements = findMovements(segment);

    if (movements.length === 0) {
      const looksLikeWork =
        /[a-z]{3,}/i.test(segment) &&
        !HEADER_PATTERN.test(normalizeText(segment)) &&
        !LABEL_VALUE_PATTERN.test(segment) &&
        scheme === null;
      if (looksLikeWork) unrecognised.push(segment);
      continue;
    }

    // Rounds written on the segment itself are a header, not a rep count.
    const withoutRounds = segment.replace(
      /\b\d+\s*(?:rounds?|rds?|rft|sets?)\b(?:\s*of)?/i,
      "",
    );
    // A scheme at the start of the line is the context's, not a quantity, and
    // an AMRAP or EMOM clock is the length of the block, not of this movement.
    const withoutScheme = withoutRounds
      .replace(/^\s*\d+(?:\s*-\s*\d+)+/, "")
      .replace(TIME_BOX_PATTERN, " ");
    const written = isMaxEffort(segment) ? null : readQuantity(withoutScheme);
    // "cal Echo Bike" under "21-18-15": the scheme counts calories, not reps.
    const schemeUnit = unitPrefix(withoutScheme);

    for (const movement of movements) {
      let quantity: Quantity;
      let estimated = false;

      if (written) {
        quantity = written;
      } else if (lineScheme !== null) {
        quantity = { value: lineScheme, unit: schemeUnit };
      } else if (context.scheme !== null) {
        quantity = toQuantity(context.scheme, schemeUnit === "rep" ? undefined : unitWord(withoutScheme));
      } else {
        quantity = defaultQuantity(movement, isMaxEffort(segment) ? "Strength" : workoutType);
        estimated = true;
      }

      items.push({
        movement,
        quantity: { value: quantity.value * context.rounds, unit: quantity.unit },
        estimated,
        source: rawLine.trim(),
      });
    }
  }

  return items;
}

/** Minutes on an AMRAP or EMOM clock, if the text states one. */
function readTimeBox(text: string): { seconds: number; kind: "amrap" | "emom" } | null {
  const pattern =
    /(\d+)\s*(?:min(?:ute)?s?|')\s*(amrap|emom)|(amrap|emom)\s*(?:in|for|of|x)?\s*(\d+)/i;
  const match = pattern.exec(text);
  if (!match) return null;
  const minutes = Number(match[1] ?? match[4]);
  const kind = (match[2] ?? match[3]).toLowerCase() as "amrap" | "emom";
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 180) return null;
  return { seconds: minutes * 60, kind };
}

/**
 * The session's real working length, when something states it. `null` when
 * nothing does, in which case the per-movement estimates stand on their own.
 */
function knownDuration(workout: ParsableWorkout, text: string): number | null {
  // Strength work is mostly rest between sets; its clock says nothing about load.
  if (workout.type === "Strength") return null;

  const box = readTimeBox(text);
  if (box) return box.kind === "emom" ? box.seconds * EMOM_WORK_DENSITY : box.seconds;

  if (
    workout.scoreType === "time_seconds" &&
    typeof workout.scoreValue === "number" &&
    workout.scoreValue > 0 &&
    workout.scoreValue < TIME_CAP_THRESHOLD
  ) {
    return workout.scoreValue;
  }

  if (typeof workout.durationSeconds === "number" && workout.durationSeconds > 0) {
    return workout.durationSeconds;
  }

  return null;
}

function parseText(text: string, workoutType: string): {
  items: RawItem[];
  unrecognised: string[];
} {
  const context: Context = { rounds: 1, scheme: null };
  const unrecognised: string[] = [];
  const items = text
    .split(/\r?\n/)
    .flatMap((line) => readLine(line, context, workoutType, unrecognised));
  return { items, unrecognised };
}

export function parseWorkout(workout: ParsableWorkout): ParsedWorkout {
  // The description is the workout. The title is read only when the description
  // names nothing — "Morning Run" from Strava, or "Back Squat" over "1-Rep Max
  // or Working Set" — because reading both would count "Back squat / 5x5 back
  // squat" twice.
  //
  // On that fallback the title borrows the description's first numbered line,
  // so "Back Squat" over "5x5 @ 80%" is 25 reps and Strava's "Morning Run" over
  // "Distance: 8.02 km" is 8 km.
  let parsed = parseText(workout.description, workout.type);
  let text = workout.description;
  if (parsed.items.length === 0) {
    const numbered =
      workout.description.split(/\r?\n/).find((line) => /\d/.test(line)) ?? "";
    const titleLine = `${workout.title} ${numbered}`.trim();
    const fromTitle = parseText(titleLine, workout.type);
    if (fromTitle.items.length > 0) {
      // Whatever the description said, it named no movement — a note such as
      // "1-Rep Max or Working Set", not work the map failed to read.
      parsed = { items: fromTitle.items, unrecognised: [] };
      text = `${titleLine}\n${workout.description}`;
    }
  }

  const estimates = parsed.items.map((item) => secondsFor(item.movement, item.quantity));
  const total = estimates.reduce((sum, s) => sum + s, 0);
  const target = knownDuration(workout, text);
  const scale = target !== null && total > 0 ? target / total : 1;

  return {
    movements: parsed.items.map((item, index) => ({
      movementId: item.movement.id,
      quantity: Math.round(item.quantity.value * 10) / 10,
      unit: item.quantity.unit,
      seconds: estimates[index] * scale,
      estimated: item.estimated,
      source: item.source,
    })),
    unrecognised: parsed.unrecognised,
  };
}
