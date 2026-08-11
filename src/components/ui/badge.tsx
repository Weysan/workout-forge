import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wider whitespace-nowrap uppercase [&_svg]:size-3 [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        primary: "border-primary/30 bg-primary/15 text-primary",
        accent: "border-accent/30 bg-accent/15 text-accent",
        // Records are the emotional payoff of the app, so they get the only
        // gradient in the system.
        pr: "border-transparent bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md shadow-primary/25",
        scaled: "border-warning/30 bg-warning/15 text-warning",
        destructive:
          "border-destructive/30 bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "span";

  return (
    <Component
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
