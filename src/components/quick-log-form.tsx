"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isYesterday, subDays } from "date-fns";
import { CalendarIcon, CheckIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { cn, fromDateKey, toDateKey, todayKey } from "@/lib/utils";
import {
  emptyDraft,
  isScoreComplete,
  resolveScore,
  type ScoreDraft,
} from "@/lib/score-draft";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { useCreateWorkout } from "@/lib/hooks/use-workouts";
import type { Benchmark, RxOrScaled, WorkoutInput } from "@/lib/types";
import { ScoreInput } from "@/components/score-input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * One-step result entry for a known benchmark or lift.
 *
 * Everything the workout log needs is already known from the benchmark itself —
 * title, format, description, score type — so the only things left to ask for are
 * the score and the date. That is what makes this a shortcut rather than a second
 * way to fill in the full workout form.
 *
 * It writes an ordinary workout document, which is why the result also shows up
 * on the calendar for the chosen day: the calendar reads workouts by date, and
 * `createWorkout` recomputes the personal record afterwards. There is no separate
 * "record-only" path to keep in sync.
 */
export function QuickLogForm({ benchmark }: { benchmark: Benchmark }) {
  const router = useRouter();
  const unitSystem = useUnitSystem();
  const createWorkout = useCreateWorkout();

  const [draft, setDraft] = useState<ScoreDraft>(() => emptyDraft(unitSystem));
  const [dateKey, setDateKey] = useState(() => todayKey());
  const [rxOrScaled, setRxOrScaled] = useState<RxOrScaled>("RX");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const resolved = resolveScore(draft, benchmark.scoreType, unitSystem);
  const complete = isScoreComplete(draft, benchmark.scoreType);
  const showScoreError = submitted && !complete;

  // RX vs Scaled describes whether a workout was performed as prescribed. A
  // barbell lift has no prescription to scale, so the control is hidden for
  // lifts and the stored value stays "RX".
  const showStandardToggle = benchmark.category !== "Lift";

  function patchDraft(patch: Partial<ScoreDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!complete) return;

    const input: WorkoutInput = {
      date: dateKey,
      title: benchmark.name,
      type: benchmark.type,
      description: benchmark.description,
      scoreType: benchmark.scoreType,
      scoreValue: resolved.scoreValue,
      scoreDisplay: resolved.scoreDisplay,
      rxOrScaled: showStandardToggle ? rxOrScaled : "RX",
      // Left false deliberately: syncRecordForBenchmark runs straight after the
      // write and badges whichever attempt actually holds the record, including
      // a backdated one that beats everything already logged.
      isPR: false,
      linkedBenchmarkId: benchmark.id,
      reps: resolved.reps,
      notes: "",
    };

    try {
      const result = await createWorkout.mutateAsync(input);

      const when = format(fromDateKey(dateKey), "d MMM yyyy");
      toast.success(
        result.queued
          ? `${benchmark.name} saved offline`
          : `${benchmark.name} logged`,
        {
          description: result.queued
            ? `${resolved.scoreDisplay} · ${when} — uploads when you're back online.`
            : `${resolved.scoreDisplay} · ${when}`,
          action: {
            label: "View",
            onClick: () => router.push(`/?date=${dateKey}`),
          },
        },
      );

      // Reset the score but keep the date: entering a run of historical results
      // for the same movement is the common case.
      setDraft(emptyDraft(unitSystem));
      setSubmitted(false);
    } catch {
      toast.error(`Could not log ${benchmark.name}`, {
        description: "Check your connection and try again.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ScoreInput
        scoreType={benchmark.scoreType}
        draft={draft}
        onChange={patchDraft}
        unitSystem={unitSystem}
        idPrefix="quick"
      />
      {showScoreError && (
        <p className="text-destructive text-xs">
          Enter a score before saving.
        </p>
      )}

      <div className="space-y-2">
        <Label>Date</Label>

        {/* Most entries are today or yesterday; the picker covers everything else. */}
        <div className="flex gap-2">
          <DateChip
            label="Today"
            active={dateKey === todayKey()}
            onClick={() => setDateKey(todayKey())}
          />
          <DateChip
            label="Yesterday"
            active={dateKey === toDateKey(subDays(new Date(), 1))}
            onClick={() => setDateKey(toDateKey(subDays(new Date(), 1)))}
          />

          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "min-h-11 flex-1 justify-center gap-2 px-3 font-normal",
                  !isToday(fromDateKey(dateKey)) &&
                    !isYesterday(fromDateKey(dateKey)) &&
                    "border-primary/60 bg-primary/10",
                )}
              >
                <CalendarIcon className="size-4 shrink-0" />
                <span className="tabular truncate">
                  {isToday(fromDateKey(dateKey)) ||
                  isYesterday(fromDateKey(dateKey))
                    ? "Pick a date"
                    : format(fromDateKey(dateKey), "d MMM yyyy")}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-2">
              <Calendar
                mode="single"
                selected={fromDateKey(dateKey)}
                defaultMonth={fromDateKey(dateKey)}
                // Results cannot be achieved in the future.
                disabled={{ after: new Date() }}
                onSelect={(date) => {
                  if (!date) return;
                  setDateKey(toDateKey(date));
                  setDatePickerOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {showStandardToggle && (
        <div className="space-y-2">
          <Label>Standard</Label>
          <ToggleGroup
            type="single"
            value={rxOrScaled}
            onValueChange={(value) => {
              if (value) setRxOrScaled(value as RxOrScaled);
            }}
          >
            <ToggleGroupItem value="RX">RX</ToggleGroupItem>
            <ToggleGroupItem value="Scaled">Scaled</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={createWorkout.isPending}>
        {createWorkout.isPending ? (
          <Loader2Icon className="animate-spin" />
        ) : complete ? (
          <CheckIcon />
        ) : (
          <PlusIcon />
        )}
        Save result
      </Button>

      <p className="text-muted-foreground/70 text-center text-xs leading-relaxed">
        Saved results appear on your calendar for the date you choose.
      </p>
    </form>
  );
}

function DateChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className="min-h-11 flex-1 px-3 text-xs font-bold tracking-wide uppercase"
    >
      {label}
    </Button>
  );
}
