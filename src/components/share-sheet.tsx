"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, LinkIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  SHARE_FORMATS,
  SHARE_FORMAT_ORDER,
  shareCaption,
  shareFilename,
  type ShareCard,
  type ShareFormat,
} from "@/lib/share-card";
import { renderShareCard } from "@/lib/share-image";
import {
  APP_URL,
  canShareFiles,
  copyLink,
  downloadFile,
  shareOrDownload,
} from "@/lib/share";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Turns a result into an image and hands it to the share sheet.
 *
 * The image is rendered **as soon as the panel opens**, before anything is
 * tapped. That is not an optimisation — it is the only arrangement that works.
 * Safari honours `navigator.share` only while the originating user gesture is
 * still live, and awaiting a canvas encode inside the click handler spends it,
 * so the share sheet never appears. Rendering ahead of time means the Share
 * button has a finished file to pass straight through. The preview is that same
 * file, so showing it costs nothing extra.
 *
 * See lib/share.ts for why there is no Instagram Stories deep link.
 */
export function ShareSheet({
  card,
  open,
  onOpenChange,
}: {
  card: ShareCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // The object URL outlives the render that created it, so it is tracked in a
  // ref and revoked explicitly. Leaking one per format toggle would pin a
  // multi-megabyte bitmap for the life of the tab.
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !card) return;

    let cancelled = false;
    setFile(null);
    setFailed(false);

    renderShareCard(card, format)
      .then((blob) => {
        if (cancelled) return;
        const rendered = new File([blob], shareFilename(card), {
          type: "image/png",
        });
        setFile(rendered);

        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(rendered);
        setPreviewUrl(objectUrl.current);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[forge] share card could not be rendered", error);
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open, card, format]);

  // Drop the bitmap once the panel is closed — it is regenerated on reopen, and
  // holding it serves nothing.
  useEffect(() => {
    if (open) return;
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    setPreviewUrl(null);
    setFile(null);
  }, [open]);

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  if (!card) return null;

  const caption = shareCaption(card, APP_URL);
  const shareable = file !== null && canShareFiles(file);

  async function handleShare() {
    if (!file || !card) return;

    const outcome = await shareOrDownload({
      file,
      title: `${card.title} · FORGE`,
      text: caption,
      url: APP_URL,
    });

    if (outcome === "downloaded") {
      toast.success("Image saved", {
        description: "Open Instagram and add it to a story or post.",
      });
    }
    // "shared" needs no toast — the OS sheet already confirmed it. "dismissed"
    // is somebody changing their mind, which is not news.
  }

  function handleSave() {
    if (!file) return;
    downloadFile(file);
    toast.success("Image saved");
  }

  async function handleCopyLink() {
    const copied = await copyLink(APP_URL);
    if (copied) toast.success("Link copied");
    else toast.error("Could not copy the link");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0">
        <SheetHeader>
          <SheetTitle>Share</SheetTitle>
          <SheetDescription>
            Pick a size, then share it straight to Instagram.
          </SheetDescription>
        </SheetHeader>

        <div className="overflow-y-auto px-5 pb-8">
          <ToggleGroup
            type="single"
            value={format}
            // Radix clears the value when the active item is tapped again; a
            // card has to be one shape or the other, so an empty value is
            // ignored rather than allowed to blank the preview.
            onValueChange={(next) => {
              if (next) setFormat(next as ShareFormat);
            }}
            aria-label="Image size"
          >
            {SHARE_FORMAT_ORDER.map((key) => (
              <ToggleGroupItem key={key} value={key}>
                {SHARE_FORMATS[key].label}
                <span className="opacity-60">
                  {key === "story" ? "9:16" : "4:5"}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* The preview box keeps the format's aspect ratio while the render is
              in flight, so the panel does not jump when the image lands. */}
          <div
            className="border-border/70 bg-elevated/40 mx-auto mt-4 w-full max-w-[280px] overflow-hidden rounded-xl border"
            style={{ aspectRatio: SHARE_FORMATS[format].aspectRatio }}
          >
            {failed ? (
              <div className="text-muted-foreground grid h-full place-items-center px-6 text-center text-sm">
                The image could not be created on this device.
              </div>
            ) : previewUrl && file ? (
              // A blob URL, and `output: "export"` has no image optimiser to
              // route it through — next/image would only add a wrapper.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={
                  card.kind === "day"
                    ? `${card.title} — ${card.badges[0] ?? "the day's sessions"}, as a shareable image`
                    : `${card.title} — ${card.value}, as a shareable image`
                }
                className="h-full w-full object-cover"
              />
            ) : (
              <Skeleton className="h-full w-full rounded-none" />
            )}
          </div>

          <div className="mt-5 space-y-2">
            {shareable && (
              <Button
                className="w-full"
                size="lg"
                onClick={handleShare}
                disabled={!file}
              >
                <Share2Icon />
                Share
              </Button>
            )}

            <Button
              variant={shareable ? "secondary" : "default"}
              className="w-full"
              size={shareable ? "default" : "lg"}
              onClick={handleSave}
              disabled={!file}
            >
              <DownloadIcon />
              Save image
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              onClick={handleCopyLink}
            >
              <LinkIcon />
              Copy app link
            </Button>
          </div>

          <p className="text-muted-foreground/70 mt-4 text-center text-xs leading-relaxed">
            {shareable
              ? "Instagram opens with the image ready — add a link sticker if you want the app to be tappable."
              : "Sharing straight to another app needs a phone. Save the image and post it from there."}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
