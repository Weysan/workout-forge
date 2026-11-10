"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { seasonOn, type Season } from "@/lib/season";

/**
 * The season the app is currently dressed for.
 *
 * Normally today's. The date strip on the log can take over while it is on
 * screen (`useSeasonOverride`), so paging back into October fades the whole app
 * to Halloween and paging forward fades it back — the calendar and the room
 * around it always agree. Leaving the page hands control back to today.
 *
 * The value lands on <html data-season>, where globals.css swaps the palette and
 * transitions it. The first paint is handled earlier, by the inline script in
 * app/layout.tsx, so opening the app in December does not fade in from green.
 */

interface SeasonState {
  season: Season | null;
  setOverride: (season: Season | null | undefined) => void;
}

const SeasonContext = createContext<SeasonState | null>(null);

/** theme-color for the browser chrome / iOS status bar, per season. */
const THEME_COLOR: Record<Season | "classic", string> = {
  classic: "#0b1120",
  halloween: "#120a1c",
  christmas: "#240810",
};

export function SeasonProvider({ children }: { children: ReactNode }) {
  // `undefined` = no override; `null` = an override that says "no season".
  const [override, setOverride] = useState<Season | null | undefined>(undefined);
  // "pending" until the first client-side check: applying a null season before
  // then would strip the attribute the boot script set, and the app would flash
  // green before fading back.
  const [today, setToday] = useState<Season | null | "pending">("pending");

  // Read on the client only: the static export is built once, long before the
  // day it is opened. Re-checked when the app comes back to the foreground, so
  // an installed PWA left open across 31 October still turns over.
  useEffect(() => {
    const check = () => setToday(seasonOn(new Date()));
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  const resolved = override === undefined ? today : override;
  const season = resolved === "pending" ? null : resolved;

  useEffect(() => {
    if (resolved === "pending") return;
    const root = document.documentElement;
    if (season) root.dataset.season = season;
    else delete root.dataset.season;

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLOR[season ?? "classic"]);
  }, [resolved, season]);

  return (
    <SeasonContext.Provider value={{ season, setOverride }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason(): Season | null {
  return useContext(SeasonContext)?.season ?? null;
}

/** Dresses the app for `season` while the calling component is mounted. */
export function useSeasonOverride(season: Season | null): void {
  const setOverride = useContext(SeasonContext)?.setOverride;

  useEffect(() => {
    setOverride?.(season);
  }, [setOverride, season]);

  useEffect(() => () => setOverride?.(undefined), [setOverride]);
}
