/**
 * Brand marks for the SSO buttons.
 *
 * Inlined rather than pulled from an icon set: both Google and Apple require
 * their logo to be reproduced exactly, and lucide has no trademarked brand
 * glyphs. Google's is multi-colour, so it ignores `currentColor` by design.
 */

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.83Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.96H1.29v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.29a12 12 0 0 0 0 10.78l3.99-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l3.99 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.05 12.72c-.02-2.4 1.96-3.55 2.05-3.61-1.12-1.64-2.86-1.86-3.47-1.89-1.48-.15-2.88.86-3.63.86-.76 0-1.92-.84-3.15-.82-1.62.02-3.11.94-3.94 2.39-1.68 2.92-.43 7.24 1.21 9.61.8 1.16 1.76 2.46 3.02 2.41 1.21-.05 1.67-.78 3.13-.78 1.45 0 1.86.78 3.13.76 1.29-.02 2.11-1.18 2.9-2.35.91-1.34 1.29-2.65 1.31-2.72-.03-.01-2.52-.97-2.55-3.85M14.66 4.9c.66-.8 1.11-1.92.99-3.03-.98.04-2.16.65-2.85 1.45-.62.71-1.16 1.85-1.02 2.94 1.09.09 2.21-.55 2.88-1.36" />
    </svg>
  );
}
