"use client";

import { useMemo, useState } from "react";
import { TrophyIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  BARS,
  COLLAR,
  PLATES,
  buildWarmupLadder,
  loadBar,
  roundToLoadable,
  type BarbellSetup,
  type LoadedBar,
} from "@/lib/barbell";
import { PERCENTAGE_STEPS, percentageOfMax } from "@/lib/percentages";
import { kgToLb, lbToKg, weightUnit } from "@/lib/units";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { useRecordMap } from "@/lib/hooks/use-prs";
import { BENCHMARK_SEED_DATA } from "@/constants/seedData";
import type { UnitSystem } from "@/lib/types";
import { NumberBox } from "@/components/number-box";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const CUSTOM_BAR = "custom";

/**
 * Which plates to hang on the bar for a given total.
 *
 * Works natively in whichever unit is selected rather than converting: a rack
 * holds 45 lb plates or 25 kg plates, never both, so the plate set follows the
 * unit toggle. See lib/barbell.ts for why that breaks the app's usual
 * store-in-kilograms rule.
 */
export function BarbellLoader() {
  const profileUnit = useUnitSystem();
  // Derived rather than seeded: the profile resolves *after* first paint, so a
  // `useState(profileUnit)` would strand an imperial athlete on kilograms. Once
  // the toggle is touched, that choice wins for the rest of the visit.
  const [chosenUnit, setChosenUnit] = useState<UnitSystem | null>(null);
  const unit = chosenUnit ?? profileUnit;
  const [barId, setBarId] = useState("mens");
  const [customBar, setCustomBar] = useState("");
  const [collars, setCollars] = useState(false);
  const [target, setTarget] = useState("");

  const bars = BARS[unit];
  const suffix = weightUnit(unit);

  const bar =
    barId === CUSTOM_BAR
      ? Number(customBar)
      : (bars.find((option) => option.id === barId)?.weight ?? bars[0].weight);

  const setup: BarbellSetup = useMemo(
    () => ({
      bar: Number.isFinite(bar) ? bar : 0,
      plates: PLATES[unit],
      collar: collars ? COLLAR[unit] : 0,
    }),
    [bar, unit, collars],
  );

  const targetValue = Number(target);
  const hasTarget = target !== "" && Number.isFinite(targetValue) && targetValue > 0;

  const loaded = hasTarget ? loadBar(targetValue, setup) : null;
  const ladder = hasTarget ? buildWarmupLadder(targetValue, setup) : [];

  /**
   * Switching units carries the weight across rather than clearing it, but a
   * straight conversion lands on 220.46 lb — a number no rack can make. Snapping
   * to the new unit's grid gives 220, which is what the athlete would have
   * picked anyway.
   */
  function switchUnit(next: UnitSystem) {
    if (next === unit) return;

    if (hasTarget) {
      const converted = next === "imperial" ? kgToLb(targetValue) : lbToKg(targetValue);
      const nextBars = BARS[next];
      const nextBar =
        barId === CUSTOM_BAR
          ? next === "imperial"
            ? kgToLb(Number(customBar))
            : lbToKg(Number(customBar))
          : (nextBars.find((option) => option.id === barId)?.weight ??
            nextBars[0].weight);

      setTarget(
        String(
          roundToLoadable(converted, {
            bar: nextBar,
            plates: PLATES[next],
            collar: collars ? COLLAR[next] : 0,
          }),
        ),
      );
    }

    if (barId === CUSTOM_BAR && customBar !== "") {
      const converted =
        next === "imperial" ? kgToLb(Number(customBar)) : lbToKg(Number(customBar));
      setCustomBar(String(Math.round(converted * 100) / 100));
    }

    setChosenUnit(next);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Unit</Label>
        <ToggleGroup
          type="single"
          value={unit}
          onValueChange={(value) => {
            if (value) switchUnit(value as UnitSystem);
          }}
        >
          <ToggleGroupItem value="metric">kg</ToggleGroupItem>
          <ToggleGroupItem value="imperial">lbs</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-2">
        {/* A Select rather than a toggle row: four options with their weights
            do not fit across a phone, and the bar is picked once per session
            where the unit and the target are fiddled with constantly. */}
        <Label htmlFor="bar">Bar</Label>
        <Select value={barId} onValueChange={setBarId}>
          <SelectTrigger id="bar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bars.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label} · {option.weight} {suffix}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_BAR}>Custom</SelectItem>
          </SelectContent>
        </Select>

        {barId === CUSTOM_BAR && (
          <NumberBox
            id="bar-weight"
            label={`Bar weight (${suffix})`}
            value={customBar}
            onValueChange={setCustomBar}
            decimal
            placeholder="0"
          />
        )}
      </div>

      {/* Competition collars are heavy enough to change the plates — 5 kg of the
          total between them — so they belong here rather than in a footnote. */}
      <label
        htmlFor="collars"
        className="border-border bg-input/40 hover:bg-elevated flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors"
      >
        <span>
          <span className="font-semibold">Collars</span>
          <span className="text-muted-foreground mt-0.5 block text-xs">
            Competition clamps, {COLLAR[unit]} {suffix} each
          </span>
        </span>
        <Switch id="collars" checked={collars} onCheckedChange={setCollars} />
      </label>

      <div className="space-y-2">
        <NumberBox
          id="target-weight"
          label={`Target (${suffix})`}
          value={target}
          onValueChange={setTarget}
          decimal
          placeholder="0"
        />
        <PrPrefill unit={unit} onPick={(weight) => setTarget(String(weight))} />
      </div>

      {loaded && (
        <>
          <LoadResult loaded={loaded} unit={unit} />
          {ladder.length > 1 && <WarmupLadder ladder={ladder} unit={unit} />}
        </>
      )}
    </div>
  );
}

/**
 * Fills the target from a percentage of a logged best.
 *
 * The percentage table already answers "what is 80% of my squat?" and then
 * leaves the athlete to load it; this closes that loop without retyping the
 * number. Records are stored in kilograms, so this is the one place the
 * kilogram world crosses into the loader's chosen unit.
 */
function PrPrefill({
  unit,
  onPick,
}: {
  unit: UnitSystem;
  onPick: (weight: number) => void;
}) {
  const { map: records } = useRecordMap();
  const [movementId, setMovementId] = useState("");
  const [percent, setPercent] = useState("100");

  // Only loads divide into percentages — a benchmark time does not.
  const lifts = useMemo(
    () =>
      BENCHMARK_SEED_DATA.filter((benchmark) => {
        const record = records.get(benchmark.id);
        return record !== undefined && record.scoreType === "weight";
      }),
    [records],
  );

  if (lifts.length === 0) return null;

  const record = records.get(movementId);

  function apply(nextMovementId: string, nextPercent: string) {
    const picked = records.get(nextMovementId);
    if (!picked) return;

    const kg = percentageOfMax(picked.bestValue, Number(nextPercent));
    const value = unit === "metric" ? kg : kgToLb(kg);
    onPick(Math.round(value * 100) / 100);
  }

  return (
    <div className="border-border/70 bg-elevated/40 space-y-2 rounded-xl border p-3">
      <span className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase">
        <TrophyIcon className="size-3" />
        From a record
      </span>
      <div className="flex gap-2">
        <Select
          value={movementId}
          onValueChange={(value) => {
            setMovementId(value);
            apply(value, percent);
          }}
        >
          <SelectTrigger aria-label="Movement" className="flex-[2]">
            <SelectValue placeholder="Movement" />
          </SelectTrigger>
          <SelectContent>
            {lifts.map((lift) => (
              <SelectItem key={lift.id} value={lift.id}>
                {lift.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={percent}
          onValueChange={(value) => {
            setPercent(value);
            apply(movementId, value);
          }}
          disabled={record === undefined}
        >
          <SelectTrigger aria-label="Percentage" className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERCENTAGE_STEPS.map((step) => (
              <SelectItem key={step} value={String(step)}>
                {step}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** The plates for one sleeve, plus what the bar ends up weighing. */
function LoadResult({ loaded, unit }: { loaded: LoadedBar; unit: UnitSystem }) {
  const suffix = weightUnit(unit);
  const exact = loaded.short === 0;

  if (loaded.belowBar) {
    return (
      <div className="border-border bg-card/60 rounded-xl border px-4 py-5 text-center">
        <p className="text-muted-foreground text-sm">
          That is lighter than the bar on its own, which already weighs{" "}
          <span className="text-foreground font-semibold">
            {loaded.total} {suffix}
          </span>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-4",
        exact ? "border-primary/40 bg-primary/10" : "border-warning/40 bg-warning/10",
      )}
    >
      <div className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
        Per side
      </div>

      {loaded.perSide.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">
          Nothing — the bar alone is the load.
        </p>
      ) : (
        // Height tracks the denomination, so the stack reads like a loaded
        // sleeve rather than a list of numbers.
        <div className="mt-3 flex flex-wrap items-end gap-1.5">
          {loaded.perSide.flatMap(({ plate, count }) =>
            Array.from({ length: count }, (_, index) => (
              <PlateChip
                key={`${plate}-${index}`}
                plate={plate}
                heaviest={loaded.perSide[0].plate}
              />
            )),
          )}
        </div>
      )}

      <div className="border-border/50 mt-4 flex items-baseline justify-between border-t pt-3">
        <span className="text-muted-foreground text-xs">
          {exact ? "Total" : "Closest load"}
        </span>
        <span className="tabular font-display text-2xl font-extrabold">
          {loaded.total} {suffix}
        </span>
      </div>

      {!exact && (
        <p className="text-warning mt-1.5 text-xs leading-relaxed">
          {loaded.short} {suffix} short of {loaded.target} — no combination of
          plates makes that exactly, and loading light beats loading heavy.
        </p>
      )}
    </div>
  );
}

function PlateChip({ plate, heaviest }: { plate: number; heaviest: number }) {
  // 2.5rem at the lightest up to 5rem at the heaviest on the bar, so the
  // proportions stay readable whatever the load.
  const height = 2.5 + 2.5 * Math.min(1, plate / heaviest);

  return (
    <span
      className="bg-primary/20 border-primary/50 text-foreground tabular font-display flex w-11 items-center justify-center rounded-md border text-sm font-bold"
      style={{ height: `${height}rem` }}
    >
      {plate}
    </span>
  );
}

/** Loadable jumps from the empty bar up to the working set. */
function WarmupLadder({
  ladder,
  unit,
}: {
  ladder: LoadedBar[];
  unit: UnitSystem;
}) {
  const suffix = weightUnit(unit);

  return (
    <div className="border-border/70 overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Warm-up sets from the empty bar up to the target
        </caption>
        <thead className="bg-elevated text-muted-foreground">
          <tr>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase"
            >
              Warm-up
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-right text-[10px] font-bold tracking-widest uppercase"
            >
              Per side
            </th>
          </tr>
        </thead>
        <tbody>
          {ladder.map((rung, index) => {
            const working = index === ladder.length - 1;

            return (
              <tr
                key={rung.total}
                className={cn("border-border/50 border-t", working && "bg-primary/5")}
              >
                <td
                  className={cn(
                    "tabular px-4 py-2.5 font-semibold",
                    working && "text-primary",
                  )}
                >
                  {rung.total} {suffix}
                </td>
                <td className="text-muted-foreground tabular px-4 py-2.5 text-right">
                  {rung.perSide.length === 0
                    ? "bar only"
                    : rung.perSide
                        .flatMap(({ plate, count }) =>
                          Array.from({ length: count }, () => plate),
                        )
                        .join(" + ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
