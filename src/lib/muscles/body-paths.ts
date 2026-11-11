/**
 * Front and back body outlines for the muscle map, as SVG path data.
 *
 * Drawn for this app — a deliberately simple, stylised figure — on a 200 × 400
 * canvas per view. Only the figure's left half (x ≤ 100) is written; the view
 * mirrors it about x = 100, so the two sides cannot drift apart.
 *
 * `centre` shapes straddle the midline and are drawn once, unmirrored.
 */

import type { Muscle } from "./catalog";

export interface BodyShape {
  d: string;
  /** Absent for the parts that are never coloured: head, hands, knees, feet. */
  muscle?: Muscle;
}

export interface BodyView {
  /** Mirrored about x = 100. */
  sided: readonly BodyShape[];
  /** Drawn once. */
  centre: readonly BodyShape[];
}

export const BODY_VIEWBOX = "0 0 200 400";

const HEAD = "M100 9 C110 9 117 18 117 30 C117 42 110 51 100 51 C90 51 83 42 83 30 C83 18 90 9 100 9 Z";
const NECK = "M92 48 L108 48 L109 60 L91 60 Z";
const HAND = "M40 200 C45 200 48 206 48 213 C48 220 44 224 40 224 C36 224 33 219 33 212 C33 205 36 200 40 200 Z";
const KNEE = "M70 276 C74 273 84 273 88 276 C89 282 87 288 84 290 C78 291 73 290 71 288 C69 284 69 280 70 276 Z";
const FOOT = "M70 380 C70 375 76 372 82 373 C88 374 90 380 89 385 C88 389 82 390 76 389 C72 388 70 385 70 380 Z";

// Arm and leg segments share their outline front and back; only the muscle
// they stand for changes.
const UPPER_ARM =
  "M53 98 C49 110 48 124 50 138 C54 141 59 140 62 136 C64 124 65 110 64 96 C60 99 56 100 53 98 Z";
const FOREARM =
  "M49 142 C44 158 40 176 38 198 C41 201 45 201 47 199 C51 180 57 162 61 141 C57 144 53 144 49 142 Z";
const DELT =
  "M71 67 C59 69 53 79 53 94 C57 97 62 96 65 92 C66 82 70 75 78 70 Z";
const LOWER_LEG =
  "M71 293 C66 312 66 336 70 360 C73 367 80 368 83 363 C86 340 88 314 87 293 C82 296 76 296 71 293 Z";

export const BODY_FRONT: BodyView = {
  centre: [
    { d: HEAD },
    { d: NECK },
    // Groin: the gap between the abs and the inner thighs.
    { d: "M76 176 L124 176 L112 198 L100 204 L88 198 Z" },
  ],
  sided: [
    { d: HAND },
    { d: KNEE },
    { d: FOOT },
    { d: "M90 58 C86 62 80 65 73 67 L91 66 Z", muscle: "traps" },
    { d: DELT, muscle: "front_delts" },
    {
      d: "M98 70 L81 70 C73 76 68 86 68 100 C76 108 90 110 98 104 Z",
      muscle: "chest",
    },
    { d: UPPER_ARM, muscle: "biceps" },
    { d: FOREARM, muscle: "forearms" },
    { d: "M98 108 C94 111 89 112 85 112 L85 168 C89 172 94 174 98 175 Z", muscle: "abs" },
    {
      d: "M82 112 C76 112 71 110 69 105 C68 120 70 140 73 156 C75 165 79 170 82 171 Z",
      muscle: "obliques",
    },
    {
      d: "M73 179 C65 200 63 230 66 260 C68 269 75 272 81 271 C88 268 90 254 90 238 C90 222 89 207 87 197 Z",
      muscle: "quads",
    },
    {
      d: "M91 201 C91 220 92 238 94 256 C97 246 98.5 228 98.5 206 Z",
      muscle: "adductors",
    },
    { d: LOWER_LEG, muscle: "calves" },
  ],
};

export const BODY_BACK: BodyView = {
  centre: [{ d: HEAD }, { d: NECK }],
  sided: [
    { d: HAND },
    { d: KNEE },
    { d: FOOT },
    {
      d: "M91 54 C88 61 81 65 72 68 C81 75 88 88 92 104 L100 112 L100 54 Z",
      muscle: "traps",
    },
    { d: DELT, muscle: "rear_delts" },
    {
      d: "M70 71 C66 80 67 92 73 100 L89 102 C86 88 80 77 70 71 Z",
      muscle: "upper_back",
    },
    {
      d: "M73 104 C70 118 72 136 80 152 C86 156 92 154 97 150 L97 120 L90 105 Z",
      muscle: "lats",
    },
    { d: UPPER_ARM, muscle: "triceps" },
    { d: FOREARM, muscle: "forearms" },
    { d: "M83 157 L100 154 L100 177 L81 178 Z", muscle: "lower_back" },
    {
      d: "M100 181 L80 181 C70 187 68 202 72 214 C80 222 92 222 100 216 Z",
      muscle: "glutes",
    },
    {
      d: "M72 219 C68 236 68 254 71 270 C77 273 85 273 91 270 C93 254 95 238 97 223 C88 225 80 223 72 219 Z",
      muscle: "hamstrings",
    },
    { d: LOWER_LEG, muscle: "calves" },
  ],
};
