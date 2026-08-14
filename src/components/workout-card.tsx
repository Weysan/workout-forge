"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  CalendarClockIcon,
  CalendarPlusIcon,
  FlameIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  Share2Icon,
  Trash2Icon,
  TrophyIcon,
} from "lucide-react";

import { cn, fromDateKey, todayKey } from "@/lib/utils";
import { formatScore, isScored, scoreTypeLabel } from "@/lib/scoring";
import { buildWorkoutCard } from "@/lib/share-card";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import type { Workout } from "@/lib/types";
import { workoutTypeLabel } from "@/constants/seedData";
import { ScoreSheet } from "@/components/score-sheet";
import { ShareSheet } from "@/components/share-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function WorkoutCard({
  workout,
  onDelete,
}: {
  workout: Workout;
  onDelete: (workout: Workout) => void;
}) {
  const unitSystem = useUnitSystem();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Null rather than a formatted string when the session has no result yet, so
  // the card has to choose what to show instead of printing a confident "00:00".
  const score = isScored(workout)
    ? formatScore(
        workout.scoreType,
        workout.scoreValue,
        unitSystem,
        workout.reps,
      )
    : null;

  // A session dated ahead has not happened, so there is no result to enter. The
  // score panel appears on its own once the day arrives.
  const isPlanned = workout.date > todayKey();

  // Only a finished session is worth posting: a workout planned for Thursday has
  // no result to show, and an image of a blank score is not a share.
  const shareCard =
    score === null
      ? null
      : buildWorkoutCard({
          title: workout.title,
          typeLabel: workoutTypeLabel(workout.type),
          rxOrScaled: workout.rxOrScaled,
          isPR: workout.isPR,
          description: workout.description,
          value: score,
          valueLabel: scoreTypeLabel(workout.scoreType),
          dateLabel: format(fromDateKey(workout.date), "d MMM yyyy"),
          dateKey: workout.date,
        });

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-colors",
        // A record gets a visible edge — it should be findable by scrolling fast.
        workout.isPR && "border-primary/40",
      )}
    >
      {workout.isPR && (
        <div className="from-primary to-accent absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r" />
      )}

      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{workoutTypeLabel(workout.type)}</Badge>
            {/* RX vs Scaled is only settled once the session has been done, so an
                unscored card shows no standard rather than the placeholder the
                plan was saved with. The score panel asks for it. */}
            {score !== null && (
              <Badge
                variant={workout.rxOrScaled === "RX" ? "primary" : "scaled"}
              >
                {workout.rxOrScaled}
              </Badge>
            )}
            {workout.isPR && (
              <Badge variant="pr">
                <TrophyIcon />
                PR
              </Badge>
            )}
            {isPlanned && (
              <Badge variant="outline">
                <CalendarClockIcon />
                Planned
              </Badge>
            )}
          </div>

          <h3 className="truncate text-lg leading-tight font-bold">
            {workout.title}
          </h3>
        </div>

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${workout.title}`}
            >
              <MoreVerticalIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            {shareCard && (
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setMenuOpen(false);
                  setShareOpen(true);
                }}
              >
                <Share2Icon />
                Share
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full justify-start"
              asChild
              onClick={() => setMenuOpen(false)}
            >
              <Link href={`/workout/edit?id=${workout.id}`}>
                <PencilIcon />
                Edit
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive w-full justify-start"
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
            >
              <Trash2Icon />
              Delete
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {workout.description && (
        <p className="text-muted-foreground line-clamp-3 px-4 text-sm leading-relaxed whitespace-pre-line">
          {workout.description}
        </p>
      )}

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-border/60 px-4 py-3">
        <div>
          <div className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
            {scoreTypeLabel(workout.scoreType)}
          </div>
          <div
            className={cn(
              "tabular font-display text-2xl leading-none font-extrabold",
              workout.isPR && "text-gradient-pr",
              score === null && "text-muted-foreground/40",
            )}
          >
            {score ?? "—"}
          </div>
        </div>

        {workout.notes && (
          <p className="text-muted-foreground/70 line-clamp-2 max-w-[55%] text-right text-xs italic">
            {workout.notes}
          </p>
        )}
      </div>

      {/* The whole point of logging a session before doing it: the result goes in
          from here, in one tap, instead of a round trip through the full form.
          Withheld until the day arrives — there is nothing honest to type into it
          for a session that has not been done yet. */}
      {score === null && !isPlanned && (
        <div className="border-t border-border/60 p-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setScoreOpen(true)}
          >
            <PlusIcon />
            Add score
          </Button>
        </div>
      )}

      {/* Outside the block above: saving a score removes the button that opened
          this panel, and unmounting the panel with it would cut its closing
          animation short. */}
      <ScoreSheet
        workout={workout}
        open={scoreOpen}
        onOpenChange={setScoreOpen}
      />

      {/* Same reasoning as the panel above: kept mounted so its dismissal
          animation survives the menu closing behind it. */}
      <ShareSheet
        card={shareCard}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this workout?</DialogTitle>
            <DialogDescription>
              <span className="text-foreground font-semibold">
                {workout.title}
              </span>{" "}
              will be removed permanently.
              {workout.isPR && (
                <>
                  {" "}
                  It currently holds a personal record — the record will pass to
                  your next-best result.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Keep it</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDelete(workout);
              }}
            >
              <Trash2Icon />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Shown when the selected day has nothing on it. */
export function EmptyDay({
  dateLabel,
  isFuture,
  dateKey,
}: {
  dateLabel: string;
  /** A day ahead is empty because it has not happened, not because it was missed. */
  isFuture: boolean;
  dateKey: string;
}) {
  return (
    <div className="border-border/70 bg-card/40 flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-14 text-center">
      <div className="bg-elevated grid size-14 place-items-center rounded-2xl">
        {isFuture ? (
          <CalendarPlusIcon className="text-muted-foreground size-6" />
        ) : (
          <FlameIcon className="text-muted-foreground size-6" />
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-bold">
          {isFuture ? "Nothing planned" : "Nothing logged"} {dateLabel}
        </h3>
        <p className="text-muted-foreground mx-auto max-w-xs text-sm">
          {isFuture
            ? "Write the session down now and fill in the result once you've done it."
            : "Log a WOD, a heavy single or a run — anything you did counts."}
        </p>
      </div>
      {/* Carries the day being viewed, so the form does not open on today. */}
      <Button asChild variant="secondary">
        <Link href={`/workout/new?date=${dateKey}`}>
          {isFuture ? "Plan a workout" : "Log a workout"}
        </Link>
      </Button>
    </div>
  );
}
