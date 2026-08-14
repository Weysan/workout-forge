import {
  SHARE_FORMATS,
  type DayShareCard,
  type ResultShareCard,
  type ShareCard,
  type ShareFormat,
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

// --- Palette (mirrors :root in app/globals.css) --------------------------

const COLOR = {
  background: "#0b1120",
  card: "#111c31",
  foreground: "#f1f5f9",
  muted: "#94a3b8",
  border: "#1e2d48",
  primary: "#10b981",
  accent: "#06b6d4",
} as const;

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
): void {
  ctx.fillStyle = COLOR.background;
  ctx.fillRect(0, 0, width, height);

  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, "rgba(17, 28, 49, 0.9)");
  wash.addColorStop(0.55, "rgba(11, 17, 32, 0)");
  wash.addColorStop(1, "rgba(17, 28, 49, 0.75)");
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
): void {
  const fade = Math.min(height * 0.62, 1180);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, fade);
  ctx.clip();

  ctx.strokeStyle = COLOR.border;
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

  blob(width * 0.12, height * 0.06, width * 0.85, COLOR.primary, 0.22);
  blob(width * 0.95, height * 0.9, width * 0.8, COLOR.accent, 0.18);
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
    ctx.fillStyle = COLOR.primary;
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
  ctx.fillStyle = COLOR.foreground;
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
  ctx.fillStyle = "rgba(22, 35, 60, 0.75)";
  ctx.fill();
  ctx.strokeStyle = COLOR.border;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = COLOR.muted;
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
): Promise<Blob> {
  const { width, height } = SHARE_FORMATS[format];
  const l = layoutFor(format);

  const displayFamily = fontStack("--font-inter-tight", "system-ui, sans-serif");
  const bodyFamily = fontStack("--font-inter", "system-ui, sans-serif");
  await ensureFonts(displayFamily, bodyFamily);

  const fonts: Fonts = {
    display: (size) => `800 ${size}px ${displayFamily}`,
    displayBold: (size) => `700 ${size}px ${displayFamily}`,
    body: (size) => `600 ${size}px ${bodyFamily}`,
    bodyRegular: (size) => `400 ${size}px ${bodyFamily}`,
  };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");

  ctx.textBaseline = "alphabetic";

  paintBackground(ctx, width, height);
  paintGrid(ctx, width, height, l.gridSize);
  paintGlow(ctx, width, height);

  const frame = paintChrome(ctx, card, width, height, l, fonts);

  // The two posters share everything above and below, and nothing in between: a
  // result hangs one enormous number off the bottom edge, a day fills the middle
  // with a list. Trying to express both as one parameterised composition was
  // worse than two functions that each do one thing.
  if (card.kind === "day") {
    paintDayBody(ctx, card, frame, l, fonts);
  } else {
    paintResultBody(ctx, card, frame, l, fonts);
  }

  return toBlob(canvas);
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
): Frame {
  const left = l.padding;
  const contentWidth = width - l.padding * 2;

  const headerBottom = paintLockup(ctx, left, l.headerTop, fonts.display);

  const footerBaseline = height - l.padding;

  ctx.font = fonts.body(l.footerSize);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLOR.muted;
  if (card.dateLabel) {
    ctx.textAlign = "left";
    ctx.fillText(card.dateLabel, left, footerBaseline);
  }

  // The app address, drawn on the image because Instagram does not turn a URL
  // in caption or story text into a link — on the image it is at least
  // readable, and typeable.
  ctx.textAlign = "right";
  ctx.fillStyle = COLOR.primary;
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
    gradient.addColorStop(0, COLOR.primary);
    gradient.addColorStop(1, COLOR.accent);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = COLOR.foreground;
  }

  value.lines.forEach((line, index) => {
    ctx.fillText(line, left, valueTop + index * valueLineHeight);
  });

  // The score's own label, sitting just above it.
  const valueLabelSize = l.eyebrowSize;
  ctx.font = bodyFont(valueLabelSize);
  ctx.fillStyle = COLOR.muted;
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

      ctx.fillStyle = "rgba(226, 232, 240, 0.78)";
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
  ctx.fillStyle = COLOR.foreground;
  ctx.textBaseline = "top";
  title.lines.forEach((line, index) => {
    ctx.fillText(line, left, titleTop + index * titleLineHeight);
  });

  // Eyebrow.
  ctx.font = displayBold(l.eyebrowSize);
  ctx.fillStyle = card.highlight ? COLOR.primary : COLOR.muted;
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
): void {
  const { left, contentWidth, contentTop, footerBaseline } = frame;
  const d = l.day;

  // --- Eyebrow ---
  ctx.font = fonts.displayBold(l.eyebrowSize);
  ctx.fillStyle = card.highlight ? COLOR.primary : COLOR.muted;
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
  ctx.fillStyle = COLOR.foreground;
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
      ctx.strokeStyle = COLOR.border;
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
    ctx.fillStyle = COLOR.foreground;
    ctx.textBaseline = "top";
    ctx.fillText(ellipsize(ctx, entry.title, textWidth), left, textTop);

    if (entry.detail) {
      ctx.font = fonts.bodyRegular(d.entryDetail);
      ctx.fillStyle = COLOR.muted;
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
      gradient.addColorStop(0, COLOR.primary);
      gradient.addColorStop(1, COLOR.accent);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = COLOR.foreground;
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
    ctx.fillStyle = COLOR.muted;
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
