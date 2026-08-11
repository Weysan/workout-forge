"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isYesterday, subDays } from "date-fns";
import { CalendarIcon, CheckIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { cn, fromDateKey, toDateKey, todayKey } from "@/lib/utils";
import {
  draftFromWorkout,
  emptyDraft,
  isScoreComplete,
  resolveScore,
  type ScoreDraft,
} from "@/lib/score-draft";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { useCreateWorkout, useUpdateWorkout } from "@/lib/hooks/use-workouts";
import type {
  Benchmark,
  RxOrScaled,
  Workout,
  WorkoutInput,
} from "@/lib/types";
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
 *
 * Passing `workout` turns the same form into a correction of that attempt. The
 * fields are identical — a mistyped score and a mistyped date are exactly what
 * gets fixed — so this is one form used in both directions rather than a second
 * one to keep in step.
 *
 * `onSaved` fires after a successful write so the container can react: the PR
 * detail panel dismisses itself after a new result, because what was just
 * entered is behind that panel, and closes the inline editor after a correction.
 */
export function QuickLogForm({
  benchmark,
  workout,
  onSaved,
  onCancel,
}: {
  benchmark: Benchmark;
  /** The attempt being corrected. Absent when logging a new result. */
  workout?: Workout;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const unitSystem = useUnitSystem();
  const createWorkout = useCreateWorkout();
  const updateWorkout = useUpdateWorkout();

  const editing = workout !== undefined;

  // An attempt keeps the score type it was recorded with. Reading it off the
  // benchmark instead would reinterpret the stored number if that definition
  // has changed since — turning a time into a rep count on save.
  const scoreType = workout?.scoreType ?? benchmark.scoreType;

  const [draft, setDraft] = useState<ScoreDraft>(() =>
    workout ? draftFromWorkout(workout, unitSystem) : emptyDraft(unitSystem),
  );
  const [dateKey, setDateKey] = useState(() => workout?.date ?? todayKey());
  const [rxOrScaled, setRxOrScaled] = useState<RxOrScaled>(
    workout?.rxOrScaled ?? "RX",
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const resolved = resolveScore(draft, scoreType, unitSystem);
  const complete = isScoreComplete(draft, scoreType);
  const showScoreError = submitted && !complete;
  const pending = createWorkout.isPending || updateWorkout.isPending;

  // RX vs Scaled describes whether a workout was performed as prescribed. A
  // barbell lift has no prescription to scale, so the control is hidden for
  // lifts and the stored value stays "RX".
  const showStandardToggle = benchmark.category !== "Lift";

  function patchDraft(patch: Partial<ScoreDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function buildInput(): WorkoutInput {
    const scored = {
      date: dateKey,
      scoreType,
      scoreValue: resolved.scoreValue,
      scoreDisplay: resolved.scoreDisplay,
      rxOrScaled: showStandardToggle ? rxOrScaled : "RX",
      reps: resolved.reps,
    } satisfies Partial<WorkoutInput>;

    if (workout) {
      // Everything this form does not ask about carries over untouched, so a
      // correction can never quietly drop the notes or retitle the session.
      const { id: _id, createdAt: _createdAt, ...carried } = workout;
      // `isPR` rides along unchanged for the same reason it is left false on a
      // new result: syncRecordForBenchmark re-badges every attempt right after
      // the write, so whatever is sent here is overwritten by the truth.
      return { ...carried, ...scored };
    }

    return {
      ...scored,
      title: benchmark.name,
      type: benchmark.type,
      description: benchmark.description,
      // Left false deliberately: syncRecordForBenchmark runs straight after the
      // write and badges whichever attempt actually holds the record, including
      // a backdated one that beats everything already logged.
      isPR: false,
      linkedBenchmarkId: benchmark.id,
      notes: "",
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!complete) return;

    const input = buildInput();

    try {
      const result = workout
        ? await updateWorkout.mutateAsync({
            workoutId: workout.id,
            input,
            previousBenchmarkId: workout.linkedBenchmarkId,
          })
        : await createWorkout.mutateAsync(input);

      const when = format(fromDateKey(dateKey), "d MMM yyyy");
      const verb = editing ? "updated" : "logged";

      toast.success(
        result.queued
          ? `${benchmark.name} saved offline`
          : `${benchmark.name} ${verb}`,
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
      // for the same movement is the common case when the form stays mounted.
      // A correction has nothing to reset — the editor closes behind it.
      if (!editing) {
        setDraft(emptyDraft(unitSystem));
        setSubmitted(false);
      }

      onSaved?.();
    } catch {
      toast.error(
        editing
          ? "Could not save your changes"
          : `Could not log ${benchmark.name}`,
        {
          description: "Check your connection and try again.",
        },
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ScoreInput
        scoreType={scoreType}
        draft={draft}
        onChange={patchDraft}
        unitSystem={unitSystem}
        // Two of these can be mounted at once — the panel's own form and an
        // open inline editor — so the ids have to name the attempt as well.
        idPrefix={workout ? `edit-${workout.id}` : "quick"}
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

      <div className="flex gap-2">
        {editing && onCancel && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          className={editing ? "flex-[2]" : "w-full"}
          disabled={pending}
        >
          {pending ? (
            <Loader2Icon className="animate-spin" />
          ) : complete ? (
            <CheckIcon />
          ) : (
            <PlusIcon />
          )}
          {editing ? "Save changes" : "Save result"}
        </Button>
      </div>

      <p className="text-muted-foreground/70 text-center text-xs leading-relaxed">
        {editing
          ? "Changing the date moves this result on your calendar too."
          : "Saved results appear on your calendar for the date you choose."}
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
