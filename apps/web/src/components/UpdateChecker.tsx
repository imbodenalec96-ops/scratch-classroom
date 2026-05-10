// Polls /version.json every 60s. When the version on disk differs
// from the version baked into THIS bundle, shows a small toast that
// nudges the user to refresh. Fixes the "I shipped but my iPad is
// still on the old build" problem without needing a service worker.
//
// Mount once near the App root.

import { useEffect, useState } from "react";

// Polling cadence — 60s is a reasonable balance between freshness and
// not hammering the server. Kicks once on mount + when the tab returns
// to focus (covers the "iPad locked overnight" case).
const POLL_INTERVAL_MS = 60_000;

// Don't pester until at least 5s after mount, so initial loads don't
// flash "new version" if the in-flight version.json races the bundle.
const STARTUP_GRACE_MS = 5_000;

export default function UpdateChecker() {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
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

    // First tick on mount.
    check();
    // Recurring tick.
    timer = window.setInterval(check, POLL_INTERVAL_MS);
    // Re-check when the tab regains focus.
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

  if (!latest || dismissed) return null;

  const refresh = () => {
    // Force a full reload (skip cache where possible). location.reload()
    // accepts a deprecated `true` arg in older browsers; modern ones
    // ignore it but still re-validate against the no-cache headers we
    // set on /index.html.
    try { (window.location as any).reload(true); }
    catch { window.location.reload(); }
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
            New version available
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginTop: 2 }}>
            You're on <code style={{ fontFamily: "Menlo, monospace" }}>{current}</code> · latest is <code style={{ fontFamily: "Menlo, monospace" }}>{latest}</code>
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
        >Later</button>
      </div>
    </div>
  );
}
