"use client";

import { useState } from "react";
import { ArrowRightLeftIcon } from "lucide-react";

import { kgToLb, lbToKg } from "@/lib/units";
import { NumberBox } from "@/components/number-box";

/**
 * Two-way kilograms ↔ pounds.
 *
 * Both fields are live: whichever one is typed into drives the other, so there
 * is no direction to set and no swap button to hunt for. Programmes and
 * benchmark descriptions mix units freely ("Grace: 135/95 lbs") while the log
 * stores kilograms, and this is the gap between the two.
 *
 * The typed field keeps its raw string rather than being reformatted on every
 * keystroke — rewriting "1." to "1" as it is typed makes the decimal point
 * impossible to enter.
 */
export function WeightConverter() {
  const [kg, setKg] = useState("");
  const [lb, setLb] = useState("");

  function handleKg(value: string) {
    setKg(value);
    setLb(value === "" ? "" : round(kgToLb(Number(value))));
  }

  function handleLb(value: string) {
    setLb(value);
    setKg(value === "" ? "" : round(lbToKg(Number(value))));
  }

  return (
    <div className="flex items-end gap-3">
      <NumberBox
        id="convert-kg"
        label="Kilograms"
        value={kg}
        onValueChange={handleKg}
        decimal
        placeholder="0"
      />
      <ArrowRightLeftIcon
        className="text-muted-foreground/50 mb-4 size-4 shrink-0"
        aria-hidden
      />
      <NumberBox
        id="convert-lb"
        label="Pounds"
        value={lb}
        onValueChange={handleLb}
        decimal
        placeholder="0"
      />
    </div>
  );
}

/**
 * Two decimals at most, with no trailing zeroes.
 *
 * Finer than any plate, and `Number()` drops the "12.50" that `toFixed` would
 * otherwise leave sitting in the field.
 */
function round(value: number): string {
  // A half-typed "." parses as NaN — leave the other field blank rather than
  // printing it.
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}
