"use client";

import { BandageIcon, DumbbellIcon, FlameIcon, MoonIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTrainingStats } from "@/lib/hooks/use-stats";
import { AVERAGE_WINDOW_WEEKS } from "@/lib/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The four numbers worth showing an athlete about their own habit.
 *
 * Deliberately not a chart. On a phone, in a profile screen, four large figures
 * are read in a glance; a graph would need study to say the same thing.
 */
export function TrainingStats() {
  const { data, isPending } = useTrainingStats();

  if (isPending || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-widest uppercase">
            Habit
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // An average over one week is not an average. Say what it covers instead of
  // presenting a single week's count as a trend.
  const windowLabel =
    data.averagedOverWeeks === 0
      ? "not enough history yet"
      : data.averagedOverWeeks === 1
        ? "last full week"
        : `last ${data.averagedOverWeeks} full weeks`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm tracking-widest uppercase">
          Habit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Tile
            icon={FlameIcon}
            label="Log streak"
            value={data.logStreak}
            unit={data.logStreak === 1 ? "day" : "days"}
            hint="Training, rest and injury days all count."
            highlight={data.logStreak > 0}
          />
          <Tile
            icon={BandageIcon}
            label="Injured"
            value={data.injuredDaysThisMonth}
            unit={data.injuredDaysThisMonth === 1 ? "day" : "days"}
            hint="This month."
            tone={data.injuredDaysThisMonth > 0 ? "text-destructive" : undefined}
          />
          <Tile
            icon={DumbbellIcon}
            label="Training"
            value={data.avgWorkoutDaysPerWeek}
            unit="days / week"
            hint={windowLabel}
          />
          <Tile
            icon={MoonIcon}
            label="Rest"
            value={data.avgRestDaysPerWeek}
            unit="days / week"
            hint={windowLabel}
          />
        </div>

        <p className="text-muted-foreground/70 text-xs leading-relaxed">
          Averages cover whole Monday-to-Sunday weeks, up to {AVERAGE_WINDOW_WEEKS}{" "}
          of them. The week in progress is left out so a Monday morning does not
          look like a collapse.
        </p>
      </CardContent>
    </Card>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  highlight,
  tone,
}: {
  icon: typeof FlameIcon;
  label: string;
  /** `null` when there is not enough history to say. */
  value: number | null;
  unit: string;
  hint: string;
  highlight?: boolean;
  tone?: string;
}) {
  return (
    <div className="border-border/70 bg-elevated/40 space-y-1 rounded-xl border px-3.5 py-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "tabular font-display text-2xl leading-none font-extrabold",
            value === null && "text-muted-foreground/40",
            highlight && "text-gradient-pr",
            tone,
          )}
        >
          {value ?? "—"}
        </span>
        {value !== null && (
          <span className="text-muted-foreground text-[11px] font-semibold">
            {unit}
          </span>
        )}
      </div>

      <p className="text-muted-foreground/70 text-[11px] leading-snug">{hint}</p>
    </div>
  );
}
