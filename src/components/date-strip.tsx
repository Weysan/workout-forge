"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addWeeks,
  addYears,
  endOfWeek,
  format,
  isSameWeek,
  isToday,
  startOfWeek,
} from "date-fns";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn, toDateKey } from "@/lib/utils";
import { useDayMarksInRange } from "@/lib/hooks/use-day-marks";
import { useWorkoutDatesInRange } from "@/lib/hooks/use-workouts";
import type { DayStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Week-at-a-glance date selector.
 *
 * A full month grid is the wrong default for daily logging: the athlete almost
 * always wants today or yesterday. The week strip puts those one tap away and
 * hides the month picker behind an icon for the rare jump.
 *
 * Days ahead are selectable: writing a session down before doing it is what the
 * unscored-workout model exists for. The month picker still stops a year out, so
 * a mis-swipe cannot land the user in 2031 with no idea how they got there.
 */
export function DateStrip({
  selected,
  onSelect,
}: {
  selected: Date;
  onSelect: (date: Date) => void;
}) {
  // The visible week is tracked separately so paging through weeks does not
  // change which day is selected.
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(selected, { weekStartsOn: 1 }),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // Follow the selection when it moves to another week — which happens when the
  // parent changes it, e.g. arriving at /?date= for a backdated result. Guarded on
  // "not already this week" so paging through weeks is not yanked back.
  useEffect(() => {
    setWeekStart((current) =>
      isSameWeek(current, selected, { weekStartsOn: 1 })
        ? current
        : startOfWeek(selected, { weekStartsOn: 1 }),
    );
  }, [selected]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  // Activity dots come from one range query per visible week.
  const weekStartKey = toDateKey(weekStart);
  const weekEndKey = toDateKey(endOfWeek(weekStart, { weekStartsOn: 1 }));

  const { data: activeDates } = useWorkoutDatesInRange(weekStartKey, weekEndKey);
  const { data: dayMarks } = useDayMarksInRange(weekStartKey, weekEndKey);

  const activeSet = useMemo(() => new Set(activeDates ?? []), [activeDates]);
  const markByDate = useMemo(
    () => new Map((dayMarks ?? []).map((mark) => [mark.date, mark.status])),
    [dayMarks],
  );

  function jumpTo(date: Date) {
    setWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
    onSelect(date);
  }

  return (
    <div className="space-y-2 pt-3">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous week"
          onClick={() => setWeekStart((current) => addWeeks(current, -1))}
        >
          <ChevronLeftIcon />
        </Button>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 font-display tracking-wide uppercase">
              <CalendarIcon className="size-4" />
              {format(weekStart, "MMMM yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-auto p-2">
            <Calendar
              mode="single"
              selected={selected}
              month={weekStart}
              onMonthChange={setWeekStart}
              onSelect={(date) => {
                if (!date) return;
                jumpTo(date);
                setPickerOpen(false);
              }}
              // Planning ahead is fine; jumping years ahead never is.
              disabled={{ after: addYears(new Date(), 1) }}
            />
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next week"
          onClick={() => setWeekStart((current) => addWeeks(current, 1))}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const key = toDateKey(day);
          const isSelected = key === toDateKey(selected);
          const dot = dotClass(
            activeSet.has(key),
            markByDate.get(key),
            isSelected,
          );

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(day)}
              aria-current={isSelected ? "date" : undefined}
              aria-label={format(day, "EEEE d MMMM")}
              className={cn(
                "group relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border transition-all",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "border-border/70 bg-card/60 hover:bg-elevated",
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-bold tracking-widest uppercase",
                  isSelected ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {format(day, "EEEEE")}
              </span>
              <span className="tabular text-lg leading-none font-bold">
                {format(day, "d")}
              </span>

              {/* Today gets a ring; accounted-for days get a dot. */}
              {isToday(day) && !isSelected && (
                <span className="ring-primary/60 pointer-events-none absolute inset-0 rounded-xl ring-2" />
              )}
              <span
                className={cn("size-1.5 rounded-full transition-colors", dot)}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Colour for a day's dot.
 *
 * The strip has to answer "which days did I account for?" at a glance, and the
 * three answers are not the same thing: trained, rested on purpose, or lost to
 * injury. A day with sessions reads as trained even if it also carries an injury
 * mark — the training is the more specific fact about the day.
 *
 * On the selected day everything sits on the primary fill, where a coloured dot
 * would be illegible, so it falls back to the contrasting foreground.
 */
function dotClass(
  hasWorkout: boolean,
  status: DayStatus | undefined,
  isSelected: boolean,
): string {
  if (!hasWorkout && !status) return "bg-transparent";
  if (isSelected) return "bg-primary-foreground";
  if (hasWorkout) return "bg-primary";
  return status === "injured" ? "bg-destructive" : "bg-muted-foreground";
}
