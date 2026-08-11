import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 16px minimum font size on mobile: anything smaller makes iOS Safari
        // zoom the viewport when the field is focused.
        "bg-input/60 border-border flex min-h-12 w-full rounded-lg border px-3.5 py-2 text-base",
        "placeholder:text-muted-foreground/70 transition-colors outline-none",
        "focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:text-foreground file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/25",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
