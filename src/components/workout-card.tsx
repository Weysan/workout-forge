"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FlameIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
  TrophyIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatScore, scoreTypeLabel } from "@/lib/scoring";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import type { Workout } from "@/lib/types";
import { WORKOUT_TYPE_OPTIONS } from "@/constants/seedData";
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

function typeLabel(type: Workout["type"]) {
  return WORKOUT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

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

  const score = formatScore(
    workout.scoreType,
    workout.scoreValue,
    unitSystem,
    workout.reps,
  );

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
            <Badge variant="outline">{typeLabel(workout.type)}</Badge>
            <Badge variant={workout.rxOrScaled === "RX" ? "primary" : "scaled"}>
              {workout.rxOrScaled}
            </Badge>
            {workout.isPR && (
              <Badge variant="pr">
                <TrophyIcon />
                PR
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
            )}
          >
            {score}
          </div>
        </div>

        {workout.notes && (
          <p className="text-muted-foreground/70 line-clamp-2 max-w-[55%] text-right text-xs italic">
            {workout.notes}
          </p>
        )}
      </div>

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

/** Shown when the selected day has nothing logged. */
export function EmptyDay({ dateLabel }: { dateLabel: string }) {
  return (
    <div className="border-border/70 bg-card/40 flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-14 text-center">
      <div className="bg-elevated grid size-14 place-items-center rounded-2xl">
        <FlameIcon className="text-muted-foreground size-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-bold">Nothing logged {dateLabel}</h3>
        <p className="text-muted-foreground mx-auto max-w-xs text-sm">
          Log a WOD, a heavy single or a run — anything you did counts.
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link href="/workout/new">Log a workout</Link>
      </Button>
    </div>
  );
}
