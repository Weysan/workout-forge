"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  endOfWeek,
  format,
  isToday,
  isTomorrow,
  isYesterday,
  startOfWeek,
} from "date-fns";
import {
  ArrowUpDownIcon,
  FlameIcon,
  PlusIcon,
  Share2Icon,
  TrophyIcon,
} from "lucide-react";
import { toast } from "sonner";

import { fromDateKey, toDateKey, todayKey } from "@/lib/utils";
import { formatScore, isScored } from "@/lib/scoring";
import { buildDayCard } from "@/lib/share-card";
import {
  useDeleteWorkout,
  useWorkoutDatesInRange,
  useWorkoutsByDate,
} from "@/lib/hooks/use-workouts";
import { useProfile, useUnitSystem } from "@/lib/hooks/use-profile";
import { useDayMark } from "@/lib/hooks/use-day-marks";
import { useTrainingStats } from "@/lib/hooks/use-stats";
import type { Workout } from "@/lib/types";
import { workoutTypeLabel } from "@/constants/seedData";
import { DateStrip } from "@/components/date-strip";
import { DayStatusBar } from "@/components/day-status-bar";
import { OctivWodPanel } from "@/components/octiv-wod-panel";
import { StravaActivityPanel } from "@/components/strava-activity-panel";
import { ReorderSheet } from "@/components/reorder-sheet";
import { ShareSheet } from "@/components/share-sheet";
import { EmptyDay, WorkoutCard } from "@/components/workout-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function readDateParam(value: string | null): Date | null {
  return value && DATE_KEY.test(value) ? fromDateKey(value) : null;
}

function Log() {
  // `?date=` makes a day linkable, which is what lets "View" on the toast from a
  // backdated result in Performance land on the day it was filed under.
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");

  const [selected, setSelected] = useState(
    () => readDateParam(dateParam) ?? new Date(),
  );

  // Covers arriving here while the page is already mounted.
  useEffect(() => {
    const fromUrl = readDateParam(dateParam);
    if (fromUrl) setSelected(fromUrl);
  }, [dateParam]);

  const dateKey = toDateKey(selected);

  const { data: profile } = useProfile();
  const unitSystem = useUnitSystem();
  const { data: workouts, isPending } = useWorkoutsByDate(dateKey);
  const deleteWorkout = useDeleteWorkout(dateKey);
  const { data: dayMark } = useDayMark(dateKey);
  // The same streak the profile shows — computed from the cached range queries,
  // so it costs no extra reads.
  const { data: stats } = useTrainingStats();
  const streak = stats?.logStreak ?? 0;

  const [reorderOpen, setReorderOpen] = useState(false);
  const [shareDayOpen, setShareDayOpen] = useState(false);

  const thisWeek = useMemo(() => {
    const now = new Date();
    return {
      start: toDateKey(startOfWeek(now, { weekStartsOn: 1 })),
      end: toDateKey(endOfWeek(now, { weekStartsOn: 1 })),
    };
  }, []);
  const { data: weekDates } = useWorkoutDatesInRange(
    thisWeek.start,
    thisWeek.end,
  );

  const prCount = (workouts ?? []).filter((w) => w.isPR).length;

  /**
   * The whole day as one poster, or null when there is nothing to post.
   *
   * Only scored sessions go on it, for the same reason a single card refuses to
   * share an unscored one: a planned session has no result, and a row reading
   * "—" is not something anybody wants on a story. The order is the day's own —
   * whatever the athlete arranged — because a poster that disagreed with the
   * screen it came from would be the wrong poster.
   */
  const dayCard = useMemo(() => {
    const scored = (workouts ?? []).filter(isScored);
    if (scored.length === 0) return null;

    return buildDayCard({
      // The log's own heading, so the image and the screen say the same thing.
      title: format(selected, "EEEE d MMMM"),
      // The year, which the title leaves out — a poster of a past season should
      // still say which one.
      dateLabel: format(selected, "yyyy"),
      dateKey,
      entries: scored.map((workout) => ({
        title: workout.title,
        detail: `${workoutTypeLabel(workout.type)} · ${workout.rxOrScaled}`,
        value: formatScore(workout.scoreType, workout.scoreValue, unitSystem, {
          reps: workout.reps,
          durationSeconds: workout.durationSeconds,
        }),
        isPR: workout.isPR,
      })),
    });
  }, [workouts, selected, dateKey, unitSystem]);

  // Days ahead are for planning: a session can be written down, but it has no
  // result yet and none can be entered until the day arrives.
  const isFuture = dateKey > todayKey();

  // "today" / "yesterday" read better than a date on the days that matter most.
  const relativeLabel = isToday(selected)
    ? "today"
    : isYesterday(selected)
      ? "yesterday"
      : isTomorrow(selected)
        ? "tomorrow"
        : `on ${format(selected, "d MMM")}`;

  async function handleDelete(workout: Workout) {
    try {
      const result = await deleteWorkout.mutateAsync(workout);
      toast.success(
        result.queued ? "Deleted on this device" : "Workout deleted",
        {
          description: result.queued
            ? "The deletion syncs when you're back online."
            : undefined,
        },
      );
    } catch {
      toast.error("Could not delete the workout", {
        description: "It has been restored. Try again in a moment.",
      });
    }
  }

  const firstName = profile?.displayName?.split(" ")[0];

  return (
    <div className="space-y-5">
      <section className="flex items-start justify-between gap-3 pt-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight font-extrabold">
            {firstName ? `Let's go, ${firstName}.` : "Training log"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            <span className="text-foreground font-semibold tabular">
              {weekDates?.length ?? 0}
            </span>{" "}
            {weekDates?.length === 1 ? "day" : "days"} trained this week
          </p>
        </div>

        {/* The log streak: consecutive days accounted for — trained, rested or
            injured — counting back from today (see logStreak in lib/stats.ts).
            Hidden at zero: a "0" badge greets a new user with a failure. */}
        {streak > 0 && (
          <div
            className="border-primary/40 bg-primary/10 flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2"
            aria-label={`${streak}-day streak`}
          >
            <FlameIcon className="streak-flame text-primary size-6" aria-hidden />
            <div className="leading-none" aria-hidden>
              <div className="font-display tabular text-xl font-extrabold">{streak}</div>
              <div className="text-muted-foreground mt-0.5 text-[10px] font-bold tracking-widest uppercase">
                day streak
              </div>
            </div>
          </div>
        )}
      </section>

      <DateStrip selected={selected} onSelect={setSelected} />

      <DayStatusBar dateKey={dateKey} workouts={workouts} isFuture={isFuture} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 pt-1">
          <h2 className="font-display truncate text-sm font-bold tracking-widest uppercase">
            {format(selected, "EEEE d MMMM")}
          </h2>

          <div className="flex shrink-0 items-center gap-1">
            {prCount > 0 && (
              <span className="text-primary mr-1 inline-flex items-center gap-1 text-[11px] font-bold tracking-widest uppercase">
                <TrophyIcon className="size-3.5" />
                {prCount} PR{prCount > 1 ? "s" : ""}
              </span>
            )}

            {/* Nothing to arrange on a day with one session. */}
            {(workouts?.length ?? 0) > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground gap-1.5 text-[11px] font-bold tracking-widest uppercase"
                onClick={() => setReorderOpen(true)}
              >
                <ArrowUpDownIcon className="size-3.5" />
                Order
              </Button>
            )}

            {/* One image for the whole day, rather than one per session — see
                buildDayCard. Absent until at least one session has a result. */}
            {dayCard && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Share this day"
                onClick={() => setShareDayOpen(true)}
              >
                <Share2Icon />
              </Button>
            )}
          </div>
        </div>

        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
        ) : workouts && workouts.length > 0 ? (
          <div className="space-y-3">
            {workouts.map((workout) => (
              <WorkoutCard
                key={workout.id}
                workout={workout}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <EmptyDay
            dateLabel={relativeLabel}
            isFuture={isFuture}
            dateKey={dateKey}
            status={dayMark?.status}
          />
        )}

        {/* Below the day's sessions: what was done comes before what the box
            programmed. Renders nothing unless Octiv is connected and has a WOD
            for this day that is not in the log yet. */}
        <OctivWodPanel dateKey={dateKey} workouts={workouts} />

        {/* Last: a watch's record of what happened outside the box. Same
            contract as the panel above — nothing at all unless there is
            something to import. */}
        <StravaActivityPanel dateKey={dateKey} workouts={workouts} />
      </section>

      {/* Both panels stay mounted while they animate out, the same arrangement as
          the sheets on a workout card. */}
      <ReorderSheet
        dateKey={dateKey}
        workouts={workouts ?? []}
        open={reorderOpen}
        onOpenChange={setReorderOpen}
      />

      <ShareSheet
        card={dayCard}
        open={shareDayOpen}
        onOpenChange={setShareDayOpen}
      />

      {/* Sits above the bottom nav, inside the thumb arc, on every scroll position. */}
      <Button
        asChild
        size="lg"
        className="fixed right-4 z-40 h-14 rounded-2xl px-5 shadow-2xl shadow-primary/30 bottom-safe mb-16"
        aria-label={isFuture ? "Plan a workout" : "Log a workout"}
      >
        <Link href={`/workout/new?date=${dateKey}`}>
          <PlusIcon className="size-5" />
          {isFuture ? "Plan" : "Log"}
        </Link>
      </Button>
    </div>
  );
}

export default function LogPage() {
  // useSearchParams needs a Suspense boundary to prerender under `output: export`.
  return (
    <Suspense
      fallback={
        <div className="space-y-4 pt-6">
          <Skeleton className="h-14 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      }
    >
      <Log />
    </Suspense>
  );
}
