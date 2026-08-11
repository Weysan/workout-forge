import type { Benchmark, BenchmarkCategory } from "@/lib/types";

/**
 * The static benchmark library.
 *
 * Shipped in the bundle rather than stored in Firestore: it is read on every
 * render of the workout picker, never edited by users, and identical for
 * everyone — so a network round-trip would buy nothing.
 *
 * `id` values are permanent. A workout references one through
 * `linkedBenchmarkId`, and a personal record's document id *is* the benchmark
 * id, so renaming an id orphans existing user data.
 */
export const BENCHMARK_SEED_DATA: readonly Benchmark[] = [
  // ---------------------------------------------------------------------
  // "The Girls" — the classic CrossFit benchmark workouts
  // ---------------------------------------------------------------------
  {
    id: "fran",
    name: "Fran",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "21-15-9\nThrusters (95/65 lbs)\nPull-ups",
  },
  {
    id: "grace",
    name: "Grace",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "30 Clean & Jerks for time (135/95 lbs)",
  },
  {
    id: "isabel",
    name: "Isabel",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "30 Snatches for time (135/95 lbs)",
  },
  {
    id: "cindy",
    name: "Cindy",
    category: "Benchmark",
    type: "AMRAP",
    scoreType: "rounds_reps",
    description: "20 min AMRAP:\n5 Pull-ups\n10 Push-ups\n15 Air Squats",
  },
  {
    id: "helen",
    name: "Helen",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "3 Rounds For Time:\n400m Run\n21 KB Swings (1.5/1 pood)\n12 Pull-ups",
  },
  {
    id: "annie",
    name: "Annie",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "50-40-30-20-10\nDouble-unders\nSit-ups",
  },
  {
    id: "diane",
    name: "Diane",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "21-15-9\nDeadlifts (225/155 lbs)\nHandstand Push-ups",
  },
  {
    id: "elizabeth",
    name: "Elizabeth",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "21-15-9\nCleans (135/95 lbs)\nRing Dips",
  },
  {
    id: "jackie",
    name: "Jackie",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n1,000m Row\n50 Thrusters (45/35 lbs)\n30 Pull-ups",
  },
  {
    id: "karen",
    name: "Karen",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "150 Wall Balls for time (20/14 lbs, 10/9 ft)",
  },
  {
    id: "nancy",
    name: "Nancy",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "5 Rounds For Time:\n400m Run\n15 Overhead Squats (95/65 lbs)",
  },
  {
    id: "mary",
    name: "Mary",
    category: "Benchmark",
    type: "AMRAP",
    scoreType: "rounds_reps",
    description:
      "20 min AMRAP:\n5 Handstand Push-ups\n10 Pistols\n15 Pull-ups",
  },
  {
    id: "chelsea",
    name: "Chelsea",
    category: "Benchmark",
    type: "EMOM",
    scoreType: "rounds_reps",
    description:
      "EMOM 30 min:\n5 Pull-ups\n10 Push-ups\n15 Air Squats\n(Score = rounds completed)",
  },
  {
    id: "amanda",
    name: "Amanda",
    category: "Benchmark",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "9-7-5\nMuscle-ups\nSnatches (135/95 lbs)",
  },

  // ---------------------------------------------------------------------
  // Hero WODs
  // ---------------------------------------------------------------------
  {
    id: "murph",
    name: "Murph",
    category: "Hero",
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n1 mile Run\n100 Pull-ups\n200 Push-ups\n300 Air Squats\n1 mile Run\n(Partition as needed, vest optional)",
  },
  {
    id: "dt",
    name: "DT",
    category: "Hero",
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "5 Rounds For Time:\n12 Deadlifts (155/105 lbs)\n9 Hang Power Cleans\n6 Push Jerks",
  },
  {
    id: "the_seven",
    name: "The Seven",
    category: "Hero",
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "7 Rounds For Time:\n7 Handstand Push-ups\n7 Thrusters (135/95 lbs)\n7 Knees-to-Elbows\n7 Deadlifts (245/165 lbs)\n7 Burpees\n7 KB Swings (2/1.5 pood)\n7 Pull-ups",
  },
  {
    id: "chad",
    name: "Chad",
    category: "Hero",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "1,000 Box Step-ups for time (20 in, 45/35 lb ruck)",
  },
  {
    id: "kalsu",
    name: "Kalsu",
    category: "Hero",
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n100 Thrusters (135/95 lbs)\n5 Burpees at the top of every minute",
  },
  {
    id: "jt",
    name: "JT",
    category: "Hero",
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "21-15-9\nHandstand Push-ups\nRing Dips\nPush-ups",
  },
  {
    id: "michael",
    name: "Michael",
    category: "Hero",
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "3 Rounds For Time:\n800m Run\n50 Back Extensions\n50 Sit-ups",
  },

  // ---------------------------------------------------------------------
  // Lifts & strength
  // ---------------------------------------------------------------------
  {
    id: "back_squat",
    name: "Back Squat",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },
  {
    id: "front_squat",
    name: "Front Squat",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },
  {
    id: "overhead_squat",
    name: "Overhead Squat",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },
  {
    id: "deadlift",
    name: "Deadlift",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },
  {
    id: "strict_press",
    name: "Strict Press",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },
  {
    id: "push_press",
    name: "Push Press",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },
  {
    id: "bench_press",
    name: "Bench Press",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },
  {
    id: "clean_and_jerk",
    name: "Clean & Jerk",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max Olympic Lift",
  },
  {
    id: "power_clean",
    name: "Power Clean",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },
  {
    id: "snatch",
    name: "Snatch",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max Olympic Lift",
  },
  {
    id: "power_snatch",
    name: "Power Snatch",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },
  {
    id: "thruster",
    name: "Thruster",
    category: "Lift",
    type: "Strength",
    scoreType: "weight",
    description: "1-Rep Max or Working Set",
  },

  // ---------------------------------------------------------------------
  // Running & Hyrox
  // ---------------------------------------------------------------------
  {
    id: "run_400m",
    name: "400m Run",
    category: "Run",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "400 meter time trial",
  },
  {
    id: "run_1k",
    name: "1km Run",
    category: "Run",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "1,000 meter time trial",
  },
  {
    id: "run_5k",
    name: "5km Run",
    category: "Run",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "5,000 meter time trial",
  },
  {
    id: "run_10k",
    name: "10km Run",
    category: "Run",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "10,000 meter time trial",
  },
  {
    id: "half_marathon",
    name: "Half Marathon",
    category: "Run",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "21.1 km time trial",
  },
  {
    id: "row_500m",
    name: "500m Row",
    category: "Run",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "500 meter row time trial",
  },
  {
    id: "row_2k",
    name: "2km Row",
    category: "Run",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "2,000 meter row time trial",
  },
  {
    id: "ski_1k",
    name: "1km SkiErg",
    category: "Run",
    type: "ForTime",
    scoreType: "time_seconds",
    description: "1,000 meter SkiErg time trial",
  },
  {
    id: "hyrox_sim",
    name: "Hyrox Full Sim",
    category: "Run",
    type: "Hyrox",
    scoreType: "time_seconds",
    description:
      "8 x 1km Run + 8 Hyrox Stations (Sled Push, Sled Pull, Burpee Broad Jump, Rowing, Farmers Carry, Sandbag Lunges, SkiErg, Wall Balls)",
  },
  {
    id: "hyrox_half_sim",
    name: "Hyrox Half Sim",
    category: "Run",
    type: "Hyrox",
    scoreType: "time_seconds",
    description: "4 x 1km Run + 4 Hyrox Stations",
  },
  {
    id: "hyrox_sled_push",
    name: "Hyrox Sled Push",
    category: "Run",
    type: "Hyrox",
    scoreType: "time_seconds",
    description: "50m Sled Push (152/102 kg)",
  },
  {
    id: "hyrox_sled_pull",
    name: "Hyrox Sled Pull",
    category: "Run",
    type: "Hyrox",
    scoreType: "time_seconds",
    description: "50m Sled Pull (103/78 kg)",
  },
  {
    id: "hyrox_burpee_broad_jump",
    name: "Hyrox Burpee Broad Jump",
    category: "Run",
    type: "Hyrox",
    scoreType: "time_seconds",
    description: "80m Burpee Broad Jump",
  },
  {
    id: "hyrox_farmers_carry",
    name: "Hyrox Farmers Carry",
    category: "Run",
    type: "Hyrox",
    scoreType: "time_seconds",
    description: "200m Farmers Carry (2 x 24/16 kg)",
  },
  {
    id: "hyrox_sandbag_lunges",
    name: "Hyrox Sandbag Lunges",
    category: "Run",
    type: "Hyrox",
    scoreType: "time_seconds",
    description: "100m Sandbag Lunges (30/20 kg)",
  },
  {
    id: "hyrox_wall_balls",
    name: "Hyrox Wall Balls",
    category: "Run",
    type: "Hyrox",
    scoreType: "time_seconds",
    description: "100 Wall Balls (9/6 kg, 10/9 ft)",
  },
];

/** Lookup by id, for resolving `linkedBenchmarkId` on a stored workout. */
export const BENCHMARKS_BY_ID: Readonly<Record<string, Benchmark>> =
  Object.fromEntries(BENCHMARK_SEED_DATA.map((b) => [b.id, b]));

export function getBenchmark(id: string | null | undefined) {
  return id ? BENCHMARKS_BY_ID[id] : undefined;
}

/** Tab order on the performance page. */
export const CATEGORY_TABS: readonly {
  value: BenchmarkCategory;
  label: string;
}[] = [
  { value: "Lift", label: "Lifts" },
  { value: "Benchmark", label: "Benchmarks" },
  { value: "Hero", label: "Hero WODs" },
  { value: "Run", label: "Cardio / Hyrox" },
];

export const WORKOUT_TYPE_OPTIONS = [
  { value: "ForTime", label: "For Time" },
  { value: "AMRAP", label: "AMRAP" },
  { value: "EMOM", label: "EMOM" },
  { value: "Strength", label: "Strength" },
  { value: "Hyrox", label: "Hyrox" },
  { value: "Custom", label: "Custom" },
] as const;

export const SCORE_TYPE_OPTIONS = [
  { value: "time_seconds", label: "Time" },
  { value: "rounds_reps", label: "Rounds + Reps" },
  { value: "reps", label: "Total Reps" },
  { value: "weight", label: "Weight" },
  { value: "pass_fail", label: "Completed / DNF" },
] as const;
