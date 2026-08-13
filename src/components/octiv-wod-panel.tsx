"use client";

import { useState } from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { useCreateWorkout } from "@/lib/hooks/use-workouts";
import { useOctivWod } from "@/lib/hooks/use-octiv";
import { OctivAuthError } from "@/lib/octiv/client";
import { wodToWorkoutInputs } from "@/lib/octiv/mapping";
import { scoreTypeLabel } from "@/lib/scoring";
import type { Workout } from "@/lib/types";
import { WORKOUT_TYPE_OPTIONS } from "@/constants/seedData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The box's programming for the selected day, and one button to log it.
 *
 * Deliberately quiet: it renders nothing at all when there is no connection, no
 * programming for that day, or nothing left to import. An optional integration
 * that shouts on every empty day would be worse than no integration.
 *
 * It sits *below* the day's sessions — what you did comes before what was
 * suggested.
 */
export function OctivWodPanel({
  dateKey,
  workouts,
}: {
  dateKey: string;
  /** The day's sessions, or `undefined` while they load. */
  workouts: Workout[] | undefined;
}) {
  const { data: wod, isPending, error } = useOctivWod(dateKey);
  const createWorkout = useCreateWorkout();
  const [importing, setImporting] = useState(false);

  // An expired or rejected token is the one failure worth a word: it is the only
  // one the athlete can act on, and silence would look like a box that stopped
  // programming. Everything else — offline, a 500 — stays quiet.
  if (error instanceof OctivAuthError) {
    return (
      <p className="text-muted-foreground/70 text-xs leading-relaxed">
        Your Octiv connection has expired. Sign in again from Profile →
        Integrations to see the day&apos;s WOD.
      </p>
    );
  }

  // `workouts` is undefined until the day is read: showing pieces before knowing
  // what is already logged would offer an import that is about to vanish.
  if (isPending || error || !wod || workouts === undefined) return null;

  const alreadyImported = new Set(
    workouts.map((workout) => workout.octivExerciseId).filter(Boolean),
  );

  const pending = wodToWorkoutInputs(wod, dateKey).filter(
    (input) => !alreadyImported.has(input.octivExerciseId),
  );

  if (pending.length === 0) return null;

  async function handleImport() {
    setImporting(true);
    try {
      // Sequential: each write recomputes derived data, and a day holds two or
      // three pieces at most, so there is nothing to gain from racing them.
      for (const input of pending) {
        await createWorkout.mutateAsync(input);
      }
      toast.success(
        pending.length === 1
          ? "Workout imported"
          : `${pending.length} workouts imported`,
        { description: "Add your score once you've done it." },
      );
    } catch {
      toast.error("Could not import the WOD", {
        description: "Anything already imported was kept. Try again in a moment.",
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="border-primary/30 bg-card/40 space-y-3 rounded-2xl border border-dashed p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold tracking-widest uppercase">
          Current WOD from Octiv
        </h3>
        <Badge variant="outline">Not logged</Badge>
      </div>

      <div className="space-y-4">
        {pending.map((input) => (
          <article key={input.octivExerciseId} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{typeLabel(input.type)}</Badge>
              <span className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
                {scoreTypeLabel(input.scoreType)}
              </span>
            </div>
            <h4 className="leading-tight font-bold">{input.title}</h4>
            {input.description && (
              // Octiv writes its programming as line-broken text, so the breaks
              // are the formatting — collapsing them would make it unreadable.
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                {input.description}
              </p>
            )}
          </article>
        ))}
      </div>

      <Button
        variant="secondary"
        className="w-full"
        onClick={handleImport}
        disabled={importing}
      >
        {importing ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
        {pending.length === 1 ? "Import this workout" : "Import this WOD"}
      </Button>
    </section>
  );
}

function typeLabel(type: Workout["type"]) {
  return WORKOUT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}
