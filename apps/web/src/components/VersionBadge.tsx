// Tiny always-visible version pill in the bottom-left corner.
// Lets you verify at a glance which bundle the device is loading
// without opening DevTools. Shows the SHA + a colored dot:
//   • violet — current
//   • amber  — server has a newer version, auto-update pending
//
// Click to force an immediate cache-bust + reload.

import { useEffect, useState } from "react";

export default function VersionBadge() {
  const current = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  const [latest, setLatest] = useState<string>(current);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled && j?.version) setLatest(j.version);
      } catch {}
    };
    check();
    const iv = window.setInterval(check, 60_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, []);

  const stale = latest !== current;

  const forceReload = async () => {
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
    try { (window.location as any).reload(true); } catch { window.location.reload(); }
  };

  return (
    <button
      onClick={forceReload}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={stale
        ? `STALE bundle — running ${current}, server has ${latest}. Click to force reload.`
        : `Up to date · ${current}. Click to force reload anyway.`}
      style={{
        position: "fixed",
        left: "max(env(safe-area-inset-left), 8px)",
        bottom: "max(env(safe-area-inset-bottom), 8px)",
        zIndex: 9998,
        padding: "3px 8px",
        borderRadius: 999,
        background: stale
          ? "rgba(245, 158, 11, 0.18)"
          : (hovered ? "rgba(168,85,247,0.20)" : "rgba(168,85,247,0.08)"),
        border: stale
          ? "1px solid rgba(245, 158, 11, 0.55)"
          : "1px solid rgba(168,85,247,0.25)",
        color: stale ? "#fcd34d" : "#c4b5fd",
        fontFamily: "Menlo, monospace",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.04em",
        cursor: "pointer",
        display: "flex", alignItems: "center", gap: 5,
        backdropFilter: "blur(4px)",
        opacity: 0.6,
        transition: "opacity 150ms",
      }}
      onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
    >
      <span style={{
        display: "inline-block", width: 5, height: 5, borderRadius: "50%",
        background: stale ? "#f59e0b" : "#a855f7",
        boxShadow: stale ? "0 0 6px rgba(245,158,11,0.7)" : undefined,
      }} />
      v{current}
      {stale && <span style={{ opacity: 0.85 }}>· →{latest}</span>}
    </button>
  );
}
