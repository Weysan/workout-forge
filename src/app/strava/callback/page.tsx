"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangleIcon, CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { useCompleteStravaConnection } from "@/lib/hooks/use-strava";
import { STRAVA_SCOPE } from "@/lib/strava/client";
import { clearOAuthState, readOAuthState } from "@/lib/strava/state";
import { BootScreen } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";

/**
 * Where Strava sends the athlete back, as `/strava/callback?code=…&state=…`.
 *
 * A query parameter rather than a path segment for the same reason as
 * `/workout/edit?id=` — this is a static export, so there is one prerendered page
 * that reads its input at runtime.
 *
 * The exchange happens here rather than on the profile page so that the code
 * never survives a navigation: it is single-use, and leaving it in a URL the
 * athlete might share or bookmark is worth avoiding even though using it twice
 * would fail anyway.
 */
type Phase =
  | { kind: "checking" }
  /** No stored nonce — the flow probably finished in another browser. See below. */
  | { kind: "confirm" }
  | { kind: "exchanging" }
  | { kind: "done"; username: string }
  | { kind: "failed"; reason: string };

function StravaCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const complete = useCompleteStravaConnection();

  const code = params.get("code");
  const returnedState = params.get("state");
  const grantedScope = params.get("scope") ?? STRAVA_SCOPE;
  const denied = params.get("error");

  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  // The exchange must happen exactly once. Strict mode runs effects twice in
  // development, and an authorization code is single-use — the second attempt
  // would fail and report a connection problem that does not exist.
  const started = useRef(false);

  function exchange() {
    if (started.current) return;
    started.current = true;

    setPhase({ kind: "exchanging" });

    complete.mutate(
      { code: code!, scope: grantedScope },
      {
        onSuccess: (connection) => {
          setPhase({ kind: "done", username: connection.username });
          toast.success(
            connection.username
              ? `Strava connected as ${connection.username}`
              : "Strava connected",
          );
          // Long enough to read the tick, short enough not to feel stuck.
          setTimeout(() => router.replace("/profile"), 1200);
        },
        onError: () => {
          setPhase({
            kind: "failed",
            reason:
              "The connection could not be completed. Try connecting again from your profile.",
          });
        },
      },
    );
  }

  useEffect(() => {
    // The athlete pressed "Cancel" on Strava's consent screen. Not a failure —
    // just say so and send them back.
    if (denied) {
      setPhase({
        kind: "failed",
        reason:
          denied === "access_denied"
            ? "You cancelled the connection. Nothing was changed."
            : `Strava reported: ${denied}`,
      });
      clearOAuthState();
      return;
    }

    if (!code) {
      setPhase({
        kind: "failed",
        reason: "Strava did not send an authorization code.",
      });
      return;
    }

    const stored = readOAuthState();
    clearOAuthState();

    // A stored nonce that does not match is a genuine red flag: this callback was
    // not produced by the flow this browser started. Refuse it outright.
    if (stored && stored !== returnedState) {
      setPhase({
        kind: "failed",
        reason:
          "This link does not match the connection this device started. Try again from your profile.",
      });
      return;
    }

    // No stored nonce at all is the ordinary iOS case: an installed PWA handed
    // the authorize step to Safari, so the context that comes back never saw the
    // write. Rather than fail a legitimate connection, ask for a tap — which
    // defends the same thing the nonce does, since nobody can tap for them.
    if (!stored) {
      setPhase({ kind: "confirm" });
      return;
    }

    exchange();
    // Runs once, against the parameters this page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase.kind === "checking" || phase.kind === "exchanging") {
    return (
      <Centered>
        <Loader2Icon className="text-primary size-8 animate-spin" />
        <p className="text-muted-foreground text-sm">
          {phase.kind === "exchanging"
            ? "Connecting your Strava account…"
            : "Checking the link…"}
        </p>
      </Centered>
    );
  }

  if (phase.kind === "confirm") {
    return (
      <Centered>
        <h1 className="font-display text-2xl font-extrabold">Finish connecting</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Strava sent you back here to link your account. Confirm it was you who
          started this.
        </p>
        <div className="flex w-full flex-col gap-2">
          <Button onClick={exchange}>
            <CheckIcon />
            Connect Strava
          </Button>
          <Button asChild variant="ghost">
            <Link href="/profile">Cancel</Link>
          </Button>
        </div>
      </Centered>
    );
  }

  if (phase.kind === "done") {
    return (
      <Centered>
        <div className="bg-elevated text-primary grid size-14 place-items-center rounded-2xl">
          <CheckIcon className="size-7" />
        </div>
        <h1 className="font-display text-2xl font-extrabold">Strava connected</h1>
        {phase.username && (
          <p className="text-muted-foreground text-sm">as {phase.username}</p>
        )}
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="bg-destructive/15 text-destructive grid size-14 place-items-center rounded-2xl">
        <AlertTriangleIcon className="size-7" />
      </div>
      <h1 className="font-display text-2xl font-extrabold">Not connected</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {phase.reason}
      </p>
      <Button asChild variant="secondary">
        <Link href="/profile">Back to profile</Link>
      </Button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </div>
  );
}

export default function StravaCallbackPage() {
  return (
    <Suspense fallback={<BootScreen />}>
      <StravaCallback />
    </Suspense>
  );
}
