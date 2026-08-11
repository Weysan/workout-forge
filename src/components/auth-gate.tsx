"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/hooks/use-profile";
import { ForgeMark } from "@/components/brand";

/**
 * Client-side route guard.
 *
 * Auth state lives in IndexedDB, not a cookie the server can read, so the guard
 * has to run in the browser. The trade-off is a brief loading state on first
 * paint; it is preferable to shipping a session cookie layer for an app whose
 * data access is already enforced by Firestore rules.
 *
 * Three states are distinguished, and conflating any two of them causes a
 * redirect loop:
 *   · resolving         → hold
 *   · signed out        → /login
 *   · signed in, no profile → /onboarding
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, initialising } = useAuth();
  const { data: profile, isPending: profilePending } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  const needsOnboarding = Boolean(user) && !profilePending && profile === null;

  useEffect(() => {
    if (initialising) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (needsOnboarding && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [initialising, user, needsOnboarding, pathname, router]);

  // Hold the shell until we know which of the three states we are in, so no
  // page renders with a half-known user.
  const resolving =
    initialising || !user || (profilePending && pathname !== "/onboarding");

  if (resolving || (needsOnboarding && pathname !== "/onboarding")) {
    return <BootScreen />;
  }

  return <>{children}</>;
}

/** Brand-consistent hold screen; never shown for more than a moment. */
export function BootScreen() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <ForgeMark className="text-primary size-10 animate-pulse" />
      <span className="text-muted-foreground text-[11px] font-bold tracking-[0.3em] uppercase">
        Loading
      </span>
    </div>
  );
}
