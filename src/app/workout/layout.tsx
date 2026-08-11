import { AuthGate } from "@/components/auth-gate";

/**
 * The workout form is a focused, full-screen task: guarded like the rest of the
 * app, but without the bottom nav that would tempt a user to navigate away with
 * unsaved input.
 */
export default function WorkoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}
