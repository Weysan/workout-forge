import type { UnitSystem } from "./types";

/**
 * Barbell loading.
 *
 * Turns "I need 102.5 on the bar" into "25 + 15 + 1.25 a side", which is the
 * arithmetic the percentage table (lib/percentages.ts) currently leaves to the
 * athlete standing in front of a rack.
 *
 * Unlike the rest of the app, this module is *not* kilograms in, kilograms out.
 * A 45 lb plate is not a converted 20.41 kg plate — it is a different object on
 * a different rack, and a gym stocks one set or the other. So the caller picks
 * the plate set matching the unit it is working in and everything here is plain
 * arithmetic in that unit. Nothing is stored, so the "Firestore holds metric"
 * invariant is untouched.
 *
 * Everything is computed in integer hundredths. 1.25 and 2.5 survive binary
 * floating point intact, but a user-typed target does not, and a greedy loop
 * that compares floats needs an epsilon to avoid dropping a plate it should
 * have taken. Integers make the comparison exact instead.
 */

export interface BarOption {
  id: string;
  label: string;
  /** In the unit of the set this option belongs to. */
  weight: number;
}

/**
 * The bars in a normal gym.
 *
 * Men's and women's are the competition standards. The training bar covers the
 * light aluminium/technique bars used for teaching and for rehab work.
 */
export const BARS: Record<UnitSystem, readonly BarOption[]> = {
  metric: [
    { id: "mens", label: "Men's", weight: 20 },
    { id: "womens", label: "Women's", weight: 15 },
    { id: "training", label: "Training", weight: 10 },
  ],
  imperial: [
    { id: "mens", label: "Men's", weight: 45 },
    { id: "womens", label: "Women's", weight: 35 },
    { id: "training", label: "Training", weight: 15 },
  ],
};

/**
 * Plate denominations, heaviest first — the order they go on the sleeve.
 *
 * Assumed unlimited: a commercial gym has enough of everything, and a loader
 * that refuses a load because it thinks you own two 20s is more often wrong
 * than right.
 */
export const PLATES: Record<UnitSystem, readonly number[]> = {
  metric: [25, 20, 15, 10, 5, 2.5, 1.25],
  imperial: [45, 35, 25, 10, 5, 2.5],
};

/** Weight of a single competition collar. Two are on the bar when used. */
export const COLLAR: Record<UnitSystem, number> = {
  metric: 2.5,
  imperial: 5.5,
};

/** Percentages of the target to warm up through, below the working set. */
export const WARMUP_PERCENTAGES: readonly number[] = [40, 55, 70, 85];

export interface BarbellSetup {
  /** Weight of the empty bar. */
  bar: number;
  /** Denominations available per side, heaviest first. */
  plates: readonly number[];
  /** Weight of *one* collar, or 0 when none are used. */
  collar?: number;
}

export interface PlateCount {
  plate: number;
  /** How many of this plate go on **each** side. */
  count: number;
}

export interface LoadedBar {
  /** What was asked for. */
  target: number;
  /** Plates for one side, heaviest first. */
  perSide: PlateCount[];
  /** What the bar will actually weigh: bar + both collars + every plate. */
  total: number;
  /** `target − total`. Zero when the target is exactly loadable. */
  short: number;
  /** The target does not clear the bare bar, so there is nothing to load. */
  belowBar: boolean;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

/** The smallest change you can make to a loaded bar: a pair of the lightest plate. */
export function loadableStep(plates: readonly number[]): number {
  if (plates.length === 0) return 0;
  return Math.min(...plates) * 2;
}

/**
 * The nearest weight this setup can actually produce.
 *
 * Rounds to nearest rather than down: a warm-up rung is a suggestion, and being
 * 1.25 kg over the arithmetic is not worth a longer plate stack.
 */
export function roundToLoadable(weight: number, setup: BarbellSetup): number {
  const base = cents(setup.bar) + 2 * cents(setup.collar ?? 0);
  const step = cents(loadableStep(setup.plates));

  if (step === 0 || cents(weight) <= base) return base / 100;

  const above = cents(weight) - base;
  return (base + Math.round(above / step) * step) / 100;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The fewest plates that reach the target, per side.
 *
 * Not greedy. Heaviest-first is the obvious approach and it is wrong on real
 * plate sets: 165 lb on a 45 lb bar is 60 a side, where grabbing the 45 first
 * forces 45 + 10 + 5, while 35 + 25 does it in two. So this searches properly —
 * cheaply, because the whole problem collapses onto a small grid (see below) —
 * and breaks ties towards the heavier plate, which is the one you want nearest
 * the collar anyway.
 *
 * When the target is not reachable — an odd number against a 1.25 kg smallest
 * plate — it loads as close as it can *without going over* and reports the gap.
 * Under-loading is the safe direction to be wrong in.
 */
export function loadBar(target: number, setup: BarbellSetup): LoadedBar {
  const baseCents = cents(setup.bar) + 2 * cents(setup.collar ?? 0);
  const targetCents = cents(target);

  // Plates go on in pairs, so the denominations of this problem are *double*
  // the plates, and the answer is read back as a per-side count. Working in the
  // pair weight keeps everything in whole hundredths — halving the target is
  // what would introduce a stray half-cent.
  const denominations = setup.plates
    .map((plate) => ({ plate, pair: 2 * cents(plate) }))
    .filter(({ pair }) => pair > 0)
    .sort((a, b) => b.pair - a.pair);

  const aboveBase = targetCents - baseCents;

  if (aboveBase <= 0 || denominations.length === 0) {
    return {
      target,
      perSide: [],
      total: baseCents / 100,
      short: aboveBase / 100,
      belowBar: aboveBase < 0,
    };
  }

  // Every reachable load is a multiple of the smallest step, so the search runs
  // on that grid rather than on hundredths: a 200 kg target is 72 cells wide,
  // not 18,000.
  const step = denominations.reduce((acc, { pair }) => gcd(acc, pair), 0);
  const reach = Math.floor(aboveBase / step);
  const units = denominations.map(({ pair }) => pair / step);

  // best[i] = fewest plates per side making exactly i steps; from[i] = the
  // denomination that got there. Heaviest-first iteration with a strict
  // improvement test means ties keep the heavier plate.
  const best = new Array<number>(reach + 1).fill(Infinity);
  const from = new Array<number>(reach + 1).fill(-1);
  best[0] = 0;

  for (let i = 1; i <= reach; i += 1) {
    for (let d = 0; d < units.length; d += 1) {
      const unit = units[d];
      if (unit > i) continue;
      if (best[i - unit] + 1 < best[i]) {
        best[i] = best[i - unit] + 1;
        from[i] = d;
      }
    }
  }

  const counts = new Array<number>(denominations.length).fill(0);
  for (let i = reach; i > 0; i -= units[from[i]]) {
    counts[from[i]] += 1;
  }

  const perSide = denominations
    .map(({ plate }, index) => ({ plate, count: counts[index] }))
    .filter(({ count }) => count > 0);

  const totalCents = baseCents + reach * step;

  return {
    target,
    perSide,
    total: totalCents / 100,
    short: (targetCents - totalCents) / 100,
    belowBar: false,
  };
}

/**
 * Loadable warm-up jumps from the empty bar up to the working weight.
 *
 * Percentages are of the target rather than of the load above the bar: that is
 * how programmes are written, and it is what makes the top rung 100%. Rungs that
 * land on the bar are dropped instead of repeated — a 40 kg target on a 20 kg
 * bar has nothing useful between the two.
 */
export function buildWarmupLadder(
  target: number,
  setup: BarbellSetup,
): LoadedBar[] {
  const base = cents(setup.bar) + 2 * cents(setup.collar ?? 0);
  const targetCents = cents(target);

  if (targetCents <= base) return [loadBar(base / 100, setup)];

  const weights = [base / 100];

  for (const percent of WARMUP_PERCENTAGES) {
    // Integer-first, as in percentageOfMax: `target * 0.4` is lossy where
    // `target * 40 / 100` is not.
    const rung = roundToLoadable((target * percent) / 100, setup);
    if (cents(rung) > base && cents(rung) < targetCents) weights.push(rung);
  }

  weights.push(target);

  // Rounding can collapse two percentages onto the same load — 55% and 70% of a
  // light target both reach the same plate — and repeating a set is not a rung.
  const unique = weights.filter(
    (weight, index) => index === 0 || cents(weight) !== cents(weights[index - 1]),
  );

  return unique.map((weight) => loadBar(weight, setup));
}
