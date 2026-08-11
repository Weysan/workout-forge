"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes FORGE installable and usable offline.
 *
 * Deliberately skipped in development: a cached shell fights with hot reload and
 * produces stale-page bugs that look like application errors.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // A failed registration costs offline support, nothing else. The app
        // must not surface an error for it.
      });
    };

    // Registering after load keeps the worker off the critical path for the
    // first paint.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
