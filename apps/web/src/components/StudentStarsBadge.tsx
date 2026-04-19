import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";

/**
 * Small read-only behavior-stars chip. Shows the student's current stars
 * (out of 10) and reward count. Polls every 20s. Fixed top-right so it
 * stays visible across the dashboard and assignment doer.
 */
export default function StudentStarsBadge() {
  const { user } = useAuth();
  const [stars, setStars] = useState<number>(0);
  const [rewards, setRewards] = useState<number>(0);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (user?.role !== "student") return;
    let cancelled = false;
    const load = () => {
      api.getMyStars()
        .then(d => { if (!cancelled) { setStars(d.stars ?? 0); setRewards(d.rewards ?? 0); setOk(true); } })
        .catch(() => { if (!cancelled) setOk(false); });
    };
    load();
    const iv = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [user?.role]);

  if (user?.role !== "student" || !ok) return null;

  const filled = Math.max(0, Math.min(5, stars));

  return (
    <div
      className="fixed top-3 right-3 z-40 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg pointer-events-none select-none"
      style={{
        background: "linear-gradient(135deg, rgba(245,158,11,0.9), rgba(251,191,36,0.85))",
        color: "#1f1407",
        fontWeight: 800,
        fontSize: 12,
        backdropFilter: "blur(6px)",
      }}
      title={`${filled}/5 stars · ${rewards} reward${rewards === 1 ? "" : "s"}`}
    >
      <span style={{ fontSize: 14 }}>⭐</span>
      <span className="font-mono">{filled}/5</span>
      {rewards > 0 && <span className="opacity-80">· 🏆{rewards}</span>}
    </div>
  );
}
