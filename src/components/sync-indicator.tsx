"use client";

import { CheckIcon, CloudUploadIcon, WifiOffIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";

/**
 * Connection and sync state, in the header.
 *
 * Deliberately visible rather than tucked into a settings screen: an athlete who
 * logs a set on gym wifi needs to know whether the app considers it saved. Silence
 * about queued writes is what makes offline apps feel untrustworthy.
 *
 * Renders nothing in the ordinary case — online with nothing pending — so the
 * header stays quiet unless there is something to say.
 */
export function SyncIndicator() {
  const { online, pendingWrites, syncing, justSynced } = useSyncStatus();

  if (online && pendingWrites === 0 && !justSynced) return null;

  const state = !online
    ? ({
        label: pendingWrites > 0 ? `${pendingWrites} to sync` : "Offline",
        icon: WifiOffIcon,
        className: "border-warning/40 bg-warning/15 text-warning",
        pulse: false,
      } as const)
    : syncing
      ? ({
          label: "Syncing",
          icon: CloudUploadIcon,
          className: "border-accent/40 bg-accent/15 text-accent",
          pulse: true,
        } as const)
      : ({
          label: "Synced",
          icon: CheckIcon,
          className: "border-primary/40 bg-primary/15 text-primary",
          pulse: false,
        } as const);

  const Icon = state.icon;

  return (
    <span
      // aria-live so a screen reader announces the transition to offline without
      // the user having to go looking for it.
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold tracking-widest uppercase",
        state.className,
      )}
    >
      <Icon className={cn("size-3", state.pulse && "animate-pulse")} />
      {state.label}
    </span>
  );
}

/**
 * Full-width notice for the offline case, shown under the header.
 *
 * The badge alone is easy to miss on a first encounter; this states the contract
 * explicitly the first time it matters.
 */
export function OfflineBanner() {
  const { online, pendingWrites } = useSyncStatus();

  if (online) return null;

  return (
    <div className="border-warning/30 bg-warning/10 text-warning flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed">
      <WifiOffIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="font-bold">No connection.</span> Everything you log is
        saved on this device and uploads automatically when you are back online.
        {pendingWrites > 0 && (
          <>
            {" "}
            <span className="font-semibold">
              {pendingWrites} change{pendingWrites === 1 ? "" : "s"} waiting.
            </span>
          </>
        )}
      </span>
    </div>
  );
}
