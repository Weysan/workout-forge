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
    id: "hyrox_doubles",
    name: "Hyrox Doubles",
    category: "Run",
    type: "Hyrox",
    scoreType: "time_seconds",
    description:
      "Team of 2 — both partners run every kilometre, station work split freely between them.\n\n8 x 1km Run + 8 Stations:\n1,000m SkiErg\n50m Sled Push (152/102 kg)\n50m Sled Pull (103/78 kg)\n80m Burpee Broad Jump\n1,000m Row\n200m Farmers Carry (2 x 24/16 kg)\n100m Sandbag Lunges (30/20 kg)\n100 Wall Balls (6/4 kg, 3.0/2.7 m)\n\nLoads are not halved — a Doubles team lifts the same as the matching singles division. Score is the team time.",
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

  // ---------------------------------------------------------------------
  // CrossFit Open — one entry per released workout, 2022-2026.
  //
  // Scored the way the Open scores them: an AMRAP is `reps` (the official
  // score is total reps, not rounds + partial), a capped chipper is a time.
  // ---------------------------------------------------------------------
  {
    id: "open_22_1",
    name: "Open 22.1",
    category: "Open",
    season: 2022,
    type: "AMRAP",
    scoreType: "reps",
    description:
      "15 min AMRAP:\n3 Wall Walks\n12 Dumbbell Snatches (50/35 lbs)\n15 Box Jump-Overs (24/20 in)",
  },
  {
    id: "open_22_2",
    name: "Open 22.2",
    category: "Open",
    season: 2022,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "1-2-3-4-5-6-7-8-9-10-9-8-7-6-5-4-3-2-1 reps For Time:\nDeadlifts (225/155 lbs)\nBar-Facing Burpees\n(10 min cap)",
  },
  {
    id: "open_22_3",
    name: "Open 22.3",
    category: "Open",
    season: 2022,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n21 Pull-ups\n42 Double-unders\n21 Thrusters (95/65 lbs)\n18 Chest-to-Bar Pull-ups\n36 Double-unders\n18 Thrusters (115/75 lbs)\n15 Bar Muscle-ups\n30 Double-unders\n15 Thrusters (135/85 lbs)\n(12 min cap)",
  },
  {
    id: "open_23_1",
    name: "Open 23.1",
    category: "Open",
    season: 2023,
    type: "AMRAP",
    scoreType: "reps",
    description:
      "14 min AMRAP:\n60 cal Row\n50 Toes-to-Bar\n40 Wall Balls (20/14 lbs, 10/9 ft)\n30 Cleans (135/95 lbs)\n20 Muscle-ups\n(A repeat of 14.4)",
  },
  {
    id: "open_23_2a",
    name: "Open 23.2A",
    category: "Open",
    season: 2023,
    type: "AMRAP",
    scoreType: "reps",
    description:
      "15 min AMRAP:\n5 Burpee Pull-ups\n10 Shuttle Runs (1 rep = 25 ft out / 25 ft back)\n(Add 5 burpee pull-ups each round; shuttle runs stay at 10)",
  },
  {
    id: "open_23_2b",
    name: "Open 23.2B",
    category: "Open",
    season: 2023,
    type: "Strength",
    scoreType: "weight",
    description:
      "Immediately following 23.2A:\n5 min to establish a 1-Rep-Max Thruster (from the floor)",
  },
  {
    id: "open_23_3",
    name: "Open 23.3",
    category: "Open",
    season: 2023,
    type: "ForTime",
    scoreType: "reps",
    description:
      "Starting with a 6 min time cap:\n5 Wall Walks\n50 Double-unders\n15 Snatches (95/65 lbs)\n5 Wall Walks\n50 Double-unders\n12 Snatches (135/95 lbs)\n\nIf completed before 6:00, add 3 min:\n20 Strict Handstand Push-ups\n50 Double-unders\n9 Snatches (185/125 lbs)\n\nIf completed before 9:00, add 3 min:\n20 Strict Deficit Handstand Push-ups\n50 Double-unders\n6 Snatches (225/155 lbs)",
  },
  {
    id: "open_24_1",
    name: "Open 24.1",
    category: "Open",
    season: 2024,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "21-15-9 For Time:\nDumbbell Snatches, arm 1 (50/35 lbs)\nLateral Burpees Over Dumbbell\nDumbbell Snatches, arm 2\nLateral Burpees Over Dumbbell\n(15 min cap)",
  },
  {
    id: "open_24_2",
    name: "Open 24.2",
    category: "Open",
    season: 2024,
    type: "AMRAP",
    scoreType: "reps",
    description:
      "20 min AMRAP:\n300m Row\n10 Deadlifts (185/125 lbs)\n50 Double-unders",
  },
  {
    id: "open_24_3",
    name: "Open 24.3",
    category: "Open",
    season: 2024,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n5 Rounds of:\n  10 Thrusters (95/65 lbs)\n  10 Chest-to-Bar Pull-ups\nRest 1 min (the clock does not stop)\n5 Rounds of:\n  7 Thrusters (135/95 lbs)\n  7 Bar Muscle-ups\n(15 min cap)",
  },
  {
    id: "open_25_1",
    name: "Open 25.1",
    category: "Open",
    season: 2025,
    type: "AMRAP",
    scoreType: "reps",
    description:
      "15 min AMRAP:\n3 Lateral Burpees Over the Dumbbell\n3 Dumbbell Hang Clean-to-Overheads (50/35 lbs)\n30 ft Walking Lunge (2 x 15 ft)\n(Add 3 reps to the burpees and hang clean-to-overheads each round; the lunge stays at 30 ft)",
  },
  {
    id: "open_25_2",
    name: "Open 25.2",
    category: "Open",
    season: 2025,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n21 Pull-ups\n42 Double-unders\n21 Thrusters (95/65 lbs)\n18 Chest-to-Bar Pull-ups\n36 Double-unders\n18 Thrusters (115/75 lbs)\n15 Bar Muscle-ups\n30 Double-unders\n15 Thrusters (135/85 lbs)\n(12 min cap — a repeat of 22.3)",
  },
  {
    id: "open_25_3",
    name: "Open 25.3",
    category: "Open",
    season: 2025,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n5 Wall Walks\n50 cal Row\n5 Wall Walks\n25 Deadlifts (225/155 lbs)\n5 Wall Walks\n25 Cleans (135/85 lbs)\n5 Wall Walks\n25 Snatches (95/65 lbs)\n5 Wall Walks\n50 cal Row\n(20 min cap)",
  },
  {
    id: "open_26_1",
    name: "Open 26.1",
    category: "Open",
    season: 2026,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n20 Wall Balls\n18 Box Jump-Overs\n30 Wall Balls\n18 Box Jump-Overs\n40 Wall Balls\n18 Med-Ball Box Step-Overs\n66 Wall Balls\n18 Med-Ball Box Step-Overs\n40 Wall Balls\n18 Box Jump-Overs\n30 Wall Balls\n18 Box Jump-Overs\n20 Wall Balls\n(20/14 lb ball, 10/9 ft target, 24/20 in box — 12 min cap)",
  },
  {
    id: "open_26_2",
    name: "Open 26.2",
    category: "Open",
    season: 2026,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n80 ft Dumbbell Overhead Walking Lunge\n20 Alternating Dumbbell Snatches\n20 Pull-ups\n80 ft Dumbbell Overhead Walking Lunge\n20 Alternating Dumbbell Snatches\n20 Chest-to-Bar Pull-ups\n80 ft Dumbbell Overhead Walking Lunge\n20 Alternating Dumbbell Snatches\n20 Ring Muscle-ups\n(50/35 lb dumbbell — 15 min cap)",
  },
  {
    id: "open_26_3",
    name: "Open 26.3",
    category: "Open",
    season: 2026,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "6 Rounds For Time:\n12 Burpees Over the Bar\n12 Cleans\n12 Burpees Over the Bar\n12 Thrusters\n(Load climbs every 2 rounds: 95/115/135 lbs, ♀ 65/75/85 lbs — 16 min cap)",
  },

  // ---------------------------------------------------------------------
  // CrossFit Games — a curated slice per season.
  //
  // Only events a normal gym can actually run: nothing here needs a Pig, a
  // Snail, a yoke, a swim, a bike course or a pegboard.
  // ---------------------------------------------------------------------
  {
    id: "games_22_jackie_pro",
    name: "Jackie Pro",
    category: "Games",
    season: 2022,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n1,000m Row\n50 Thrusters (95/65 lbs)\n30 Bar Muscle-ups\n(10 min cap ♂ / 11 min ♀ — the row must be finished under 3:15 ♂ / 3:40 ♀)",
  },
  {
    id: "games_22_echo_press",
    name: "Echo Press",
    category: "Games",
    season: 2022,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n30/25 cal Echo Bike\n10 Deficit Handstand Push-ups\n20/15 cal Echo Bike\n10 Deficit Handstand Push-ups\n20/15 cal Echo Bike\n10 Deficit Handstand Push-ups\n30/25 cal Echo Bike\n(3.5 in deficit ♂ / 2 in ♀ — 10 min cap ♂ / 12 min ♀)",
  },
  {
    id: "games_22_elizabeth_elevated",
    name: "Elizabeth Elevated",
    category: "Games",
    season: 2022,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "21-15-9-9-9 For Time:\nSquat Cleans (135/95 lbs)\nDips\n(Each round's dips are split into 3 unbroken sets, each preceded by a parallel-bar traverse — 10 min cap ♂ / 12 min ♀)",
  },
  {
    id: "games_23_helena",
    name: "Helena",
    category: "Games",
    season: 2023,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "3 Rounds For Time:\n400m Run\n12 Bar Muscle-ups\n21 Dumbbell Snatches (50/35 lbs)\n(11 min cap)",
  },
  {
    id: "games_23_ski_bag",
    name: "Ski-Bag",
    category: "Games",
    season: 2023,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n30 cal SkiErg\n30 Sandbag Squats (200/125 lbs)\n20 cal SkiErg\n20 Sandbag Squats\n(6 min cap)",
  },
  {
    id: "games_23_echo_thruster_final",
    name: "Echo Thruster Final",
    category: "Games",
    season: 2023,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "21-18-15 For Time:\ncal Echo Bike\nThrusters (115/85, 135/95, 155/105 lbs)\nThen:\n66 ft Overhead Walking Lunge (155/105 lbs)\n(10 min cap)",
  },
  {
    id: "games_23_olympic_total",
    name: "Olympic Total",
    category: "Games",
    season: 2023,
    type: "Strength",
    scoreType: "weight",
    description:
      "For Load:\n1-Rep-Max Snatch + 1-Rep-Max Clean & Jerk\n(Two attempts at each lift; score is the combined total)",
  },
  {
    id: "games_24_dickies_triplet",
    name: "Dickies Triplet",
    category: "Games",
    season: 2024,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "5 Rounds For Time:\n175m Run\n12 Toes-to-Bar\n8 Alternating Dumbbell Snatches (100/70 lbs)\n(11 min cap)",
  },
  {
    id: "games_24_firestorm",
    name: "Firestorm",
    category: "Games",
    season: 2024,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "3 Rounds For Time:\n15/11 cal Echo Bike\n11 Burpees Over the Barricade\n(4 min cap ♂ / 5 min ♀)",
  },
  {
    id: "games_24_midline_climb",
    name: "Midline Climb",
    category: "Games",
    season: 2024,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n50 Deadlifts (225/155 lbs)\n3 Rope Climbs\n50/30 cal SkiErg\n3 Rope Climbs\n50 GHD Sit-ups\n3 Rope Climbs\n50 GHD Sit-ups\n3 Rope Climbs\n50/30 cal SkiErg\n3 Rope Climbs\n50 Deadlifts\n(20 min cap)",
  },
  {
    id: "games_25_running_isabel",
    name: "Running Isabel",
    category: "Games",
    season: 2025,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "5 Rounds For Time:\n200 ft Run\n6 Snatches (155/105 lbs)",
  },
  {
    id: "games_25_all_crossed_up",
    name: "All Crossed Up",
    category: "Games",
    season: 2025,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n20 Wall Walks\n10 Dumbbell Shoulder-to-Overheads\n20 Double-under Crossovers\n30 Toes-to-Bar\n20 Double-under Crossovers\n10 Dumbbell Shoulder-to-Overheads\n20 Double-under Crossovers\n30 Toes-to-Bar\n20 Double-under Crossovers\n10 Dumbbell Shoulder-to-Overheads\n(100/70 lb dumbbell — 10 min cap)",
  },
  {
    id: "games_25_atlas",
    name: "Atlas",
    category: "Games",
    season: 2025,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "9-15-21 For Time:\nThrusters (135/95 lbs)\nRope Climbs (3-5-7)\nThen:\n100 ft Overhead Walking Lunge",
  },
  {
    id: "games_25_throttle_up",
    name: "Throttle Up",
    category: "Games",
    season: 2025,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time, wearing a vest (22/16 lbs):\n35 cal SkiErg\n28 Chest-to-Bar Pull-ups\n24 Burpee Box Jump-Overs (24/20 in)",
  },
  {
    id: "games_26_2007_hopper",
    name: "2007 Hopper",
    category: "Games",
    season: 2026,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "For Time:\n1,000m Row\nThen 5 Rounds of:\n  25 Pull-ups\n  7 Push Jerks (135/85 lbs)",
  },
  {
    id: "games_26_hopper_2026",
    name: "The Hopper 2026",
    category: "Games",
    season: 2026,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "3 Rounds For Time:\n21 Toes-to-Bar\n7 unbroken Power Snatches (95/65 lbs)\n7 unbroken Hang Snatches\n7 unbroken Squat Snatches",
  },
  {
    id: "games_26_run_hang_squat_clean",
    name: "Run Hang Squat Clean",
    category: "Games",
    season: 2026,
    type: "ForTime",
    scoreType: "time_seconds",
    description:
      "4 Rounds For Time:\n660m Run\n10 Hang Squat Cleans (225/155 lbs)",
  },
  {
    id: "games_26_crossfit_total",
    name: "The CrossFit Total",
    category: "Games",
    season: 2026,
    type: "Strength",
    scoreType: "weight",
    description:
      "For Load:\n1-Rep-Max Back Squat\n1-Rep-Max Shoulder Press\n1-Rep-Max Deadlift\n(Score is the combined total of the three lifts)",
  },
];

/** Lookup by id, for resolving `linkedBenchmarkId` on a stored workout. */
export const BENCHMARKS_BY_ID: Readonly<Record<string, Benchmark>> =
  Object.fromEntries(BENCHMARK_SEED_DATA.map((b) => [b.id, b]));

export function getBenchmark(id: string | null | undefined) {
  return id ? BENCHMARKS_BY_ID[id] : undefined;
}

/**
 * Every category, in display order, with its label.
 *
 * Drives the grouping in the benchmark picker, where a flat list of all six
 * groups is what you want — you are searching for one workout by name.
 * The performance page uses `PERFORMANCE_TABS` instead, which folds Open and
 * Games behind a season browser rather than giving each its own tab.
 */
export const CATEGORY_TABS: readonly {
  value: BenchmarkCategory;
  label: string;
}[] = [
  { value: "Lift", label: "Lifts" },
  { value: "Benchmark", label: "Benchmarks" },
  { value: "Hero", label: "Hero WODs" },
  { value: "Run", label: "Cardio / Hyrox" },
  { value: "Open", label: "Open" },
  { value: "Games", label: "Games" },
];

/**
 * The two categories that belong to a competition season.
 *
 * They are browsed by year rather than as flat lists: "the 2025 Open" is how an
 * athlete thinks about them, and five years of Open and Games in one scroll is
 * a wall of near-identical names.
 */
export const SEASON_STAGES = [
  { value: "Open", label: "Open" },
  { value: "Games", label: "Games" },
] as const;

export type SeasonStage = (typeof SEASON_STAGES)[number]["value"];

/**
 * The pseudo-category standing in for the season browser on the performance
 * page. Not a `BenchmarkCategory` — no benchmark is ever filed under it.
 */
export const SEASON_TAB = "Season";

export type PerformanceTab = BenchmarkCategory | typeof SEASON_TAB;

/** Tab order on the performance page. */
export const PERFORMANCE_TABS: readonly {
  value: PerformanceTab;
  label: string;
}[] = [
  { value: "Lift", label: "Lifts" },
  { value: "Benchmark", label: "Benchmarks" },
  { value: "Hero", label: "Hero WODs" },
  { value: "Run", label: "Cardio / Hyrox" },
  { value: SEASON_TAB, label: "Season" },
];

/**
 * Seasons present in the library, newest first — derived rather than written
 * down, so adding next year's Open is a one-place change.
 */
export const SEASONS: readonly number[] = [
  ...new Set(
    BENCHMARK_SEED_DATA.flatMap((b) => (b.season === undefined ? [] : [b.season])),
  ),
].sort((a, b) => b - a);

export const WORKOUT_TYPE_OPTIONS = [
  { value: "ForTime", label: "For Time" },
  { value: "AMRAP", label: "AMRAP" },
  { value: "EMOM", label: "EMOM" },
  { value: "Strength", label: "Strength" },
  { value: "Hyrox", label: "Hyrox" },
  { value: "Run", label: "Run / Row / Ride" },
  { value: "Custom", label: "Custom" },
] as const;

/**
 * The label for a stored `WorkoutType`.
 *
 * Falls back to the stored value, which is readable enough ("Hyrox") and is what
 * a document written by a future version would carry.
 */
export function workoutTypeLabel(type: string): string {
  return WORKOUT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export const SCORE_TYPE_OPTIONS = [
  { value: "time_seconds", label: "Time" },
  { value: "rounds_reps", label: "Rounds + Reps" },
  { value: "reps", label: "Total Reps" },
  { value: "weight", label: "Weight" },
  { value: "pass_fail", label: "Completed / DNF" },
] as const;
