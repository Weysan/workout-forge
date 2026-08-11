"use client";

import { Input } from "@/components/ui/input";

/**
 * A single big numeric field with a caption above it.
 *
 * Shared by the score inputs and the helper tools, which all ask for numbers on
 * a phone, mid-session, from someone out of breath: hence the oversized target,
 * the centred value, and the number pad.
 */
export function NumberBox({
  id,
  label,
  value,
  onValueChange,
  max,
  placeholder,
  decimal = false,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  max?: number;
  placeholder?: string;
  decimal?: boolean;
}) {
  return (
    <div className="flex-1 space-y-1.5">
      <label
        htmlFor={id}
        className="text-muted-foreground/80 block text-[10px] font-bold tracking-widest uppercase"
      >
        {label}
      </label>
      <Input
        id={id}
        // `type="text"` with a numeric inputMode, not `type="number"`: number
        // inputs silently discard invalid intermediate text and their spinners
        // are a liability on touch.
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        // iOS shows the pad from inputMode; this hints Android too.
        pattern={decimal ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        className="tabular font-display h-14 text-center text-2xl font-bold"
        onChange={(event) => {
          const raw = event.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, "");
          const normalised = decimal ? raw.replace(",", ".") : raw;

          if (normalised === "") {
            onValueChange("");
            return;
          }
          if (max !== undefined && Number(normalised) > max) return;

          onValueChange(normalised);
        }}
      />
    </div>
  );
}
