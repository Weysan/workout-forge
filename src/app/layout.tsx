import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "FORGE — Hybrid Training Log",
    template: "%s · FORGE",
  },
  description:
    "Log WODs, track personal records and benchmark your hybrid fitness across CrossFit, Hyrox, strength and running.",
  applicationName: "FORGE",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "FORGE",
    // "black-translucent" lets the app draw behind the status bar, which is what
    // makes an installed PWA feel native rather than framed.
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    // Stops iOS turning rep schemes like "21-15-9" into phone-number links.
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1,
  // Content must reach the screen edges under the notch and home indicator.
  viewportFit: "cover",
  // Zoom stays enabled: disabling it is an accessibility failure, and the 16px
  // input floor already prevents Safari's focus-zoom.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
