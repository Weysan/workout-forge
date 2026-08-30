"use client";

import { useState } from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { useCreateWorkout } from "@/lib/hooks/use-workouts";
import { useStravaActivities } from "@/lib/hooks/use-strava";
import { StravaAuthError } from "@/lib/strava/client";
import { activitiesToWorkoutInputs } from "@/lib/strava/mapping";
import { getBenchmark, workoutTypeLabel } from "@/constants/seedData";
import type { Workout } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StravaIcon } from "@/components/provider-icons";

/**
 * The athlete's Strava activities for the selected day, and one button to log
 * them.
 *
 * Deliberately quiet, exactly like the Octiv panel: it renders nothing at all
 * when there is no connection, nothing recorded that day, or nothing left to
 * import. An optional integration that shouts on every rest day would be worse
 * than no integration.
 *
 * It sits below the day's sessions and below the Octiv panel — what was done
 * comes first, then what the box programmed, then what a watch recorded.
 */
export function StravaActivityPanel({
  dateKey,
  workouts,
}: {
  dateKey: string;
  /** The day's sessions, or `undefined` while they load. */
  workouts: Workout[] | undefined;
}) {
  const { data: activities, isPending, error } = useStravaActivities(dateKey);
  const createWorkout = useCreateWorkout();
  const [importing, setImporting] = useState(false);

  // A revoked connection is the one failure worth a word: it is the only one the
  // athlete can act on, and silence would look like a watch that stopped
  // recording. Everything else — offline, a 500, the rate limit — stays quiet.
  if (error instanceof StravaAuthError) {
    return (
      <p className="text-muted-foreground/70 text-xs leading-relaxed">
        Strava is no longer accepting this connection. Connect again from Profile
        → Integrations to keep importing your activities.
      </p>
    );
  }

  // `workouts` is undefined until the day is read: offering an import before
  // knowing what is already logged would offer one that is about to vanish.
  if (isPending || error || !activities || workouts === undefined) return null;

  const alreadyImported = new Set(
    workouts.map((workout) => workout.stravaActivityId).filter(Boolean),
  );

  const pending = activitiesToWorkoutInputs(activities, dateKey).filter(
    (input) => !alreadyImported.has(input.stravaActivityId),
  );

  if (pending.length === 0) return null;

  async function handleImport() {
    setImporting(true);
    try {
      // Sequential: each write recomputes derived data, and a day holds one or
      // two activities at most, so there is nothing to gain from racing them.
      for (const input of pending) {
        await createWorkout.mutateAsync(input);
      }
      toast.success(
        pending.length === 1
          ? "Activity imported"
          : `${pending.length} activities imported`,
      );
    } catch {
      toast.error("Could not import from Strava", {
        description:
          "Anything already imported was kept. Try again in a moment.",
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="border-primary/30 bg-card/40 space-y-3 rounded-2xl border border-dashed p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display flex items-center gap-2 text-sm font-bold tracking-widest uppercase">
          <StravaIcon className="size-4" />
          Recorded on Strava
        </h3>
        <Badge variant="outline">Not logged</Badge>
      </div>

      <div className="space-y-4">
        {pending.map((input) => {
          const benchmark = getBenchmark(input.linkedBenchmarkId);

          return (
            <article key={input.stravaActivityId} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{workoutTypeLabel(input.type)}</Badge>
                <span className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
                  {input.scoreDisplay}
                </span>
                {/* Only a run flagged as a race, at a standard distance, gets
                    here — see benchmarkIdFor in strava/mapping.ts. Worth
                    showing, because it means this import can set a PR. */}
                {benchmark && (
                  <Badge variant="accent">{benchmark.name}</Badge>
                )}
              </div>
              <h4 className="leading-tight font-bold">{input.title}</h4>
              {input.description && (
                // Written as one measurement per line, so the breaks are the
                // formatting — collapsing them would run them together.
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                  {input.description}
                </p>
              )}
            </article>
          );
        })}
      </div>

      <Button
        variant="secondary"
        className="w-full"
        onClick={handleImport}
        disabled={importing}
      >
        {importing ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
        {pending.length === 1 ? "Import this activity" : "Import these activities"}
      </Button>
    </section>
  );
}
