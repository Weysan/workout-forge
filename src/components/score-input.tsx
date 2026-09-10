"use client";

import { CheckCircle2Icon, XCircleIcon } from "lucide-react";

import type { ScoreDraft } from "@/lib/score-draft";
import type { ScoreType, UnitSystem } from "@/lib/types";
import { NumberBox } from "@/components/number-box";
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
          {/* Most "for time" workouts carry a cap, and reaching it unfinished is
              a reps score rather than a slow time. The two are alternatives, so
              this picks between them rather than offering both at once. */}
          <ToggleGroup
            type="single"
            value={draft.timeCapped ? "capped" : "finished"}
            onValueChange={(value) => {
              if (!value) return;
              onChange({ timeCapped: value === "capped" });
            }}
            className="w-full"
          >
            <ToggleGroupItem value="finished" className="flex-1">
              Finished
            </ToggleGroupItem>
            <ToggleGroupItem value="capped" className="flex-1">
              Hit the cap
            </ToggleGroupItem>
          </ToggleGroup>

          {draft.timeCapped ? (
            <>
              <NumberBox
                id={id("cappedReps")}
                label="Reps completed"
                value={draft.cappedReps}
                onValueChange={(cappedReps) => onChange({ cappedReps })}
                max={9999}
                placeholder="0"
              />
              <Hint>
                Scored on reps, and ranked behind every finishing time — which is
                how the Open counts it.
              </Hint>
            </>
          ) : (
            <>
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
            </>
          )}
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

    case "distance_metres":
      return (
        <Field label="Distance">
          <div className="flex items-end gap-2">
            <NumberBox
              id={id("distance")}
              label={draft.distanceUnit === "metric" ? "km" : "mi"}
              value={draft.distance}
              onValueChange={(distance) => onChange({ distance })}
              // 5.01 km and 5.1 km are different runs.
              decimal
              placeholder="0.00"
            />
          </div>

          <ToggleGroup
            type="single"
            value={draft.distanceUnit}
            onValueChange={(value) => {
              if (value) onChange({ distanceUnit: value as UnitSystem });
            }}
            className="mt-2"
          >
            <ToggleGroupItem value="metric">km</ToggleGroupItem>
            <ToggleGroupItem value="imperial">mi</ToggleGroupItem>
          </ToggleGroup>

          {draft.distanceUnit !== unitSystem && (
            <Hint>
              Entered in {draft.distanceUnit === "metric" ? "km" : "miles"},
              shown elsewhere in {unitSystem === "metric" ? "km" : "miles"}.
            </Hint>
          )}

          {/* The time is a second field rather than a second score: the
              distance is what ranks, and a run logged without a stopwatch is
              still a run. Pace is worked out from the two and never typed. */}
          <div className="mt-4 flex items-end gap-2">
            <NumberBox
              id={id("distance-minutes")}
              label="Min"
              value={draft.distanceMinutes}
              onValueChange={(distanceMinutes) => onChange({ distanceMinutes })}
              max={999}
              placeholder="0"
            />
            <span className="font-display pb-3 text-2xl font-bold text-muted-foreground">
              :
            </span>
            <NumberBox
              id={id("distance-seconds")}
              label="Sec"
              value={draft.distanceSeconds}
              onValueChange={(distanceSeconds) => onChange({ distanceSeconds })}
              max={59}
              placeholder="00"
            />
          </div>
          <Hint>
            Time is optional — add it and the card shows your pace.
          </Hint>
        </Field>
      );

    case "pass_fail":
      return (
        <Field label="Result">
          <ToggleGroup
            type="single"
            // Neither option is preselected: an unanswered result is what marks
            // the session as still unscored, so defaulting to "Completed" would
            // quietly score a workout the user only meant to write down.
            value={draft.completed === null ? "" : draft.completed ? "done" : "dnf"}
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

