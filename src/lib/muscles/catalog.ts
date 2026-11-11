/**
 * Muscle groups and the movement catalog that maps onto them.
 *
 * Shipped in the bundle, like the benchmark library: identical for everyone,
 * never edited by users, and read on every render of the muscle map.
 *
 * Nothing derived from this file is stored. Muscle load is recomputed from the
 * workout text whenever it is shown, so retuning a weight here or adding an
 * alias improves every past session at once, with no migration.
 *
 * Movement `id` values are nonetheless meant to be permanent: a later "fix the
 * detected movements" feature would store them on the workout.
 *
 * The module imports nothing, so Node's type stripping runs it directly in
 * `tests/muscles.test.mjs`.
 */

export type Muscle =
  | "chest"
  | "front_delts"
  | "rear_delts"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "traps"
  | "upper_back"
  | "lats"
  | "lower_back"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "adductors"
  | "calves";

/** Display order: top of the body to the bottom, front before back. */
export const MUSCLES: readonly { id: Muscle; label: string }[] = [
  { id: "traps", label: "Traps" },
  { id: "front_delts", label: "Front delts" },
  { id: "rear_delts", label: "Rear delts" },
  { id: "chest", label: "Chest" },
  { id: "upper_back", label: "Upper back" },
  { id: "lats", label: "Lats" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "forearms", label: "Forearms" },
  { id: "abs", label: "Abs" },
  { id: "obliques", label: "Obliques" },
  { id: "lower_back", label: "Lower back" },
  { id: "glutes", label: "Glutes" },
  { id: "quads", label: "Quads" },
  { id: "hamstrings", label: "Hamstrings" },
  { id: "adductors", label: "Adductors" },
  { id: "calves", label: "Calves" },
];

export const MUSCLE_LABELS: Readonly<Record<Muscle, string>> =
  Object.fromEntries(MUSCLES.map((m) => [m.id, m.label])) as Record<
    Muscle,
    string
  >;

/**
 * How much each muscle works in a movement, from 0 to 1.
 *
 * Rough convention: 1 for the prime movers, ~0.5–0.8 for the muscles that
 * clearly share the work, ~0.2–0.4 for stabilisers. These are coaching
 * estimates, not EMG data — good enough to tell a squat day from a pull day.
 */
export type MuscleWeights = Partial<Record<Muscle, number>>;

export interface Movement {
  id: string;
  name: string;
  /**
   * Phrases that name this movement, written naturally. They go through the
   * same normalisation as the workout text (see `normalizeText` in parse.ts),
   * so plurals, hyphens and "&" need no separate entries.
   *
   * When aliases of different movements overlap, the longest phrase in the line
   * wins — "hang power clean" beats "clean", "bent over row" beats "row".
   */
  aliases: readonly string[];
  /**
   * Estimated working seconds per unit. Time is the common currency that lets
   * 400 m of running, 15 calories on a bike and 21 thrusters be weighed against
   * each other inside one workout.
   */
  secPerRep?: number;
  secPerMetre?: number;
  secPerCal?: number;
  muscles: MuscleWeights;
}

/** Used when a movement has no figure for the unit the line was written in. */
export const FALLBACK_SEC_PER_REP = 3;
export const FALLBACK_SEC_PER_METRE = 1;
export const FALLBACK_SEC_PER_CAL = 4;

// Shared weight sets, so the variants of one pattern cannot drift apart.
const SQUAT: MuscleWeights = {
  quads: 1,
  glutes: 0.8,
  adductors: 0.5,
  hamstrings: 0.3,
  lower_back: 0.3,
  abs: 0.3,
};
const HINGE: MuscleWeights = {
  glutes: 1,
  hamstrings: 0.9,
  lower_back: 0.9,
  quads: 0.4,
  traps: 0.4,
  forearms: 0.5,
  upper_back: 0.4,
  lats: 0.3,
};
const CLEAN: MuscleWeights = {
  quads: 0.9,
  glutes: 0.9,
  hamstrings: 0.7,
  lower_back: 0.6,
  traps: 0.8,
  upper_back: 0.5,
  front_delts: 0.3,
  forearms: 0.4,
  abs: 0.3,
};
const SNATCH: MuscleWeights = {
  quads: 0.8,
  glutes: 0.9,
  hamstrings: 0.7,
  lower_back: 0.6,
  traps: 0.8,
  upper_back: 0.6,
  front_delts: 0.6,
  triceps: 0.3,
  abs: 0.3,
};
const PRESS: MuscleWeights = {
  front_delts: 1,
  triceps: 0.8,
  traps: 0.4,
  chest: 0.3,
  abs: 0.3,
};
const PULL_UP: MuscleWeights = {
  lats: 1,
  biceps: 0.7,
  upper_back: 0.6,
  rear_delts: 0.3,
  forearms: 0.5,
  abs: 0.2,
};
const BURPEE: MuscleWeights = {
  chest: 0.7,
  quads: 0.6,
  glutes: 0.4,
  triceps: 0.5,
  front_delts: 0.4,
  abs: 0.3,
  calves: 0.2,
};
const LUNGE: MuscleWeights = {
  quads: 1,
  glutes: 0.9,
  adductors: 0.4,
  hamstrings: 0.4,
  calves: 0.2,
};

export const MOVEMENTS: readonly Movement[] = [
  // --- Squat pattern -------------------------------------------------------
  {
    id: "air_squat",
    name: "Air squat",
    aliases: ["air squat", "squat", "bodyweight squat", "jump squat"],
    secPerRep: 2,
    muscles: { quads: 1, glutes: 0.6, adductors: 0.4, abs: 0.2 },
  },
  {
    id: "back_squat",
    name: "Back squat",
    aliases: ["back squat", "high bar squat", "low bar squat", "box squat"],
    secPerRep: 4,
    muscles: SQUAT,
  },
  {
    id: "front_squat",
    name: "Front squat",
    aliases: ["front squat", "goblet squat", "sandbag squat", "zercher squat"],
    secPerRep: 4,
    muscles: { ...SQUAT, upper_back: 0.4, abs: 0.5, lower_back: 0.2 },
  },
  {
    id: "overhead_squat",
    name: "Overhead squat",
    aliases: ["overhead squat", "ohs"],
    secPerRep: 4,
    muscles: {
      ...SQUAT,
      front_delts: 0.6,
      upper_back: 0.5,
      traps: 0.4,
      triceps: 0.3,
      abs: 0.6,
    },
  },
  {
    id: "pistol",
    name: "Pistol",
    aliases: ["pistol", "pistol squat", "single leg squat"],
    secPerRep: 3,
    muscles: { quads: 1, glutes: 0.7, adductors: 0.3, abs: 0.3, calves: 0.2 },
  },
  {
    id: "leg_press",
    name: "Leg press",
    aliases: ["leg press", "leg extension"],
    secPerRep: 3,
    muscles: { quads: 1, glutes: 0.5, adductors: 0.3 },
  },
  {
    id: "wall_ball",
    name: "Wall ball",
    aliases: ["wall ball", "wallball", "wall ball shot", "wb"],
    secPerRep: 2.5,
    muscles: {
      quads: 1,
      glutes: 0.6,
      front_delts: 0.7,
      triceps: 0.4,
      adductors: 0.3,
      abs: 0.3,
    },
  },
  {
    id: "thruster",
    name: "Thruster",
    aliases: ["thruster", "cluster"],
    secPerRep: 2.5,
    muscles: {
      quads: 1,
      glutes: 0.7,
      front_delts: 1,
      triceps: 0.6,
      adductors: 0.3,
      upper_back: 0.2,
      abs: 0.4,
    },
  },

  // --- Single leg, jumping -------------------------------------------------
  {
    id: "lunge",
    name: "Lunge",
    aliases: [
      "lunge",
      "walking lunge",
      "reverse lunge",
      "split squat",
      "bulgarian split squat",
      "front rack lunge",
      "dumbbell lunge",
    ],
    secPerRep: 2,
    secPerMetre: 1.6,
    muscles: LUNGE,
  },
  {
    id: "sandbag_lunge",
    name: "Sandbag lunge",
    aliases: ["sandbag lunge", "sandbag walking lunge"],
    secPerRep: 2.2,
    secPerMetre: 1.8,
    muscles: { ...LUNGE, upper_back: 0.4, abs: 0.3, traps: 0.3 },
  },
  {
    id: "overhead_lunge",
    name: "Overhead lunge",
    aliases: [
      "overhead lunge",
      "overhead walking lunge",
      "dumbbell overhead walking lunge",
      "dumbbell overhead lunge",
    ],
    secPerRep: 2.5,
    secPerMetre: 2,
    muscles: { ...LUNGE, front_delts: 0.6, traps: 0.4, abs: 0.5, triceps: 0.3 },
  },
  {
    id: "step_up",
    name: "Box step-up",
    aliases: [
      "step up",
      "box step up",
      "box step over",
      "med ball box step over",
      "medicine ball box step over",
    ],
    secPerRep: 2.5,
    muscles: { quads: 1, glutes: 0.9, hamstrings: 0.3, calves: 0.3 },
  },
  {
    id: "box_jump",
    name: "Box jump",
    aliases: ["box jump", "box jump over", "box over"],
    secPerRep: 2.5,
    muscles: { quads: 1, glutes: 0.7, calves: 0.7, hamstrings: 0.3 },
  },
  {
    id: "broad_jump",
    name: "Broad jump",
    aliases: ["broad jump", "tuck jump"],
    secPerRep: 2.5,
    secPerMetre: 1.5,
    muscles: { quads: 1, glutes: 0.8, calves: 0.6, hamstrings: 0.4 },
  },

  // --- Hinge ---------------------------------------------------------------
  {
    id: "deadlift",
    name: "Deadlift",
    aliases: ["deadlift", "dl", "sumo deadlift", "trap bar deadlift"],
    secPerRep: 3.5,
    muscles: HINGE,
  },
  {
    id: "romanian_deadlift",
    name: "Romanian deadlift",
    aliases: [
      "romanian deadlift",
      "rdl",
      "stiff leg deadlift",
      "good morning",
      "single leg deadlift",
    ],
    secPerRep: 3.5,
    muscles: { hamstrings: 1, glutes: 0.8, lower_back: 0.8, forearms: 0.3 },
  },
  {
    id: "sumo_deadlift_high_pull",
    name: "Sumo deadlift high pull",
    aliases: ["sumo deadlift high pull", "sdhp", "high pull"],
    secPerRep: 2.5,
    muscles: { ...HINGE, traps: 0.9, front_delts: 0.5, rear_delts: 0.3 },
  },
  {
    id: "kb_swing",
    name: "Kettlebell swing",
    aliases: [
      "kettlebell swing",
      "swing",
      "russian swing",
      "american swing",
      "kbs",
      "dumbbell swing",
    ],
    secPerRep: 2,
    muscles: {
      glutes: 1,
      hamstrings: 0.8,
      lower_back: 0.6,
      front_delts: 0.3,
      forearms: 0.4,
      abs: 0.3,
    },
  },
  {
    id: "hip_thrust",
    name: "Hip thrust",
    aliases: ["hip thrust", "glute bridge"],
    secPerRep: 3,
    muscles: { glutes: 1, hamstrings: 0.5 },
  },
  {
    id: "back_extension",
    name: "Back extension",
    aliases: [
      "back extension",
      "hip extension",
      "ghd hip extension",
      "ghd back extension",
      "superman",
    ],
    secPerRep: 2.5,
    muscles: { lower_back: 1, glutes: 0.7, hamstrings: 0.6 },
  },
  {
    id: "hamstring_curl",
    name: "Hamstring curl",
    aliases: ["hamstring curl", "leg curl", "nordic curl", "nordic"],
    secPerRep: 3,
    muscles: { hamstrings: 1, calves: 0.2 },
  },

  // --- Olympic lifting -----------------------------------------------------
  {
    id: "clean",
    name: "Clean",
    aliases: [
      "clean",
      "squat clean",
      "hang clean",
      "hang squat clean",
      "clean pull",
      "muscle clean",
    ],
    secPerRep: 3,
    muscles: CLEAN,
  },
  {
    id: "power_clean",
    name: "Power clean",
    aliases: ["power clean", "hang power clean", "hpc"],
    secPerRep: 3,
    muscles: { ...CLEAN, quads: 0.6 },
  },
  {
    id: "clean_and_jerk",
    name: "Clean & jerk",
    aliases: [
      "clean and jerk",
      "c and j",
      "squat clean and jerk",
      "power clean and jerk",
      "cnj",
    ],
    secPerRep: 4.5,
    muscles: { ...CLEAN, front_delts: 0.7, triceps: 0.6 },
  },
  {
    id: "jerk",
    name: "Jerk",
    aliases: ["jerk", "push jerk", "split jerk", "power jerk"],
    secPerRep: 2.5,
    muscles: { ...PRESS, quads: 0.5, glutes: 0.3 },
  },
  {
    id: "snatch",
    name: "Snatch",
    aliases: [
      "snatch",
      "squat snatch",
      "hang snatch",
      "hang squat snatch",
      "snatch balance",
      "snatch pull",
    ],
    secPerRep: 3.5,
    muscles: SNATCH,
  },
  {
    id: "power_snatch",
    name: "Power snatch",
    aliases: ["power snatch", "hang power snatch"],
    secPerRep: 3,
    muscles: { ...SNATCH, quads: 0.6 },
  },
  {
    id: "db_snatch",
    name: "Dumbbell snatch",
    aliases: [
      "dumbbell snatch",
      "alternating dumbbell snatch",
      "kettlebell snatch",
      "single arm dumbbell snatch",
    ],
    secPerRep: 2.2,
    muscles: { ...SNATCH, obliques: 0.4, traps: 0.6 },
  },
  {
    id: "db_clean_to_overhead",
    name: "Dumbbell clean to overhead",
    aliases: [
      "clean to overhead",
      "dumbbell clean to overhead",
      "dumbbell hang clean to overhead",
      "hang clean to overhead",
      "dumbbell clean and jerk",
    ],
    secPerRep: 3,
    muscles: { ...CLEAN, front_delts: 0.8, triceps: 0.5, obliques: 0.3 },
  },
  {
    id: "devil_press",
    name: "Devil press",
    aliases: ["devil press", "devils press", "man maker"],
    secPerRep: 4,
    muscles: { ...BURPEE, glutes: 0.8, hamstrings: 0.6, front_delts: 0.7 },
  },
  {
    id: "turkish_get_up",
    name: "Turkish get-up",
    aliases: ["turkish get up", "tgu", "get up"],
    secPerRep: 10,
    muscles: { front_delts: 0.8, abs: 0.8, obliques: 0.7, glutes: 0.5, quads: 0.4 },
  },

  // --- Pressing ------------------------------------------------------------
  {
    id: "strict_press",
    name: "Strict press",
    aliases: [
      "strict press",
      "press",
      "shoulder press",
      "overhead press",
      "military press",
      "ohp",
      "dumbbell press",
      "arnold press",
    ],
    secPerRep: 3,
    muscles: PRESS,
  },
  {
    id: "push_press",
    name: "Push press",
    aliases: ["push press"],
    secPerRep: 2.5,
    muscles: { ...PRESS, quads: 0.4, glutes: 0.3 },
  },
  {
    id: "shoulder_to_overhead",
    name: "Shoulder to overhead",
    aliases: [
      "shoulder to overhead",
      "sto",
      "s2oh",
      "dumbbell shoulder to overhead",
      "ground to overhead",
    ],
    secPerRep: 2.5,
    muscles: { ...PRESS, quads: 0.3 },
  },
  {
    id: "bench_press",
    name: "Bench press",
    aliases: [
      "bench press",
      "bench",
      "dumbbell bench press",
      "incline bench press",
      "floor press",
    ],
    secPerRep: 3,
    muscles: { chest: 1, triceps: 0.7, front_delts: 0.5 },
  },
  {
    id: "push_up",
    name: "Push-up",
    aliases: ["push up", "pushup", "hand release push up", "hrpu"],
    secPerRep: 1.8,
    muscles: { chest: 1, triceps: 0.7, front_delts: 0.5, abs: 0.3 },
  },
  {
    id: "hspu",
    name: "Handstand push-up",
    aliases: [
      "handstand push up",
      "hspu",
      "strict handstand push up",
      "shspu",
      "deficit handstand push up",
      "strict deficit handstand push up",
      "pike push up",
    ],
    secPerRep: 2.5,
    muscles: { front_delts: 1, triceps: 0.9, traps: 0.5, chest: 0.2, abs: 0.2 },
  },
  {
    id: "handstand_walk",
    name: "Handstand walk",
    aliases: ["handstand walk", "hs walk", "handstand hold"],
    secPerRep: 3,
    secPerMetre: 1.5,
    muscles: { front_delts: 1, triceps: 0.6, traps: 0.5, abs: 0.5, forearms: 0.3 },
  },
  {
    id: "wall_walk",
    name: "Wall walk",
    aliases: ["wall walk", "wall climb"],
    secPerRep: 6,
    muscles: { front_delts: 1, triceps: 0.5, abs: 0.6, chest: 0.3, traps: 0.3 },
  },
  {
    id: "dip",
    name: "Dip",
    aliases: ["dip", "ring dip", "bar dip", "bench dip", "parallel bar dip"],
    secPerRep: 2,
    muscles: { triceps: 1, chest: 0.7, front_delts: 0.5 },
  },
  {
    id: "lateral_raise",
    name: "Lateral raise",
    aliases: ["lateral raise", "front raise", "upright row"],
    secPerRep: 2.5,
    muscles: { front_delts: 0.8, traps: 0.5, rear_delts: 0.3 },
  },
  {
    id: "triceps_isolation",
    name: "Triceps extension",
    aliases: [
      "tricep extension",
      "triceps extension",
      "skull crusher",
      "tricep pushdown",
      "triceps pushdown",
    ],
    secPerRep: 2.5,
    muscles: { triceps: 1 },
  },

  // --- Pulling -------------------------------------------------------------
  {
    id: "pull_up",
    name: "Pull-up",
    aliases: [
      "pull up",
      "pullup",
      "kipping pull up",
      "butterfly pull up",
      "strict pull up",
      "chin up",
      "chinup",
      "jumping pull up",
    ],
    secPerRep: 1.8,
    muscles: PULL_UP,
  },
  {
    id: "chest_to_bar",
    name: "Chest-to-bar pull-up",
    aliases: ["chest to bar", "chest to bar pull up", "c2b", "ctb"],
    secPerRep: 2,
    muscles: { ...PULL_UP, upper_back: 0.8, rear_delts: 0.4 },
  },
  {
    id: "muscle_up",
    name: "Muscle-up",
    aliases: [
      "muscle up",
      "bar muscle up",
      "ring muscle up",
      "bmu",
      "rmu",
    ],
    secPerRep: 4,
    muscles: { lats: 1, triceps: 0.8, chest: 0.5, biceps: 0.4, abs: 0.4, forearms: 0.4 },
  },
  {
    id: "burpee_pull_up",
    name: "Burpee pull-up",
    aliases: ["burpee pull up"],
    secPerRep: 5,
    muscles: { ...BURPEE, lats: 0.8, biceps: 0.5, upper_back: 0.4 },
  },
  {
    id: "rope_climb",
    name: "Rope climb",
    aliases: ["rope climb", "legless rope climb"],
    secPerRep: 12,
    muscles: { lats: 1, biceps: 1, forearms: 1, upper_back: 0.5, abs: 0.4 },
  },
  {
    id: "row_strength",
    name: "Bent-over row",
    aliases: [
      "bent over row",
      "barbell row",
      "pendlay row",
      "dumbbell row",
      "ring row",
      "seated row",
      "cable row",
      "lat pulldown",
      "pulldown",
    ],
    secPerRep: 2.5,
    muscles: { lats: 0.9, upper_back: 1, biceps: 0.6, rear_delts: 0.6, forearms: 0.4 },
  },
  {
    id: "face_pull",
    name: "Face pull",
    aliases: ["face pull", "reverse fly", "band pull apart"],
    secPerRep: 2,
    muscles: { rear_delts: 1, upper_back: 0.7, traps: 0.4 },
  },
  {
    id: "curl",
    name: "Biceps curl",
    aliases: ["curl", "bicep curl", "biceps curl", "hammer curl"],
    secPerRep: 2.5,
    muscles: { biceps: 1, forearms: 0.5 },
  },
  {
    id: "shrug",
    name: "Shrug",
    aliases: ["shrug"],
    secPerRep: 2,
    muscles: { traps: 1, forearms: 0.4 },
  },

  // --- Midline -------------------------------------------------------------
  {
    id: "toes_to_bar",
    name: "Toes-to-bar",
    aliases: ["toe to bar", "t2b", "ttb", "toe to ring"],
    secPerRep: 2,
    muscles: { abs: 1, lats: 0.5, obliques: 0.4, forearms: 0.5 },
  },
  {
    id: "knees_to_elbows",
    name: "Knees-to-elbows",
    aliases: [
      "knee to elbow",
      "k2e",
      "kte",
      "knee raise",
      "hanging knee raise",
      "leg raise",
      "hanging leg raise",
    ],
    secPerRep: 2,
    muscles: { abs: 1, obliques: 0.4, lats: 0.3, forearms: 0.4 },
  },
  {
    id: "sit_up",
    name: "Sit-up",
    aliases: ["sit up", "situp", "abmat sit up", "crunch", "v up", "tuck up"],
    secPerRep: 1.8,
    muscles: { abs: 1, obliques: 0.3 },
  },
  {
    id: "ghd_sit_up",
    name: "GHD sit-up",
    aliases: ["ghd sit up", "ghd situp", "ghd"],
    secPerRep: 2.5,
    muscles: { abs: 1, quads: 0.5, obliques: 0.3 },
  },
  {
    id: "core_hold",
    name: "Core hold",
    aliases: [
      "plank",
      "hollow hold",
      "hollow rock",
      "l sit",
      "side plank",
      "dead bug",
    ],
    secPerRep: 3,
    muscles: { abs: 1, obliques: 0.6 },
  },
  {
    id: "rotation",
    name: "Rotation",
    aliases: [
      "russian twist",
      "woodchop",
      "pallof press",
      "windmill",
      "side bend",
    ],
    secPerRep: 2,
    muscles: { obliques: 1, abs: 0.5 },
  },

  // --- Burpees -------------------------------------------------------------
  {
    id: "burpee",
    name: "Burpee",
    aliases: [
      "burpee",
      "bar facing burpee",
      "lateral burpee",
      "burpee over the bar",
      "burpee over bar",
      "lateral burpee over the dumbbell",
      "lateral burpee over dumbbell",
      "burpee over the barricade",
    ],
    secPerRep: 3.5,
    muscles: BURPEE,
  },
  {
    id: "burpee_box_jump",
    name: "Burpee box jump",
    aliases: ["burpee box jump", "burpee box jump over"],
    secPerRep: 5,
    muscles: { ...BURPEE, quads: 0.9, glutes: 0.6, calves: 0.5 },
  },
  {
    id: "burpee_broad_jump",
    name: "Burpee broad jump",
    aliases: ["burpee broad jump", "bbj"],
    secPerRep: 4.5,
    // 80 m takes most athletes four to six minutes.
    secPerMetre: 3.6,
    muscles: { ...BURPEE, quads: 0.9, glutes: 0.7, calves: 0.4 },
  },

  // --- Carries and sleds ---------------------------------------------------
  {
    id: "farmers_carry",
    name: "Farmers carry",
    aliases: [
      "farmer carry",
      "farmer walk",
      "farmers carry",
      "suitcase carry",
      "carry",
      "yoke",
    ],
    secPerRep: 30,
    secPerMetre: 0.9,
    muscles: {
      forearms: 1,
      traps: 1,
      upper_back: 0.4,
      abs: 0.4,
      obliques: 0.4,
      quads: 0.3,
      calves: 0.3,
    },
  },
  {
    id: "sled_push",
    name: "Sled push",
    aliases: ["sled push", "prowler push", "prowler"],
    secPerRep: 30,
    secPerMetre: 2.4,
    muscles: {
      quads: 1,
      glutes: 0.8,
      calves: 0.6,
      front_delts: 0.3,
      triceps: 0.3,
      chest: 0.3,
      abs: 0.3,
    },
  },
  {
    id: "sled_pull",
    name: "Sled pull",
    aliases: ["sled pull", "sled drag", "rope pull"],
    secPerRep: 30,
    secPerMetre: 2.4,
    muscles: {
      upper_back: 0.9,
      lats: 0.8,
      biceps: 0.7,
      forearms: 0.7,
      rear_delts: 0.5,
      lower_back: 0.5,
      hamstrings: 0.4,
      glutes: 0.4,
    },
  },

  // --- Monostructural ------------------------------------------------------
  {
    id: "run",
    name: "Run",
    aliases: [
      "run",
      "running",
      "jog",
      "sprint",
      "shuttle run",
      "trail run",
      "treadmill",
      "virtual run",
      "marathon",
      "half marathon",
    ],
    secPerRep: 6,
    // ~5:30 /km.
    secPerMetre: 0.33,
    muscles: { calves: 1, quads: 0.7, hamstrings: 0.6, glutes: 0.6, abs: 0.2 },
  },
  {
    id: "walk",
    name: "Walk",
    aliases: ["walk", "hike", "hiking", "ruck", "rucking"],
    secPerRep: 30,
    secPerMetre: 0.75,
    muscles: { calves: 0.6, quads: 0.4, glutes: 0.4, hamstrings: 0.3 },
  },
  {
    id: "row",
    name: "Row",
    aliases: ["row", "rowing", "rower", "erg", "c2 row", "concept2 row"],
    secPerRep: 30,
    // ~2:00 /500 m.
    secPerMetre: 0.24,
    secPerCal: 4,
    muscles: {
      quads: 0.6,
      glutes: 0.5,
      hamstrings: 0.5,
      lats: 0.7,
      upper_back: 0.7,
      biceps: 0.4,
      lower_back: 0.4,
      rear_delts: 0.3,
    },
  },
  {
    id: "ski",
    name: "SkiErg",
    aliases: ["skierg", "ski erg", "ski", "nordic ski"],
    secPerRep: 30,
    secPerMetre: 0.25,
    secPerCal: 4.5,
    muscles: {
      lats: 1,
      triceps: 0.6,
      abs: 0.6,
      upper_back: 0.4,
      glutes: 0.3,
      front_delts: 0.3,
    },
  },
  {
    id: "bike",
    name: "Bike",
    aliases: [
      "bike",
      "echo bike",
      "assault bike",
      "air bike",
      "airdyne",
      "bike erg",
      "bikeerg",
      "cycling",
      "cycle",
      "ride",
      "spin",
      "gravel ride",
      "mountain bike ride",
    ],
    secPerRep: 30,
    // ~30 km/h.
    secPerMetre: 0.12,
    secPerCal: 3,
    muscles: { quads: 1, glutes: 0.5, hamstrings: 0.4, calves: 0.3 },
  },
  {
    id: "swim",
    name: "Swim",
    aliases: ["swim", "swimming"],
    secPerRep: 30,
    secPerMetre: 1.2,
    muscles: {
      lats: 0.8,
      front_delts: 0.6,
      upper_back: 0.5,
      triceps: 0.5,
      chest: 0.4,
      abs: 0.3,
    },
  },
  {
    id: "double_under",
    name: "Double-under",
    aliases: [
      "double under",
      "dus",
      "double under crossover",
      "single under",
      "jump rope",
      "skipping",
      "crossover",
    ],
    secPerRep: 0.5,
    muscles: { calves: 1, quads: 0.2, front_delts: 0.2, forearms: 0.3 },
  },
];

export const MOVEMENTS_BY_ID: ReadonlyMap<string, Movement> = new Map(
  MOVEMENTS.map((m) => [m.id, m]),
);
