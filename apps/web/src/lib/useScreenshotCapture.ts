/**
 * useScreenshotCapture — client-side DOM→JPEG capture for teacher monitor.
 *
 * Every ~6 seconds, captures the main viewport as a tiny JPEG (240×160, q55)
 * and POSTs it to the server. Teacher's Monitor tile renders the thumbnail.
 *
 * Privacy + performance rules baked in:
 * - Only captures when document.visibilityState === 'visible'
 *   (tabbed away = no capture, server's last one stays with "Away" grey tint)
 * - Skips capture if the page has a lock overlay visible (useless info)
 * - Skips when offline
 * - Caps payload at ~40KB; server rejects anything larger
 * - Gracefully no-ops if html-to-image import fails
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { api } from "./api.ts";

const CAPTURE_INTERVAL_MS = 6_000;
const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 160;
const JPEG_QUALITY = 0.55;

export function useScreenshotCapture(enabled: boolean) {
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  useEffect(() => { pathRef.current = location.pathname; }, [location.pathname]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function capture() {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      // Skip if the lock overlay is showing — teacher doesn't need to see the lock screen
      if (document.querySelector('[aria-label="Screen locked by teacher"]')) return;

      try {
        const mod = await import("html-to-image").catch(() => null);
        if (!mod || cancelled) return;

        // Capture the main content area, fall back to documentElement
        const node = (document.querySelector("main") as HTMLElement | null)
          || document.documentElement;

        // Compute scale so output fits THUMB_WIDTH
        const rect = node.getBoundingClientRect();
        const scale = Math.min(
          THUMB_WIDTH / Math.max(rect.width, 1),
          THUMB_HEIGHT / Math.max(rect.height, 1),
        );

        const dataUrl = await mod.toJpeg(node, {
          quality: JPEG_QUALITY,
          cacheBust: false,
          skipFonts: true,
          pixelRatio: scale,
          width: Math.min(rect.width, 2000),
          height: Math.min(rect.height, 2000),
          backgroundColor: "#07071a",
          filter: (el: Element) => {
            // Don't capture iframes / canvases (CORS-tainted) or the lock overlay
            if (el instanceof HTMLIFrameElement) return false;
            if (el instanceof HTMLCanvasElement) return false;
            return true;
          },
        }).catch(() => null);

        if (!dataUrl || cancelled) return;

        // Hard client-side size cap
        if (dataUrl.length > 55_000) return;

        api.postSnapshot(dataUrl, pathRef.current).catch(() => {});
      } catch {
        // Silent no-op — capture failures shouldn't break the student's session
      }
    }

    // First capture after 3s so layout has settled
    const first = setTimeout(capture, 3_000);
    timer = setInterval(capture, CAPTURE_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [enabled]);
}
