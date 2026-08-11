"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDaysIcon, TrophyIcon, UserIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { usingEmulator } from "@/lib/firebase";
import { ForgeLogo } from "@/components/brand";
import { OfflineBanner, SyncIndicator } from "@/components/sync-indicator";

const NAV_ITEMS = [
  { href: "/", label: "Log", icon: CalendarDaysIcon },
  { href: "/performance", label: "Records", icon: TrophyIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
] as const;

/**
 * Mobile-first chrome: sticky header, scrolling content, fixed bottom nav.
 *
 * Navigation sits at the bottom because that is the only part of a phone screen
 * a thumb reaches comfortably.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28">
        <div className="pt-3 empty:hidden">
          <OfflineBanner />
        </div>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

function Header() {
  return (
    <header className="bg-background/85 sticky top-0 z-30 border-b border-border/70 backdrop-blur-lg pt-safe">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
        <Link href="/" aria-label="FORGE home">
          <ForgeLogo />
        </Link>
        <div className="flex items-center gap-2">
          <SyncIndicator />
          {usingEmulator && <EmulatorBadge />}
        </div>
      </div>
    </header>
  );
}

/**
 * Visible marker that the app is talking to the local emulator.
 *
 * Without it, it is genuinely easy to spend ten minutes wondering why a workout
 * "disappeared" after switching between local and real Firebase.
 */
function EmulatorBadge() {
  return (
    <span className="border-warning/40 bg-warning/15 text-warning inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold tracking-widest uppercase">
      <span className="bg-warning size-1.5 animate-pulse rounded-full" />
      Local
    </span>
  );
}

function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-background/90 fixed inset-x-0 bottom-0 z-30 border-t border-border/70 backdrop-blur-lg pb-safe">
      <div className="mx-auto flex h-16 w-full max-w-2xl items-stretch justify-around px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          // "/" would otherwise match every route with startsWith.
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex flex-1 flex-col items-center justify-center gap-1 rounded-lg transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn("size-5 transition-transform", active && "scale-110")}
                strokeWidth={active ? 2.5 : 2}
              />
              <span className="text-[10px] font-bold tracking-widest uppercase">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
