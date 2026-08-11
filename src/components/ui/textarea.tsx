import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "bg-input/60 border-border flex min-h-28 w-full rounded-lg border px-3.5 py-3 text-base",
        "placeholder:text-muted-foreground/70 transition-colors outline-none",
        "focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/25",
        // Movement lists are read line by line; preserve the athlete's line breaks.
        "font-sans leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
