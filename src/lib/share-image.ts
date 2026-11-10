import {
  SHARE_FORMATS,
  type DayShareCard,
  type ResultShareCard,
  type ShareCard,
  type ShareFormat,
  type ShareTheme,
} from "./share-card";
import { APP_URL_DISPLAY } from "./share";

/**
 * Draws a share card onto a canvas.
 *
 * Why by hand, rather than screenshotting the DOM with html2canvas or satori:
 * the app's palette is built on Tailwind v4 `@theme` tokens,
 * `color-mix(in oklab, …)`, `background-clip: text` gradients and `mask-image`
 * (see app/globals.css) — the exact set of features those libraries render
 * wrong or not at all. Canvas 2D also needs no dependency and no network, which
 * matters for an app whose normal case is a gym with no signal.
 *
 * What it costs is that the palette exists twice: once as CSS custom properties
 * and once as the constants below. They are small, they are commented on both
 * sides, and the alternative was a screenshot that did not look like the app.
 *
 * Everything is drawn at 1080px wide — Instagram's own working size. Rendering
 * larger would only make a heavier file for the share sheet to carry.
 */

// --- Palettes ------------------------------------------------------------

interface Palette {
  background: string;
  card: string;
  foreground: string;
  muted: string;
  border: string;
  /** Brand mark, the app address, and the start of the record gradient. */
  primary: string;
  /** The end of the record gradient. */
  accent: string;
  /** Fill behind the outlined pills. */
  badgeFill: string;
  /** A result's WOD text — softer than `foreground` so the title still leads. */
  description: string;
}

/** Mirrors :root in app/globals.css. */
const CLASSIC: Palette = {
  background: "#0b1120",
  card: "#111c31",
  foreground: "#f1f5f9",
  muted: "#94a3b8",
  border: "#1e2d48",
  primary: "#10b981",
  accent: "#06b6d4",
  badgeFill: "rgba(22, 35, 60, 0.75)",
  description: "rgba(226, 232, 240, 0.78)",
};

/**
 * Deep wine ground, gold for the brand and records, warm white type.
 *
 * Gold rather than green as the primary: green text on red is the one
 * Christmas combination that fails contrast, and the garland already carries
 * the green.
 */
const CHRISTMAS: Palette = {
  background: "#2a0a10",
  card: "#3d1119",
  foreground: "#fff8ef",
  muted: "#e5bfb8",
  border: "#5e2531",
  primary: "#f6c453",
  accent: "#fff1c9",
  badgeFill: "rgba(61, 17, 25, 0.82)",
  description: "rgba(255, 241, 230, 0.82)",
};

/**
 * Near-black aubergine ground, pumpkin orange for the brand, amber for the end
 * of the record gradient. Purple stays in the backdrop — as type it is too dark
 * to read on this ground.
 */
const HALLOWEEN: Palette = {
  background: "#120a1c",
  card: "#1d1230",
  foreground: "#f6f1ff",
  muted: "#b9a8d0",
  border: "#30214a",
  primary: "#f97316",
  accent: "#fbbf24",
  badgeFill: "rgba(29, 18, 48, 0.82)",
  description: "rgba(240, 232, 255, 0.8)",
};

type Backdrop = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  l: Layout,
) => void;

/** One frame of a looping backdrop; `p` runs 0 → 1 over the loop. */
type AnimatedBackdrop = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  l: Layout,
  p: number,
) => void;

interface ThemeSpec {
  palette: Palette;
  /** Everything behind the type: ground, texture, decoration. */
  paintBackdrop: Backdrop;
  /**
   * The same backdrop in motion, for the video card. Only the seasonal themes
   * have one: the classic grid has nothing that would move.
   *
   * Every moving part is periodic in `p`, so the last frame meets the first and
   * the clip loops without a seam — Instagram replays a story video until the
   * viewer taps on.
   */
  paintAnimated?: AnimatedBackdrop;
}

const THEMES: Record<ShareTheme, ThemeSpec> = {
  classic: {
    palette: CLASSIC,
    paintBackdrop: (ctx, width, height, l) => {
      paintBackground(ctx, width, height, CLASSIC, "rgba(17, 28, 49, 0.9)", "rgba(17, 28, 49, 0.75)");
      paintGrid(ctx, width, height, l.gridSize, CLASSIC);
      paintGlow(ctx, width, height, CLASSIC.primary, CLASSIC.accent);
    },
  },
  halloween: {
    palette: HALLOWEEN,
    paintBackdrop: (ctx, width, height, l) => {
      paintBackground(ctx, width, height, HALLOWEEN, "rgba(46, 22, 74, 0.85)", "rgba(29, 18, 48, 0.7)");
      paintGlow(ctx, width, height, "#7c3aed", HALLOWEEN.primary, 0.26, 0.16);
      paintStars(ctx, width, height);
      paintMoon(ctx, width, l);
      paintFog(ctx, width, height);
    },
    paintAnimated: (ctx, width, height, l, p) => {
      paintBackground(ctx, width, height, HALLOWEEN, "rgba(46, 22, 74, 0.85)", "rgba(29, 18, 48, 0.7)");
      paintGlow(ctx, width, height, "#7c3aed", HALLOWEEN.primary, 0.26, 0.16);
      paintStars(ctx, width, height, p);
      paintMoon(ctx, width, l, p);
      paintFog(ctx, width, height, p);
    },
  },
  christmas: {
    palette: CHRISTMAS,
    paintBackdrop: (ctx, width, height) => {
      paintBackground(ctx, width, height, CHRISTMAS, "rgba(92, 16, 30, 0.85)", "rgba(61, 17, 25, 0.7)");
      paintGlow(ctx, width, height, "#d4213f", CHRISTMAS.primary, 0.32, 0.12);
      paintSnowfall(ctx, width, height);
      paintSnowDrift(ctx, width, height);
      paintGarland(ctx, width);
    },
    paintAnimated: (ctx, width, height, _l, p) => {
      paintBackground(ctx, width, height, CHRISTMAS, "rgba(92, 16, 30, 0.85)", "rgba(61, 17, 25, 0.7)");
      paintGlow(ctx, width, height, "#d4213f", CHRISTMAS.primary, 0.32, 0.12);
      paintFallingSnow(ctx, width, height, p);
      paintSnowDrift(ctx, width, height);
      paintGarland(ctx, width, p);
    },
  },
};

// --- Layout --------------------------------------------------------------

interface Layout {
  padding: number;
  /** Distance from the top edge to the FORGE lockup baseline area. */
  headerTop: number;
  gridSize: number;
  titleMax: number;
  titleMin: number;
  valueMax: number;
  valueMin: number;
  bodySize: number;
  eyebrowSize: number;
  badgeSize: number;
  footerSize: number;
  /** Space between the stacked blocks of the composition. */
  gap: number;
  /** Sizes used only by the day poster, whose body is a list rather than a number. */
  day: DayLayout;
}

interface DayLayout {
  /** A day's title is a date — longer than "Fran", so it starts smaller. */
  titleMax: number;
  titleMin: number;
  /** Height of one session row, before it is fitted to the space available. */
  rowMax: number;
  rowMin: number;
  entryTitle: number;
  entryDetail: number;
  entryValueMax: number;
  entryValueMin: number;
}

/**
 * The two formats are the same poster at two heights, not two designs.
 *
 * A story has ~570px more vertical room than a post, and the temptation is to
 * scale everything up to fill it. That makes the post look like a squashed
 * story. Instead the type sizes barely move and the *space* absorbs the
 * difference, so both read as the same card.
 */
function layoutFor(format: ShareFormat): Layout {
  const story = format === "story";
  return {
    padding: 88,
    headerTop: story ? 150 : 96,
    gridSize: 56,
    titleMax: story ? 128 : 112,
    titleMin: 60,
    valueMax: story ? 208 : 180,
    valueMin: 88,
    bodySize: story ? 42 : 38,
    eyebrowSize: 26,
    badgeSize: 26,
    footerSize: 26,
    gap: story ? 56 : 44,
    day: {
      titleMax: story ? 100 : 88,
      titleMin: 52,
      rowMax: story ? 208 : 170,
      rowMin: 118,
      entryTitle: story ? 44 : 40,
      entryDetail: 26,
      entryValueMax: story ? 78 : 70,
      entryValueMin: 34,
    },
  };
}

// --- Fonts ---------------------------------------------------------------

/**
 * next/font generates hashed family names (`__Inter_Tight_abc123`) and exposes
 * them through the CSS variables set on <html> in app/layout.tsx. Reading them
 * back is the only way to name those faces in a `ctx.font` string.
 */
function fontStack(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value === "" ? fallback : `${value}, ${fallback}`;
}

/**
 * Waits for the faces this renderer draws with.
 *
 * `document.fonts.ready` alone is not enough: it resolves once *pending* loads
 * settle, and a face nothing has painted yet was never pending. Without the
 * explicit `load` calls the first share of a session silently falls back to a
 * system face — and only the first, which makes it a confusing bug to chase.
 */
async function ensureFonts(display: string, body: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;

  const wanted = [
    `800 100px ${display}`,
    `700 40px ${display}`,
    `600 26px ${body}`,
    `400 40px ${body}`,
  ];

  await Promise.all(
    wanted.map((font) => document.fonts.load(font).catch(() => undefined)),
  );
  await document.fonts.ready;
}

// --- Text helpers --------------------------------------------------------

/** Greedy word wrap. Falls back to hard-splitting a single word too long to fit. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    let line = "";
    for (const word of words) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth || line === "") {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line !== "") lines.push(line);
  }

  return lines;
}

/**
 * The largest size at which `text` fits `maxLines` lines of `maxWidth`.
 *
 * Names on this card range from "Fran" to "Bulgarian Split Squat", and a fixed
 * size flatters exactly one of them. Stepping down 4px at a time is more than
 * precise enough at this scale and costs a few dozen `measureText` calls.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
): { size: number; lines: string[] } {
  let size = startSize;

  while (size > minSize) {
    ctx.font = font(size);
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
    size -= 4;
  }

  ctx.font = font(minSize);
  // At the floor, accept the overflow and clip: a truncated title is better
  // than type too small to read on a phone held at arm's length.
  return { size: minSize, lines: wrapText(ctx, text, maxWidth).slice(0, maxLines) };
}

// --- Decoration ----------------------------------------------------------

/** Vertical lift from the app's ground colour toward its card colour. */
function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  c: Palette,
  washTop: string,
  washBottom: string,
): void {
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, width, height);

  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, washTop);
  wash.addColorStop(0.55, withAlpha(c.background, 0));
  wash.addColorStop(1, washBottom);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
}

/**
 * The hairline grid from `.bg-grid`, faded from the top.
 *
 * The CSS uses a radial `mask-image`; canvas has no masks, so the same shape is
 * achieved by drawing the lines under a vertical alpha ramp via
 * `globalCompositeOperation`. Close enough that the two sit side by side.
 */
function paintGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  size: number,
  c: Palette,
): void {
  const fade = Math.min(height * 0.62, 1180);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, fade);
  ctx.clip();

  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;

  for (let x = size; x < width; x += size) {
    const alpha = 0.5 * (1 - x / width) + 0.15;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, fade);
    ctx.stroke();
  }

  for (let y = size; y < fade; y += size) {
    ctx.globalAlpha = 0.55 * (1 - y / fade);
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

/** The `.glow-primary` / `.glow-accent` bloom, as two soft radial washes. */
function paintGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  top: string,
  bottom: string,
  topAlpha = 0.22,
  bottomAlpha = 0.18,
): void {
  const blob = (
    x: number,
    y: number,
    radius: number,
    color: string,
    alpha: number,
  ) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, withAlpha(color, alpha));
    gradient.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  };

  blob(width * 0.12, height * 0.06, width * 0.85, top, topAlpha);
  blob(width * 0.95, height * 0.9, width * 0.8, bottom, bottomAlpha);
}

// --- Halloween decoration ------------------------------------------------

/** Faint pinpricks across the upper sky, thinning toward the middle. */
function paintStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  /** Loop position for the video card; omitted for the still. */
  p?: number,
): void {
  const rand = seeded(1031);
  const sky = height * 0.6;
  const count = Math.round((width * sky) / 14000);

  ctx.save();
  ctx.fillStyle = "#f6f1ff";
  for (let i = 0; i < count; i++) {
    const y = rand() * rand() * sky; // squared: denser near the top
    const alpha = (0.15 + rand() * 0.4) * (1 - y / sky);
    const x = rand() * width;
    const r = 1 + rand() * 2;
    // Each star twinkles 1–3 times per loop, from its own phase. The twinkle
    // takes no random draws, so the still keeps exactly the stars it always had.
    const twinkle =
      p === undefined
        ? 1
        : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (p * (1 + (i % 3)) + i * 0.137)));
    ctx.globalAlpha = alpha * twinkle * (p === undefined ? 1 : 1.5);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A full moon in the top-right corner, with bats crossing it.
 *
 * Its centre is tied to the lockup's height, and its radius keeps the disc
 * clear of where a day card's title starts — white type over a pale moon is
 * unreadable.
 */
function paintMoon(
  ctx: CanvasRenderingContext2D,
  width: number,
  l: Layout,
  /** Loop position for the video card; omitted for the still. */
  p?: number,
): void {
  const r = 68;
  const cx = width - l.padding - r;
  const cy = l.headerTop + 20;

  ctx.save();
  // The halo breathes once per loop in the video.
  const haloAlpha = p === undefined ? 0.28 : 0.24 + 0.08 * Math.sin(2 * Math.PI * p);
  const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 3.2);
  halo.addColorStop(0, `rgba(254, 240, 199, ${haloAlpha})`);
  halo.addColorStop(1, "rgba(254, 240, 199, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - r * 3.2, cy - r * 3.2, r * 6.4, r * 6.4);

  const disc = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  disc.addColorStop(0, "#fff7dd");
  disc.addColorStop(1, "#f2d999");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // A few craters, barely there.
  ctx.fillStyle = "rgba(196, 160, 90, 0.22)";
  for (const [dx, dy, cr] of [
    [-0.3, -0.15, 0.18],
    [0.25, 0.2, 0.13],
    [0.05, -0.45, 0.09],
    [-0.1, 0.42, 0.1],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy + dy * r, cr * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (p === undefined) {
    // Bats: one across the disc, the rest trailing off to the left of it.
    paintBat(ctx, cx - r * 0.15, cy + r * 0.1, 34, -0.12);
    paintBat(ctx, cx - r * 1.9, cy - r * 0.45, 22, 0.15);
    paintBat(ctx, cx - r * 2.9, cy + r * 0.25, 16, -0.05);
    paintBat(ctx, cx + r * 0.9, cy + r * 1.25, 14, 0.2);
    return;
  }

  // In the video the bats fly: right to left across the top of the card, each
  // crossing once per loop from its own starting point, flapping as they go.
  // They stay in the band above the title, the same room the still gives them.
  const flights = [
    { y: cy + r * 0.1, span: 34, offset: 0.05, dip: 26, flaps: 18 },
    { y: cy - r * 0.45, span: 22, offset: 0.4, dip: -18, flaps: 22 },
    { y: cy + r * 0.6, span: 16, offset: 0.72, dip: 14, flaps: 26 },
  ];
  for (const bat of flights) {
    const q = (p + bat.offset) % 1;
    const x = width + 80 - q * (width + 160);
    const y = bat.y + bat.dip * Math.sin(2 * Math.PI * q);
    const flap = 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * p * bat.flaps));
    paintBat(ctx, x, y, bat.span, 0.08 * Math.sin(2 * Math.PI * q), flap);
  }
}

/** A bat silhouette `span` px from body to wingtip. */
function paintBat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  span: number,
  tilt: number,
  /** Vertical squash of the wings, 1 = spread. */
  flap = 1,
): void {
  const s = span;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(1, flap);
  ctx.fillStyle = "#0a0612";
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.12);
  // Right wing: up to the tip, then three scallops back to the body.
  ctx.quadraticCurveTo(s * 0.45, -s * 0.45, s, -s * 0.15);
  ctx.quadraticCurveTo(s * 0.85, s * 0.05, s * 0.68, s * 0.12);
  ctx.quadraticCurveTo(s * 0.55, -s * 0.02, s * 0.4, s * 0.12);
  ctx.quadraticCurveTo(s * 0.28, 0, s * 0.12, s * 0.2);
  ctx.lineTo(0, s * 0.3);
  // Left wing, mirrored.
  ctx.lineTo(-s * 0.12, s * 0.2);
  ctx.quadraticCurveTo(-s * 0.28, 0, -s * 0.4, s * 0.12);
  ctx.quadraticCurveTo(-s * 0.55, -s * 0.02, -s * 0.68, s * 0.12);
  ctx.quadraticCurveTo(-s * 0.85, s * 0.05, -s, -s * 0.15);
  ctx.quadraticCurveTo(-s * 0.45, -s * 0.45, 0, -s * 0.12);
  ctx.closePath();
  ctx.fill();

  // Ears.
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.1);
  ctx.lineTo(-s * 0.07, -s * 0.28);
  ctx.lineTo(0, -s * 0.14);
  ctx.lineTo(s * 0.07, -s * 0.28);
  ctx.lineTo(s * 0.1, -s * 0.1);
  ctx.fill();
  ctx.restore();
}

/** Low violet mist along the bottom — the Halloween counterpart of the snowbanks. */
function paintFog(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  /** Loop position for the video card; omitted for the still. */
  p?: number,
): void {
  // In the video the two banks roll against each other, once per loop.
  const roll = p === undefined ? 0 : Math.sin(2 * Math.PI * p) * 0.9;
  const layer = (base: number, amplitude: number, phase: number, alpha: number) => {
    const gradient = ctx.createLinearGradient(0, height - base - amplitude * 2, 0, height);
    gradient.addColorStop(0, "rgba(167, 139, 250, 0)");
    gradient.addColorStop(1, `rgba(167, 139, 250, ${alpha})`);
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 12) {
      ctx.lineTo(
        x,
        height - base - amplitude * Math.sin((x / width) * Math.PI * 1.6 + phase),
      );
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  };

  layer(150, 30, 0.8 + roll, 0.12);
  layer(80, 22, 2.6 - roll, 0.14);
}

// --- Christmas decoration ------------------------------------------------

/**
 * A small seeded PRNG (mulberry32).
 *
 * The snow has to land in the same place every time: the preview and the file
 * that gets shared are separate renders when the format is toggled, and flakes
 * that jump about between them look like a glitch rather than weather.
 */
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

/**
 * Soft dots plus a handful of six-armed crystals.
 *
 * Kept faint on purpose — the flakes sit under the title and the score, and
 * they are texture, not content. Density is per area so a story and a post get
 * the same weather rather than the same count.
 */
function paintSnowfall(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const rand = seeded(1225);
  const dots = Math.round((width * height) / 9000);

  ctx.save();
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < dots; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 1.5 + rand() * rand() * 5;
    ctx.globalAlpha = 0.12 + rand() * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  const crystals = Math.round(height / 240);
  for (let i = 0; i < crystals; i++) {
    const x = rand() * width;
    const y = 140 + rand() * (height - 280);
    const size = 22 + rand() * 30;
    ctx.globalAlpha = 0.1 + rand() * 0.1;
    ctx.lineWidth = Math.max(2, size / 12);
    paintCrystal(ctx, x, y, size, rand() * Math.PI);
  }
  ctx.restore();
}

/**
 * Snow in motion, for the video card.
 *
 * Each flake falls a few hundred pixels and fades in and out over its own slice
 * of the loop rather than crossing the whole card. That keeps the fall slow —
 * a flake crossing 1920px in an eight-second loop would be a blizzard — while
 * still looping without a seam: at the moment a flake wraps round, it is
 * invisible. Near (larger) flakes fall further and faster than far ones.
 */
function paintFallingSnow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  p: number,
): void {
  const rand = seeded(2512);
  const dots = Math.round((width * height) / 8000);

  ctx.save();
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < dots; i++) {
    const depth = rand();
    const x0 = rand() * width;
    const y0 = rand() * height;
    const r = 1.5 + depth * depth * 5;
    const peak = 0.15 + depth * 0.45;
    const fall = 260 + depth * 420;
    const sway = 6 + rand() * 18;
    const q = (p + rand()) % 1;

    ctx.globalAlpha = peak * Math.sin(Math.PI * q);
    ctx.beginPath();
    ctx.arc(
      x0 + sway * Math.sin(2 * Math.PI * (q * 2 + depth)),
      y0 + fall * (q - 0.5),
      r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  const crystals = Math.round(height / 220);
  for (let i = 0; i < crystals; i++) {
    const x = rand() * width;
    const y = 160 + rand() * (height - 320);
    const size = 22 + rand() * 30;
    const q = (p + rand()) % 1;
    const spin = rand() < 0.5 ? -1 : 1;
    ctx.globalAlpha = (0.12 + rand() * 0.1) * Math.sin(Math.PI * q);
    ctx.lineWidth = Math.max(2, size / 12);
    paintCrystal(ctx, x, y + 220 * (q - 0.5), size, rand() * Math.PI + spin * Math.PI * q);
  }
  ctx.restore();
}

function paintCrystal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
): void {
  ctx.beginPath();
  for (let arm = 0; arm < 6; arm++) {
    const angle = rotation + (arm * Math.PI) / 3;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx * size, y + dy * size);

    // One pair of barbs at two thirds of the arm — enough to read as a flake.
    const bx = x + dx * size * 0.6;
    const by = y + dy * size * 0.6;
    for (const side of [-1, 1]) {
      const barb = angle + side * (Math.PI / 4);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(barb) * size * 0.3, by + Math.sin(barb) * size * 0.3);
    }
  }
  ctx.stroke();
}

/**
 * Two low banks of snow along the bottom edge.
 *
 * Low alpha so the footer — the date and the app address — keeps its contrast
 * sitting on top of them.
 */
function paintSnowDrift(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const bank = (base: number, amplitude: number, phase: number, alpha: number) => {
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 12) {
      const y =
        height -
        base -
        amplitude * Math.sin((x / width) * Math.PI * 2.2 + phase) -
        amplitude * 0.4 * Math.sin((x / width) * Math.PI * 5 + phase * 2);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 248, 239, ${alpha})`;
    ctx.fill();
  };

  bank(54, 16, 0.4, 0.06);
  bank(28, 12, 2.1, 0.09);
}

/**
 * A string of lights swagged across the top edge.
 *
 * The lowest point of the wire stays above y≈70 so it clears the FORGE lockup,
 * which starts at 96px on a post.
 */
function paintGarland(
  ctx: CanvasRenderingContext2D,
  width: number,
  /** Loop position for the video card; omitted for the still. */
  p?: number,
): void {
  const swags = 3;
  const swagWidth = width / swags;
  const top = 6;
  const sag = 46;
  const bulbColors = ["#ff3b4f", "#f6c453", "#2fbf71", "#fff8ef"];

  // y on the wire at x: a parabola per swag, peaking at each anchor.
  const wireY = (x: number) => {
    const t = (x % swagWidth) / swagWidth;
    return top + sag * 4 * t * (1 - t);
  };

  ctx.save();
  ctx.strokeStyle = "#14532d";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, wireY(0));
  for (let x = 4; x <= width; x += 4) ctx.lineTo(x, wireY(x));
  ctx.stroke();

  const perSwag = 5;
  let colorIndex = 0;
  for (let s = 0; s < swags; s++) {
    for (let b = 1; b <= perSwag; b++) {
      const x = s * swagWidth + (b / (perSwag + 1)) * swagWidth;
      const y = wireY(x);
      const index = colorIndex++;
      const color = bulbColors[index % bulbColors.length];
      // Twinkle in the video: each bulb dims and brightens twice per loop, a
      // little behind its neighbour, so the brightness chases along the wire.
      const glow =
        p === undefined
          ? 1
          : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (p * 2 - index / 7)));

      const halo = ctx.createRadialGradient(x, y + 14, 0, x, y + 14, 34);
      halo.addColorStop(0, withAlpha(color, 0.45 * glow));
      halo.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(x - 34, y - 20, 68, 68);

      // Socket, then the bulb hanging below it.
      ctx.fillStyle = "#1f3b2c";
      ctx.fillRect(x - 5, y - 2, 10, 9);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55 + 0.45 * glow;
      ctx.beginPath();
      ctx.ellipse(x, y + 17, 7.5, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/**
 * Rounded rectangle path, with a square-cornered fallback.
 *
 * `ctx.roundRect` landed in Safari 16.4, but file sharing works from Safari 15 —
 * so there is a band of iOS versions that can share an image this renderer would
 * otherwise throw on. Square corners on the mark and the badge pills are a far
 * smaller loss than no image at all.
 */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The FORGE lockup: three ascending bars, then the wordmark.
 *
 * The bar geometry is the 32×32 viewBox from components/brand.tsx scaled up, so
 * the mark on the image is the same mark as the one in the app header rather
 * than an approximation of it.
 */
function paintLockup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  displayFont: (size: number) => string,
  c: Palette,
): number {
  const scale = 52 / 32;
  const bars: Array<[number, number, number, number, number]> = [
    // x, y, width, height, opacity — from ForgeMark's three <rect> elements.
    [2, 19, 7, 11, 0.45],
    [12.5, 12, 7, 18, 0.75],
    [23, 2, 7, 28, 1],
  ];

  ctx.save();
  for (const [bx, by, bw, bh, opacity] of bars) {
    ctx.globalAlpha = opacity;
    ctx.fillStyle = c.primary;
    roundRectPath(
      ctx,
      x + bx * scale,
      y + by * scale,
      bw * scale,
      bh * scale,
      1.5 * scale,
    );
    ctx.fill();
  }
  ctx.restore();

  // The wordmark carries `tracking-[0.2em]` in the app; canvas has no
  // letter-spacing in older Safari, so it is drawn glyph by glyph.
  const wordmarkSize = 38;
  ctx.font = displayFont(wordmarkSize);
  ctx.fillStyle = c.foreground;
  ctx.textBaseline = "middle";
  drawTracked(
    ctx,
    "FORGE",
    x + 52 * scale + 26,
    y + (32 * scale) / 2 + 1,
    wordmarkSize * 0.2,
  );

  return y + 32 * scale;
}

/**
 * Truncates to fit, with an ellipsis, measured at the font currently set.
 *
 * Used on a day card's session rows, where the score has first claim on the width
 * and the title takes what is left. `fitText` is the wrong tool there: shrinking
 * one row's title to fit would leave it a different size from its neighbours,
 * and a list of five different type sizes reads as a mistake.
 */
function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/** Draws text with manual letter-spacing, returning the width consumed. */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): number {
  let cursor = x;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
  return cursor - x - tracking;
}

function trackedWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number,
): number {
  let total = 0;
  for (const char of text) total += ctx.measureText(char).width + tracking;
  return Math.max(0, total - tracking);
}

/** An outlined pill, matching the `outline` Badge variant. */
function paintBadge(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  size: number,
  bodyFont: (size: number) => string,
  c: Palette,
): number {
  const text = label.toUpperCase();
  const tracking = size * 0.12;
  ctx.font = bodyFont(size);
  const textWidth = trackedWidth(ctx, text, tracking);

  const paddingX = 22;
  const height = size + 26;
  const width = textWidth + paddingX * 2;

  ctx.save();
  roundRectPath(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = c.badgeFill;
  ctx.fill();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = c.muted;
  ctx.textBaseline = "middle";
  drawTracked(ctx, text, x + paddingX, y + height / 2 + 1, tracking);

  return width;
}

// --- Render --------------------------------------------------------------

/**
 * Renders `card` at `format` and returns it as a PNG blob.
 *
 * PNG rather than JPEG: the card is flat colour and large type, which JPEG
 * softens into visible ringing, and Instagram re-encodes whatever it is given
 * anyway. The file lands around 200–400 KB, well inside what a share sheet
 * carries comfortably.
 */
export async function renderShareCard(
  card: ShareCard,
  format: ShareFormat,
  theme: ShareTheme = "classic",
): Promise<Blob> {
  const { width, height } = SHARE_FORMATS[format];
  const l = layoutFor(format);
  const { paintBackdrop } = THEMES[theme];

  const canvas = makeCanvas(width, height);
  const ctx = context2d(canvas);
  paintBackdrop(ctx, width, height, l);
  ctx.drawImage(await paintForeground(card, format, theme), 0, 0);

  return toBlob(canvas);
}

/**
 * Everything on the card that does not move — brand, title, pills, score,
 * footer — on a transparent canvas.
 *
 * Split from the backdrop so the video card can draw its text once and lay it
 * over each moving frame, rather than re-measuring and re-wrapping every word
 * thirty times a second.
 */
async function paintForeground(
  card: ShareCard,
  format: ShareFormat,
  theme: ShareTheme,
): Promise<HTMLCanvasElement> {
  const { width, height } = SHARE_FORMATS[format];
  const l = layoutFor(format);
  const { palette: c } = THEMES[theme];

  const displayFamily = fontStack("--font-inter-tight", "system-ui, sans-serif");
  const bodyFamily = fontStack("--font-inter", "system-ui, sans-serif");
  await ensureFonts(displayFamily, bodyFamily);

  const fonts: Fonts = {
    display: (size) => `800 ${size}px ${displayFamily}`,
    displayBold: (size) => `700 ${size}px ${displayFamily}`,
    body: (size) => `600 ${size}px ${bodyFamily}`,
    bodyRegular: (size) => `400 ${size}px ${bodyFamily}`,
  };

  const canvas = makeCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.textBaseline = "alphabetic";

  const frame = paintChrome(ctx, card, width, height, l, fonts, c);

  // The two posters share everything above and below, and nothing in between: a
  // result hangs one enormous number off the bottom edge, a day fills the middle
  // with a list. Trying to express both as one parameterised composition was
  // worse than two functions that each do one thing.
  if (card.kind === "day") {
    paintDayBody(ctx, card, frame, l, fonts, c);
  } else {
    paintResultBody(ctx, card, frame, l, fonts, c);
  }

  return canvas;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
  return ctx;
}

// --- Video ---------------------------------------------------------------

/** Length of the video card's loop. Long enough that the snow can fall slowly. */
export const SHARE_VIDEO_SECONDS = 8;
const SHARE_VIDEO_FPS = 30;

/**
 * MP4 first: it is what Instagram, WhatsApp and the iOS photo library all take.
 * Safari records it natively and Chrome has since 126. WebM is the fallback for
 * older Chromium, where it still shares and plays, if less universally.
 */
const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm",
];

function pickVideoType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/** Whether this browser can record the animated card, and whether `theme` has one. */
export function canRenderShareVideo(theme: ShareTheme): boolean {
  if (typeof document === "undefined") return false;
  if (!THEMES[theme].paintAnimated) return false;
  if (typeof HTMLCanvasElement.prototype.captureStream !== "function") return false;
  return pickVideoType() !== null;
}

export interface ShareVideo {
  blob: Blob;
  /** "mp4" or "webm", for the filename. */
  extension: string;
}

/**
 * Records the animated card as a seamless looping video.
 *
 * MediaRecorder can only record in real time, so this takes as long as the
 * clip — the share sheet shows progress while it runs. Frames are drawn on
 * requestAnimationFrame and positioned by elapsed time, not frame count, so a
 * phone that drops a frame produces a clip that skips rather than one that runs
 * slow and breaks the loop.
 *
 * The canvas is attached to the document, off screen, while it records: Safari
 * does not reliably produce frames from a canvas that is not in the DOM.
 */
export async function renderShareVideo(
  card: ShareCard,
  format: ShareFormat,
  theme: ShareTheme,
  options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<ShareVideo> {
  const { signal, onProgress } = options;
  const paintAnimated = THEMES[theme].paintAnimated;
  const mimeType = pickVideoType();
  if (!paintAnimated || !mimeType) {
    throw new Error("Animated cards are not supported here.");
  }

  const { width, height } = SHARE_FORMATS[format];
  const l = layoutFor(format);
  const foreground = await paintForeground(card, format, theme);
  if (signal?.aborted) throw abortError();

  const canvas = makeCanvas(width, height);
  Object.assign(canvas.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    pointerEvents: "none",
  });
  document.body.append(canvas);
  const ctx = context2d(canvas);

  const draw = (p: number) => {
    paintAnimated(ctx, width, height, l, p);
    ctx.drawImage(foreground, 0, 0);
  };
  draw(0);

  const stream = canvas.captureStream(SHARE_VIDEO_FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const duration = SHARE_VIDEO_SECONDS * 1000;
  let frame = 0;

  const cleanup = () => {
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((track) => track.stop());
    canvas.remove();
  };

  try {
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("The video could not be recorded."));
      signal?.addEventListener("abort", () => {
        if (recorder.state !== "inactive") recorder.stop();
        reject(abortError());
      });
    });

    recorder.start();
    const started = performance.now();

    const tick = (now: number) => {
      const elapsed = now - started;
      onProgress?.(Math.min(1, elapsed / duration));
      if (elapsed >= duration) {
        draw(0); // the loop point, so the last frame is the first
        recorder.stop();
        return;
      }
      draw(elapsed / duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    await stopped;
  } finally {
    cleanup();
  }

  const type = mimeType.split(";")[0];
  return {
    blob: new Blob(chunks, { type }),
    extension: type === "video/mp4" ? "mp4" : "webm",
  };
}

function abortError(): DOMException {
  return new DOMException("The recording was cancelled.", "AbortError");
}

/** The four faces a body painter draws with. */
interface Fonts {
  display: (size: number) => string;
  displayBold: (size: number) => string;
  body: (size: number) => string;
  bodyRegular: (size: number) => string;
}

/** The room left for a card's body once the brand and the footer have taken theirs. */
interface Frame {
  width: number;
  left: number;
  contentWidth: number;
  /** Nothing may be drawn above this line — the lockup owns everything higher. */
  contentTop: number;
  /** The footer's baseline. A body stays clear of it. */
  footerBaseline: number;
}

/**
 * The parts every card has: the lockup at the top, the date and the app address
 * at the bottom. Returns the space that is left.
 */
function paintChrome(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  width: number,
  height: number,
  l: Layout,
  fonts: Fonts,
  c: Palette,
): Frame {
  const left = l.padding;
  const contentWidth = width - l.padding * 2;

  const headerBottom = paintLockup(ctx, left, l.headerTop, fonts.display, c);

  const footerBaseline = height - l.padding;

  ctx.font = fonts.body(l.footerSize);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c.muted;
  if (card.dateLabel) {
    ctx.textAlign = "left";
    ctx.fillText(card.dateLabel, left, footerBaseline);
  }

  // The app address, drawn on the image because Instagram does not turn a URL
  // in caption or story text into a link — on the image it is at least
  // readable, and typeable.
  ctx.textAlign = "right";
  ctx.fillStyle = c.primary;
  ctx.fillText(APP_URL_DISPLAY, width - l.padding, footerBaseline);
  ctx.textAlign = "left";

  return {
    width,
    left,
    contentWidth,
    // Nothing below may cross this line. A result's composition is built from the
    // bottom up, so without a stated ceiling a long WOD simply pushes the title
    // off the top of the canvas — see the description budget in paintResultBody.
    contentTop: headerBottom + l.gap,
    footerBaseline,
  };
}

/**
 * One result: the score is the poster, and everything else is stacked upward
 * from it.
 */
function paintResultBody(
  ctx: CanvasRenderingContext2D,
  card: ResultShareCard,
  frame: Frame,
  l: Layout,
  fonts: Fonts,
  c: Palette,
): void {
  const { width, left, contentWidth, contentTop, footerBaseline } = frame;
  const {
    display: displayFont,
    displayBold,
    body: bodyFont,
    bodyRegular,
  } = fonts;

  // --- Score ---
  // The composition hangs off the bottom edge: the score is the thing the eye
  // should land on, and anchoring it to a fixed distance from the bottom keeps
  // it in the same place whether the title took one line or two.
  const scoreBottom = footerBaseline - l.footerSize - l.gap;

  // One line, always. "8 rnds + 12 reps" broken across two lines reads as two
  // separate numbers, and on a 4:5 post those two lines cost most of the room
  // the WOD needs. Shrinking to fit keeps it as one statement — even at the
  // floor it is still the second-largest thing on the card.
  const value = fitText(
    ctx,
    card.value,
    displayFont,
    contentWidth,
    1,
    l.valueMax,
    l.valueMin,
  );

  const valueLineHeight = value.size * 1.02;
  const valueTop = scoreBottom - valueLineHeight * value.lines.length;

  ctx.font = displayFont(value.size);
  ctx.textBaseline = "top";

  // `.text-gradient-pr` — primary to accent across the text — applied only to
  // records, so the treatment still means something when it appears.
  if (card.highlight) {
    const gradient = ctx.createLinearGradient(
      left,
      valueTop,
      left + contentWidth,
      scoreBottom,
    );
    gradient.addColorStop(0, c.primary);
    gradient.addColorStop(1, c.accent);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = c.foreground;
  }

  value.lines.forEach((line, index) => {
    ctx.fillText(line, left, valueTop + index * valueLineHeight);
  });

  // The score's own label, sitting just above it.
  const valueLabelSize = l.eyebrowSize;
  ctx.font = bodyFont(valueLabelSize);
  ctx.fillStyle = c.muted;
  ctx.textBaseline = "alphabetic";
  drawTracked(
    ctx,
    card.valueLabel.toUpperCase(),
    left,
    valueTop - 22,
    valueLabelSize * 0.18,
  );

  // --- Title block, growing upward from the score ---
  let cursor = valueTop - valueLabelSize - 22 - l.gap;

  // The title, badges and eyebrow are measured before anything is drawn,
  // because the description has to be told how much room is left over rather
  // than taking what it wants. `clampLines` already capped it at six lines, but
  // six lines of wrapped text plus a two-line title is more than a 4:5 post has
  // room for, and the block that loses in a bottom-up layout is whichever one is
  // drawn last — the title. Which is the one thing that must never be cut.
  const title = fitText(
    ctx,
    card.title,
    displayFont,
    contentWidth,
    2,
    l.titleMax,
    l.titleMin,
  );
  const titleLineHeight = title.size * 1.05;
  const titleBlock =
    titleLineHeight * title.lines.length + l.eyebrowSize + 26 + l.gap * 0.6;
  const badgeHeight = l.badgeSize + 26;
  const badgesBlock =
    card.badges.length > 0 ? badgeHeight + l.gap * 0.6 : 0;

  // Description sits directly above the score when present.
  if (card.description) {
    ctx.font = bodyRegular(l.bodySize);
    const lineHeight = l.bodySize * 1.42;
    const budget =
      cursor - l.gap * 0.8 - badgesBlock - titleBlock - contentTop;
    const allowed = Math.max(0, Math.floor(budget / lineHeight));

    const wrapped = wrapText(ctx, card.description, contentWidth);
    const lines =
      wrapped.length > allowed
        ? // Losing the last line to an ellipsis is better than losing it
          // silently: the reader can see the workout continues.
          [...wrapped.slice(0, Math.max(0, allowed - 1)), "…"]
        : wrapped;

    if (allowed > 0) {
      const blockHeight = lines.length * lineHeight;
      const top = cursor - blockHeight;

      ctx.fillStyle = c.description;
      ctx.textBaseline = "top";
      lines.forEach((line, index) => {
        ctx.fillText(line, left, top + index * lineHeight);
      });

      cursor = top - l.gap * 0.8;
    }
  }

  // Badges.
  if (card.badges.length > 0) {
    const badgeTop = cursor - badgeHeight;
    let badgeX = left;
    for (const badge of card.badges) {
      const consumed = paintBadge(
        ctx,
        badge,
        badgeX,
        badgeTop,
        l.badgeSize,
        bodyFont,
        c,
      );
      badgeX += consumed + 14;
      // Silently stop rather than wrap: three pills is the realistic maximum and
      // a second row would push into the title.
      if (badgeX > width - l.padding - 120) break;
    }
    cursor = badgeTop - l.gap * 0.6;
  }

  // Title — measured above, drawn here.
  const titleTop = cursor - titleLineHeight * title.lines.length;

  ctx.font = displayFont(title.size);
  ctx.fillStyle = c.foreground;
  ctx.textBaseline = "top";
  title.lines.forEach((line, index) => {
    ctx.fillText(line, left, titleTop + index * titleLineHeight);
  });

  // Eyebrow.
  ctx.font = displayBold(l.eyebrowSize);
  ctx.fillStyle = card.highlight ? c.primary : c.muted;
  ctx.textBaseline = "alphabetic";
  drawTracked(
    ctx,
    card.eyebrow.toUpperCase(),
    left,
    titleTop - 26,
    l.eyebrowSize * 0.22,
  );
}

/**
 * A whole training day: the sessions are the content, so this one reads top down.
 *
 * The header block is drawn first because its height is knowable — an eyebrow, a
 * title of at most two lines, one row of pills — and whatever is left between it
 * and the footer belongs to the list. The rows then split that space evenly,
 * within bounds: five sessions on a 4:5 post would otherwise give each row 90px
 * to hold a title, a type and a score, and two sessions on a story would give
 * each 500px and look like a mistake. Bounded and centred, a two-session day and
 * a five-session day are recognisably the same poster.
 */
function paintDayBody(
  ctx: CanvasRenderingContext2D,
  card: DayShareCard,
  frame: Frame,
  l: Layout,
  fonts: Fonts,
  c: Palette,
): void {
  const { left, contentWidth, contentTop, footerBaseline } = frame;
  const d = l.day;

  // --- Eyebrow ---
  ctx.font = fonts.displayBold(l.eyebrowSize);
  ctx.fillStyle = card.highlight ? c.primary : c.muted;
  ctx.textBaseline = "top";
  drawTracked(
    ctx,
    card.eyebrow.toUpperCase(),
    left,
    contentTop,
    l.eyebrowSize * 0.22,
  );

  let cursor = contentTop + l.eyebrowSize + 24;

  // --- Title ---
  const title = fitText(
    ctx,
    card.title,
    fonts.display,
    contentWidth,
    2,
    d.titleMax,
    d.titleMin,
  );
  const titleLineHeight = title.size * 1.05;

  ctx.font = fonts.display(title.size);
  ctx.fillStyle = c.foreground;
  ctx.textBaseline = "top";
  title.lines.forEach((line, index) => {
    ctx.fillText(line, left, cursor + index * titleLineHeight);
  });
  cursor += titleLineHeight * title.lines.length + l.gap * 0.5;

  // --- Badges: how many sessions, and how many were records ---
  if (card.badges.length > 0) {
    let badgeX = left;
    for (const badge of card.badges) {
      const consumed = paintBadge(
        ctx,
        badge,
        badgeX,
        cursor,
        l.badgeSize,
        fonts.body,
        c,
      );
      badgeX += consumed + 14;
      if (badgeX > frame.width - l.padding - 120) break;
    }
    cursor += l.badgeSize + 26 + l.gap * 0.6;
  }

  if (card.entries.length === 0) return;

  // --- The sessions ---
  const overflowHeight =
    card.hiddenCount > 0 ? l.badgeSize + 24 + l.gap * 0.5 : 0;
  const listBottom = footerBaseline - l.footerSize - l.gap - overflowHeight;
  const available = Math.max(0, listBottom - cursor);

  const rowHeight = Math.max(
    d.rowMin,
    Math.min(d.rowMax, available / card.entries.length),
  );
  const listHeight = rowHeight * card.entries.length;
  // Centred in what is left, so the block does not hang off the header on a day
  // with two sessions or crowd the footer on a day with five.
  const listTop = cursor + Math.max(0, (available - listHeight) / 2);

  card.entries.forEach((entry, index) => {
    const rowTop = listTop + index * rowHeight;

    // A hairline between rows, not around them: the rows are one list, and a box
    // per session would turn the poster into a table.
    if (index > 0) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, rowTop + 0.5);
      ctx.lineTo(left + contentWidth, rowTop + 0.5);
      ctx.stroke();
      ctx.restore();
    }

    // The score has first claim on the width — it is the part somebody reads —
    // and the title takes what is left over.
    const value = fitText(
      ctx,
      entry.value,
      fonts.display,
      contentWidth * 0.46,
      1,
      d.entryValueMax,
      d.entryValueMin,
    );
    const valueText = value.lines[0] ?? entry.value;
    const valueWidth = ctx.measureText(valueText).width;

    const textWidth = Math.max(120, contentWidth - valueWidth - 36);
    const titleHeight = d.entryTitle * 1.1;
    const detailHeight = entry.detail ? d.entryDetail * 1.35 : 0;
    const textTop = rowTop + (rowHeight - titleHeight - detailHeight) / 2;

    ctx.font = fonts.body(d.entryTitle);
    ctx.fillStyle = c.foreground;
    ctx.textBaseline = "top";
    ctx.fillText(ellipsize(ctx, entry.title, textWidth), left, textTop);

    if (entry.detail) {
      ctx.font = fonts.bodyRegular(d.entryDetail);
      ctx.fillStyle = c.muted;
      ctx.fillText(
        ellipsize(ctx, entry.detail, textWidth),
        left,
        textTop + titleHeight,
      );
    }

    ctx.font = fonts.display(value.size);
    if (entry.highlight) {
      const gradient = ctx.createLinearGradient(
        left + contentWidth - valueWidth,
        rowTop,
        left + contentWidth,
        rowTop + rowHeight,
      );
      gradient.addColorStop(0, c.primary);
      gradient.addColorStop(1, c.accent);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = c.foreground;
    }
    ctx.textAlign = "right";
    ctx.fillText(
      valueText,
      left + contentWidth,
      rowTop + (rowHeight - value.size * 1.02) / 2,
    );
    ctx.textAlign = "left";
  });

  // --- What did not fit ---
  if (card.hiddenCount > 0) {
    ctx.font = fonts.body(l.badgeSize);
    ctx.fillStyle = c.muted;
    ctx.textBaseline = "top";
    drawTracked(
      ctx,
      `+${card.hiddenCount} MORE ${card.hiddenCount === 1 ? "SESSION" : "SESSIONS"}`,
      left,
      listTop + listHeight + l.gap * 0.4,
      l.badgeSize * 0.14,
    );
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The card could not be encoded as an image."));
    }, "image/png");
  });
}
