import { cn } from "@/lib/utils";

/**
 * FORGE mark.
 *
 * Three ascending bars — a progression, and a nod to the loaded-barbell plates
 * on gym signage. Drawn inline as SVG so it stays crisp at any size, inherits
 * the current colour, and costs no extra request.
 */
export function ForgeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      <rect x="2" y="19" width="7" height="11" rx="1.5" fill="currentColor" opacity="0.45" />
      <rect x="12.5" y="12" width="7" height="18" rx="1.5" fill="currentColor" opacity="0.75" />
      <rect x="23" y="2" width="7" height="28" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function ForgeLogo({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <ForgeMark className="text-primary size-7" />
      <div className="leading-none">
        <div className="font-display text-xl font-extrabold tracking-[0.2em]">
          FORGE
        </div>
        {showTagline && (
          <div className="text-muted-foreground mt-1 text-[10px] font-semibold tracking-[0.25em] uppercase">
            Hybrid Training Log
          </div>
        )}
      </div>
    </div>
  );
}
