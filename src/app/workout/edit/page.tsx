"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useWorkout } from "@/lib/hooks/use-workouts";
import { WorkoutForm } from "@/components/workout-form";
import { BootScreen } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";

/**
 * Edit an existing workout, addressed as `/workout/edit?id=<workoutId>`.
 *
 * The id is a query parameter rather than a path segment (`/workout/[id]/edit`)
 * because the site is a static export: Next would need every possible id at
 * build time via generateStaticParams, and workout ids are created by users long
 * after the build. A query parameter keeps a single prerendered page that reads
 * its target at runtime.
 */
function EditWorkout() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  // Hooks must run unconditionally, so the query is made with whatever we have
  // and simply stays disabled when the id is absent.
  const { data: workout, isPending, isError } = useWorkout(id ?? undefined);

  if (!id) return <NotFound reason="No workout was specified." />;
  if (isPending) return <BootScreen />;
  if (isError || !workout) {
    return <NotFound reason="It may have been deleted on another device." />;
  }

  // `key` remounts the form if the id changes, so state never leaks between two
  // different workouts.
  return <WorkoutForm key={workout.id} mode="edit" workout={workout} />;
}

function NotFound({ reason }: { reason: string }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-extrabold">Workout not found</h1>
      <p className="text-muted-foreground text-sm">{reason}</p>
      <Button asChild variant="secondary">
        <Link href="/">Back to the log</Link>
      </Button>
    </div>
  );
}

export default function EditWorkoutPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={<BootScreen />}>
      <EditWorkout />
    </Suspense>
  );
}
