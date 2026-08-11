"use client";

import { useState } from "react";
import { format } from "date-fns";
import { PencilIcon, PercentIcon, TrophyIcon } from "lucide-react";

import { cn, fromDateKey } from "@/lib/utils";
import { formatScore, isScored, scoreTypeLabel } from "@/lib/scoring";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { useBenchmarkHistory } from "@/lib/hooks/use-workouts";
import type { Benchmark, PersonalRecord, Workout } from "@/lib/types";
import { PercentageTableDialog } from "@/components/percentage-table-dialog";
import { QuickLogForm } from "@/components/quick-log-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Full attempt history for one movement.
 *
 * Sorted by date rather than by score: progression over time is the story, and
 * the best result is already called out at the top.
 */
export function PrDetailSheet({
  benchmark,
  record,
  open,
  onOpenChange,
}: {
  benchmark: Benchmark | null;
  record: PersonalRecord | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const unitSystem = useUnitSystem();
  const { data: history, isPending } = useBenchmarkHistory(
    open ? (benchmark?.id ?? null) : null,
  );
  const [percentagesOpen, setPercentagesOpen] = useState(false);
  // At most one attempt is under correction at a time: two open editors would
  // both be writing to the same history list behind each other's back.
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!benchmark) return null;

  // Only loads divide into percentages — a benchmark time or an AMRAP score does
  // not, so the button stays off those movements entirely.
  const percentagesAvailable =
    record !== undefined && record.scoreType === "weight";

  // The record document stores the load but not the reps behind it, so the reps
  // come from the attempt the recompute badged as the record holder. `undefined`
  // while the history loads, which the table treats as "not known" rather than
  // as a single.
  const bestReps = history?.find((attempt) => attempt.isPR)?.reps;

  return (
    <Sheet
      open={open}
      // Dismissing the panel has to drop the percentage table and any open
      // editor with it: this component stays mounted between movements, so
      // leftover state would greet the next movement opened.
      onOpenChange={(next) => {
        if (!next) {
          setPercentagesOpen(false);
          setEditingId(null);
        }
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="gap-0">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{benchmark.category}</Badge>
            <Badge variant="outline">{benchmark.type}</Badge>
          </div>
          <SheetTitle>{benchmark.name}</SheetTitle>
          <SheetDescription className="whitespace-pre-line">
            {benchmark.description}
          </SheetDescription>
        </SheetHeader>

        <div className="overflow-y-auto px-5 pb-8">
          {/* --- Standing best --- */}
          <div
            className={cn(
              "flex items-end justify-between rounded-xl border px-4 py-3",
              record
                ? "border-primary/40 bg-primary/10"
                : "border-border bg-card/60",
            )}
          >
            <div>
              <div className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
                All-time best
              </div>
              <div className="tabular font-display text-3xl leading-none font-extrabold">
                {record ? (
                  <span className="text-gradient-pr">
                    {formatScore(
                      record.scoreType,
                      record.bestValue,
                      unitSystem,
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </div>
            </div>
            {record?.achievedOn && (
              <div className="text-muted-foreground text-right text-xs">
                {format(fromDateKey(record.achievedOn), "d MMM yyyy")}
              </div>
            )}
          </div>

          {/* --- Percentage table ---------------------------------------------
              Full-width rather than tucked into the card above: it is reached
              mid-session, on a phone, to answer "what is 75% of this?". */}
          {percentagesAvailable && (
            <Button
              type="button"
              variant="outline"
              className="mt-2.5 w-full"
              onClick={() => setPercentagesOpen(true)}
            >
              <PercentIcon />
              Percentage table
            </Button>
          )}

          {/* --- Log a result -------------------------------------------------
              Placed above the history: it is the reason most visits to this
              panel happen, and burying it under a long attempt list would mean
              scrolling past everything to reach the primary action. */}
          <div className="border-border/70 bg-elevated/40 mt-5 rounded-xl border p-4">
            <h3 className="font-display mb-3 text-sm font-bold tracking-widest uppercase">
              Log a result
            </h3>
            {/* Dismiss on save: the new result lands on the records list and the
                calendar, both of which this panel covers. */}
            <QuickLogForm
              benchmark={benchmark}
              onSaved={() => onOpenChange(false)}
            />
          </div>

          {/* --- History --- */}
          <div className="mt-6 mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
              {scoreTypeLabel(benchmark.scoreType)} history
            </h3>
            {history && history.length > 0 && (
              <span className="text-muted-foreground/60 text-[11px]">
                Tap to edit
              </span>
            )}
          </div>

          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : history && history.length > 0 ? (
            <ol className="space-y-2">
              {history.map((attempt) =>
                attempt.id === editingId ? (
                  <li
                    key={attempt.id}
                    className="border-primary/50 bg-card rounded-lg border p-4"
                  >
                    <h4 className="font-display mb-3 text-sm font-bold tracking-widest uppercase">
                      Edit result
                    </h4>
                    {/* Stays open on save, unlike the panel's own form: the
                        corrected row is right here, and the history behind this
                        editor refetches to show it. */}
                    <QuickLogForm
                      benchmark={benchmark}
                      workout={attempt}
                      onSaved={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <li key={attempt.id}>
                    <AttemptRow
                      attempt={attempt}
                      onEdit={() => setEditingId(attempt.id)}
                    />
                  </li>
                ),
              )}
            </ol>
          ) : (
            <p className="text-muted-foreground border-border/70 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              No attempts logged yet. Add one above — including results from
              before you started using FORGE.
            </p>
          )}
        </div>

        {percentagesAvailable && (
          <PercentageTableDialog
            movementName={benchmark.name}
            maxKg={record.bestValue}
            basisReps={bestReps}
            open={percentagesOpen}
            onOpenChange={setPercentagesOpen}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * One logged attempt, as a button that opens it for correction.
 *
 * The whole row is the target rather than a small pencil: a mistyped result is
 * spotted by reading the row, and on a phone the thumb is already there.
 */
function AttemptRow({
  attempt,
  onEdit,
}: {
  attempt: Workout;
  onEdit: () => void;
}) {
  const unitSystem = useUnitSystem();

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit result from ${format(fromDateKey(attempt.date), "d MMMM yyyy")}`}
      className="border-border/70 bg-card/60 hover:border-primary/50 hover:bg-elevated group flex w-full items-start justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="tabular text-sm font-semibold">
            {format(fromDateKey(attempt.date), "d MMM yyyy")}
          </span>
          <Badge variant={attempt.rxOrScaled === "RX" ? "primary" : "scaled"}>
            {attempt.rxOrScaled}
          </Badge>
          {attempt.isPR && (
            <Badge variant="pr">
              <TrophyIcon />
              PR
            </Badge>
          )}
        </div>
        {attempt.notes && (
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {attempt.notes}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* An attempt can be on the calendar before it has a result — it shows
            here as pending rather than as a score of zero. */}
        <span
          className={cn(
            "tabular font-display text-lg font-bold",
            !isScored(attempt) && "text-muted-foreground/40",
          )}
        >
          {isScored(attempt)
            ? formatScore(
                attempt.scoreType,
                attempt.scoreValue,
                unitSystem,
                attempt.reps,
              )
            : "—"}
        </span>
        <PencilIcon
          className="text-muted-foreground/40 group-hover:text-primary size-3.5 transition-colors"
          aria-hidden
        />
      </div>
    </button>
  );
}
