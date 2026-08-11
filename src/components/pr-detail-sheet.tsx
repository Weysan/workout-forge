"use client";

import { format } from "date-fns";
import { TrophyIcon } from "lucide-react";

import { cn, fromDateKey } from "@/lib/utils";
import { formatScore, isScored, scoreTypeLabel } from "@/lib/scoring";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { useBenchmarkHistory } from "@/lib/hooks/use-workouts";
import type { Benchmark, PersonalRecord } from "@/lib/types";
import { QuickLogForm } from "@/components/quick-log-form";
import { Badge } from "@/components/ui/badge";
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

  if (!benchmark) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
              onLogged={() => onOpenChange(false)}
            />
          </div>

          {/* --- History --- */}
          <h3 className="text-muted-foreground mt-6 mb-3 text-[11px] font-bold tracking-widest uppercase">
            {scoreTypeLabel(benchmark.scoreType)} history
          </h3>

          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : history && history.length > 0 ? (
            <ol className="space-y-2">
              {history.map((attempt) => (
                <li
                  key={attempt.id}
                  className="border-border/70 bg-card/60 flex items-start justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="tabular text-sm font-semibold">
                        {format(fromDateKey(attempt.date), "d MMM yyyy")}
                      </span>
                      <Badge
                        variant={
                          attempt.rxOrScaled === "RX" ? "primary" : "scaled"
                        }
                      >
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

                  {/* An attempt can be on the calendar before it has a result —
                      it shows here as pending rather than as a score of zero. */}
                  <span
                    className={cn(
                      "tabular font-display shrink-0 text-lg font-bold",
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
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground border-border/70 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              No attempts logged yet. Add one above — including results from
              before you started using FORGE.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
