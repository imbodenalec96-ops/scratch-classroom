// STAR home dashboard. Big numbers at the top, recent activity feed
// below, plus quick action tiles for the most common workflows.

import { useEffect, useMemo, useState } from "react";
import { StarStore, letterGradeColor, type StarTrackerEntry, type StarRefusalLog, type ActivePass } from "../../lib/star/storage.ts";

export default function StarHome({ onTab }: { onTab: (tab: "create" | "gradebook" | "reports" | "settings") => void }) {
  const [now, setNow] = useState(Date.now());
  // Tick pass timers and refresh stats every 5s — cheap, keeps the
  // dashboard feeling live without thrashing localStorage every second.
  useEffect(() => { const iv = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(iv); }, []);

  const data = useMemo(() => {
    const tracker = StarStore.getAsnTrack();
    const log = StarStore.getLog();
    const passes = StarStore.getActivePasses();
    const todayStr = new Date().toLocaleDateString();

    const completedToday = Object.values(tracker)
      .flatMap((t) => t.submissions || [])
      .filter((s) => new Date(s.loggedAt).toLocaleDateString() === todayStr);
    const refusalsToday = log.filter((r) => r.date === todayStr);

    const pointsToday = completedToday.reduce(
      (sum, s) => sum + (s.status === "completed" ? StarStore.getPointsPerCompletion() : 0),
      0,
    );

    // Recent activity feed — merge completions, refusals, active passes.
    type Item = { kind: "completion" | "refusal" | "pass"; ts: number; title: string; meta: string; color: string };
    const items: Item[] = [];
    for (const t of Object.values(tracker)) {
      for (const s of t.submissions || []) {
        items.push({
          kind: "completion", ts: new Date(s.loggedAt).getTime(),
          title: `${s.studentName} · ${t.name}`,
          meta: `${s.letterGrade} (${s.pct}%) · ${s.score}/${s.maxScore}`,
          color: letterGradeColor(s.letterGrade),
        });
      }
    }
    for (const r of log) {
      items.push({
        kind: "refusal", ts: new Date(`${r.date} ${r.time}`).getTime() || Date.now(),
        title: `${r.student} · ${r.type}`,
        meta: r.subject ? `${r.subject}${r.task ? ` — ${r.task}` : ""}` : (r.task || ""),
        color: "#ef4444",
      });
    }
    for (const p of passes) {
      const elapsed = Math.round((now - new Date(p.startedAt).getTime()) / 1000);
      items.push({
        kind: "pass", ts: new Date(p.startedAt).getTime(),
        title: `${p.studentName} · ${p.passKind} pass`,
        meta: `Out for ${fmtElapsed(elapsed)}${elapsed > 300 ? " — over 5 min!" : ""}`,
        color: elapsed > 300 ? "#ef4444" : "#fbbf24",
      });
    }
    items.sort((a, b) => b.ts - a.ts);

    return {
      completedTodayCount: completedToday.length,
      refusalsTodayCount: refusalsToday.length,
      activePassesCount: passes.length,
      pointsToday,
      items: items.slice(0, 12),
    };
  }, [now]);

  return (
    <div>
      {/* Stats */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12, marginBottom: 18,
      }}>
        <StatCard
          icon="✅" label="Completed Today"
          value={data.completedTodayCount} accent="#10b981"
          onClick={() => onTab("gradebook")}
        />
        <StatCard
          icon="🚨" label="Refusals Today"
          value={data.refusalsTodayCount} accent="#ef4444"
          onClick={() => onTab("reports")}
        />
        <StatCard
          icon="⏱" label="Out Of Room"
          value={data.activePassesCount} accent="#fbbf24"
          subtle="active passes"
        />
        <StatCard
          icon="⭐" label="Points Awarded"
          value={data.pointsToday} accent="#a855f7"
          subtle="today"
        />
      </div>

      {/* Quick actions */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10, marginBottom: 18,
      }}>
        <ActionTile icon="✨" title="New Assignment" subtitle="Generate + barcode" onClick={() => onTab("create")} />
        <ActionTile icon="🚨" title="Refusal Form" subtitle="Print a fresh form" onClick={() => onTab("create")} />
        <ActionTile icon="🚻" title="Pass Sheet" subtitle="Print pass barcodes" onClick={() => onTab("create")} />
        <ActionTile icon="📚" title="Gradebook" subtitle="Student grades" onClick={() => onTab("gradebook")} />
      </div>

      {/* Recent activity */}
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14, padding: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 10 }}>
          🕐 Recent Activity
        </div>
        {data.items.length === 0 ? (
          <div style={{ padding: 20, opacity: 0.6, textAlign: "center", fontSize: 13 }}>
            Nothing recent — scan a barcode to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.items.map((it, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(255,255,255,0.03)",
                borderLeft: `3px solid ${it.color}`,
              }}>
                <span style={{ fontSize: 18 }}>
                  {it.kind === "completion" ? "✅" : it.kind === "refusal" ? "🚨" : "⏱"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.title}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{it.meta}</div>
                </div>
                <span style={{ fontSize: 11, opacity: 0.55, whiteSpace: "nowrap", color: it.color, fontWeight: 700 }}>
                  {fmtRelative(it.ts, now)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent, subtle, onClick }: { icon: string; label: string; value: number | string; accent: string; subtle?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} style={{
      padding: 16, borderRadius: 14,
      background: `linear-gradient(135deg, ${accent}22, ${accent}05)`,
      border: `1px solid ${accent}55`,
      color: "white", textAlign: "left", cursor: onClick ? "pointer" : "default",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.7 }}>{label}</span>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 38, fontWeight: 900, color: accent, lineHeight: 1, marginTop: 4 }}>{value}</div>
      {subtle && <div style={{ fontSize: 11, opacity: 0.6 }}>{subtle}</div>}
    </button>
  );
}

function ActionTile({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: 14, borderRadius: 12,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      color: "white", textAlign: "left", cursor: "pointer",
      display: "flex", alignItems: "center", gap: 12,
      transition: "transform 0.15s ease, background 0.15s ease",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.10)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
    >
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>{subtitle}</div>
      </div>
    </button>
  );
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtRelative(ts: number, now: number): string {
  const diff = Math.max(0, Math.round((now - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
