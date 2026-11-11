"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn, fromDateKey, todayKey } from "@/lib/utils";
import { useWorkoutsInRange } from "@/lib/hooks/use-workouts";
import { MUSCLE_LABELS, type Muscle } from "@/lib/muscles/catalog";
import {
  BODY_BACK,
  BODY_FRONT,
  BODY_VIEWBOX,
  type BodyView,
} from "@/lib/muscles/body-paths";
import {
  fetchStartFor,
  levelColor,
  periodRange,
  stepPeriod,
  summarisePeriod,
  type MusclePeriod,
  type MuscleStat,
  type PeriodSummary,
} from "@/lib/muscles/load";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const PERIODS: { value: MusclePeriod; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

/** A muscle that did no work: visible as part of the figure, but not coloured. */
const IDLE_FILL = "color-mix(in oklab, var(--muted-foreground) 22%, transparent)";
/** Head, hands, knees, feet. */
const BODY_FILL = "color-mix(in oklab, var(--muted-foreground) 10%, transparent)";

/**
 * Which muscles the logged sessions worked, drawn on a front and back figure.
 *
 * Everything is derived on the fly from the workout text — see lib/muscles —
 * so nothing here writes, and it works offline from the cached log.
 */
export function MuscleMap() {
  const today = todayKey();
  const [period, setPeriod] = useState<MusclePeriod>("week");
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<Muscle | null>(null);

  const { start, end } = periodRange(period, anchor);
  const { data: workouts, isPending } = useWorkoutsInRange(
    fetchStartFor(period, anchor),
    end,
  );

  const summary = useMemo(
    () =>
      workouts
        ? summarisePeriod({ period, anchor, today, workouts })
        : null,
    [workouts, period, anchor, today],
  );

  const isCurrent = end >= today;
  const selectedStat = summary?.muscles.find((m) => m.muscle === selected);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-sm tracking-widest uppercase">Muscles</CardTitle>

        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(value) => {
            if (!value) return;
            setPeriod(value as MusclePeriod);
            setAnchor(today);
            setSelected(null);
          }}
          aria-label="Period"
        >
          {PERIODS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous"
            onClick={() => {
              setAnchor(stepPeriod(period, anchor, -1));
              setSelected(null);
            }}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="text-sm font-semibold tabular">
            {periodLabel(period, start, end)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next"
            disabled={isCurrent}
            onClick={() => {
              setAnchor(stepPeriod(period, anchor, 1));
              setSelected(null);
            }}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isPending || !summary ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Figure
                label="Front"
                view={BODY_FRONT}
                summary={summary}
                selected={selected}
                onSelect={setSelected}
              />
              <Figure
                label="Back"
                view={BODY_BACK}
                summary={summary}
                selected={selected}
                onSelect={setSelected}
              />
            </div>

            <Legend mode={summary.mode} />

            {summary.workouts.length === 0 ? (
              <p className="text-muted-foreground border-border/70 rounded-xl border border-dashed px-4 py-8 text-center text-sm">
                No workouts logged {period === "day" ? "on this day" : `this ${period}`}.
              </p>
            ) : (
              <>
                {selectedStat && <MuscleDetail stat={selectedStat} />}
                <Ranking
                  summary={summary}
                  selected={selected}
                  onSelect={setSelected}
                />
                <Unrecognised summary={summary} />
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function periodLabel(period: MusclePeriod, start: string, end: string): string {
  const s = fromDateKey(start);
  const e = fromDateKey(end);
  if (period === "day") return format(s, "EEE d MMM yyyy");
  if (period === "month") return format(s, "MMMM yyyy");
  return s.getMonth() === e.getMonth()
    ? `${format(s, "d")} – ${format(e, "d MMM yyyy")}`
    : `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
}

function fillFor(stat: MuscleStat | undefined): string {
  if (!stat || stat.level === null) return IDLE_FILL;
  return levelColor(stat.level);
}

function Figure({
  label,
  view,
  summary,
  selected,
  onSelect,
}: {
  label: string;
  view: BodyView;
  summary: PeriodSummary;
  selected: Muscle | null;
  onSelect: (muscle: Muscle | null) => void;
}) {
  const stats = new Map(summary.muscles.map((m) => [m.muscle, m]));

  const shapes = (mirrored: boolean) =>
    view.sided.map((shape, index) => {
      const key = `${mirrored ? "r" : "l"}${index}`;
      if (!shape.muscle) {
        return <path key={key} d={shape.d} fill={BODY_FILL} />;
      }
      const muscle = shape.muscle;
      const isSelected = selected === muscle;
      return (
        <path
          key={key}
          d={shape.d}
          fill={fillFor(stats.get(muscle))}
          stroke={isSelected ? "var(--foreground)" : "var(--card)"}
          strokeWidth={isSelected ? 2.5 : 1.5}
          className="cursor-pointer transition-[fill] duration-300"
          onClick={() => onSelect(isSelected ? null : muscle)}
        >
          <title>{MUSCLE_LABELS[muscle]}</title>
        </path>
      );
    });

  return (
    <figure className="space-y-1">
      <svg
        viewBox={BODY_VIEWBOX}
        className="mx-auto h-auto w-full max-w-[180px]"
        role="img"
        aria-label={`${label} view`}
      >
        {view.centre.map((shape, index) => (
          <path key={`c${index}`} d={shape.d} fill={BODY_FILL} />
        ))}
        <g>{shapes(false)}</g>
        <g transform="translate(200 0) scale(-1 1)">{shapes(true)}</g>
      </svg>
      <figcaption className="text-muted-foreground text-center text-[11px] tracking-widest uppercase">
        {label}
      </figcaption>
    </figure>
  );
}

function Legend({ mode }: { mode: PeriodSummary["mode"] }) {
  const stops = [0, 0.25, 0.5, 0.75, 1].map(levelColor).join(", ");
  return (
    <div className="space-y-1">
      <div
        className="h-1.5 w-full rounded-full"
        style={{ background: `linear-gradient(to right, ${stops})` }}
      />
      <div className="text-muted-foreground flex justify-between text-[11px]">
        {mode === "baseline" ? (
          <>
            <span>Less than usual</span>
            <span>Usual</span>
            <span>More than usual</span>
          </>
        ) : (
          <>
            <span>Least worked</span>
            <span>Most worked</span>
          </>
        )}
      </div>
    </div>
  );
}

function Ranking({
  summary,
  selected,
  onSelect,
}: {
  summary: PeriodSummary;
  selected: Muscle | null;
  onSelect: (muscle: Muscle | null) => void;
}) {
  const worked = summary.muscles.filter((m) => m.load > 0);
  const top = worked[0]?.share ?? 1;

  return (
    <ol className="space-y-1">
      {worked.map((stat) => {
        const ratio =
          stat.expected !== null && stat.expected > 0 ? stat.load / stat.expected : null;
        return (
          <li key={stat.muscle}>
            <button
              type="button"
              onClick={() => onSelect(selected === stat.muscle ? null : stat.muscle)}
              className={cn(
                "hover:bg-elevated flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                selected === stat.muscle && "bg-elevated",
              )}
            >
              <span className="w-24 shrink-0 truncate">{MUSCLE_LABELS[stat.muscle]}</span>
              <span className="bg-elevated h-1.5 flex-1 overflow-hidden rounded-full">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(stat.share / top) * 100}%`,
                    background: fillFor(stat),
                  }}
                />
              </span>
              <span className="text-muted-foreground w-10 shrink-0 text-right tabular">
                {Math.round(stat.share * 100)}%
              </span>
              {summary.mode === "baseline" && (
                <span className="text-muted-foreground w-12 shrink-0 text-right text-xs tabular">
                  {ratio === null ? "new" : `×${ratio.toFixed(1)}`}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function MuscleDetail({ stat }: { stat: MuscleStat }) {
  return (
    <div className="bg-elevated/60 space-y-2 rounded-xl px-3 py-2.5">
      <div className="text-sm font-semibold">{MUSCLE_LABELS[stat.muscle]}</div>
      {stat.contributors.length === 0 ? (
        <p className="text-muted-foreground text-sm">Not worked in this period.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {stat.contributors.map((c) => (
            <li key={c.workoutId} className="flex justify-between gap-3">
              <span className="truncate">
                {c.title || "Untitled"}
                <span className="text-muted-foreground ml-2 text-xs">
                  {format(fromDateKey(c.date), "EEE d MMM")}
                </span>
              </span>
              <span className="text-muted-foreground shrink-0 tabular">
                {Math.round((c.load / stat.load) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Unrecognised({ summary }: { summary: PeriodSummary }) {
  if (summary.unrecognised.length === 0) return null;
  const lines = summary.unrecognised.reduce((n, w) => n + w.lines.length, 0);

  return (
    <details className="text-muted-foreground text-xs">
      <summary className="cursor-pointer">
        {lines} {lines === 1 ? "line" : "lines"} not recognised — not counted
      </summary>
      <ul className="mt-2 space-y-1.5">
        {summary.unrecognised.map((w) => (
          <li key={w.workoutId}>
            <span className="text-foreground font-medium">{w.title || "Untitled"}</span>
            <span>: {w.lines.join(" · ")}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
