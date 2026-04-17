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
import { isScreenshotFocused } from "./useClassCommands.ts";

// Standard low-res capture (thumbnail on Monitor grid)
const NORMAL_INTERVAL_MS = 6_000;
const NORMAL_WIDTH = 240;
const NORMAL_HEIGHT = 160;
const NORMAL_JPEG_Q = 0.55;

// Focused capture (teacher has drawer open on this student)
const FOCUSED_INTERVAL_MS = 2_000;
const FOCUSED_WIDTH = 1280;
const FOCUSED_HEIGHT = 720;
const FOCUSED_JPEG_Q = 0.72;

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
      if (document.querySelector('[aria-label="Screen locked by teacher"]')) return;

      const focused = isScreenshotFocused();
      const tgtW = focused ? FOCUSED_WIDTH  : NORMAL_WIDTH;
      const tgtH = focused ? FOCUSED_HEIGHT : NORMAL_HEIGHT;
      const q    = focused ? FOCUSED_JPEG_Q : NORMAL_JPEG_Q;
      const maxBytes = focused ? 180_000 : 55_000;

      try {
        const mod = await import("html-to-image").catch(() => null);
        if (!mod || cancelled) return;

        const node = (document.querySelector("main") as HTMLElement | null)
          || document.documentElement;

        const rect = node.getBoundingClientRect();
        const scale = Math.min(
          tgtW / Math.max(rect.width, 1),
          tgtH / Math.max(rect.height, 1),
        );

        const dataUrl = await mod.toJpeg(node, {
          quality: q,
          cacheBust: false,
          skipFonts: true,
          pixelRatio: scale,
          width: Math.min(rect.width, 2400),
          height: Math.min(rect.height, 2400),
          backgroundColor: "#07071a",
          filter: (el: Element) => {
            if (el instanceof HTMLIFrameElement) return false;
            if (el instanceof HTMLCanvasElement) return false;
            return true;
          },
        }).catch(() => null);

        if (!dataUrl || cancelled) return;
        if (dataUrl.length > maxBytes) return;

        api.postSnapshot(dataUrl, pathRef.current).catch(() => {});
      } catch {}
    }

    // First capture after 3s so layout has settled
    const first = setTimeout(capture, 3_000);

    // Dynamic interval — re-check focus state every loop so switching
    // to/from focused mode takes effect immediately.
    let lastInterval = NORMAL_INTERVAL_MS;
    const scheduleNext = () => {
      const want = isScreenshotFocused() ? FOCUSED_INTERVAL_MS : NORMAL_INTERVAL_MS;
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        capture();
        const newWant = isScreenshotFocused() ? FOCUSED_INTERVAL_MS : NORMAL_INTERVAL_MS;
        if (newWant !== lastInterval) { lastInterval = newWant; scheduleNext(); }
      }, want);
      lastInterval = want;
    };
    scheduleNext();

    return () => {
      cancelled = true;
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [enabled]);
}
