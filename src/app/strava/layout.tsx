import { AuthGate } from "@/components/auth-gate";

/**
 * The Strava OAuth landing. Guarded, because completing the connection means
 * writing to the signed-in user's document, and given no bottom nav for the same
 * reason as the workout form: it is a step in a flow, not a place to browse from.
 */
export default function StravaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}
