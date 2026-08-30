"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  InfoIcon,
  LinkIcon,
  Loader2Icon,
  UnlinkIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useDisconnectStrava, useStravaConnection } from "@/lib/hooks/use-strava";
import {
  STRAVA_SCOPE,
  buildAuthorizeUrl,
  isStravaConfigured,
} from "@/lib/strava/client";
import { createOAuthState } from "@/lib/strava/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StravaIcon } from "@/components/provider-icons";

/**
 * The Strava account, on Profile → Integrations.
 *
 * Unlike the Octiv card there is no sign-in sheet: Strava's flow is a redirect,
 * so the button's whole job is to leave. The athlete comes back to
 * `/strava/callback`, which is where the connection is actually made.
 *
 * Also unlike Octiv, no expiry is shown. A Strava access token lasts six hours
 * and renews itself, so a countdown would be both alarming and meaningless — the
 * only state worth reporting is a connection Strava has stopped accepting, which
 * arrives as `revokedAt`.
 */
export function StravaConnectCard() {
  const { connection, isConnected, isRevoked } = useStravaConnection();
  const disconnect = useDisconnectStrava();
  const [leaving, setLeaving] = useState(false);

  const configured = isStravaConfigured();

  function handleConnect() {
    // Held true for the rest of this document's life: the redirect below replaces
    // the page, so there is no state to reset afterwards, and a second tap during
    // the navigation would generate a second nonce and invalidate the first.
    setLeaving(true);
    window.location.assign(buildAuthorizeUrl(createOAuthState()));
  }

  async function handleDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success("Strava disconnected");
    } catch {
      toast.error("Could not disconnect Strava");
    }
  }

  // An athlete who unticked `activity:read_all` on the consent screen gets a
  // working connection that silently cannot see their private activities. Saying
  // so is better than letting them wonder where a run went.
  const missingPrivateScope =
    isConnected &&
    !isRevoked &&
    connection !== null &&
    connection.scope.length > 0 &&
    !connection.scope.includes(STRAVA_SCOPE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm tracking-widest uppercase">
          <StravaIcon className="size-4" />
          Strava
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {!configured ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            Strava is not configured for this build. Set{" "}
            <code className="text-xs">NEXT_PUBLIC_STRAVA_CLIENT_ID</code> and{" "}
            <code className="text-xs">NEXT_PUBLIC_STRAVA_WORKER_URL</code>, then
            deploy the token broker in <code className="text-xs">worker/</code>.
          </p>
        ) : isConnected && connection ? (
          <>
            <div
              className={
                isRevoked
                  ? "border-destructive/40 bg-destructive/5 flex items-start gap-3 rounded-xl border px-4 py-3"
                  : "border-border bg-input/40 flex items-start gap-3 rounded-xl border px-4 py-3"
              }
            >
              <div
                className={
                  isRevoked
                    ? "bg-destructive/15 text-destructive grid size-10 shrink-0 place-items-center rounded-xl"
                    : "bg-elevated grid size-10 shrink-0 place-items-center rounded-xl"
                }
              >
                {isRevoked ? (
                  <AlertTriangleIcon className="size-5" />
                ) : (
                  <StravaIcon className="size-5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {connection.username || "Connected"}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                  {isRevoked
                    ? "Strava is no longer accepting this connection. Connect again to keep importing your activities."
                    : "Connected"}
                </span>
              </div>
            </div>

            {missingPrivateScope && (
              <div className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  You did not grant access to private activities, so anything set
                  to &ldquo;Only You&rdquo; will not appear. Connect again to
                  change that.
                </span>
              </div>
            )}

            <div className="flex gap-2">
              {isRevoked && (
                <Button
                  className="flex-1"
                  onClick={handleConnect}
                  disabled={leaving}
                >
                  {leaving ? <Loader2Icon className="animate-spin" /> : <LinkIcon />}
                  Connect again
                </Button>
              )}
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive flex-1 justify-center"
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <UnlinkIcon />
                )}
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Connect Strava to see the runs, rows and rides you have already done
              on the day you are looking at, and put them in your log — scored —
              in one tap.
            </p>
            <Button className="w-full" onClick={handleConnect} disabled={leaving}>
              {leaving ? <Loader2Icon className="animate-spin" /> : <LinkIcon />}
              Connect Strava
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
