"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

/**
 * How far back the year dropdown reaches.
 *
 * Long enough to file a lift set in another decade, short enough that the list
 * is still a list. Callers with a different horizon pass their own `startMonth`.
 */
const YEARS_BACK = 30;

/**
 * Month calendar for jumping to an arbitrary date.
 *
 * The caption is a month + year dropdown rather than a label, because paging a
 * month at a time is the wrong tool for the job it is most often given here:
 * filing a result from years ago. Twelve taps to reach last year is not
 * navigation, it is an obstacle.
 *
 * Weeks start on Monday because CrossFit and Hyrox training blocks are written
 * Monday-first, and the date strip on the home screen matches.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  startMonth,
  endMonth,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  // Fixed for the lifetime of the popover: recomputing "now" on every render
  // would hand DayPicker a new bound each time for no gain.
  const [defaultStartMonth, defaultEndMonth] = React.useMemo(() => {
    const today = new Date();
    return [new Date(today.getFullYear() - YEARS_BACK, 0, 1), today];
  }, []);

  const hasDropdowns = captionLayout !== "label";

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      captionLayout={captionLayout}
      startMonth={startMonth ?? defaultStartMonth}
      // Nothing in the app is logged forward, so navigation stops at this month
      // and the dropdowns grey out the rest of the current year.
      endMonth={endMonth ?? defaultEndMonth}
      className={cn("p-1", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "flex flex-col gap-3",
        // Padded clear of the arrows, which are positioned over this row.
        month_caption: cn(
          "flex h-9 items-center justify-center",
          hasDropdowns && "px-9",
        ),
        caption_label: hasDropdowns
          ? "flex items-center gap-1 rounded-lg border border-border/70 bg-input/40 px-2.5 py-1.5 font-display text-sm font-bold tracking-wide uppercase"
          : "font-display text-sm font-bold tracking-wide uppercase",
        dropdowns: "flex items-center gap-1.5",
        dropdown_root: "relative",
        // The real <select> sits invisibly over its label, so a phone opens its
        // own year wheel instead of a scroll list crammed into the popover.
        // `text-base` keeps iOS from zooming the page when it takes focus.
        dropdown:
          "absolute inset-0 size-full cursor-pointer text-base opacity-0",
        nav: "flex items-center justify-between absolute inset-x-1 top-1",
        button_previous:
          "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-40 z-10",
        button_next:
          "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-40 z-10",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-muted-foreground w-10 text-[11px] font-bold tracking-widest uppercase",
        week: "mt-1 flex w-full",
        day: "size-10 p-0 text-center",
        day_button: cn(
          "size-10 rounded-lg text-sm font-medium tabular transition-colors outline-none",
          "hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring",
        ),
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:font-bold [&>button]:hover:bg-primary",
        today: "[&>button]:text-primary [&>button]:font-bold",
        outside: "[&>button]:text-muted-foreground/40",
        disabled: "[&>button]:opacity-40 [&>button]:pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        // Sized here rather than by the class DayPicker passes down, which has
        // no styles behind it and would leave the icons at their 24px default.
        Chevron: ({ orientation }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon className="size-4" />;
          }
          if (orientation === "right") {
            return <ChevronRightIcon className="size-4" />;
          }
          // "down" — the caret on a caption dropdown.
          return (
            <ChevronDownIcon className="text-muted-foreground size-3.5 shrink-0" />
          );
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
