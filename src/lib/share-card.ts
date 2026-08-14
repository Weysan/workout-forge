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

/**
 * What both posters share.
 *
 * A single result and a whole training day are the same object at the top —
 * kicker, headline, pills, date, brand — and diverge below it: one has a score
 * the size of the canvas, the other has a list. So they are one union with a
 * common head rather than two unrelated shapes, which is what lets the renderer
 * paint the chrome once and the share sheet stay indifferent to which it is
 * holding.
 */
interface ShareCardBase {
  /** Small uppercase kicker above the title — "Personal record", "Workout". */
  eyebrow: string;
  /** The movement, workout or day. The largest text on the card after the score. */
  title: string;
  /** Category, type, RX/Scaled, PR — drawn as outlined pills. */
  badges: string[];
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

/** One result: a session, or a standing record. */
export interface ResultShareCard extends ShareCardBase {
  kind: "result";
  /** The WOD itself. Absent for a PR card, where the movement name says it all. */
  description?: string;
  /** "Time", "Load" — from `scoreTypeLabel`. */
  valueLabel: string;
  /** "4:15", "120 kg × 3" — from `formatScore`. */
  value: string;
}

/** One line of a day card. */
export interface DayShareEntry {
  title: string;
  /** "For Time · RX" — the session's shape in one line. Absent when there is none worth drawing. */
  detail?: string;
  /** "4:15", "140 kg × 3". */
  value: string;
  /** A record among the day's sessions gets the gradient treatment on its own row. */
  highlight: boolean;
}

/** A whole training day: several sessions, each with its own score. */
export interface DayShareCard extends ShareCardBase {
  kind: "day";
  entries: DayShareEntry[];
  /** Sessions there was no room for, so the card can say so instead of lying by omission. */
  hiddenCount: number;
}

export type ShareCard = ResultShareCard | DayShareCard;

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
}): ResultShareCard {
  return {
    kind: "result",
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
}): ResultShareCard {
  const description = clampLines(input.description, DESCRIPTION_MAX_LINES);

  return {
    kind: "result",
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
 * How many sessions fit on a day card before it starts counting the rest.
 *
 * Five rows leaves each one enough height for a title, its type and a score
 * legible on a phone. A sixth would shrink all of them to fit a day almost
 * nobody has, and the honest way to handle a seven-session day is to say there
 * were seven, not to render them at 20px.
 */
export const DAY_ENTRY_MAX = 5;

/**
 * A whole training day.
 *
 * The day's sessions are the content, so there is no single hero number: two
 * pieces scored in seconds and kilograms have no meaningful total, and inventing
 * one ("3 sessions!") would put the least interesting fact in the biggest type.
 * The rows carry the story and the title says which day it was.
 *
 * Entries arrive already ordered — the sequence the athlete arranged on the log
 * (lib/day-order.ts) — and already formatted, the same as everything else here.
 * Unscored sessions are dropped by the caller rather than shown as a dash: a
 * poster of a result that does not exist yet is not a share.
 */
export function buildDayCard(input: {
  /** "Friday 14 August" — the day as the log heading writes it. */
  title: string;
  /** The year, which the title leaves out. */
  dateLabel?: string;
  dateKey?: string;
  entries: Array<{
    title: string;
    detail?: string;
    value: string;
    isPR: boolean;
  }>;
}): DayShareCard {
  const shown = input.entries.slice(0, DAY_ENTRY_MAX);
  const prCount = input.entries.filter((entry) => entry.isPR).length;

  return {
    kind: "day",
    eyebrow: "Training day",
    title: input.title,
    badges: dedupeBadges([
      `${input.entries.length} ${input.entries.length === 1 ? "session" : "sessions"}`,
      ...(prCount > 0 ? [`${prCount} ${prCount === 1 ? "PR" : "PRs"}`] : []),
    ]),
    entries: shown.map((entry) => ({
      title: entry.title,
      // Same reasoning as an empty description: a blank line would reserve space
      // on the poster for nothing.
      detail: entry.detail === "" ? undefined : entry.detail,
      value: entry.value,
      highlight: entry.isPR,
    })),
    hiddenCount: Math.max(0, input.entries.length - shown.length),
    dateLabel: input.dateLabel,
    dateKey: input.dateKey,
    // The day is a record day if any session in it was, including one that did
    // not fit on the card.
    highlight: prCount > 0,
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
  const signature = `Tracked with FORGE · ${appUrl}`;

  // A day card has no single result to lead with, so the caption becomes the
  // session list — the same thing the image shows, for the targets that display
  // text and not much else.
  if (card.kind === "day") {
    const sessions = card.badges[0] ?? "";
    const lines = card.entries.map(
      (entry) => `${entry.title} — ${entry.value}`,
    );
    if (card.hiddenCount > 0) {
      lines.push(`+${card.hiddenCount} more`);
    }

    return [`${card.title}${sessions === "" ? "" : ` — ${sessions}`}`, lines.join("\n"), signature]
      .filter((block) => block !== "")
      .join("\n\n");
  }

  const headline =
    card.eyebrow === "Personal record"
      ? `New PR — ${card.title}: ${card.value}`
      : `${card.title} — ${card.value}`;

  return `${headline}\n\n${signature}`;
}

/**
 * `forge-back-squat-2026-08-12.png` — sortable, and obviously ours in a
 * downloads folder.
 *
 * A day card is named for the day rather than its title: "Friday 14 August"
 * slugged would repeat the date that already follows it, and every day in a
 * downloads folder should sit next to its neighbours.
 */
export function shareFilename(card: ShareCard): string {
  const slug = card.kind === "day" ? "day" : slugify(card.title);
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
