"use client";

import { buildPercentageTable } from "@/lib/percentages";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { formatWeight } from "@/lib/units";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Percentages of a logged best, for reading a prescribed load off a programme
 * mid-session ("5 × 3 @ 75%").
 *
 * Opened from the movement detail panel, so it sits on top of a sheet that is
 * itself a dialog. That nesting is deliberate: the athlete is mid-lookup and
 * should land back on the movement — with its history and log form — rather than
 * have the panel torn down underneath them.
 */
export function PercentageTableDialog({
  movementName,
  maxKg,
  basisReps,
  open,
  onOpenChange,
}: {
  movementName: string;
  /** The standing best, in kilograms — the 100% row. */
  maxKg: number;
  /**
   * Reps performed on the attempt that set `maxKg`, when known.
   *
   * A best above one rep is not a 1RM, and a programme's percentages are of a
   * 1RM, so the table says so instead of quietly being 5–15% light.
   */
  basisReps?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const unitSystem = useUnitSystem();
  const rows = buildPercentageTable(maxKg);
  const isMultiRepBest = typeof basisReps === "number" && basisReps > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{movementName} percentages</DialogTitle>
          <DialogDescription>
            Of your best, {formatWeight(maxKg, unitSystem)}.
          </DialogDescription>
        </DialogHeader>

        {isMultiRepBest && (
          <p className="text-muted-foreground border-border/70 bg-elevated/40 rounded-lg border px-3 py-2 text-xs leading-relaxed">
            That best was set for {basisReps} reps, so these are percentages of a{" "}
            {basisReps}-rep load — your true 1RM is higher.
          </p>
        )}

        {/* Scrolls independently: the full list is taller than a phone in
            landscape, and the header should stay put while it does. */}
        <div className="border-border/70 max-h-[65svh] overflow-y-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Percentages of a {formatWeight(maxKg, unitSystem)}{" "}
              {movementName} best
            </caption>
            <thead className="bg-elevated text-muted-foreground sticky top-0">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase"
                >
                  Percent
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-right text-[10px] font-bold tracking-widest uppercase"
                >
                  Load
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.percent}
                  className={cn(
                    "border-border/50 border-t",
                    // The anchor of the whole table: called out so it is obvious
                    // which number everything below is derived from.
                    row.percent === 100 && "bg-primary/5",
                  )}
                >
                  <td className="tabular px-4 py-2.5 font-semibold">
                    {row.percent}%
                  </td>
                  <td
                    className={cn(
                      "tabular font-display px-4 py-2.5 text-right text-base font-bold",
                      row.percent === 100 && "text-primary",
                    )}
                  >
                    {formatWeight(row.kg, unitSystem)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
