"use client";

import { useMemo, useState, useEffect, type CSSProperties } from "react";

import { useSeason } from "@/lib/season-context";
import type { Season } from "@/lib/season";

/**
 * Seasonal decoration behind the whole app: slow snow from November, a moon,
 * stars and the odd bat in October.
 *
 * Pure CSS animation on transforms and opacity — no canvas, no rAF loop — so it
 * runs on the compositor and leaves the main thread to the app. A layer is
 * mounted the first time its season comes up and then kept, so switching
 * seasons cross-fades (`.season-layer` in globals.css) instead of popping, and a
 * hidden layer's animations are paused.
 *
 * Positions come from a seeded generator: the flakes are in the same places on
 * every render, so nothing reshuffles when React re-renders the shell.
 */
export function SeasonalBackdrop() {
  const season = useSeason();
  const [seen, setSeen] = useState<Season[]>([]);

  useEffect(() => {
    if (season && !seen.includes(season)) setSeen((list) => [...list, season]);
  }, [season, seen]);

  return (
    <div aria-hidden>
      {seen.includes("christmas") && <ChristmasLayer active={season === "christmas"} />}
      {seen.includes("halloween") && <HalloweenLayer active={season === "halloween"} />}
    </div>
  );
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Vars = CSSProperties & Record<`--${string}`, string>;

// --- Christmas -----------------------------------------------------------

function ChristmasLayer({ active }: { active: boolean }) {
  const flakes = useMemo(() => {
    const rand = seeded(1225);
    return Array.from({ length: 42 }, () => {
      const depth = rand(); // 0 = far, 1 = near
      const fall = 30 - depth * 16; // near flakes fall faster
      return {
        size: 2 + depth * 4.5,
        opacity: 0.25 + depth * 0.5,
        style: {
          left: `${rand() * 100}%`,
          "--fall": `${fall}s`,
          // Negative delay: the animation starts part-way through, so the sky
          // is already full of snow rather than all of it entering from the top.
          "--delay": `${-rand() * fall}s`,
          "--sway": `${3 + rand() * 3}s`,
          "--drift": `${8 + rand() * 22}px`,
          "--rest": `${rand() * 100}%`,
        } as Vars,
      };
    });
  }, []);

  return (
    <div className="season-layer" data-active={active ? "" : undefined}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 10% 0%, rgba(212, 33, 63, 0.28), transparent 70%)," +
            "radial-gradient(ellipse 80% 50% at 95% 100%, rgba(246, 196, 83, 0.12), transparent 70%)",
        }}
      />
      {flakes.map((flake, index) => (
        <div key={index} className="season-flake" style={flake.style}>
          <span
            style={{
              width: flake.size,
              height: flake.size,
              opacity: flake.opacity,
              filter: flake.size > 5 ? "blur(0.5px)" : undefined,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// --- Halloween -----------------------------------------------------------

function HalloweenLayer({ active }: { active: boolean }) {
  const { stars, bats } = useMemo(() => {
    const rand = seeded(1031);
    return {
      stars: Array.from({ length: 46 }, () => {
        const y = rand() * rand() * 60; // denser near the top
        const size = 1 + rand() * 1.8;
        return {
          left: `${rand() * 100}%`,
          top: `${y}%`,
          width: size,
          height: size,
          "--twinkle": `${2 + rand() * 3.5}s`,
          "--delay": `${-rand() * 5}s`,
        } as Vars;
      }),
      bats: [
        { top: "14vh", size: 30, fly: 26, delay: -4, dip: "6vh" },
        { top: "24vh", size: 20, fly: 34, delay: -19, dip: "-4vh" },
        { top: "9vh", size: 16, fly: 41, delay: -30, dip: "3vh" },
      ].map((bat) => ({
        size: bat.size,
        style: {
          top: bat.top,
          "--fly": `${bat.fly}s`,
          "--delay": `${bat.delay}s`,
          "--dip": bat.dip,
        } as Vars,
      })),
    };
  }, []);

  return (
    <div className="season-layer" data-active={active ? "" : undefined}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 10% 0%, rgba(124, 58, 237, 0.24), transparent 70%)," +
            "radial-gradient(ellipse 80% 50% at 95% 100%, rgba(249, 115, 22, 0.14), transparent 70%)",
        }}
      />
      {stars.map((style, index) => (
        <span key={index} className="season-star" style={style} />
      ))}

      <svg
        className="season-moon absolute top-[calc(5.5rem+env(safe-area-inset-top,0px))] right-6 size-16"
        viewBox="0 0 64 64"
      >
        <defs>
          <radialGradient id="season-moon-fill" cx="40%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#fff7dd" />
            <stop offset="100%" stopColor="#f2d999" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill="url(#season-moon-fill)" opacity="0.9" />
        <g fill="rgba(196, 160, 90, 0.25)">
          <circle cx="22" cy="27" r="5.5" />
          <circle cx="40" cy="38" r="4" />
          <circle cx="34" cy="17" r="2.8" />
          <circle cx="28" cy="45" r="3" />
        </g>
      </svg>

      {bats.map((bat, index) => (
        <div key={index} className="season-bat" style={bat.style}>
          <Bat size={bat.size} />
        </div>
      ))}

      <div className="season-fog" />
    </div>
  );
}

function Bat({ size }: { size: number }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 64 32" fill="#07040c" opacity="0.85">
      <path d="M32 9 C27 2 14 1 0 8 C6 10 9 14 10 18 C14 15 18 16 20 20 C23 17 27 18 29 22 L32 26 L35 22 C37 18 41 17 44 20 C46 16 50 15 54 18 C55 14 58 10 64 8 C50 1 37 2 32 9 Z" />
      <path d="M29 9 L30 4 L32 8 L34 4 L35 9 Z" />
    </svg>
  );
}
