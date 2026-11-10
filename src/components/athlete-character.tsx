import type { DayStatus } from "@/lib/types";

/**
 * The little athlete who stands in for an empty day that was marked rest or
 * injured.
 *
 * One figure, two poses: asleep on the mat for a rest day, and on the same mat
 * nursing a bandaged knee — ice pack on, pain pulsing, wincing — for an injury.
 * Same person, same headband, same kettlebell parked at their feet: the marker
 * changes their day, not who they are.
 *
 * The head is a profile lying on its back: crown to the left, the back of the
 * head on the towel, the face turned to the ceiling and the chin toward the
 * body.
 *
 * Drawn inline so it takes the season's colours: the tank top and headband are
 * `--primary`, so they are emerald most of the year, gold at Christmas and
 * pumpkin in October. Motion lives in globals.css (`.athlete-*`) and is CSS only
 * — a slow breath, rising Zs, a throbbing knee — and switches off under
 * prefers-reduced-motion.
 */
export function AthleteCharacter({
  status,
  label,
  className,
}: {
  status: DayStatus;
  /** Read by screen readers in place of the heading the figure replaces. */
  label: string;
  className?: string;
}) {
  const injured = status === "injured";

  return (
    <svg
      viewBox="0 0 240 120"
      role="img"
      aria-label={label}
      className={className}
    >
      {/* Mat */}
      <rect
        x="14"
        y="88"
        width="212"
        height="9"
        rx="4.5"
        style={{ fill: "color-mix(in oklab, var(--muted-foreground) 28%, transparent)" }}
      />

      {/* Kettlebell, parked at the feet */}
      <g style={{ fill: "color-mix(in oklab, var(--muted-foreground) 70%, var(--background))" }}>
        <path
          d="M207 70 a9 9 0 0 1 18 0"
          fill="none"
          strokeWidth="4"
          style={{ stroke: "color-mix(in oklab, var(--muted-foreground) 70%, var(--background))" }}
        />
        <circle cx="216" cy="78" r="11" />
      </g>

      {/* Rolled towel under the head */}
      <ellipse cx="46" cy="86" rx="20" ry="6" fill="#e8e3da" />

      {/* Legs, knees up */}
      <g strokeLinecap="round" fill="none" stroke="#e0ac80">
        <path d="M140 79 L166 56" strokeWidth="11" />
        <path d="M166 56 L184 85" strokeWidth="9.5" />
      </g>
      {/* Shoe */}
      <path d="M180 84 h18 a5 5 0 0 1 0 6 h-18 z" fill="#f8fafc" />
      <path d="M180 87 h20" strokeWidth="2" style={{ stroke: "var(--primary)" }} />

      {/* Shorts */}
      <rect x="114" y="68" width="32" height="19" rx="7" fill="#2b2f3a" />

      {/* Torso and arm breathe together */}
      <g className="athlete-breathe">
        <rect x="62" y="66" width="58" height="21" rx="10" style={{ fill: "var(--primary)" }} />
        {/* Arm resting across the stomach */}
        <path
          d="M74 71 Q90 82 106 74"
          fill="none"
          stroke="#e0ac80"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </g>

      {/* Neck */}
      <path d="M58 76 L66 74" stroke="#e0ac80" strokeWidth="8" strokeLinecap="round" />

      {/* Head, in profile, face to the ceiling. Hair first, then the face
          over it, leaving hair on the crown and the back of the head. */}
      <circle cx="46" cy="74" r="15" fill="#3b2a20" />
      <circle cx="50" cy="71" r="13.5" fill="#e0ac80" />
      {/* Nose, the highest point of the head */}
      <path d="M52 58.5 q3.5 -4.5 6.5 0.5" fill="#e0ac80" stroke="#c98d62" strokeWidth="1.6" strokeLinejoin="round" />
      {/* Ear */}
      <ellipse cx="47" cy="73" rx="3" ry="3.8" fill="#c98d62" />
      {/* Headband, round the crown */}
      <path
        d="M42 59.5 Q33 70 39 84"
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        style={{ stroke: "var(--primary)" }}
      />

      {injured ? (
        <>
          {/* Wince: an eye squeezed shut, a gritted mouth */}
          <path d="M45 61 l4 2.2 l-4 2.2" fill="none" stroke="#3b2a20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M57 64.5 l4 1.5" stroke="#8a4b32" strokeWidth="2" strokeLinecap="round" />
          {/* Sweat drop sliding off the forehead */}
          <path className="athlete-sweat" d="M40 50 q3 5 0 7 q-3 -2 0 -7 z" fill="#7dd3fc" />

          {/* The knee: bandage wrapped round it, ice pack on top */}
          <g transform="rotate(-40 160 62)">
            <rect x="148" y="55" width="22" height="13" rx="3" fill="#f8fafc" />
            <path d="M153 55 v13 M159 55 v13 M165 55 v13" stroke="#d6d3d1" strokeWidth="1.2" />
          </g>
          <rect x="158" y="40" width="20" height="12" rx="5" fill="#7dd3fc" stroke="#38bdf8" strokeWidth="1.5" transform="rotate(14 168 46)" />
          <path d="M163 44 h8" stroke="#e0f2fe" strokeWidth="1.6" strokeLinecap="round" transform="rotate(14 168 46)" />

          {/* Pain, pulsing out from the knee */}
          <g className="athlete-throb" fill="none" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round">
            <path d="M184 40 l6 -5" />
            <path d="M187 50 l8 -1" />
            <path d="M180 31 l2 -7" />
          </g>
        </>
      ) : (
        <>
          {/* Closed eye */}
          <path d="M46 62 q2.5 3 5 0" fill="none" stroke="#3b2a20" strokeWidth="2" strokeLinecap="round" />
          {/* Small open mouth, mid-snore */}
          <circle cx="59" cy="65" r="1.8" fill="#8a4b32" />
          {/* Zs drifting up and away */}
          <g style={{ fill: "var(--muted-foreground)" }} fontWeight="800" fontFamily="var(--font-inter-tight), sans-serif">
            <text className="athlete-z" x="64" y="52" fontSize="13">z</text>
            <text className="athlete-z athlete-z-2" x="64" y="52" fontSize="16">z</text>
            <text className="athlete-z athlete-z-3" x="64" y="52" fontSize="19">Z</text>
          </g>
        </>
      )}
    </svg>
  );
}
