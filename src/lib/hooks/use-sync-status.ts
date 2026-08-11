"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  getPendingWriteCount,
  isOnline,
  subscribeToConnectivity,
  subscribeToPendingWrites,
} from "@/lib/offline";

/**
 * Connectivity plus how many writes are still waiting to reach the server.
 *
 * `useSyncExternalStore` rather than an effect-and-state pair: it reads the
 * current value during render, so the indicator cannot briefly show "online"
 * on a page loaded while offline.
 */
export function useSyncStatus() {
  const online = useSyncExternalStore(
    subscribeToConnectivity,
    isOnline,
    // Assumed online on the server: rendering an offline warning into static HTML
    // would show it to everyone for a frame before hydration corrects it.
    () => true,
  );

  const pendingWrites = useSyncExternalStore(
    subscribeToPendingWrites,
    getPendingWriteCount,
    () => 0,
  );

  // Brief confirmation after the queue drains, so a sync that completes in
  // 200ms is still visible to the user rather than flickering past.
  const [justSynced, setJustSynced] = useState(false);
  const [wasPending, setWasPending] = useState(false);

  useEffect(() => {
    if (pendingWrites > 0) {
      setWasPending(true);
      setJustSynced(false);
      return;
    }

    if (!wasPending) return;

    setWasPending(false);
    setJustSynced(true);
    const timer = setTimeout(() => setJustSynced(false), 2_500);
    return () => clearTimeout(timer);
  }, [pendingWrites, wasPending]);

  return {
    online,
    pendingWrites,
    syncing: online && pendingWrites > 0,
    justSynced,
  };
}
