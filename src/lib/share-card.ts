/**
 * The shareable card, as data.
 *
 * Sharing a result means drawing it onto a canvas at Instagram's dimensions
 * (lib/share-image.ts). That renderer is unavoidably browser-bound, so
 * *deciding what goes on the card* is kept here, apart from it: a plain
 * description of the poster that can be reasoned about, and tested, without a
 * canvas in the room.
 *
 * This module imports nothing — everything arrives pre-formatted. A PR's
 * "120 kg × 3" is produced by `formatScore` in lib/scoring.ts and its date by
 * date-fns at the call site, so there is exactly one implementation of how a
 * score reads, and it is the one already on screen. A shared image that
 * disagreed with the app it came from would be worse than no image at all.
 *
 * Having no imports is also what lets `node --test` run this file directly
 * through type stripping, the same arrangement as lib/barbell.ts.
 */

// --- Formats -------------------------------------------------------------

/**
 * Instagram's two useful canvases.
 *
 * Story is the full-bleed 9:16 that Stories and Reels display without cropping.
 * Post is 4:5 — the tallest ratio the feed allows, and so the one that claims
 * the most screen as somebody scrolls past.
 *
 * Both are drawn at 1080px wide, which is what Instagram downscales to anyway;
 * rendering larger only makes a heavier file for the share sheet to carry.
 */
export const SHARE_FORMATS = {
  story: {
    width: 1080,
    height: 1920,
    label: "Story",
    /** For the preview box, so it reserves the right shape before the render lands. */
    aspectRatio: "9 / 16",
  },
  post: {
    width: 1080,
    height: 1350,
    label: "Post",
    aspectRatio: "4 / 5",
  },
} as const;

export type ShareFormat = keyof typeof SHARE_FORMATS;

export const SHARE_FORMAT_ORDER = ["story", "post"] as const;

// --- The card ------------------------------------------------------------

export interface ShareCard {
  /** Small uppercase kicker above the title — "Personal record", "Workout". */
  eyebrow: string;
  /** The movement or workout name. The largest text on the card after the score. */
  title: string;
  /** Category, type, RX/Scaled, PR — drawn as outlined pills. */
  badges: string[];
  /** The WOD itself. Absent for a PR card, where the movement name says it all. */
  description?: string;
  /** "Time", "Load" — from `scoreTypeLabel`. */
  valueLabel: string;
  /** "4:15", "120 kg × 3" — from `formatScore`. */
  value: string;
  /** "12 Aug 2026". Absent when the source has no date to stand behind. */
  dateLabel?: string;
  /**
   * Whether the score gets the primary→accent gradient rather than plain white.
   * Reserved for records: if every card shouted, none would.
   */
  highlight: boolean;
  /** `YYYY-MM-DD`, used only to name the downloaded file. */
  dateKey?: string;
}

// --- Builders ------------------------------------------------------------

/**
 * A standing personal record.
 *
 * Deliberately without a description: the benchmark's own text runs to several
 * lines of prescribed movements, which is the right thing to read *before*
 * attempting Fran and the wrong thing to post *after* setting a record on it.
 * The number is the story here.
 */
export function buildPrCard(input: {
  name: string;
  category: string;
  type: string;
  value: string;
  valueLabel: string;
  dateLabel?: string;
  dateKey?: string;
}): ShareCard {
  return {
    eyebrow: "Personal record",
    title: input.name,
    badges: dedupeBadges([input.category, input.type]),
    valueLabel: input.valueLabel,
    value: input.value,
    dateLabel: input.dateLabel,
    dateKey: input.dateKey,
    highlight: true,
  };
}

/**
 * One logged session.
 *
 * The description carries the workout — the rep scheme and the movements — which
 * is what makes the image legible to another athlete rather than a number
 * floating without context.
 */
export function buildWorkoutCard(input: {
  title: string;
  typeLabel: string;
  rxOrScaled: string;
  isPR: boolean;
  description: string;
  value: string;
  valueLabel: string;
  dateLabel?: string;
  dateKey?: string;
}): ShareCard {
  const description = clampLines(input.description, DESCRIPTION_MAX_LINES);

  return {
    eyebrow: "Workout",
    title: input.title,
    badges: dedupeBadges([
      input.typeLabel,
      input.rxOrScaled,
      ...(input.isPR ? ["PR"] : []),
    ]),
    // An empty description must not become an empty block reserving space on
    // the card, so it is dropped rather than passed through blank.
    description: description === "" ? undefined : description,
    valueLabel: input.valueLabel,
    value: input.value,
    dateLabel: input.dateLabel,
    dateKey: input.dateKey,
    highlight: input.isPR,
  };
}

/**
 * A benchmark's category and type often coincide ("Hero" / "ForTime" differ, but
 * a custom lift can arrive as "Lift" twice). Two identical pills side by side
 * read as a rendering bug.
 */
function dedupeBadges(badges: string[]): string[] {
  const seen = new Set<string>();
  return badges.filter((badge) => {
    const key = badge.trim().toLowerCase();
    if (key === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Text preparation ----------------------------------------------------

/** How much of a WOD survives onto the card. */
export const DESCRIPTION_MAX_LINES = 6;

/**
 * Keeps the first `maxLines` non-empty lines of a block of text.
 *
 * A WOD is written as lines — "21-15-9", then a movement per line — and that
 * shape is the thing worth preserving. Truncating by character count would cut
 * mid-movement; truncating by line leaves something that still reads as a
 * workout. The ellipsis is only added when text was actually dropped, so a WOD
 * that fits shows no sign of having been through here.
 *
 * Blank lines are collapsed rather than counted: a description separated by
 * double newlines would otherwise spend half its budget on whitespace.
 */
export function clampLines(text: string, maxLines: number): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (lines.length === 0) return "";
  if (lines.length <= maxLines) return lines.join("\n");

  return [...lines.slice(0, maxLines), "…"].join("\n");
}

// --- Share payload -------------------------------------------------------

/**
 * The caption that travels with the image.
 *
 * Instagram ignores it — its composer opens with an empty caption regardless —
 * but the same share sheet also offers WhatsApp, Messages and mail, where this
 * is the entire message. So it has to stand alone, which is why it repeats the
 * result rather than assuming the image is visible.
 */
export function shareCaption(card: ShareCard, appUrl: string): string {
  const headline =
    card.eyebrow === "Personal record"
      ? `New PR — ${card.title}: ${card.value}`
      : `${card.title} — ${card.value}`;

  return `${headline}\n\nTracked with FORGE · ${appUrl}`;
}

/** `forge-back-squat-2026-08-12.png` — sortable, and obviously ours in a downloads folder. */
export function shareFilename(card: ShareCard): string {
  const slug = slugify(card.title);
  const parts = ["forge", slug === "" ? "result" : slug];
  if (card.dateKey) parts.push(card.dateKey);
  return `${parts.join("-")}.png`;
}

/**
 * ASCII slug.
 *
 * Movement names carry accents ("Hyrox Doubles", "Kettlebell Snatch" are fine,
 * but user-titled workouts are free text) and some filesystems and download
 * handlers still mangle anything outside ASCII. NFD + stripping combining marks
 * turns "é" into "e" rather than dropping the letter entirely.
 */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    // Combining diacritical marks. Written as escapes because the literal
    // characters are invisible in an editor.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
