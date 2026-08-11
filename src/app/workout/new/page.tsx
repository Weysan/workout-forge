"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { WorkoutForm } from "@/components/workout-form";
import { BootScreen } from "@/components/auth-gate";
import { todayKey } from "@/lib/utils";

/** `YYYY-MM-DD` only — a malformed param must not become the workout's date. */
function readDateParam(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayKey();
}

function NewWorkout() {
  const searchParams = useSearchParams();
  // The FAB carries the day the user was looking at, so logging never starts on
  // the wrong date.
  const dateKey = readDateParam(searchParams.get("date"));

  return <WorkoutForm mode="create" initialDateKey={dateKey} />;
}

export default function NewWorkoutPage() {
  // useSearchParams opts the route into client rendering; the boundary keeps the
  // build from failing on prerender.
  return (
    <Suspense fallback={<BootScreen />}>
      <NewWorkout />
    </Suspense>
  );
}
