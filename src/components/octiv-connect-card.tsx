"use client";

import { useState } from "react";
import { format, isValid } from "date-fns";
import {
  AlertTriangleIcon,
  CheckIcon,
  LinkIcon,
  Loader2Icon,
  UnlinkIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useConnectOctiv, useDisconnectOctiv, useOctivConnection } from "@/lib/hooks/use-octiv";
import { OctivAuthError } from "@/lib/octiv/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function formatExpiry(isoDate: string): string | null {
  const date = new Date(isoDate);
  return isValid(date) ? format(date, "d MMM yyyy") : null;
}

/**
 * The Octiv account, on Profile → Integrations.
 *
 * Connecting is a one-off: Octiv's token lasts a year, so the normal state of
 * this card is "connected", showing who as and until when.
 */
export function OctivConnectCard() {
  const { connection, isConnected, isExpired } = useOctivConnection();
  const disconnect = useDisconnectOctiv();
  const [signInOpen, setSignInOpen] = useState(false);

  async function handleDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success("Octiv disconnected");
    } catch {
      toast.error("Could not disconnect Octiv");
    }
  }

  const expiry = connection ? formatExpiry(connection.expiresAt) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm tracking-widest uppercase">
          Octiv
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {isConnected && connection ? (
          <>
            <div
              className={
                isExpired
                  ? "border-destructive/40 bg-destructive/5 flex items-start gap-3 rounded-xl border px-4 py-3"
                  : "border-border bg-input/40 flex items-start gap-3 rounded-xl border px-4 py-3"
              }
            >
              <div
                className={
                  isExpired
                    ? "bg-destructive/15 text-destructive grid size-10 shrink-0 place-items-center rounded-xl"
                    : "bg-elevated text-primary grid size-10 shrink-0 place-items-center rounded-xl"
                }
              >
                {isExpired ? (
                  <AlertTriangleIcon className="size-5" />
                ) : (
                  <CheckIcon className="size-5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {connection.username || "Connected"}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                  {isExpired
                    ? "This connection has expired. Sign in again to keep seeing the day's WOD."
                    : expiry
                      ? `Connected · expires ${expiry}`
                      : "Connected"}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              {isExpired && (
                <Button className="flex-1" onClick={() => setSignInOpen(true)}>
                  <LinkIcon />
                  Sign in again
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
              Connect your gym&apos;s Octiv account to see the programming for
              the day you are looking at, and put it in your log in one tap.
            </p>
            <Button className="w-full" onClick={() => setSignInOpen(true)}>
              <LinkIcon />
              Connect Octiv
            </Button>
          </>
        )}
      </CardContent>

      {/* Kept mounted outside the branches: a successful sign-in swaps the whole
          card, and unmounting the panel with it would cut its close short. */}
      <Sheet open={signInOpen} onOpenChange={setSignInOpen}>
        <SheetContent side="bottom" className="gap-0">
          {/* A child, so each visit starts from empty fields rather than from
              whatever the last attempt left behind. */}
          {signInOpen && <SignInForm onDone={() => setSignInOpen(false)} />}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const connect = useConnectOctiv();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const connection = await connect.mutateAsync({
        username: username.trim(),
        password,
      });
      toast.success(`Octiv connected as ${connection.username}`);
      onDone();
    } catch (caught) {
      // Shown in the panel rather than only as a toast: the fields are right
      // there, and a wrong password is fixed by retyping it, not by dismissing
      // something.
      setError(
        caught instanceof OctivAuthError
          ? caught.message
          : "Could not reach Octiv. Check your connection and try again.",
      );
    }
  }

  const canSubmit =
    username.trim().length > 0 && password.length > 0 && !connect.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Sign in to Octiv</SheetTitle>
        <SheetDescription>
          The same username and password you use in the Octiv app. Your password
          is used once to sign in and is never stored.
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-2">
        <div className="space-y-2">
          <Label htmlFor="octivUsername">Username</Label>
          <Input
            id="octivUsername"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="octivPassword">Password</Label>
          <Input
            id="octivPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p className="text-destructive text-sm leading-relaxed">{error}</p>
        )}
      </div>

      <SheetFooter>
        <Button type="submit" disabled={!canSubmit}>
          {connect.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <LinkIcon />
          )}
          Connect
        </Button>
      </SheetFooter>
    </form>
  );
}
