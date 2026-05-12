// Custom Behavior Tracker — define behaviors (class-wide or per-kid),
// tap a kid + chip to record an instance with timestamp + optional
// note. Bottom panel shows a per-kid frequency chart for IEP meetings.

import { useMemo, useState } from "react";
import {
  StarStore,
  type StarStudent, type BehaviorDef, type BehaviorEvent,
} from "../../lib/star/storage.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

const TONE_COLOR: Record<BehaviorDef["tone"], string> = {
  positive:  "#10b981",
  neutral:   "#3b82f6",
  challenge: "#f59e0b",
};

export default function BehaviorTracker() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [defs, setDefs] = useState<BehaviorDef[]>(() => StarStore.getBehaviorDefs());
  const [log, setLog] = useState<BehaviorEvent[]>(() => StarStore.getBehaviorLog());
  const [studentId, setStudentId] = useState<string>(students[0]?.id || "");
  const [showAdd, setShowAdd] = useState(false);
  const [newDef, setNewDef] = useState<{ label: string; emoji: string; tone: BehaviorDef["tone"]; scope: "class" | "student"; studentId: string }>({
    label: "", emoji: "🟦", tone: "neutral", scope: "class", studentId: "",
  });
  const [pendingNoteFor, setPendingNoteFor] = useState<{ defId: string; studentId: string } | null>(null);
  const [pendingNote, setPendingNote] = useState("");
  const [reportRange, setReportRange] = useState<"today" | "week" | "month">("today");
  // Backdate quick-logs (teacher logging an event from a few min ago)
  const [quickShiftMin, setQuickShiftMin] = useState<number>(0);
  const computeQuickTs = () => {
    const d = new Date();
    if (quickShiftMin) d.setMinutes(d.getMinutes() - quickShiftMin);
    return d.toISOString();
  };

  // Filter the chip palette by scope: show class-wide + this kid's own.
  const visibleDefs = useMemo(() => {
    return defs.filter((d) => !d.archived && (d.scope === "class" || d.studentId === studentId));
  }, [defs, studentId]);

  const recordInstance = (defId: string, opts?: { note?: string }) => {
    if (!studentId) return;
    const ts = computeQuickTs();
    const next = StarStore.recordBehavior(defId, studentId, opts?.note, ts);
    setLog(next);
    loggedBeep();
  };

  const onChipTap = (defId: string) => {
    recordInstance(defId);
    successBeep();
  };

  const onChipLongPress = (defId: string) => {
    setPendingNoteFor({ defId, studentId });
    setPendingNote("");
  };

  const submitNote = () => {
    if (!pendingNoteFor) return;
    recordInstance(pendingNoteFor.defId, { note: pendingNote.trim() || undefined });
    setPendingNoteFor(null);
    setPendingNote("");
  };

  const removeEvent = (id: string) => {
    StarStore.removeBehaviorEvent(id);
    setLog(StarStore.getBehaviorLog());
  };

  const addDef = () => {
    const label = newDef.label.trim();
    if (!label) return;
    const def: BehaviorDef = {
      id: `bd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label, emoji: newDef.emoji.trim() || "🟦",
      tone: newDef.tone,
      scope: newDef.scope,
      studentId: newDef.scope === "student" ? newDef.studentId : undefined,
      createdDate: new Date().toISOString(),
    };
    StarStore.addBehaviorDef(def);
    setDefs(StarStore.getBehaviorDefs());
    setNewDef({ label: "", emoji: "🟦", tone: "neutral", scope: "class", studentId: "" });
    setShowAdd(false);
  };

  const deleteDef = (id: string) => {
    if (!window.confirm("Delete this behavior? Existing entries are kept; only the chip is removed.")) return;
    StarStore.removeBehaviorDef(id);
    setDefs(StarStore.getBehaviorDefs());
  };

  // Per-kid + per-def counts for the report card.
  const report = useMemo(() => {
    const start = (() => {
      const d = new Date(Date.now() - 7 * 3600_000);
      if (reportRange === "today") return d.toISOString().slice(0, 10);
      if (reportRange === "week")  { d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10); }
      d.setUTCDate(d.getUTCDate() - 29); return d.toISOString().slice(0, 10);
    })();
    const inRange = log.filter((e) => e.date >= start && e.studentId === studentId);
    const byDef: Record<string, BehaviorEvent[]> = {};
    for (const e of inRange) (byDef[e.defId] ||= []).push(e);
    const rows = defs
      .filter((d) => !d.archived && (d.scope === "class" || d.studentId === studentId))
      .map((d) => ({ def: d, count: (byDef[d.id] || []).length, events: byDef[d.id] || [] }))
      .sort((a, b) => b.count - a.count);
    const total = inRange.length;
    return { start, rows, total };
  }, [log, defs, studentId, reportRange]);

  const max = Math.max(1, ...report.rows.map((r) => r.count));

  const printReport = () => {
    if (!studentId) return;
    const stu = students.find((s) => s.id === studentId);
    openReportWindow(stu, report.rows, report.start, reportRange);
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      {/* Student picker */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 12 }}>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={inp()}>
          <option value="">— Pick a student —</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.grade ? ` (${s.grade})` : ""}</option>)}
        </select>
        <button onClick={() => setShowAdd((v) => !v)} style={ghost()}>
          {showAdd ? "✕ Cancel" : "+ New behavior"}
        </button>
      </div>

      {/* Add-behavior composer */}
      {showAdd && (
        <div style={{
          padding: 12, marginBottom: 12, borderRadius: 12,
          background: "rgba(168,85,247,0.06)",
          border: "1px solid rgba(168,85,247,0.30)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8, marginBottom: 8 }}>
            <input value={newDef.emoji} onChange={(e) => setNewDef((d) => ({ ...d, emoji: e.target.value }))} maxLength={4} style={{ ...inp(), textAlign: "center", fontSize: 22 }} />
            <input value={newDef.label} onChange={(e) => setNewDef((d) => ({ ...d, label: e.target.value }))} placeholder="Behavior label (e.g. 'Used calming corner')" style={inp()} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <select value={newDef.tone} onChange={(e) => setNewDef((d) => ({ ...d, tone: e.target.value as BehaviorDef["tone"] }))} style={inp()}>
              <option value="positive">🟢 Positive</option>
              <option value="neutral">🔵 Neutral</option>
              <option value="challenge">🟡 Challenge</option>
            </select>
            <select value={newDef.scope} onChange={(e) => setNewDef((d) => ({ ...d, scope: e.target.value as "class" | "student", studentId: e.target.value === "student" ? studentId : "" }))} style={inp()}>
              <option value="class">🏫 Class-wide</option>
              <option value="student">👤 Just for this kid</option>
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button onClick={addDef} disabled={!newDef.label.trim()} style={primary(!newDef.label.trim())}>Add behavior</button>
          </div>
        </div>
      )}

      {/* Chip palette — tap to record */}
      {studentId ? (
        <>
          {/* Time picker — backdate quick-logs */}
          <div style={{
            display: "flex", gap: 6, alignItems: "center", marginBottom: 10,
            padding: "8px 12px", borderRadius: 10,
            background: "rgba(168,85,247,0.06)",
            border: "1px solid rgba(168,85,247,0.30)",
            flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)" }}>
              ⏰ When:
            </span>
            {[0, 5, 10, 15, 30].map((m) => (
              <button
                key={m}
                onClick={() => setQuickShiftMin(m)}
                style={{
                  padding: "4px 10px", borderRadius: 6,
                  background: quickShiftMin === m ? "rgba(168,85,247,0.30)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${quickShiftMin === m ? "rgba(168,85,247,0.55)" : "rgba(255,255,255,0.10)"}`,
                  color: quickShiftMin === m ? "#f9a8d4" : "rgba(245,241,232,0.65)",
                  fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "Menlo, monospace",
                }}
              >{m === 0 ? "now" : `−${m}m`}</button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#f9a8d4", fontFamily: "Menlo, monospace", fontWeight: 800 }}>
              {(() => {
                const d = new Date(); d.setMinutes(d.getMinutes() - quickShiftMin);
                return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              })()}
            </span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 8 }}>
            Tap a chip to record · long-press to add a note
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {visibleDefs.map((d) => {
              const c = TONE_COLOR[d.tone];
              const todayCount = log.filter((e) => e.defId === d.id && e.studentId === studentId && e.date === new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10)).length;
              let pressTimer: number | null = null;
              return (
                <button
                  key={d.id}
                  onClick={() => onChipTap(d.id)}
                  onMouseDown={() => { pressTimer = window.setTimeout(() => onChipLongPress(d.id), 600); }}
                  onMouseUp={() => { if (pressTimer) window.clearTimeout(pressTimer); }}
                  onMouseLeave={() => { if (pressTimer) window.clearTimeout(pressTimer); }}
                  onTouchStart={() => { pressTimer = window.setTimeout(() => onChipLongPress(d.id), 600); }}
                  onTouchEnd={() => { if (pressTimer) window.clearTimeout(pressTimer); }}
                  onContextMenu={(e) => { e.preventDefault(); onChipLongPress(d.id); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderRadius: 999,
                    background: `${c}1a`,
                    border: `1.5px solid ${c}77`,
                    color: "#fce7f3",
                    cursor: "pointer", fontSize: 14, fontWeight: 800,
                    touchAction: "manipulation",
                    position: "relative",
                  }}
                  title="Tap to log · long-press for a note"
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{d.emoji}</span>
                  <span>{d.label}</span>
                  {todayCount > 0 && (
                    <span style={{
                      marginLeft: 4, padding: "2px 8px", borderRadius: 999,
                      background: c, color: "white", fontSize: 11, fontWeight: 900,
                    }}>{todayCount}</span>
                  )}
                  {d.scope === "student" && (
                    <span title="Just for this kid" style={{ fontSize: 10, opacity: 0.7 }}>👤</span>
                  )}
                  <span
                    onClick={(e) => { e.stopPropagation(); deleteDef(d.id); }}
                    style={{
                      marginLeft: 4, opacity: 0.4, cursor: "pointer",
                      fontSize: 12, padding: "0 4px", borderRadius: 4,
                    }}
                    title="Delete this behavior"
                  >✕</span>
                </button>
              );
            })}
          </div>

          {/* Pending-note dialog */}
          {pendingNoteFor && (
            <div style={{
              padding: 12, marginBottom: 14, borderRadius: 12,
              background: "rgba(245,158,11,0.10)",
              border: "1.5px solid rgba(245,158,11,0.45)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#fde68a", marginBottom: 6 }}>
                Add a note (optional)
              </div>
              <textarea
                value={pendingNote}
                onChange={(e) => setPendingNote(e.target.value)}
                rows={2}
                placeholder="What happened? Triggers, what worked, etc."
                style={{ ...inp(), resize: "vertical", fontFamily: "inherit", marginBottom: 8 }}
                autoFocus
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                <button onClick={() => setPendingNoteFor(null)} style={ghost()}>Cancel</button>
                <button onClick={submitNote} style={primary(false)}>Save instance</button>
              </div>
            </div>
          )}

          {/* Frequency report */}
          <div style={{
            padding: 14, borderRadius: 14, marginBottom: 14,
            background: "rgba(168,85,247,0.06)",
            border: "1px solid rgba(168,85,247,0.20)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#f9a8d4" }}>
                Frequency · {report.total} total
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setReportRange("today")} style={chip(reportRange === "today")}>Today</button>
                <button onClick={() => setReportRange("week")}  style={chip(reportRange === "week")}>7 days</button>
                <button onClick={() => setReportRange("month")} style={chip(reportRange === "month")}>30 days</button>
                <button onClick={printReport} style={ghost()}>🖨 Print</button>
              </div>
            </div>
            {report.rows.length === 0 ? (
              <div style={{ padding: 12, textAlign: "center", color: "rgba(196,181,253,0.55)", fontSize: 12 }}>
                No behaviors yet for this kid.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {report.rows.map((r) => {
                  const c = TONE_COLOR[r.def.tone];
                  const pct = (r.count / max) * 100;
                  return (
                    <div key={r.def.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr 40px", gap: 8, alignItems: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fce7f3", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{r.def.emoji}</span>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.def.label}</span>
                      </div>
                      <div style={{ height: 14, background: "rgba(0,0,0,0.30)", borderRadius: 7, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 7 }} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 900, color: c, fontFamily: "Menlo, monospace" }}>
                        {r.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent timeline */}
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 8 }}>
            Recent (last 12)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {log.filter((e) => e.studentId === studentId).slice(-12).reverse().map((e) => {
              const def = defs.find((d) => d.id === e.defId);
              if (!def) return null;
              const c = TONE_COLOR[def.tone];
              const ts = new Date(e.ts);
              return (
                <div key={e.id} style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 8, alignItems: "center",
                  padding: "6px 10px", borderRadius: 8,
                  background: "rgba(0,0,0,0.20)", borderLeft: `3px solid ${c}`,
                }}>
                  <span style={{ fontSize: 16 }}>{def.emoji}</span>
                  <span style={{ fontSize: 13, color: "#fce7f3", fontWeight: 700 }}>
                    {def.label}{e.note ? ` — ${e.note}` : ""}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(196,181,253,0.55)", fontFamily: "Menlo, monospace" }}>
                    {ts.toLocaleString()}
                  </span>
                  <button onClick={() => removeEvent(e.id)} style={miniBtn()} title="Delete this entry">✕</button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ padding: 18, textAlign: "center", color: "rgba(196,181,253,0.55)", fontSize: 13 }}>
          Pick a student above to start tracking.
        </div>
      )}
    </div>
  );
}

/* ── Print report ───────────────────────────────────────────────── */

function openReportWindow(student: StarStudent | undefined, rows: { def: BehaviorDef; count: number; events: BehaviorEvent[] }[], start: string, range: "today" | "week" | "month") {
  if (!student) return;
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((a, r) => a + r.count, 0);
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const startLabel = new Date(start + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const bars = rows.length === 0
    ? `<p class="empty">No behaviors recorded in this range.</p>`
    : `<table>
        <thead><tr><th>Behavior</th><th>Count</th><th>Frequency</th></tr></thead>
        <tbody>${rows.map((r) => {
          const tone = r.def.tone;
          const c = tone === "positive" ? "#10b981" : tone === "challenge" ? "#f59e0b" : "#3b82f6";
          const pct = (r.count / max) * 100;
          return `<tr>
            <td><b>${escapeHtml(r.def.emoji)}</b> ${escapeHtml(r.def.label)} <span class="tone tone-${tone}">${tone}</span></td>
            <td class="count" style="color:${c}">${r.count}</td>
            <td class="bar"><div style="width:${pct}%;background:${c}"></div></td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;

  // Notes timeline (last 30 with notes)
  const noted = rows.flatMap((r) => r.events.filter((e) => e.note).map((e) => ({ def: r.def, e })))
    .sort((a, b) => b.e.ts.localeCompare(a.e.ts)).slice(0, 30);
  const notesHtml = noted.length === 0 ? "" : `
    <h2>📝 Noted entries</h2>
    <ul class="notes">
      ${noted.map(({ def, e }) => `<li>
        <span>${escapeHtml(def.emoji)} <b>${escapeHtml(def.label)}</b></span>
        <em>${new Date(e.ts).toLocaleString()}</em>
        <div>${escapeHtml(e.note || "")}</div>
      </li>`).join("")}
    </ul>
  `;

  w.document.write(`<!doctype html><html><head><title>Behavior — ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</title>
    <style>
      @media print { @page { size: letter; margin: 0.55in; } .no-print { display: none; } }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; padding: 0; margin: 0; line-height: 1.5; }
      .toolbar { padding: 12px 24px; background: #faf5ff; border-bottom: 1px solid #d8b4fe; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #4c1d95; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #6d28d9; background: #6d28d9; color: white; font-weight: 700; cursor: pointer; }
      .page { padding: 28px; max-width: 720px; margin: 0 auto; }
      h1 { margin: 4px 0 6px; font-size: 26px; letter-spacing: -0.02em; }
      h2 { font-size: 14px; margin: 22px 0 8px; letter-spacing: 0.04em; text-transform: uppercase; color: #4c1d95; border-bottom: 2px solid #ede9fe; padding-bottom: 4px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 18px; }
      .stat-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
      .stat { padding: 10px 12px; border-radius: 10px; background: #faf5ff; border: 1px solid #d8b4fe; text-align: center; }
      .stat .n { font-size: 24px; font-weight: 900; color: #6d28d9; }
      .stat .l { font-size: 10px; font-weight: 800; color: #6d28d9; opacity: 0.75; letter-spacing: 0.10em; text-transform: uppercase; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { text-align: left; padding: 6px 8px; background: #faf5ff; border-bottom: 2px solid #d8b4fe; font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #4c1d95; }
      td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
      .count { font-weight: 800; text-align: right; font-family: Menlo, monospace; }
      .bar { width: 40%; }
      .bar div { height: 14px; border-radius: 7px; }
      .tone { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
      .tone-positive  { background: #d1fae5; color: #065f46; }
      .tone-neutral   { background: #dbeafe; color: #1e3a8a; }
      .tone-challenge { background: #fef3c7; color: #92400e; }
      .empty { color: #6b7280; font-style: italic; }
      ul.notes { list-style: none; padding: 0; margin: 0; }
      ul.notes li { padding: 8px 12px; border-radius: 8px; background: #faf5ff; border: 1px solid #ede9fe; margin-bottom: 6px; font-size: 12px; }
      ul.notes em { font-style: italic; color: #6b7280; margin-left: 6px; }
    </style></head><body>
      <div class="toolbar no-print">
        <div>📊 Behavior report — ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</div>
        <button onclick="window.print()">🖨 Print</button>
      </div>
      <section class="page">
        <h1>📊 Behavior Frequency Report</h1>
        <div class="meta">
          <b>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</b>
          ${student.grade ? ` · Grade ${escapeHtml(student.grade)}` : ""}
          · Generated ${escapeHtml(todayLabel)}
        </div>
        <div class="stat-row">
          <div class="stat"><div class="n">${total}</div><div class="l">Total instances</div></div>
          <div class="stat"><div class="n">${rows.length}</div><div class="l">Behaviors observed</div></div>
        </div>
        <div class="meta">Range: <b>${range === "today" ? "Today" : range === "week" ? "Last 7 days" : "Last 30 days"}</b> (since ${escapeHtml(startLabel)})</div>
        <h2>📈 Frequency</h2>
        ${bars}
        ${notesHtml}
      </section>
      <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250))</script>
    </body></html>`);
  w.document.close();
}

/* ── UI helpers ─────────────────────────────────────────────────── */

function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 10px", borderRadius: 8,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 13, outline: "none",
    boxSizing: "border-box",
  };
}
function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: disabled ? "rgba(168,85,247,0.18)" : "linear-gradient(135deg, #6366f1, #a855f7, #ec4899)",
    color: "white", border: "none", fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
  };
}
function chip(active: boolean): React.CSSProperties {
  return {
    padding: "6px 10px", borderRadius: 999,
    background: active ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.04)",
    border: `1px solid ${active ? "rgba(168,85,247,0.55)" : "rgba(255,255,255,0.10)"}`,
    color: active ? "#f9a8d4" : "rgba(245,241,232,0.65)",
    fontSize: 11, fontWeight: 800, cursor: "pointer",
  };
}
function miniBtn(): React.CSSProperties {
  return {
    width: 22, height: 22, borderRadius: 6,
    background: "rgba(239,68,68,0.20)",
    border: "1px solid rgba(239,68,68,0.45)",
    color: "#fca5a5", fontSize: 10, fontWeight: 800, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}
function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
