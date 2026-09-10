"use client";

import { MapPinIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { MAX_LOCATION_LENGTH, suggestLocations } from "@/lib/locations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The optional "where" on a workout: a free-text field, with the athlete's
 * recent places offered as chips underneath.
 *
 * Chips rather than a dropdown or a combobox. This is a phone form with the
 * keyboard already up, and a popover would cover the field it is meant to fill;
 * chips sit in the layout, need no open/close state, and stay reachable with a
 * thumb. Typing narrows them, so a long list is still one tap away.
 *
 * The field itself is never disabled or constrained by the list — the first
 * session at a new box has no chip to tap, and that is the case this must not
 * make harder.
 */
export function LocationInput({
  value,
  onChange,
  locations,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Remembered places, most recently used first. */
  locations: readonly string[];
}) {
  const suggestions = suggestLocations(locations, value);

  return (
    <div className="space-y-2">
      <Label htmlFor="location">
        Place
        <span className="text-muted-foreground/70 ml-1.5 text-xs font-normal">
          optional
        </span>
      </Label>

      <Input
        id="location"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="CrossFit Berlin, home garage…"
        maxLength={MAX_LOCATION_LENGTH}
        autoComplete="off"
        // The place is a proper noun most of the time, and iOS lower-casing
        // "CrossFit" into "crossfit" is a correction nobody asked for.
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
      />

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {suggestions.map((place) => (
            <button
              key={place}
              type="button"
              onClick={() => onChange(place)}
              className={cn(
                "border-border bg-input/40 text-muted-foreground inline-flex min-h-9 max-w-full items-center gap-1.5",
                "rounded-lg border px-2.5 text-sm transition-colors",
                "hover:bg-elevated hover:text-foreground active:bg-elevated",
              )}
            >
              <MapPinIcon className="size-3.5 shrink-0" />
              <span className="truncate">{place}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
