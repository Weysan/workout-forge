"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import { AuthProvider } from "@/lib/auth-context";
import { setWriteRejectionHandler } from "@/lib/offline";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";

export function Providers({ children }: { children: ReactNode }) {
  // Created in state, not at module scope: a module-level client would be shared
  // between requests on the server and leak one user's cache into another's.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Firestore's own listeners and persistent cache already keep data
            // fresh, so aggressive refetching only costs reads.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  /**
   * A write that was accepted locally and later refused by the server.
   *
   * Rare — it means the queued change violated the security rules — but the user
   * has already been told it was saved, so staying silent would leave them with a
   * wrong picture of their own data. Refetching everything puts the UI back in
   * step with what the server actually holds.
   */
  useEffect(() => {
    setWriteRejectionHandler(() => {
      toast.error("A saved change could not be uploaded", {
        description: "Your data has been refreshed to match the server.",
        duration: 8_000,
      });
      queryClient.invalidateQueries();
    });

    return () => setWriteRejectionHandler(null);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster />
        <ServiceWorkerRegistrar />
      </AuthProvider>
    </QueryClientProvider>
  );
}
