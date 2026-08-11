import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";

/**
 * Layout for the signed-in, chrome-bearing routes: the log, records and profile.
 *
 * The workout form and the auth screens deliberately sit outside this group —
 * they are full-screen tasks where a bottom nav would invite the user to
 * navigate away mid-entry and lose their input.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
