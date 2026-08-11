import { WifiOffIcon } from "lucide-react";

import { ForgeLogo } from "@/components/brand";

/**
 * Served by the service worker when a navigation fails offline.
 *
 * Deliberately static — no providers, no Firebase — so it renders even when
 * nothing else can load.
 */
export const metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <ForgeLogo />

      <div className="bg-elevated grid size-16 place-items-center rounded-2xl">
        <WifiOffIcon className="text-muted-foreground size-7" />
      </div>

      <div className="space-y-2">
        <h1 className="font-display text-2xl font-extrabold">You&apos;re offline</h1>
        <p className="text-muted-foreground mx-auto max-w-sm text-sm leading-relaxed">
          Workouts you logged while connected are still on this device. Anything
          you log now will sync as soon as you have signal again.
        </p>
      </div>
    </div>
  );
}
