"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  CalendarIcon,
  ClockIcon,
  Loader2Icon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { cn, fromDateKey, toDateKey, todayKey } from "@/lib/utils";
import {
  emptyDraft,
  draftFromWorkout,
  resolveScore,
  type ScoreDraft,
} from "@/lib/score-draft";
import { scoreTypeLabel } from "@/lib/scoring";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { useCreateWorkout, useUpdateWorkout } from "@/lib/hooks/use-workouts";
import { getBenchmark, SCORE_TYPE_OPTIONS, WORKOUT_TYPE_OPTIONS } from "@/constants/seedData";
import type {
  Benchmark,
  RxOrScaled,
  ScoreType,
  Workout,
  WorkoutInput,
  WorkoutType,
} from "@/lib/types";
import { BenchmarkPicker } from "@/components/benchmark-picker";
import { ScoreInput } from "@/components/score-input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Create/edit form for a workout.
 *
 * Full-screen with a sticky action bar rather than a modal: the form has five
 * sections and the on-screen keyboard eats half a phone's viewport, so a
 * centred dialog would leave almost nothing visible.
 *
 * The score is optional. A session written down in advance has no result yet,
 * and refusing to save it would push the user into inventing one — so the title
 * is the only hard requirement, and `ScoreSheet` fills the result in later
 * straight from the log.
 */
export function WorkoutForm({
  mode,
  initialDateKey,
  workout,
}: {
  mode: "create" | "edit";
  initialDateKey?: string;
  workout?: Workout;
}) {
  const router = useRouter();
  const unitSystem = useUnitSystem();
  const createWorkout = useCreateWorkout();
  const updateWorkout = useUpdateWorkout();

  const [title, setTitle] = useState(workout?.title ?? "");
  const [dateKey, setDateKey] = useState(
    workout?.date ?? initialDateKey ?? todayKey(),
  );
  const [type, setType] = useState<WorkoutType>(workout?.type ?? "ForTime");
  const [scoreType, setScoreType] = useState<ScoreType>(
    workout?.scoreType ?? "time_seconds",
  );
  const [description, setDescription] = useState(workout?.description ?? "");
  const [notes, setNotes] = useState(workout?.notes ?? "");
  const [rxOrScaled, setRxOrScaled] = useState<RxOrScaled>(
    workout?.rxOrScaled ?? "RX",
  );
  const [markAsPR, setMarkAsPR] = useState(workout?.isPR ?? false);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(
    getBenchmark(workout?.linkedBenchmarkId) ?? null,
  );
  const [draft, setDraft] = useState<ScoreDraft>(() =>
    workout ? draftFromWorkout(workout, unitSystem) : emptyDraft(unitSystem),
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // The profile loads after first paint, so the default weight unit has to catch
  // up once it arrives — but only while the field is still untouched.
  useEffect(() => {
    setDraft((current) =>
      current.weight === "" ? { ...current, weightUnit: unitSystem } : current,
    );
  }, [unitSystem]);

  const pending = createWorkout.isPending || updateWorkout.isPending;

  const resolved = useMemo(
    () => resolveScore(draft, scoreType, unitSystem),
    [draft, scoreType, unitSystem],
  );

  const titleError =
    submitted && title.trim().length === 0 ? "Give this workout a name" : null;

  const scored = resolved.scoreValue !== null;

  function patchDraft(patch: Partial<ScoreDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  /** Selecting a benchmark fills in everything it knows, without clobbering typing. */
  function applyBenchmark(next: Benchmark) {
    setBenchmark(next);
    setType(next.type);
    setScoreType(next.scoreType);
    // Only overwrite fields the user has not already filled in themselves.
    setTitle((current) => (current.trim() === "" ? next.name : current));
    setDescription((current) =>
      current.trim() === "" ? next.description : current,
    );
  }

  function clearBenchmark() {
    setBenchmark(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    // The score is allowed to be missing; a nameless workout is not.
    if (title.trim().length === 0) {
      toast.error("Give this workout a name");
      return;
    }

    const input: WorkoutInput = {
      date: dateKey,
      title: title.trim(),
      type,
      description: description.trim(),
      scoreType,
      scoreValue: resolved.scoreValue,
      scoreDisplay: resolved.scoreDisplay,
      rxOrScaled,
      // A manual tick is a floor, not the last word: syncRecordForBenchmark
      // recomputes the true record holder immediately after the write. It cannot
      // apply to a session with no result to compare.
      isPR: scored && markAsPR,
      linkedBenchmarkId: benchmark?.id ?? null,
      reps: resolved.reps,
      notes: notes.trim(),
    };

    try {
      const result =
        mode === "edit" && workout
          ? await updateWorkout.mutateAsync({
              workoutId: workout.id,
              input,
              previousBenchmarkId: workout.linkedBenchmarkId,
            })
          : await createWorkout.mutateAsync(input);

      const verb = mode === "edit" ? "updated" : "logged";

      if (result.queued) {
        toast.success(`Workout saved offline`, {
          description: "It uploads automatically when you're back online.",
        });
      } else {
        toast.success(`Workout ${verb}`, {
          description: !scored
            ? "No score yet — add it from your log once you've trained."
            : mode === "edit"
              ? undefined
              : benchmark
                ? `Counted towards your ${benchmark.name} record.`
                : undefined,
        });
      }

      router.push("/");
    } catch {
      toast.error(
        mode === "edit"
          ? "Could not save your changes"
          : "Could not log the workout",
        { description: "Your input is still here — check your connection and try again." },
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-svh flex-col">
      <header className="bg-background/85 sticky top-0 z-30 border-b border-border/70 backdrop-blur-lg pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-2 px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel"
            onClick={() => router.back()}
          >
            <XIcon />
          </Button>
          <h1 className="font-display text-sm font-bold tracking-widest uppercase">
            {mode === "edit" ? "Edit workout" : "Log workout"}
          </h1>
          <div className="size-9" aria-hidden />
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-7 px-4 py-6 pb-32">
        {/* --- Shortcut ---------------------------------------------------- */}
        <section className="space-y-2">
          <Label>Shortcut</Label>
          <BenchmarkPicker
            selected={benchmark}
            onSelect={applyBenchmark}
            onClear={clearBenchmark}
          />
        </section>

        <Separator />

        {/* --- Meta -------------------------------------------------------- */}
        <section className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Tuesday WOD"
              maxLength={120}
              aria-invalid={titleError !== null}
            />
            {titleError && (
              <p className="text-destructive text-xs">{titleError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 w-full justify-start gap-2 px-3.5 font-normal"
                  >
                    <CalendarIcon className="text-muted-foreground size-4" />
                    <span className="tabular truncate">
                      {format(fromDateKey(dateKey), "d MMM yyyy")}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2">
                  <Calendar
                    mode="single"
                    selected={fromDateKey(dateKey)}
                    defaultMonth={fromDateKey(dateKey)}
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

            <div className="space-y-2">
              <Label htmlFor="type">Format</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as WorkoutType)}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKOUT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Movements</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={"21-15-9\nThrusters (43/30 kg)\nPull-ups"}
              maxLength={5000}
              rows={5}
            />
          </div>
        </section>

        <Separator />

        {/* --- Score ------------------------------------------------------- */}
        <section className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="scoreType">
              Scored by
              {/* Says up front that this whole section can be skipped. */}
              <span className="text-muted-foreground/60 font-normal">
                optional
              </span>
            </Label>
            <Select
              value={scoreType}
              onValueChange={(value) => setScoreType(value as ScoreType)}
            >
              <SelectTrigger id="scoreType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCORE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScoreInput
            scoreType={scoreType}
            draft={draft}
            onChange={patchDraft}
            unitSystem={unitSystem}
          />
          {/* Live read-back: confirms the app understood the input before saving.
              With nothing entered, say plainly that this is a valid way to save,
              so a blank score does not read as an unfinished form. */}
          {scored ? (
            <div className="border-border/70 bg-card/60 flex items-baseline justify-between rounded-xl border px-4 py-3">
              <span className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
                {scoreTypeLabel(scoreType)}
              </span>
              <span className="tabular font-display text-2xl font-extrabold">
                {resolved.scoreDisplay}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground/70 flex items-start gap-2 text-xs leading-relaxed">
              <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
              Leave this empty to plan the session now — you can add the result
              from your log afterwards.
            </p>
          )}
        </section>

        <Separator />

        {/* --- Tags -------------------------------------------------------- */}
        <section className="space-y-5">
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

          {/* Hidden until there is a score: a record with no result behind it
              cannot be compared against anything, so offering the tick would be
              offering a badge that means nothing. It reappears with the score. */}
          {scored && (
            <label
              htmlFor="markAsPR"
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                markAsPR
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-input/40 hover:bg-elevated",
              )}
            >
              <input
                id="markAsPR"
                type="checkbox"
                checked={markAsPR}
                onChange={(event) => setMarkAsPR(event.target.checked)}
                className="accent-primary size-5 shrink-0"
              />
              <span className="flex-1">
                <span className="flex items-center gap-1.5 font-semibold">
                  <TrophyIcon
                    className={cn(
                      "size-4",
                      markAsPR ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  Mark as a PR
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                  {benchmark
                    ? "Optional — records for linked benchmarks are detected automatically."
                    : "Use this for workouts that aren't linked to a benchmark."}
                </span>
              </span>
            </label>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="How it felt, scaling used, splits…"
              maxLength={5000}
              rows={3}
            />
          </div>
        </section>
      </div>

      {/* Sticky action bar: saving must never require scrolling to the bottom. */}
      <div className="bg-background/90 fixed inset-x-0 bottom-0 z-30 border-t border-border/70 backdrop-blur-lg pb-safe">
        <div className="mx-auto flex w-full max-w-2xl gap-3 px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => router.back()}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-[2]" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {mode === "edit" ? "Save changes" : "Log workout"}
          </Button>
        </div>
      </div>
    </form>
  );
}
