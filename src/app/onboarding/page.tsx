"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { useCreateProfile, useProfile } from "@/lib/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ForgeLogo } from "@/components/brand";
import { BootScreen } from "@/components/auth-gate";
import type { Gender, UnitSystem } from "@/lib/types";

export default function OnboardingPage() {
  const { user, initialising } = useAuth();
  const { data: profile, isPending: profilePending } = useProfile();
  const createProfile = useCreateProfile();
  const router = useRouter();

  // Pre-filled from the OAuth account: one less field to type on a phone.
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (user?.displayName && !touched) setDisplayName(user.displayName);
  }, [user?.displayName, touched]);

  useEffect(() => {
    if (initialising && !user) return;
    if (!initialising && !user) router.replace("/login");
    // Re-running onboarding would overwrite an existing profile.
    if (profile) router.replace("/");
  }, [initialising, user, profile, router]);

  const nameError =
    touched && displayName.trim().length === 0
      ? "Tell us what to call you"
      : null;

  const canSubmit =
    displayName.trim().length > 0 && gender !== "" && !createProfile.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);

    // Re-derived rather than reusing `canSubmit`, so the guard reads on its own
    // and narrows `gender` away from the empty placeholder.
    const trimmedName = displayName.trim();
    if (trimmedName.length === 0 || gender === "" || createProfile.isPending) {
      return;
    }

    try {
      await createProfile.mutateAsync({
        displayName: trimmedName,
        gender,
        unitSystem,
      });
      toast.success("You're in", { description: "Time to log your first session." });
      router.replace("/");
    } catch {
      toast.error("Could not save your profile", {
        description: "Check your connection and try again.",
      });
    }
  }

  if (initialising || !user || profilePending) return <BootScreen />;

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative mx-auto w-full max-w-lg flex-1 px-5 pt-safe pb-safe">
        <header className="flex h-14 items-center">
          <ForgeLogo />
        </header>

        <form onSubmit={handleSubmit} className="space-y-8 py-6">
          <div className="space-y-2">
            <p className="text-primary text-[11px] font-bold tracking-[0.3em] uppercase">
              Step 1 of 1
            </p>
            <h1 className="font-display text-3xl leading-tight font-extrabold">
              Set up your profile
            </h1>
            <p className="text-muted-foreground text-sm">
              This shapes how scores are displayed. You can change all of it
              later in Profile.
            </p>
          </div>

          {/* --- Display name --- */}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(event) => {
                setTouched(true);
                setDisplayName(event.target.value);
              }}
              placeholder="How should we call you?"
              maxLength={60}
              autoComplete="name"
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? "displayName-error" : undefined}
            />
            {nameError && (
              <p id="displayName-error" className="text-destructive text-xs">
                {nameError}
              </p>
            )}
          </div>

          {/* --- Gender --- */}
          <div className="space-y-2">
            <Label>Gender</Label>
            <p className="text-muted-foreground/80 -mt-1 text-xs">
              Benchmark workouts prescribe different loads by division.
            </p>
            <RadioGroup
              value={gender}
              onValueChange={(value) => setGender(value as Gender)}
              className="pt-1"
            >
              <RadioCard value="female" id="gender-female">
                Female
              </RadioCard>
              <RadioCard value="male" id="gender-male">
                Male
              </RadioCard>
              <RadioCard value="non_binary" id="gender-non-binary">
                Non-binary
              </RadioCard>
            </RadioGroup>
          </div>

          {/* --- Units --- */}
          <div className="space-y-2">
            <Label>Units</Label>
            <ToggleGroup
              type="single"
              value={unitSystem}
              // Radix clears the value when the active item is pressed again;
              // an empty unit system is not a valid state.
              onValueChange={(value) => {
                if (value) setUnitSystem(value as UnitSystem);
              }}
            >
              <ToggleGroupItem value="metric">kg · km</ToggleGroupItem>
              <ToggleGroupItem value="imperial">lbs · mi</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!canSubmit}
          >
            {createProfile.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <ArrowRightIcon />
            )}
            Start training
          </Button>
        </form>
      </div>
    </div>
  );
}
