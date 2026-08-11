"use client";

import { CheckCircle2Icon, XCircleIcon } from "lucide-react";

import type { ScoreDraft } from "@/lib/score-draft";
import type { ScoreType, UnitSystem } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Score entry, shaped by the score type.
 *
 * Every numeric field sets `inputMode` so phones open the number pad instead of
 * the full keyboard — the difference between two taps and six when logging
 * between rounds.
 */
export function ScoreInput({
  scoreType,
  draft,
  onChange,
  unitSystem,
  /**
   * Namespaces the input ids. Two ScoreInputs can be mounted at once — the
   * workout form and the quick-log form in the records sheet — and duplicate
   * ids would silently point every <label> at the first match.
   */
  idPrefix = "score",
}: {
  scoreType: ScoreType;
  draft: ScoreDraft;
  onChange: (patch: Partial<ScoreDraft>) => void;
  unitSystem: UnitSystem;
  idPrefix?: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;

  switch (scoreType) {
    case "time_seconds":
      return (
        <Field label="Time">
          <div className="flex items-end gap-2">
            <NumberBox
              id={id("minutes")}
              label="Min"
              value={draft.minutes}
              onValueChange={(minutes) => onChange({ minutes })}
              max={999}
              placeholder="0"
            />
            <span className="font-display pb-3 text-2xl font-bold text-muted-foreground">
              :
            </span>
            <NumberBox
              id={id("seconds")}
              label="Sec"
              value={draft.seconds}
              onValueChange={(seconds) => onChange({ seconds })}
              max={59}
              placeholder="00"
            />
          </div>
          <Hint>
            Minutes can go past 60 — a 72:14 Murph is fine, it displays as
            1:12:14.
          </Hint>
        </Field>
      );

    case "rounds_reps":
      return (
        <Field label="Score">
          <div className="flex items-end gap-2">
            <NumberBox
              id={id("rounds")}
              label="Rounds"
              value={draft.rounds}
              onValueChange={(rounds) => onChange({ rounds })}
              max={999}
              placeholder="0"
            />
            <span className="font-display pb-3 text-2xl font-bold text-muted-foreground">
              +
            </span>
            <NumberBox
              id={id("partial-reps")}
              label="Extra reps"
              value={draft.partialReps}
              onValueChange={(partialReps) => onChange({ partialReps })}
              max={999}
              placeholder="0"
            />
          </div>
        </Field>
      );

    case "reps":
      return (
        <Field label="Total reps">
          <NumberBox
            id={id("total-reps")}
            label="Reps"
            value={draft.totalReps}
            onValueChange={(totalReps) => onChange({ totalReps })}
            max={99999}
            placeholder="0"
          />
        </Field>
      );

    case "weight":
      return (
        <Field label="Load">
          <div className="flex items-end gap-2">
            <NumberBox
              id={id("weight")}
              label="Weight"
              value={draft.weight}
              onValueChange={(weight) => onChange({ weight })}
              // Fractional plates and lbs conversions both need decimals.
              decimal
              placeholder="0"
            />
            <NumberBox
              id={id("weight-reps")}
              label="Reps"
              value={draft.weightReps}
              onValueChange={(weightReps) => onChange({ weightReps })}
              max={999}
              placeholder="1"
            />
          </div>

          <ToggleGroup
            type="single"
            value={draft.weightUnit}
            onValueChange={(value) => {
              if (value) onChange({ weightUnit: value as UnitSystem });
            }}
            className="mt-2"
          >
            <ToggleGroupItem value="metric">kg</ToggleGroupItem>
            <ToggleGroupItem value="imperial">lbs</ToggleGroupItem>
          </ToggleGroup>

          {draft.weightUnit !== unitSystem && (
            <Hint>
              Entered in {draft.weightUnit === "metric" ? "kg" : "lbs"}, shown
              elsewhere in {unitSystem === "metric" ? "kg" : "lbs"}.
            </Hint>
          )}
        </Field>
      );

    case "pass_fail":
      return (
        <Field label="Result">
          <ToggleGroup
            type="single"
            value={draft.completed ? "done" : "dnf"}
            onValueChange={(value) => {
              if (value) onChange({ completed: value === "done" });
            }}
          >
            <ToggleGroupItem value="done">
              <CheckCircle2Icon className="size-4" />
              Completed
            </ToggleGroupItem>
            <ToggleGroupItem value="dnf">
              <XCircleIcon className="size-4" />
              DNF
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      );
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground/70 text-xs leading-relaxed">{children}</p>
  );
}

function NumberBox({
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
