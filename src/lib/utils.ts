import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * `YYYY-MM-DD` in the *browser's* timezone.
 *
 * `Date.prototype.toISOString()` converts to UTC first, which shifts the date
 * for anyone west of Greenwich in the evening — a workout logged at 9pm in New
 * York would land on tomorrow. Workout dates are calendar days as the athlete
 * experienced them, so they are always derived from local parts.
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a `YYYY-MM-DD` key back into a local-midnight Date. */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function todayKey(): string {
  return toDateKey(new Date());
}
