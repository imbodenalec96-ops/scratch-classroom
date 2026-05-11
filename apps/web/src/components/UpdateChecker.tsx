// Polls /version.json every 30s + on tab-focus + on visibility change.
// When the version on disk differs from the version baked into THIS
// bundle, the user gets a 10-second warning toast then the page
// auto-reloads.
//
// AUTO-RELOAD is on by default because the alternative is "user
// keeps seeing stale code and getting confused." If the user is
// actively typing/scanning, the in-flight work goes through before
// the reload (the toast is shown for 10 seconds first).
//
// Mount once near the App root.

import { useEffect, useRef, useState } from "react";

// Faster cadence — 30s. Cheap (one tiny JSON fetch).
const POLL_INTERVAL_MS = 30_000;
// Grace period before the very first poll, so cold-load races don't trigger a phantom "new version".
const STARTUP_GRACE_MS = 5_000;
// Once a mismatch is detected, how long to show the toast before auto-reloading.
const AUTO_RELOAD_AFTER_MS = 10_000;

export default function UpdateChecker() {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const reloadTimerRef = useRef<number | null>(null);
  const current = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

  useEffect(() => {
    let cancelled = false;
    let startedAt = Date.now();
    let timer: number | null = null;

    const check = async () => {
      try {
        const r = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        if (j?.version && j.version !== current && Date.now() - startedAt > STARTUP_GRACE_MS) {
          setLatest(j.version);
        }
      } catch {
        // Offline / dev / etc. — silent.
      }
    };

    check();
    timer = window.setInterval(check, POLL_INTERVAL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [current]);

  // Once a mismatch is detected (and not dismissed), start a 10-sec
  // countdown then force a full reload. This is intentional: the
  // alternative is "user keeps using stale code and reports bugs
  // that aren't bugs."
  useEffect(() => {
    if (!latest || dismissed) {
      if (reloadTimerRef.current) { window.clearInterval(reloadTimerRef.current); reloadTimerRef.current = null; }
      setSecondsLeft(null);
      return;
    }
    setSecondsLeft(Math.floor(AUTO_RELOAD_AFTER_MS / 1000));
    reloadTimerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s == null) return s;
        if (s <= 1) {
          if (reloadTimerRef.current) window.clearInterval(reloadTimerRef.current);
          // Wipe service workers + caches first so the reload definitely fetches fresh.
          (async () => {
            try {
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
              }
              if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
            } catch {}
            try { (window.location as any).reload(true); }
            catch { window.location.reload(); }
          })();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (reloadTimerRef.current) { window.clearInterval(reloadTimerRef.current); reloadTimerRef.current = null; }
    };
  }, [latest, dismissed]);

  if (!latest || dismissed) return null;

  const refresh = () => {
    (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {}
      try { (window.location as any).reload(true); }
      catch { window.location.reload(); }
    })();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: "max(env(safe-area-inset-right), 16px)",
        bottom: "max(env(safe-area-inset-bottom), 16px)",
        zIndex: 9999,
        maxWidth: 360,
        padding: "12px 14px",
        borderRadius: 14,
        background: "linear-gradient(135deg, rgba(168,85,247,0.95), rgba(236,72,153,0.95))",
        border: "1px solid rgba(255,255,255,0.20)",
        boxShadow: "0 16px 40px -8px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.15)",
        color: "white",
        fontFamily: "'Inter', system-ui, sans-serif",
        backdropFilter: "blur(8px)",
        animation: "starUpdateSlide .35s cubic-bezier(0.22,1,0.36,1) both",
      }}
    >
      <style>{`
        @keyframes starUpdateSlide {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>🆕</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.005em" }}>
            New version — auto-refresh{secondsLeft != null ? ` in ${secondsLeft}s` : "…"}
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginTop: 2 }}>
            You're on <code style={{ fontFamily: "Menlo, monospace" }}>{current}</code> → updating to <code style={{ fontFamily: "Menlo, monospace" }}>{latest}</code>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          onClick={refresh}
          style={{
            flex: 1,
            padding: "9px 14px", borderRadius: 10, border: "none",
            background: "white", color: "#6d28d9",
            fontWeight: 800, fontSize: 13, cursor: "pointer",
            touchAction: "manipulation",
          }}
        >🔄 Refresh now</button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            padding: "9px 12px", borderRadius: 10,
            background: "rgba(255,255,255,0.15)", color: "white",
            border: "1px solid rgba(255,255,255,0.30)",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            touchAction: "manipulation",
          }}
          aria-label="Dismiss"
        >Skip</button>
      </div>
    </div>
  );
}
