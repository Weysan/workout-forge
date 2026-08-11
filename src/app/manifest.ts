import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * `display: "standalone"` is what removes the browser chrome once installed;
 * without it the PWA is just a bookmark.
 */

// Next treats a manifest as a route handler, and `output: "export"` refuses to
// build one whose caching behaviour is unstated. The contents are constant, so
// this is written to a file at build time like any other static asset.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FORGE — Hybrid Training Log",
    short_name: "FORGE",
    description:
      "Log WODs, track personal records and benchmark your hybrid fitness across CrossFit, Hyrox, strength and running.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1120",
    theme_color: "#0b1120",
    categories: ["health", "fitness", "sports", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // A maskable icon lets Android crop to its own shape without clipping the
      // logo; without one the launcher draws a white box behind it.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Log a workout",
        short_name: "Log",
        url: "/workout/new",
      },
      {
        name: "Personal records",
        short_name: "PRs",
        url: "/performance",
      },
    ],
  };
}
