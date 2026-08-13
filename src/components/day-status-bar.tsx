"use client";

import { useState } from "react";
import {
  BandageIcon,
  CheckIcon,
  Loader2Icon,
  MoonIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useClearDayMark, useDayMark, useSetDayMark } from "@/lib/hooks/use-day-marks";
import type { DayMark, DayStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

export const DAY_NOTE_MAX = 500;

const PRESENTATION: Record<
  DayStatus,
  {
    label: string;
    icon: typeof MoonIcon;
    /** Card treatment when the day carries this mark. */
    tone: string;
    iconTone: string;
    blurb: string;
    placeholder: string;
  }
> = {
  rest: {
    label: "Rest day",
    icon: MoonIcon,
    tone: "border-border bg-elevated/50",
    iconTone: "bg-elevated text-muted-foreground",
    blurb: "Recovery counts. This day is accounted for, not missed.",
    placeholder: "Deload week, travelling, planned day off…",
  },
  injured: {
    label: "Injured",
    icon: BandageIcon,
    tone: "border-destructive/40 bg-destructive/5",
    iconTone: "bg-destructive/15 text-destructive",
    blurb: "Logged as time lost to injury, so it does not read as a lapse.",
    placeholder: "What hurts, and how it happened…",
  },
};

/**
 * Rest and injury for the selected day.
 *
 * Sits directly under the date strip because it answers the same question the
 * strip poses — "what happened on this day?" — for the days where the answer is
 * not a workout. Without it an empty day is ambiguous: a deliberate rest day and
 * a day you forgot to log look identical, which quietly makes the log punish
 * recovery.
 */
export function DayStatusBar({
  dateKey,
  workouts,
  isFuture,
}: {
  dateKey: string;
  /**
   * The day's sessions, or `undefined` while they are still loading. Rest is
   * refused on a day that has any, so an empty array and "not known yet" must
   * stay distinguishable — offering the button on a maybe would let the user
   * take an action that is about to become invalid.
   */
  workouts: readonly unknown[] | undefined;
  isFuture: boolean;
}) {
  const { data: mark, isPending } = useDayMark(dateKey);
  const clearDayMark = useClearDayMark();
  const [editing, setEditing] = useState<DayStatus | null>(null);

  // A day cannot be both rested and trained. The workout is the stronger claim,
  // so the button is refused here rather than silently deleting the sessions;
  // the reverse case — logging onto a rest day — clears the marker instead.
  const restBlocked = (workouts?.length ?? 0) > 0;
  // You do not plan to be injured. Rest, by contrast, is legitimate programming,
  // so it stays available on days ahead.
  const injuryBlocked = isFuture;

  async function handleClear() {
    try {
      const result = await clearDayMark.mutateAsync(dateKey);
      toast.success(result.queued ? "Cleared on this device" : "Day cleared", {
        description: result.queued
          ? "The change syncs when you're back online."
          : undefined,
      });
    } catch {
      toast.error("Could not clear this day", {
        description: "Try again in a moment.",
      });
    }
  }

  // Nothing at all until both reads settle: flashing the two buttons and then
  // replacing them with a card is worse than a moment of empty space, and
  // offering "Rest day" before the day's sessions are known would offer an
  // action that is about to be refused.
  if (isPending || workouts === undefined) return null;

  return (
    <>
      {mark ? (
        <MarkedDay
          mark={mark}
          onEdit={() => setEditing(mark.status)}
          onClear={handleClear}
          clearing={clearDayMark.isPending}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <StatusButton
            status="rest"
            disabled={restBlocked}
            onClick={() => setEditing("rest")}
          />
          <StatusButton
            status="injured"
            disabled={injuryBlocked}
            onClick={() => setEditing("injured")}
          />
        </div>
      )}

      {(restBlocked || injuryBlocked) && !mark && (
        <p className="text-muted-foreground/70 -mt-1 text-xs leading-relaxed">
          {restBlocked
            ? "This day already has a session, so it can't be a rest day. Delete the session first."
            : "Injuries can only be logged for today or a day that has already happened."}
        </p>
      )}

      {/* Kept outside the branches above so saving a mark — which swaps the
          buttons for the card — does not unmount the panel mid-animation. */}
      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent side="bottom" className="gap-0">
          {editing && (
            // A child so it mounts with the panel: each visit starts from the
            // stored note rather than one left half-typed by the last.
            <DayMarkForm
              dateKey={dateKey}
              status={editing}
              note={mark?.status === editing ? mark.note : ""}
              onSaved={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function StatusButton({
  status,
  disabled,
  onClick,
}: {
  status: DayStatus;
  disabled: boolean;
  onClick: () => void;
}) {
  const { label, icon: Icon } = PRESENTATION[status];

  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-12 justify-center gap-2 font-semibold"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="text-muted-foreground size-4" />
      {status === "injured" ? "Injury" : label}
    </Button>
  );
}

function MarkedDay({
  mark,
  onEdit,
  onClear,
  clearing,
}: {
  mark: DayMark;
  onEdit: () => void;
  onClear: () => void;
  clearing: boolean;
}) {
  const { label, icon: Icon, tone, iconTone, blurb } = PRESENTATION[mark.status];

  return (
    <div
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", tone)}
    >
      <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", iconTone)}>
        <Icon className="size-5" />
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit the note on this ${label.toLowerCase()}`}
      >
        <span className="block font-semibold">{label}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
          {mark.note || blurb}
        </span>
      </button>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove the ${label.toLowerCase()} mark`}
        onClick={onClear}
        disabled={clearing}
      >
        {clearing ? <Loader2Icon className="animate-spin" /> : <XIcon />}
      </Button>
    </div>
  );
}

function DayMarkForm({
  dateKey,
  status,
  note: initialNote,
  onSaved,
}: {
  dateKey: string;
  status: DayStatus;
  note: string;
  onSaved: () => void;
}) {
  const setDayMark = useSetDayMark();
  const [note, setNote] = useState(initialNote);

  const { label, blurb, placeholder } = PRESENTATION[status];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      const result = await setDayMark.mutateAsync({
        date: dateKey,
        status,
        note: note.trim(),
      });

      toast.success(
        result.queued ? `${label} saved on this device` : `${label} logged`,
        {
          description: result.queued
            ? "It uploads automatically when you're back online."
            : blurb,
        },
      );

      onSaved();
    } catch {
      toast.error(`Could not log this ${label.toLowerCase()}`, {
        description: "Your note is still here — check your connection and try again.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{label}</SheetTitle>
        <SheetDescription>{blurb}</SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-2">
        <Label htmlFor="dayNote">
          Note
          <span className="text-muted-foreground/60 font-normal">optional</span>
        </Label>
        <Textarea
          id="dayNote"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={placeholder}
          maxLength={DAY_NOTE_MAX}
          rows={3}
        />
      </div>

      <SheetFooter>
        <Button type="submit" disabled={setDayMark.isPending}>
          {setDayMark.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <CheckIcon />
          )}
          Save
        </Button>
      </SheetFooter>
    </form>
  );
}
