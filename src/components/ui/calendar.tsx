"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

/**
 * Month calendar for jumping to an arbitrary date.
 *
 * Weeks start on Monday because CrossFit and Hyrox training blocks are written
 * Monday-first, and the date strip on the home screen matches.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      className={cn("p-1", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "flex flex-col gap-3",
        month_caption: "flex h-9 items-center justify-center",
        caption_label: "font-display text-sm font-bold tracking-wide uppercase",
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
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className="size-4" {...chevronProps} />
          ) : (
            <ChevronRightIcon className="size-4" {...chevronProps} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
