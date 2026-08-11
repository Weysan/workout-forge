import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Static export.
   *
   * Firebase Hosting is a static CDN, so `next build` emits a plain directory of
   * HTML/JS/CSS into `out/` instead of a Node server. That suits this app: every
   * page is client-rendered and talks to Firebase Auth and Firestore directly
   * from the browser, so there was never any server-side work to do.
   *
   * What this rules out, should you need it later:
   *   · dynamic route segments without generateStaticParams — see
   *     src/app/workout/edit, which takes ?id= for exactly this reason
   *   · route handlers, server actions, middleware, ISR
   *   · next/image with the default optimising loader
   */
  output: "export",

  // No image optimisation server exists in an export, so images are served as
  // authored. There are none today; this keeps next/image from hard-failing the
  // build if one is added.
  images: { unoptimized: true },

  // `cleanUrls` in firebase.json maps /login → login.html, so the export keeps
  // flat filenames rather than directory-per-route.
  trailingSlash: false,

  // NOTE: response headers are deliberately NOT configured here. `headers()` is
  // silently ignored by `output: "export"` — there is no server to apply it.
  // Cache-Control for the service worker and build assets lives in the `hosting`
  // block of firebase.json, which is what actually serves them.
};

export default nextConfig;
