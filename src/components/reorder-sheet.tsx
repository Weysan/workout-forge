"use client";

import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  TrophyIcon,
} from "lucide-react";
import { toast } from "sonner";

import { moveItem, orderChanged } from "@/lib/day-order";
import { formatScore, isScored } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { useReorderWorkouts } from "@/lib/hooks/use-workouts";
import type { Workout } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Arranging a day into the order it was trained.
 *
 * The log reads newest first, which for a day logged as it happened is the
 * sequence backwards. This panel is where that is fixed: a compact row per
 * session, dragged by its handle or nudged with the arrows, saved as one batch.
 *
 * Two ways to move a row rather than one, on purpose. Dragging is what a thumb
 * reaches for, but it is unusable with a keyboard or a screen reader and awkward
 * with gloves on and sweat on the glass — so the arrows are a peer, not a
 * fallback, and both write the same thing.
 *
 * Rows are a fixed height because the drag maths depends on it: a target index is
 * the pointer's travel divided by one row's worth of it. Sessions here are titles
 * and scores, which fit a single line, so nothing is lost by pinning it.
 */

/** Row height and the gap below it, in px — see the note above. */
const ROW_HEIGHT = 56;
const ROW_GAP = 8;
const STEP = ROW_HEIGHT + ROW_GAP;

interface Drag {
  /** Which row is in hand, by its index at the moment the drag started. */
  fromIndex: number;
  pointerId: number;
  startY: number;
  /** Pointer travel since `startY`, in px. */
  dy: number;
}

export function ReorderSheet({
  dateKey,
  workouts,
  open,
  onOpenChange,
}: {
  dateKey: string;
  /** The day's sessions, in the order currently on screen. */
  workouts: readonly Workout[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const unitSystem = useUnitSystem();
  const reorder = useReorderWorkouts(dateKey);

  const [ids, setIds] = useState<string[]>(() => workouts.map((w) => w.id));
  const [drag, setDrag] = useState<Drag | null>(null);

  const byId = useMemo(
    () => new Map(workouts.map((workout) => [workout.id, workout])),
    [workouts],
  );

  // The panel's list is local state, so it is seeded when the panel opens. Doing
  // it on every `workouts` change instead would throw away a half-finished
  // arrangement the moment a background refetch landed.
  useEffect(() => {
    if (!open) return;
    setIds(workouts.map((workout) => workout.id));
    setDrag(null);
    // `workouts` is deliberately not a dependency; see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A session deleted from behind this panel must not leave a row pointing at
  // nothing, and one logged while it is open belongs in the list being arranged.
  useEffect(() => {
    setIds((current) => {
      const kept = current.filter((id) => byId.has(id));
      const added = workouts
        .map((workout) => workout.id)
        .filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      const same =
        next.length === current.length &&
        next.every((id, index) => id === current[index]);
      return same ? current : next;
    });
  }, [byId, workouts]);

  const targetIndex = useMemo(() => {
    if (!drag) return null;
    const moved = drag.fromIndex + Math.round(drag.dy / STEP);
    return Math.max(0, Math.min(ids.length - 1, moved));
  }, [drag, ids.length]);

  // Every pointermove re-renders, so this closes over the final `dy` and needs no
  // ref of its own.
  function endDrag() {
    if (!drag || targetIndex === null) return;
    const { fromIndex } = drag;
    setIds((current) => moveItem(current, fromIndex, targetIndex));
    setDrag(null);
  }

  function handlePointerDown(event: ReactPointerEvent, index: number) {
    // Mouse drags only from the primary button; a right-click should not lift a
    // row and then leave it stuck to the pointer.
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      fromIndex: index,
      pointerId: event.pointerId,
      startY: event.clientY,
      dy: 0,
    });
  }

  function handlePointerMove(event: ReactPointerEvent) {
    setDrag((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, dy: event.clientY - current.startY }
        : current,
    );
  }

  function nudge(index: number, direction: -1 | 1) {
    setIds((current) => moveItem(current, index, index + direction));
  }

  /**
   * How far a row sits from its resting place while a drag is in progress: the
   * dragged row follows the finger, and the rows it has passed step aside by
   * exactly one row's height to open the gap it will land in.
   */
  function offsetFor(index: number): number {
    if (!drag || targetIndex === null) return 0;
    if (index === drag.fromIndex) return drag.dy;
    if (drag.fromIndex < targetIndex) {
      return index > drag.fromIndex && index <= targetIndex ? -STEP : 0;
    }
    return index >= targetIndex && index < drag.fromIndex ? STEP : 0;
  }

  const dirty = orderChanged(workouts, ids);

  async function handleSave() {
    if (!dirty) {
      onOpenChange(false);
      return;
    }

    try {
      const result = await reorder.mutateAsync(ids);
      onOpenChange(false);
      toast.success(result.queued ? "Order saved on this device" : "Order saved", {
        description: result.queued
          ? "It syncs when you're back online."
          : undefined,
      });
    } catch {
      toast.error("Could not save the order", {
        description: "The day is unchanged. Try again in a moment.",
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0">
        <SheetHeader>
          <SheetTitle>Reorder sessions</SheetTitle>
          <SheetDescription>
            Drag a session by its handle, or use the arrows, to put the day in the
            order you trained it.
          </SheetDescription>
        </SheetHeader>

        <div className="overflow-y-auto px-5">
          <ol className="relative" style={{ height: ids.length * STEP }}>
            {ids.map((id, index) => {
              const workout = byId.get(id);
              if (!workout) return null;

              const score = isScored(workout)
                ? formatScore(
                    workout.scoreType,
                    workout.scoreValue,
                    unitSystem,
                    workout.reps,
                  )
                : null;
              const lifted = drag?.fromIndex === index;

              return (
                <li
                  key={id}
                  className={cn(
                    "absolute inset-x-0 flex items-center gap-1 rounded-xl border px-2",
                    lifted
                      ? "border-primary/50 bg-elevated z-10 shadow-xl shadow-black/40"
                      : "border-border/70 bg-card/60",
                    // Only the untouched rows animate: transitioning the row in
                    // hand would have it lag a finger's width behind the pointer.
                    !drag && "transition-transform",
                  )}
                  style={{
                    height: ROW_HEIGHT,
                    top: index * STEP,
                    transform: `translateY(${offsetFor(index)}px)`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Drag ${workout.title} to reorder`}
                    // Without this the browser claims the gesture as a scroll and
                    // the pointer events stop arriving mid-drag.
                    className="text-muted-foreground hover:text-foreground grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg"
                    onPointerDown={(event) => handlePointerDown(event, index)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <GripVerticalIcon className="size-4" />
                  </button>

                  <span className="text-muted-foreground/70 tabular w-4 shrink-0 text-center text-xs font-bold">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">
                        {workout.title}
                      </span>
                      {workout.isPR && (
                        <TrophyIcon className="text-primary size-3 shrink-0" />
                      )}
                    </div>
                    <div className="text-muted-foreground tabular text-xs">
                      {score ?? "Not scored"}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${workout.title} up`}
                      disabled={index === 0}
                      onClick={() => nudge(index, -1)}
                    >
                      <ChevronUpIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${workout.title} down`}
                      disabled={index === ids.length - 1}
                      onClick={() => nudge(index, 1)}
                    >
                      <ChevronDownIcon />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <SheetFooter>
          <Button
            size="lg"
            onClick={handleSave}
            disabled={reorder.isPending || !dirty}
          >
            {reorder.isPending ? "Saving…" : "Save order"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={reorder.isPending}
          >
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
