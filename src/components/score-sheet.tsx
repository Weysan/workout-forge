"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CheckIcon, Loader2Icon, TrophyIcon } from "lucide-react";
import { toast } from "sonner";

import { cn, fromDateKey } from "@/lib/utils";
import {
  draftFromWorkout,
  isScoreComplete,
  resolveScore,
  type ScoreDraft,
} from "@/lib/score-draft";
import { scoreTypeLabel } from "@/lib/scoring";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { useUpdateWorkout } from "@/lib/hooks/use-workouts";
import { SCORE_TYPE_OPTIONS } from "@/constants/seedData";
import type { RxOrScaled, ScoreType, Workout, WorkoutInput } from "@/lib/types";
import { ScoreInput } from "@/components/score-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Fills in the result of a session that was logged without one.
 *
 * This is the second half of planning a workout ahead: the full form captures
 * what you intend to do, and this panel captures how it went, from the card on
 * the log itself. Sending the user back through the five-section form for two
 * numbers is the friction that stops results being recorded at all.
 *
 * It writes an ordinary workout update, so the record recompute that runs after
 * every write picks the result up on its own — scoring a planned Fran that beats
 * your best takes the PR exactly as logging it fresh would have.
 */
export function ScoreSheet({
  workout,
  open,
  onOpenChange,
}: {
  workout: Workout;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0">
        {/* The body is a child so it mounts with the panel: each visit starts
            from the workout's stored values rather than from a half-typed score
            left behind by the last one. */}
        <ScoreForm workout={workout} onSaved={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function ScoreForm({
  workout,
  onSaved,
}: {
  workout: Workout;
  onSaved: () => void;
}) {
  const unitSystem = useUnitSystem();
  const updateWorkout = useUpdateWorkout();

  // Seeded from the workout: the score type chosen while planning is usually
  // right, and re-picking it every time would be busywork. It stays editable
  // because a plan can be vague about how the session will be measured.
  const [scoreType, setScoreType] = useState<ScoreType>(workout.scoreType);
  const [draft, setDraft] = useState<ScoreDraft>(() =>
    draftFromWorkout(workout, unitSystem),
  );
  const [rxOrScaled, setRxOrScaled] = useState<RxOrScaled>(workout.rxOrScaled);
  const [markAsPR, setMarkAsPR] = useState(workout.isPR);
  const [submitted, setSubmitted] = useState(false);

  const resolved = resolveScore(draft, scoreType, unitSystem);
  const complete = isScoreComplete(draft, scoreType);
  const showScoreError = submitted && !complete;

  function patchDraft(patch: Partial<ScoreDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!complete) return;

    // Everything that is not the score carries over untouched, so this panel can
    // never quietly rewrite the title, date or movements it does not show.
    const { id: _id, createdAt: _createdAt, ...carried } = workout;

    const input: WorkoutInput = {
      ...carried,
      scoreType,
      scoreValue: resolved.scoreValue,
      scoreDisplay: resolved.scoreDisplay,
      rxOrScaled,
      // A tick here is a floor, not the last word: for a linked benchmark the
      // record recompute right after the write decides who actually holds it.
      isPR: markAsPR,
      reps: resolved.reps,
    };

    try {
      const result = await updateWorkout.mutateAsync({
        workoutId: workout.id,
        input,
      });

      toast.success(result.queued ? "Score saved offline" : "Score added", {
        description: result.queued
          ? `${resolved.scoreDisplay} — uploads when you're back online.`
          : `${workout.title} · ${resolved.scoreDisplay}`,
      });

      onSaved();
    } catch {
      toast.error("Could not save your score", {
        description: "Your input is still here — check your connection and try again.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Add your score</SheetTitle>
        <SheetDescription>
          {workout.title} · {format(fromDateKey(workout.date), "d MMM yyyy")}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-2">
        <div className="space-y-2">
          {/* Ids carry the workout id: the log mounts one of these panels per
              card, so a fixed id would point every label at the first match. */}
          <Label htmlFor={`score-${workout.id}-type`}>Scored by</Label>
          <Select
            value={scoreType}
            onValueChange={(value) => setScoreType(value as ScoreType)}
          >
            <SelectTrigger id={`score-${workout.id}-type`}>
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
          idPrefix={`score-${workout.id}`}
        />
        {showScoreError && (
          <p className="text-destructive text-xs">Enter a score before saving.</p>
        )}

        {complete && (
          <div className="border-border/70 bg-elevated/40 flex items-baseline justify-between rounded-xl border px-4 py-3">
            <span className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
              {scoreTypeLabel(scoreType)}
            </span>
            <span className="tabular font-display text-2xl font-extrabold">
              {resolved.scoreDisplay}
            </span>
          </div>
        )}

        {/* Whether it was scaled is often only known afterwards, so it is here
            rather than being frozen at the value the plan was saved with. */}
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

        <label
          htmlFor={`score-${workout.id}-pr`}
          className={cn(
            "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
            markAsPR
              ? "border-primary/50 bg-primary/10"
              : "border-border bg-input/40 hover:bg-elevated",
          )}
        >
          <input
            id={`score-${workout.id}-pr`}
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
              {workout.linkedBenchmarkId
                ? "Optional — records for linked benchmarks are detected automatically."
                : "Use this for workouts that aren't linked to a benchmark."}
            </span>
          </span>
        </label>
      </div>

      <SheetFooter>
        <Button type="submit" disabled={updateWorkout.isPending}>
          {updateWorkout.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <CheckIcon />
          )}
          Save score
        </Button>
      </SheetFooter>
    </form>
  );
}
