// STAR home dashboard. Big numbers at the top, recent activity feed
// below, plus quick action tiles for the most common workflows.

import { useEffect, useMemo, useState } from "react";
import { StarStore, letterGradeColor, type StarTrackerEntry, type StarRefusalLog, type ActivePass } from "../../lib/star/storage.ts";
import { tokens as T } from "../../lib/star/theme.ts";
import { Stat, Card, SectionLabel } from "./ui.tsx";

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
      {/* Big page header — matches the other tabs' PageHeader pattern */}
      <div style={{ marginBottom: T.space["2xl"] }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8, marginBottom: T.space.sm,
          padding: "5px 12px", borderRadius: 999,
          background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(236,72,153,0.10))",
          border: "1px solid rgba(168,85,247,0.30)",
          fontSize: 10, fontWeight: 800,
          letterSpacing: "0.28em", textTransform: "uppercase",
          color: "#f9a8d4",
        }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: "#ec4899", boxShadow: "0 0 10px rgba(236,72,153,0.85)",
          }} />
          Today at a glance
        </div>
        <h2 style={{
          fontSize: T.font.size["4xl"], fontWeight: T.font.weight.black,
          margin: 0, letterSpacing: "-0.035em", lineHeight: 1.05,
          background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 40%, #f9a8d4 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>Welcome back.</h2>
        <p style={{ marginTop: T.space.sm, color: T.color.textMuted, fontSize: T.font.size.lg, lineHeight: 1.5, maxWidth: 720 }}>
          Snapshot of your classroom right now — completions, refusals, who's out, and points awarded.
        </p>
      </div>

      {/* Stats — bigger, with breathing room */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: T.space.lg, marginBottom: T.space["2xl"],
      }}>
        <Stat icon="✅" label="Completed Today" value={data.completedTodayCount} accent="success" onClick={() => onTab("gradebook")} />
        <Stat icon="🚨" label="Refusals Today" value={data.refusalsTodayCount} accent="danger" onClick={() => onTab("reports")} />
        <Stat icon="⏱" label="Out Of Room" value={data.activePassesCount} accent="warning" subtle="active passes" />
        <Stat icon="⭐" label="Points Awarded" value={data.pointsToday} accent="primary" subtle="today" />
      </div>

      {/* Quick actions — section header */}
      <div style={{ marginBottom: T.space.md }}>
        <SectionLabel icon={<span>⚡</span>}>Quick actions</SectionLabel>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: T.space.md, marginBottom: T.space["2xl"],
      }}>
        <ActionTile icon="✨" title="New Assignment" subtitle="Generate + barcode" onClick={() => onTab("create")} />
        <ActionTile icon="🚨" title="Refusal Form" subtitle="Print a fresh form" onClick={() => onTab("create")} />
        <ActionTile icon="🚻" title="Pass Sheet" subtitle="Print pass barcodes" onClick={() => onTab("create")} />
        <ActionTile icon="📚" title="Gradebook" subtitle="Student grades" onClick={() => onTab("gradebook")} />
        <ActionTile icon="🗣" title="AAC Quick Board" subtitle="Tablet speak-on-tap" onClick={() => { window.location.href = "/star/aac"; }} />
      </div>

      {/* Recent activity */}
      <Card padding="lg">
        <SectionLabel icon={<span>🕐</span>}>Recent Activity</SectionLabel>
        {data.items.length === 0 ? (
          <div style={{ padding: T.space.xl, color: T.color.textSubtle, textAlign: "center", fontSize: T.font.size.md }}>
            Nothing recent — scan a barcode to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: T.space.xs }}>
            {data.items.map((it, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: T.space.md,
                padding: `${T.space.sm}px ${T.space.md}px`,
                borderRadius: T.radius.md,
                background: T.color.surfaceSunken,
                borderLeft: `3px solid ${it.color}`,
                transition: `background ${T.motion.fast}`,
              }}>
                <span style={{ fontSize: 18 }}>
                  {it.kind === "completion" ? "✅" : it.kind === "refusal" ? "🚨" : "⏱"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: T.font.size.md, fontWeight: T.font.weight.semibold, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.title}
                  </div>
                  <div style={{ fontSize: T.font.size.sm, color: T.color.textMuted }}>{it.meta}</div>
                </div>
                <span style={{
                  fontSize: T.font.size.xs, whiteSpace: "nowrap", color: it.color,
                  fontWeight: T.font.weight.semibold, fontVariantNumeric: "tabular-nums",
                }}>
                  {fmtRelative(it.ts, now)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ActionTile({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: T.space.md, borderRadius: T.radius.lg,
      background: T.color.surface,
      border: `1px solid ${T.color.border}`,
      color: T.color.text, textAlign: "left", cursor: "pointer",
      display: "flex", alignItems: "center", gap: T.space.md,
      transition: `transform ${T.motion.fast}, background ${T.motion.standard}, border-color ${T.motion.standard}, box-shadow ${T.motion.standard}`,
      outline: "none",
      fontFamily: T.font.family,
    }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "rgba(99,102,241,0.10)";
        el.style.borderColor = T.color.accentBorder;
        el.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = T.color.surface;
        el.style.borderColor = T.color.border;
        el.style.transform = "translateY(0)";
      }}
      onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = T.focusRing; }}
      onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      <span style={{ fontSize: 28 }} aria-hidden>{icon}</span>
      <div>
        <div style={{ fontSize: T.font.size.md, fontWeight: T.font.weight.bold }}>{title}</div>
        <div style={{ fontSize: T.font.size.xs, color: T.color.textMuted }}>{subtitle}</div>
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
