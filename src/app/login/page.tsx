"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { Loader2Icon, WifiOffIcon } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { usingEmulator } from "@/lib/firebase";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { Button } from "@/components/ui/button";
import { ForgeLogo } from "@/components/brand";
import { GoogleIcon } from "@/components/provider-icons";
import { BootScreen } from "@/components/auth-gate";

/**
 * Google is the only sign-in offered.
 *
 * Apple's popup flow does not survive an installed PWA on iOS — it opens outside
 * the standalone window and the credential never comes back — so offering it
 * would be a dead end for the platform this app is built for. `signIn("apple")`
 * still exists for when that is handled properly with a redirect flow.
 */
export default function LoginPage() {
  const { user, initialising, signIn } = useAuth();
  const { online } = useSyncStatus();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // Someone arriving here with a live session (bookmark, back button) should not
  // be asked to sign in again.
  useEffect(() => {
    if (!initialising && user) router.replace("/");
  }, [initialising, user, router]);

  async function handleSignIn() {
    setPending(true);
    try {
      await signIn("google");
      // The redirect is driven by the effect above once auth state settles.
    } catch (error) {
      setPending(false);

      if (error instanceof FirebaseError) {
        // Dismissing the popup is a deliberate choice, not a failure worth a
        // red toast.
        if (
          error.code === "auth/popup-closed-by-user" ||
          error.code === "auth/cancelled-popup-request"
        ) {
          return;
        }

        if (error.code === "auth/popup-blocked") {
          toast.error("Your browser blocked the sign-in window", {
            description: "Allow pop-ups for this site and try again.",
          });
          return;
        }

        if (error.code === "auth/operation-not-allowed") {
          toast.error("This sign-in method is not enabled", {
            description:
              "Enable it in Firebase console → Authentication → Sign-in method.",
          });
          return;
        }
      }

      toast.error("Could not sign you in", {
        description: "Check your connection and try again.",
      });
    }
  }

  // Only an already-authenticated user is held back, and only for the moment it
  // takes the redirect above to fire. `initialising` deliberately does NOT gate
  // this screen: it starts true on the server, so gating on it would make every
  // signed-out visitor — the entire audience for this page — wait through a
  // spinner for content that is safe to render immediately.
  if (user) return <BootScreen />;

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      {/* Hairline grid + emerald bloom: the "gym floor under stadium light" look. */}
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]" />

      <div className="relative flex flex-1 flex-col justify-between px-6 pt-safe pb-safe">
        <div className="flex flex-1 flex-col justify-center gap-10 py-16">
          <ForgeLogo showTagline className="justify-center" />

          <div className="space-y-4 text-center">
            <h1 className="font-display text-[2.75rem] leading-[0.95] font-extrabold tracking-tight">
              Every session
              <br />
              <span className="text-gradient-pr">on the record.</span>
            </h1>
            <p className="text-muted-foreground mx-auto max-w-sm text-base leading-relaxed">
              Log WODs, chase benchmarks and watch your lifts, runs and Hyrox
              splits move — all in one place.
            </p>
          </div>

          <ul className="mx-auto flex flex-wrap justify-center gap-2">
            {["CrossFit", "Hyrox", "Strength", "Running"].map((tag) => (
              <li
                key={tag}
                className="border-border bg-card/60 text-muted-foreground rounded-md border px-3 py-1.5 text-[11px] font-bold tracking-widest uppercase"
              >
                {tag}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 pb-8">
          {/* Sign-in is the one flow that cannot work offline: it needs a round
              trip to Google. Saying so beats a popup that fails. */}
          {!online && (
            <div className="border-warning/30 bg-warning/10 text-warning flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed">
              <WifiOffIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-bold">No connection.</span> Signing in needs
                one — but once you are in, FORGE works offline.
              </span>
            </div>
          )}

          <Button
            size="lg"
            variant="default"
            className="w-full"
            onClick={handleSignIn}
            disabled={pending || !online}
          >
            {pending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <GoogleIcon className="size-5" />
            )}
            Continue with Google
          </Button>

          {usingEmulator && (
            <p className="text-warning/80 pt-2 text-center text-xs">
              Local emulator — sign-in opens a fake account picker. No real
              Google account is used.
            </p>
          )}

          <p className="text-muted-foreground/70 pt-2 text-center text-xs leading-relaxed">
            Your training data is private to your account.
          </p>
        </div>
      </div>
    </div>
  );
}
