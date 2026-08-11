"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Toast host.
 *
 * Positioned top-center: the bottom of the screen belongs to the nav bar and the
 * FAB, and a toast there would cover the button the user just pressed.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      theme="dark"
      richColors
      closeButton
      offset={12}
      toastOptions={{
        classNames: {
          toast:
            "!bg-card !border-border !text-foreground !rounded-xl !shadow-2xl",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-secondary !text-secondary-foreground",
        },
      }}
    />
  );
}
