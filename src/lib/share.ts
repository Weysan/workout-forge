/**
 * Getting an image out of the app and into Instagram.
 *
 * There is no web API that posts to Instagram Stories. The `instagram-stories://`
 * deep link everyone finds first is native-only: it requires an app bundle with
 * a registered Facebook App ID, which a browser — or an installed PWA, which is
 * what FORGE is — cannot present.
 *
 * What does work is the Web Share API's file support. Handing a PNG to
 * `navigator.share` opens the operating system's own share sheet, where
 * Instagram appears as a target like any other app; choosing it opens the Story
 * or post composer with the image already loaded. Two conditions apply:
 *
 *   · a secure context — HTTPS, or localhost, so `npm run dev` is fine
 *   · a user gesture, and a *prompt* one. See `shareOrDownload` below.
 *
 * Where files cannot be shared — desktop browsers, Firefox — the image is
 * downloaded instead and the athlete posts it from their phone. That is a
 * genuine fallback rather than a dead end, which is why this module always has
 * something to do.
 */

/**
 * Where the app lives, for the link painted on the image and sent with the share.
 *
 * Overridable so a custom domain does not require a code change. The fallback is
 * the Firebase Hosting site the project deploys to today, which means a build
 * with no environment configured still produces a working link rather than
 * "undefined".
 */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://workout-forge-7f364.web.app";

/** The same URL without its scheme — what actually gets drawn on the card. */
export const APP_URL_DISPLAY = APP_URL.replace(/^https?:\/\//, "").replace(
  /\/$/,
  "",
);

/**
 * Whether this browser can put *this file* on the share sheet.
 *
 * Checked with the real file rather than a probe: `canShare` inspects the type
 * and size, and answers for what you actually intend to send.
 */
export function canShareFiles(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;

  try {
    return navigator.canShare({ files: [file] });
  } catch {
    // Some browsers throw rather than return false on an unsupported payload.
    return false;
  }
}

export type ShareOutcome = "shared" | "dismissed" | "downloaded";

/**
 * Offers the image to the share sheet, falling back to a download.
 *
 * **This must be called directly from a click handler, with the file already
 * built.** Safari only honours `navigator.share` while the user gesture is still
 * live, and awaiting anything first — a canvas `toBlob`, a font load — spends
 * that budget and gets the call rejected with `NotAllowedError`. The caller's
 * job is therefore to have rendered the file in advance; see
 * components/share-sheet.tsx, which does exactly that when the panel opens.
 *
 * Dismissing the share sheet rejects with `AbortError`. That is somebody
 * changing their mind, not a failure, and reporting it as one would put an error
 * toast on screen every time — so it is reported back as its own outcome and the
 * caller stays quiet.
 */
export async function shareOrDownload(payload: {
  file: File;
  title: string;
  text: string;
  url: string;
}): Promise<ShareOutcome> {
  const { file, title, text, url } = payload;

  if (canShareFiles(file)) {
    try {
      // `url` is dropped by Instagram — it does not linkify caption text, which
      // is why the address is drawn onto the image itself as well. It survives
      // intact in WhatsApp, Messages and mail, where it is the useful part.
      await navigator.share({ files: [file], title, text, url });
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "dismissed";
      // Anything else — a share sheet that failed to open, a target that
      // rejected the file — still leaves the athlete with an image they wanted.
      // Falling through to the download is more useful than an error.
    }
  }

  downloadFile(file);
  return "downloaded";
}

/**
 * Only `AbortError` is somebody closing the sheet.
 *
 * `NotAllowedError` looks similar but means the opposite: the gesture was spent
 * before the call landed, so no sheet ever appeared and the athlete is still
 * waiting for something to happen. That one has to fall through to the download.
 */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Saves the file to disk via a synthetic anchor, revoking the object URL after. */
export function downloadFile(file: File): void {
  const href = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoking immediately can cancel the download in Safari, which reads the blob
  // asynchronously after the click. A turn of the event loop is enough.
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Puts the app link on the clipboard. Returns false when the API is unavailable. */
export async function copyLink(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
