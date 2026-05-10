// IEP goal tracker. Daily Met / Partial / Not yet log per student,
// plus a printable SEIF-style report for the IEP team.
//
// One canonical entry per (studentId, date). Tapping a status overwrites
// the day's prior entry. History strip shows the last 10 days at a glance.

import { useMemo, useState } from "react";
import {
  StarStore,
  type StarStudent, type IepStatus, type IepLogEntry, type IepGoal,
} from "../../lib/star/storage.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

const STATUS: Array<{ id: IepStatus; label: string; icon: string; color: string }> = [
  { id: "met",     label: "Met",       icon: "✓", color: "#10b981" },
  { id: "partial", label: "Partial",   icon: "◐", color: "#f59e0b" },
  { id: "not",     label: "Not yet",   icon: "✗", color: "#ef4444" },
];

function todayPacific(): string {
  const d = new Date(Date.now() - 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function lastNDays(n: number, anchor = todayPacific()): string[] {
  const [y, m, d] = anchor.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    out.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`);
  }
  return out;
}

function pretty(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function statusMeta(s: IepStatus | undefined) {
  if (!s) return { label: "—", icon: "·", color: "rgba(196,181,253,0.30)" };
  return STATUS.find((x) => x.id === s)!;
}

export default function IepTracker() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [goals, setGoals] = useState<IepGoal[]>(() => StarStore.getIepGoals());
  const [log, setLog] = useState<IepLogEntry[]>(() => StarStore.getIepLog());

  // Group goals by student for fast lookup
  const goalsByStudent = useMemo(() => {
    const m: Record<string, IepGoal[]> = {};
    for (const g of goals) {
      (m[g.studentId] ||= []).push(g);
    }
    return m;
  }, [goals]);
  // (also force-refresh once when this component mounts to pick up
  // anything saved by Settings panel between renders)
  void setGoals;
  const [openNote, setOpenNote] = useState<{ studentId: string; date: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const today = todayPacific();
  const last10 = useMemo(() => lastNDays(10), []);

  const byStudentToday = useMemo(() => {
    const m: Record<string, IepLogEntry | undefined> = {};
    for (const s of students) {
      m[s.id] = log.find((e) => e.studentId === s.id && e.date === today);
    }
    return m;
  }, [log, students, today]);

  const setStatus = (studentId: string, status: IepStatus) => {
    StarStore.logIep(studentId, today, status, byStudentToday[studentId]?.note);
    setLog(StarStore.getIepLog());
    successBeep();
    setSavedFlash(studentId);
    setTimeout(() => setSavedFlash((id) => id === studentId ? null : id), 800);
  };

  const saveNote = () => {
    if (!openNote) return;
    const cur = log.find((e) => e.studentId === openNote.studentId && e.date === openNote.date);
    StarStore.logIep(openNote.studentId, openNote.date, cur?.status || "partial", noteDraft.trim() || undefined);
    setLog(StarStore.getIepLog());
    setOpenNote(null);
    setNoteDraft("");
    loggedBeep();
  };

  // Per-kid rollup over the lookback window for the right-hand stats
  const rollup30 = useMemo(() => {
    const out: Record<string, { met: number; partial: number; not: number; total: number; pct: number }> = {};
    const window = lastNDays(30);
    const set = new Set(window);
    for (const s of students) {
      const entries = log.filter((e) => e.studentId === s.id && set.has(e.date));
      const met = entries.filter((e) => e.status === "met").length;
      const partial = entries.filter((e) => e.status === "partial").length;
      const not = entries.filter((e) => e.status === "not").length;
      const total = met + partial + not;
      const pct = total ? Math.round(((met * 100) + (partial * 50)) / total) : 0;
      out[s.id] = { met, partial, not, total, pct };
    }
    return out;
  }, [log, students]);

  return (
    <div style={{ color: "#f5f1e8" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10, marginBottom: 16,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "#c4b5fd", marginBottom: 4 }}>
            🎯 IEP Goals · {pretty(today)}
          </div>
          <div style={{ fontSize: 14, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>
            Tap a status per kid. Hit 🖨 to print a SEIF report for IEP meetings.
          </div>
        </div>
        <button onClick={() => printSeifReport(students, goals, log, "all")} style={primaryBtn(false)}>
          🖨 Print Whole-Class SEIF
        </button>
      </div>

      {students.length === 0 && (
        <div style={empty()}>
          No students yet. Visit Settings → Students or hit 🔄 Sync from Classroom.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {students.map((s) => {
          const studentGoals = goalsByStudent[s.id] || [];
          const todayEntry = byStudentToday[s.id];
          const r = rollup30[s.id];
          const flashing = savedFlash === s.id;
          return (
            <div
              key={s.id}
              style={{
                position: "relative",
                padding: 16, borderRadius: 14,
                background: flashing
                  ? "linear-gradient(135deg, rgba(34,197,94,0.20), rgba(168,85,247,0.08))"
                  : "linear-gradient(180deg, rgba(168,85,247,0.08) 0%, rgba(99,102,241,0.04) 100%)",
                border: flashing
                  ? "1px solid rgba(34,197,94,0.50)"
                  : "1px solid rgba(168,85,247,0.20)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 18px -8px rgba(0,0,0,0.45)",
                transition: "background .25s, border .25s",
              }}
            >
              {/* Top row: avatar + name + 30-day stats + print btn */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={avatarStyle()}>{(s.firstName || "?").charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 17, fontWeight: 900, letterSpacing: "-0.015em", color: "#fce7f3",
                  }}>{s.firstName} {s.lastName}</div>
                  {studentGoals.length === 0 && (
                    <div style={{ fontSize: 12, color: "rgba(196,181,253,0.45)", fontWeight: 600, marginTop: 2, fontStyle: "italic" }}>
                      No goals yet — open Settings → IEP Goals to add (or load roster).
                    </div>
                  )}
                  {studentGoals.length > 0 && (
                    <div style={{ fontSize: 12, color: "rgba(196,181,253,0.65)", fontWeight: 700, marginTop: 2 }}>
                      {studentGoals.length} goal{studentGoals.length === 1 ? "" : "s"} on file
                    </div>
                  )}
                </div>
                {r && r.total > 0 && (
                  <div style={{
                    flexShrink: 0, padding: "6px 12px", borderRadius: 10,
                    background: "rgba(168,85,247,0.10)",
                    border: "1px solid rgba(168,85,247,0.25)",
                    textAlign: "right", minWidth: 90,
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)" }}>
                      30-day score
                    </div>
                    <div style={{
                      fontSize: 22, fontWeight: 900, color: r.pct >= 80 ? "#86efac" : r.pct >= 50 ? "#fcd34d" : "#fca5a5",
                      fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
                    }}>{r.pct}%</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(196,181,253,0.55)" }}>
                      {r.met}✓ {r.partial}◐ {r.not}✗
                    </div>
                  </div>
                )}
                <button
                  onClick={() => printSeifReport(students, goals, log, s.id)}
                  disabled={studentGoals.length === 0}
                  title={studentGoals.length ? "Print SEIF report for this student" : "Add at least one goal first"}
                  style={ghostBtn(studentGoals.length === 0)}
                >🖨</button>
              </div>

              {/* Goals list — chip per goal */}
              {studentGoals.length > 0 && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 5,
                  marginBottom: 12, padding: "10px 12px", borderRadius: 10,
                  background: "rgba(168,85,247,0.04)",
                  border: "1px solid rgba(168,85,247,0.15)",
                }}>
                  {studentGoals.map((g, i) => (
                    <div key={g.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
                      <span style={{
                        flexShrink: 0,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: 22, height: 18, padding: "0 5px", borderRadius: 999,
                        background: "rgba(168,85,247,0.18)",
                        color: "#c4b5fd", fontWeight: 800, fontSize: 10,
                        border: "1px solid rgba(168,85,247,0.35)",
                      }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0, color: "rgba(196,181,253,0.85)", fontWeight: 600, lineHeight: 1.45 }}>
                        {g.area && <span style={{ color: "#f9a8d4", fontWeight: 800, marginRight: 6 }}>{g.area}:</span>}
                        {g.goalText}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Status row — today */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUS.map((opt) => {
                  const active = todayEntry?.status === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setStatus(s.id, opt.id)}
                      aria-pressed={active}
                      style={{
                        flex: 1, minWidth: 100, minHeight: 44,
                        padding: "10px 12px", borderRadius: 10,
                        background: active
                          ? `linear-gradient(135deg, ${opt.color}, ${opt.color}cc)`
                          : `${opt.color}11`,
                        border: active ? `1.5px solid ${opt.color}` : `1px solid ${opt.color}55`,
                        color: active ? "white" : opt.color,
                        fontWeight: 800, fontSize: 14,
                        cursor: "pointer", touchAction: "manipulation",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        boxShadow: active ? `0 0 14px ${opt.color}55` : "none",
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{opt.icon}</span>
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    setOpenNote({ studentId: s.id, date: today });
                    setNoteDraft(todayEntry?.note || "");
                  }}
                  style={{
                    minWidth: 90, minHeight: 44,
                    padding: "10px 14px", borderRadius: 10,
                    background: todayEntry?.note ? "rgba(168,85,247,0.18)" : "rgba(168,85,247,0.06)",
                    border: "1px solid rgba(168,85,247,0.30)",
                    color: "#fce7f3", fontWeight: 700, fontSize: 13,
                    cursor: "pointer", touchAction: "manipulation",
                  }}
                >📝 {todayEntry?.note ? "Note ✓" : "Note"}</button>
              </div>

              {/* History strip — last 10 days */}
              <div style={{
                marginTop: 12, paddingTop: 12,
                borderTop: "1px solid rgba(168,85,247,0.12)",
                display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap",
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
                  color: "rgba(196,181,253,0.55)", marginRight: 4,
                }}>Last 10</div>
                {last10.slice().reverse().map((d) => {
                  const e = log.find((x) => x.studentId === s.id && x.date === d);
                  const meta = statusMeta(e?.status);
                  return (
                    <span
                      key={d}
                      title={`${pretty(d)} · ${meta.label}${e?.note ? ` — ${e.note}` : ""}`}
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 26, height: 26, borderRadius: 7,
                        background: e ? `${meta.color}22` : "rgba(168,85,247,0.04)",
                        border: e ? `1px solid ${meta.color}66` : "1px solid rgba(168,85,247,0.10)",
                        color: e ? meta.color : "rgba(196,181,253,0.30)",
                        fontWeight: 900, fontSize: 13,
                      }}
                    >{meta.icon}</span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Note modal */}
      {openNote && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpenNote(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 800,
            background: "rgba(10,4,20,0.78)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <div style={{
            width: "min(520px, 96vw)",
            background: "radial-gradient(900px 600px at 0% 0%, rgba(168,85,247,0.18) 0%, transparent 55%), linear-gradient(180deg, #1a0f2e 0%, #0a0414 100%)",
            border: "1px solid rgba(168,85,247,0.30)",
            borderRadius: 18, padding: 22,
            boxShadow: "0 24px 56px -10px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase",
              color: "#f9a8d4", marginBottom: 6,
            }}>📝 IEP Note · {pretty(openNote.date)}</div>
            <div style={{
              fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", color: "#fce7f3", marginBottom: 12,
              background: "linear-gradient(135deg, #f5f1e8 0%, #f9a8d4 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>{students.find((s) => s.id === openNote.studentId)?.firstName || "Student"}</div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              autoFocus
              rows={5}
              placeholder="What happened today? Triggers, supports tried, what worked, what didn't…"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "12px 14px", borderRadius: 12,
                background: "rgba(10,4,20,0.55)", color: "#fce7f3",
                border: "1px solid rgba(168,85,247,0.30)",
                fontSize: 14, fontWeight: 500, lineHeight: 1.5,
                outline: "none", resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setOpenNote(null)} style={ghostBtn(false)}>Cancel</button>
              <button onClick={saveNote} style={primaryBtn(false)}>Save Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Buttons + helpers ───────────────────────────────────────────── */

function avatarStyle(): React.CSSProperties {
  return {
    width: 44, height: 44, borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: 18, color: "white", flexShrink: 0,
    boxShadow: "0 4px 14px -4px rgba(168,85,247,0.55), inset 0 2px 0 rgba(255,255,255,0.15)",
  };
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 16px", borderRadius: 10, border: "none",
    background: disabled
      ? "rgba(168,85,247,0.18)"
      : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    color: "white", fontWeight: 900, fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    boxShadow: disabled ? "none" : "0 8px 22px -6px rgba(168,85,247,0.55)",
    touchAction: "manipulation",
  };
}

function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 12px", borderRadius: 10,
    background: "rgba(168,85,247,0.06)",
    border: "1px solid rgba(168,85,247,0.30)",
    color: "#fce7f3", fontWeight: 700, fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    touchAction: "manipulation",
  };
}

function empty(): React.CSSProperties {
  return {
    padding: "20px 22px", borderRadius: 12,
    background: "rgba(168,85,247,0.04)",
    border: "1px dashed rgba(168,85,247,0.25)",
    color: "rgba(196,181,253,0.65)", fontSize: 13, fontWeight: 600, textAlign: "center",
  };
}

/* ── PRINT — SEIF (Special Education Information Form) report ────── */

export function printSeifReport(
  students: StarStudent[],
  goals: IepGoal[],
  log: IepLogEntry[],
  scope: string,
) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;

  const list = scope === "all" ? students : students.filter((s) => s.id === scope);
  const today = new Date();
  const teacherLine = "";
  const generated = today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const sections = list.map((s) => {
    const studentGoals = goals.filter((g) => g.studentId === s.id);
    return buildSeifSection(s, studentGoals, log);
  }).join('<div class="page-break"></div>');

  const css = `
    @media print { @page { size: letter; margin: 0.55in; } .page-break { page-break-after: always; } .no-print { display: none; } }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; padding: 0; margin: 0; line-height: 1.5; }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
    h2 { font-size: 14px; margin: 16px 0 6px; letter-spacing: 0.04em; text-transform: uppercase; color: #4c1d95; border-bottom: 2px solid #ede9fe; padding-bottom: 4px; }
    .meta { font-size: 11px; color: #555; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #ede9fe; color: #5b21b6; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .goalbox { background: #faf5ff; border: 1px solid #d8b4fe; border-radius: 8px; padding: 10px 14px; margin-top: 8px; }
    .goalbox .area { display: inline-block; padding: 1px 7px; border-radius: 4px; background: #6d28d9; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; margin-right: 6px; }
    .goalbox .text { font-size: 14px; font-weight: 600; color: #1f1235; }

    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
    .sum { padding: 10px 12px; border-radius: 8px; border: 1px solid #e5e7eb; }
    .sum .label { font-size: 9px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #555; }
    .sum .v { font-size: 22px; font-weight: 900; margin-top: 2px; letter-spacing: -0.02em; }
    .sum.ok .v { color: #047857; }
    .sum.warn .v { color: #b45309; }
    .sum.err .v { color: #b91c1c; }
    .sum.score { background: #faf5ff; border-color: #d8b4fe; }
    .sum.score .v { color: #5b21b6; }

    table.log { width: 100%; border-collapse: collapse; font-size: 12px; }
    table.log th { text-align: left; padding: 6px 8px; background: #faf5ff; border-bottom: 2px solid #d8b4fe; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #4c1d95; }
    table.log td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
    .badge.met { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .badge.partial { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .badge.not { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

    .weekly { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin: 8px 0 16px; }
    .week { padding: 8px 10px; border-radius: 6px; border: 1px solid #e5e7eb; }
    .week .wk { font-size: 9px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: #555; margin-bottom: 4px; }
    .bar { height: 14px; background: #f3f4f6; border-radius: 4px; overflow: hidden; display: flex; }
    .bar > span { display: block; height: 100%; }
    .bar > .met { background: #10b981; }
    .bar > .partial { background: #f59e0b; }
    .bar > .not { background: #ef4444; }
    .legend { display: flex; gap: 14px; font-size: 11px; color: #444; margin: 4px 0 14px; }
    .legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; vertical-align: middle; margin-right: 5px; }

    .signbox { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .signline { border-bottom: 1.5px solid #444; height: 30px; margin-bottom: 4px; }
    .signlbl { font-size: 10px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: #555; }

    section.report { padding: 24px; }
    .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 2px solid #d8b4fe; }
    .topbar .right { text-align: right; font-size: 11px; color: #555; }
    .toolbar { padding: 12px 24px; background: #faf5ff; border-bottom: 1px solid #d8b4fe; display: flex; justify-content: space-between; align-items: center; }
    .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #6d28d9; background: #6d28d9; color: white; font-weight: 700; cursor: pointer; }
  `;

  const html = `<!doctype html><html><head><title>SEIF — IEP Goal Progress${scope === "all" ? "" : ` — ${(list[0]?.firstName || "")} ${list[0]?.lastName || ""}`.trim()}</title><style>${css}</style></head>
    <body>
      <div class="toolbar no-print">
        <div style="font-weight:800;color:#4c1d95;letter-spacing:0.04em">📄 SEIF — IEP Goal Progress Report</div>
        <button onclick="window.print()">🖨 Print</button>
      </div>
      ${sections}
      <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
    </body></html>`;

  function buildSeifSection(s: StarStudent, studentGoals: IepGoal[], allLog: IepLogEntry[]): string {
    const entries = allLog
      .filter((e) => e.studentId === s.id)
      .sort((a, b) => b.date.localeCompare(a.date));

    const met = entries.filter((e) => e.status === "met").length;
    const partial = entries.filter((e) => e.status === "partial").length;
    const not = entries.filter((e) => e.status === "not").length;
    const total = met + partial + not;
    const score = total ? Math.round(((met * 100) + (partial * 50)) / total) : 0;

    // Group by ISO week (Mon–Sun)
    const weeks: Record<string, { label: string; met: number; partial: number; not: number }> = {};
    for (const e of entries) {
      const [y, m, d] = e.date.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const day = dt.getUTCDay() || 7; // Mon = 1, Sun = 7
      const monday = new Date(dt); monday.setUTCDate(dt.getUTCDate() - (day - 1));
      const wkKey = `${monday.getUTCFullYear()}-W${String(Math.ceil(((monday.getTime() - Date.UTC(monday.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0")}`;
      const wkLabel = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
      const cur = weeks[wkKey] || { label: wkLabel, met: 0, partial: 0, not: 0 };
      if (e.status === "met") cur.met++;
      else if (e.status === "partial") cur.partial++;
      else cur.not++;
      weeks[wkKey] = cur;
    }
    const weekKeys = Object.keys(weeks).sort().reverse().slice(0, 8).reverse();

    const goalHtml = studentGoals.length === 0
      ? `<div class="goalbox" style="background:#fef9c3;border-color:#fde047"><span class="text" style="color:#854d0e">⚠ No IEP goals recorded for this student. Add one in /star → Settings → IEP Goals before sharing.</span></div>`
      : studentGoals.map((g, i) => `
          <div class="goalbox" style="margin-top:${i === 0 ? "8px" : "6px"}">
            <div style="display:flex;align-items:flex-start;gap:8px">
              <span style="display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:18px;padding:0 5px;border-radius:999px;background:#6d28d9;color:white;font-weight:800;font-size:10px;flex-shrink:0;margin-top:2px">${i + 1}</span>
              <div style="flex:1;min-width:0">
                ${g.area ? `<span class="area">${escapeHtml(g.area)}</span>` : ""}
                <span class="text">${escapeHtml(g.goalText)}</span>
              </div>
            </div>
          </div>
        `).join("");

    const weeklyHtml = weekKeys.length
      ? `<div class="weekly">${weekKeys.map((k) => {
          const w = weeks[k];
          const t = w.met + w.partial + w.not || 1;
          return `<div class="week">
            <div class="wk">Week of ${escapeHtml(w.label)}</div>
            <div class="bar">
              <span class="met" style="width:${(w.met / t) * 100}%"></span>
              <span class="partial" style="width:${(w.partial / t) * 100}%"></span>
              <span class="not" style="width:${(w.not / t) * 100}%"></span>
            </div>
            <div style="font-size:10px;color:#555;margin-top:3px;font-variant-numeric:tabular-nums">
              ${w.met}✓ &nbsp; ${w.partial}◐ &nbsp; ${w.not}✗
            </div>
          </div>`;
        }).join("")}</div>
        <div class="legend">
          <span><span class="dot" style="background:#10b981"></span>Met</span>
          <span><span class="dot" style="background:#f59e0b"></span>Partial</span>
          <span><span class="dot" style="background:#ef4444"></span>Not yet</span>
        </div>`
      : "";

    const tableRows = entries.slice(0, 60).map((e) => {
      const cls = e.status;
      const lbl = STATUS.find((x) => x.id === e.status)?.label || "—";
      return `<tr>
        <td style="white-space:nowrap"><b>${escapeHtml(pretty(e.date))}</b></td>
        <td><span class="badge ${cls}">${lbl}</span></td>
        <td>${escapeHtml(e.note || "")}</td>
      </tr>`;
    }).join("");

    return `
      <section class="report">
        <div class="topbar">
          <div>
            <h1>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</h1>
            <div class="meta">${s.grade ? `Grade <b>${escapeHtml(s.grade)}</b> · ` : ""}IEP Goal Progress Report</div>
          </div>
          <div class="right">
            <div class="pill">SEIF</div>
            <div style="margin-top:4px">${escapeHtml(generated)}</div>
            <div style="margin-top:2px">Total entries: <b>${total}</b></div>
          </div>
        </div>

        <h2>${studentGoals.length > 1 ? `Goals (${studentGoals.length})` : "Goal"}</h2>
        ${goalHtml}

        <h2>Summary</h2>
        <div class="summary">
          <div class="sum score">
            <div class="label">Mastery Score</div>
            <div class="v">${score}%</div>
          </div>
          <div class="sum ok">
            <div class="label">Met</div>
            <div class="v">${met}</div>
          </div>
          <div class="sum warn">
            <div class="label">Partial</div>
            <div class="v">${partial}</div>
          </div>
          <div class="sum err">
            <div class="label">Not Yet</div>
            <div class="v">${not}</div>
          </div>
        </div>

        ${weekKeys.length ? `<h2>Weekly Trend</h2>${weeklyHtml}` : ""}

        <h2>Daily Log${entries.length > 60 ? ` <span style="font-size:10px;color:#666;font-weight:600">(showing newest 60 of ${entries.length})</span>` : ""}</h2>
        ${entries.length === 0
          ? `<div style="padding:14px;background:#faf5ff;border:1px dashed #d8b4fe;border-radius:8px;color:#5b21b6;font-size:12px">No entries logged yet for this student.</div>`
          : `<table class="log">
              <thead><tr><th style="width:130px">Date</th><th style="width:90px">Status</th><th>Notes</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>`
        }

        <div class="signbox">
          <div>
            <div class="signline"></div>
            <div class="signlbl">Teacher signature</div>
            <div style="font-size:10px;color:#777;margin-top:2px">${teacherLine}</div>
          </div>
          <div>
            <div class="signline"></div>
            <div class="signlbl">Case manager signature</div>
          </div>
        </div>

        <div style="margin-top:14px;font-size:10px;color:#888">
          Mastery Score = (Met × 100 + Partial × 50) ÷ total entries. Generated by STAR · ${escapeHtml(generated)}.
        </div>
      </section>
    `;
  }

  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
