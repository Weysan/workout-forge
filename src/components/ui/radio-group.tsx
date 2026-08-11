"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "border-border text-primary focus-visible:ring-ring aspect-square size-5 shrink-0 rounded-full border transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-primary",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <CircleIcon className="fill-primary text-primary size-2.5" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

/**
 * Full-width tappable row wrapping a radio.
 *
 * The bare 20px control is a poor mobile target, so the whole card is the label
 * and therefore the whole card is tappable.
 */
function RadioCard({
  value,
  id,
  children,
  className,
}: {
  value: string;
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "border-border bg-input/40 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-base transition-colors",
        "hover:bg-elevated has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/10",
        className,
      )}
    >
      <RadioGroupItem value={value} id={id} />
      <span className="flex-1">{children}</span>
    </label>
  );
}

export { RadioGroup, RadioGroupItem, RadioCard };
