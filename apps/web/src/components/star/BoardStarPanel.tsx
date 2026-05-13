// Board-side STAR widget. Adds a small toggle button to the ClassroomBoard
// that opens a slide-over panel showing:
//   • Today's assignment completion tracker — bar per student per subject
//   • Live grades view — same matrix layout as the /star Gradebook tab,
//     resized for the projector.
//
// Reads everything from localStorage (synced via the cross-device server
// poll already running in StarBoardOverlay). Polls every second so saves
// from the iPad show up on the projector immediately.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, letterGradeColor, countsTowardGrade,
  type StarStudent, type StarTrackerEntry, type Subject,
} from "../../lib/star/storage.ts";
import { syncFromClassroom } from "../../lib/star/sync.ts";
import { tokens as T } from "../../lib/star/theme.ts";

const SUBJECTS: Subject[] = ["Math", "Reading", "Writing", "Science", "Social Studies"];

// External handle so ClassroomBoard's header can render its own toggle
// button matching the ⛶ / 🌅 / 💼 / 🔒 row, while BoardStarPanel just
// owns the slide-over panel.
let _setOpen: ((v: boolean) => void) | null = null;
let _getOpen: (() => boolean) | null = null;
export function toggleStarPanel() { if (_setOpen && _getOpen) _setOpen(!_getOpen()); }
export function isStarPanelOpen() { return !!_getOpen?.(); }

export default function BoardStarPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"completion" | "grades">("completion");
  _setOpen = setOpen;
  _getOpen = () => open;

  // SERVER PULL whenever the panel opens AND every 30s while it's
  // open. Without this, the panel's child components (CompletionView,
  // GradesMatrixView) only see whatever's in local cache — which on
  // the projector/iPad is whoever last visited the page. With it, the
  // matrix reflects every device's saves within ~30 seconds.
  useEffect(() => {
    if (!open) return;
    const pull = async () => {
      try {
        const { getActiveClassId } = await import("../../lib/star/boardEvents.ts");
        const { hydrateStarSubmissions } = await import("../../lib/star/serverHydrate.ts");
        const cid = getActiveClassId();
        if (cid) await hydrateStarSubmissions(cid);
        // Also clean up stale local junk so the assignment count
        // doesn't read 2,000+ from accumulated cruft.
        const { pruneOldAssignments, stripOldHeavyFields, dedupAsnTrackSubmissions } = await import("../../lib/star/storage.ts");
        dedupAsnTrackSubmissions();
        stripOldHeavyFields(3);
        pruneOldAssignments(14);
      } catch {}
    };
    pull();
    const iv = window.setInterval(pull, 30_000);
    return () => window.clearInterval(iv);
  }, [open]);

  return (
    <>
      {/* Toggle button is rendered by ClassroomBoard inside its top header
          row so it scales + sits next to the rest of the teacher controls
          instead of floating fixed on top of fullscreen. */}

      {/* Slide-over panel */}
      {open && (
        <div role="dialog" aria-label="STAR class live view"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }} style={{
          position: "fixed", inset: 0, zIndex: 240,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
          animation: `starOverlayIn ${T.motion.standard}`,
        }}>
          <style>{`@keyframes starOverlayIn { from { opacity: 0; } to { opacity: 1; } } @keyframes starSheetIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0,
            width: "min(900px, 96vw)",
            background: T.color.bg,
            borderLeft: `1px solid ${T.color.border}`,
            color: T.color.text, padding: T.space["2xl"], overflow: "auto",
            boxShadow: `-24px 0 64px rgba(0,0,0,0.55)`,
            fontFamily: T.font.family,
            animation: `starSheetIn ${T.motion.slow}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space.lg, gap: T.space.md }}>
              <div>
                <div style={{
                  fontSize: T.font.size.xs, fontWeight: T.font.weight.bold,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  color: T.color.textMuted,
                }}>
                  ⭐ STAR · Class Live View
                </div>
                <h2 style={{
                  fontSize: T.font.size["2xl"], fontWeight: T.font.weight.black,
                  margin: "4px 0 0", letterSpacing: "-0.01em",
                }}>
                  {view === "completion" ? "Class Completion" : "Student Grades"}
                </h2>
                <DataCounts />
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close panel" style={closeBtn()}>✕</button>
            </div>

            {/* View toggle */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              <ToggleBtn active={view === "completion"} onClick={() => setView("completion")} icon="✅" label="Completion" />
              <ToggleBtn active={view === "grades"} onClick={() => setView("grades")} icon="📚" label="Grades Matrix" />
            </div>

            {view === "completion" ? <CompletionView /> : <GradesMatrixView />}
          </div>
        </div>
      )}
    </>
  );
}

/* ── completion tracker ──────────────────────────────────────────── */

function CompletionView() {
  const [tick, setTick] = useState(0);
  // 1-second poll so iPad saves show up on the projector instantly.
  useEffect(() => { const iv = window.setInterval(() => setTick((n) => n + 1), 1000); return () => window.clearInterval(iv); }, []);

  const data = useMemo(() => {
    const tracker = StarStore.getAsnTrack();
    const students = StarStore.getStudents();

    // Every assignment in the tracker — no date filter. The teacher sees
    // a true running picture of how each kid is doing across all
    // barcoded work, not just stuff created today.
    const all: StarTrackerEntry[] = Object.values(tracker);

    // Build name lookup for matching CSV-imported entries that don't
    // carry a real DB studentId.
    const idByFirstName = new Map<string, string>();
    const idByFullName  = new Map<string, string>();
    for (const stu of students) {
      const full = `${stu.firstName} ${stu.lastName}`.trim().toLowerCase();
      if (full) idByFullName.set(full, stu.id);
      const first = stu.firstName.trim().toLowerCase();
      if (first) idByFirstName.set(first, stu.id);
    }

    const resolveStudentId = (t: StarTrackerEntry, sub?: { studentId?: string; studentName?: string }): string | null => {
      if (sub?.studentId && students.some((s) => s.id === sub.studentId)) return sub.studentId;
      if (t.studentId && students.some((s) => s.id === t.studentId)) return t.studentId;
      const name = sub?.studentName || t.studentName;
      if (!name) return null;
      const lower = String(name).trim().toLowerCase();
      return idByFullName.get(lower) || idByFirstName.get(lower.split(/\s+/)[0]) || null;
    };

    const rows = students.map((stu) => {
      const completedFor = new Set<string>();
      const subjects = new Set<string>();
      let total = 0;
      for (const t of all) {
        // Belongs to this student if explicitly tagged OR has a
        // submission credited to them.
        const explicitlyMine = resolveStudentId(t) === stu.id;
        const submitted = (t.submissions || []).some((sub) => resolveStudentId(t, sub) === stu.id);
        if (!explicitlyMine && !submitted) continue;
        subjects.add(t.subject);
        total += 1;
        if (submitted) completedFor.add(t.id);
      }
      return { stu, completed: completedFor.size, total, subjectsToday: subjects };
    });

    return { todays: all, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  if (data.todays.length === 0) {
    return (
      <div style={{ padding: 24, opacity: 0.6, textAlign: "center", fontSize: 14, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
        No assignments yet — generate one in /star → Create.
      </div>
    );
  }

  const hasAnyMatched = data.rows.some((r) => r.total > 0);
  if (!hasAnyMatched) {
    return <NoMatchDiagnostic count={data.todays.length} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.rows.map(({ stu, completed, total }) => {
        if (total === 0) return null;
        const pct = Math.round((completed / total) * 100);
        const allDone = completed === total && total > 0;
        return (
          <div key={stu.id} style={{
            padding: 12, borderRadius: 12,
            background: allDone ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${allDone ? "rgba(16,185,129,0.40)" : "rgba(255,255,255,0.10)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <span style={avatar()}>{(stu.firstName || "?")[0].toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{stu.firstName} {stu.lastName}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{completed} of {total} done {allDone ? "🎉" : ""}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: allDone ? "#10b981" : "#fde68a" }}>{pct}%</div>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,0.40)", overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: allDone ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg,#6366f1,#fbbf24)",
                transition: "width 0.5s ease",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── data counts subtitle — shows raw localStorage counts ─────── */

function DataCounts() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = window.setInterval(() => setTick((n) => n + 1), 2000); return () => window.clearInterval(iv); }, []);
  const tracker = StarStore.getAsnTrack();
  const subs = Object.values(tracker).reduce((a, t) => a + (t.submissions?.length || 0), 0);
  void tick;
  return (
    <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4, fontFamily: "monospace" }}>
      {Object.keys(tracker).length} assignments · {subs} submissions · {StarStore.getStudents().length} students
    </div>
  );
}

/* ── empty-state diagnostic with inline Sync button ─────────────── */

function NoMatchDiagnostic({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const studentsCount = StarStore.getStudents().length;

  const sync = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await syncFromClassroom();
      setMsg(r.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      padding: 20, borderRadius: 12,
      background: "rgba(251,191,36,0.10)",
      border: "1px solid rgba(251,191,36,0.40)",
      color: "#fde68a", fontSize: 13, lineHeight: 1.6,
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>
        Found {count} assignment{count === 1 ? "" : "s"} but couldn't match any to a student.
      </div>
      <div style={{ opacity: 0.85, marginBottom: 6 }}>
        STAR roster has <b>{studentsCount}</b> student{studentsCount === 1 ? "" : "s"}.
        {studentsCount === 0 && " That's why — sync your classroom roster first."}
      </div>
      <div style={{ opacity: 0.85, marginBottom: 14 }}>
        Most assignments come from the legacy CSV (tagged by name only).
        Sync pulls real student IDs so STAR can credit them.
      </div>
      <button onClick={sync} disabled={busy} style={{
        padding: "10px 16px", borderRadius: 10,
        background: busy ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#6366f1,#b23a48)",
        color: "white", border: "1px solid rgba(251,191,36,0.55)",
        fontWeight: 800, cursor: busy ? "wait" : "pointer", fontSize: 13,
      }}>
        {busy ? "Syncing…" : "🔄 Sync from Classroom"}
      </button>
      {msg && (
        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.30)", color: "#f5f1e8", fontSize: 12 }}>
          {msg} — close + reopen this panel to refresh the view.
        </div>
      )}
    </div>
  );
}

/* ── grades matrix ───────────────────────────────────────────────── */

function GradesMatrixView() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = window.setInterval(() => setTick((n) => n + 1), 2000); return () => window.clearInterval(iv); }, []);

  const data = useMemo(() => {
    const students = StarStore.getStudents();
    const tracker = StarStore.getAsnTrack();
    // Pre-compute case-insensitive matchers + first-name fallback so
    // a submission's studentId casing or a missing-id studentName row
    // both resolve to the right roster student. This was the root
    // cause of "Aiden has no grades" earlier — strict-equal id match.
    const firstByLower = new Map<string, string>();
    const fullByLower = new Map<string, string>();
    const idByLower = new Map<string, string>();
    for (const stu of students) {
      idByLower.set(stu.id.toLowerCase(), stu.id);
      const full = `${stu.firstName} ${stu.lastName}`.trim().toLowerCase();
      if (full) fullByLower.set(full, stu.id);
      const first = stu.firstName.trim().toLowerCase();
      if (first) firstByLower.set(first, stu.id);
    }
    const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const resolveSubmissionTo = (stuId: string, sub: any): boolean => {
      // 1) case-insensitive id match
      if (sub.studentId) {
        const matched = idByLower.get(String(sub.studentId).toLowerCase());
        if (matched === stuId) return true;
      }
      // 2) first-name fallback (covers id mismatches)
      if (sub.studentName) {
        const sn = norm(sub.studentName);
        const sid = fullByLower.get(sn) || firstByLower.get(sn.split(/\s+/)[0]);
        if (sid === stuId) return true;
      }
      return false;
    };
    const rows = students.map((stu) => {
      const bySubj: Record<string, { pct: number; letter: string; count: number }> = {};
      for (const t of Object.values(tracker)) {
        // Latest submission per student per assignment so a re-grade
        // overrides the original instead of being averaged with it.
        const matchingSubs = (t.submissions || [])
          .filter((s) => resolveSubmissionTo(stu.id, s))
          .filter(countsTowardGrade);
        if (matchingSubs.length === 0) continue;
        let pick = matchingSubs[0];
        let pickTs = -1;
        for (const sub of matchingSubs) {
          const ts = Date.parse(sub.loggedAt || sub.completedDate || "") || 0;
          if (ts > pickTs) { pick = sub; pickTs = ts; }
        }
        const cur = bySubj[t.subject] || { pct: 0, letter: "F", count: 0 };
        cur.pct = (cur.pct * cur.count + pick.pct) / (cur.count + 1);
        cur.count += 1;
        cur.letter = letterFromPct(Math.round(cur.pct));
        bySubj[t.subject] = cur;
      }
      return { stu, bySubj };
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead style={{ background: "rgba(0,0,0,0.50)" }}>
          <tr>
            <th style={th()}>Student</th>
            {SUBJECTS.map((s) => <th key={s} style={th()}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map(({ stu, bySubj }) => (
            <tr key={stu.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ padding: "10px 14px", verticalAlign: "middle", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={avatar()}>{(stu.firstName || "?")[0].toUpperCase()}</span>
                <div>
                  <div style={{ fontWeight: 800 }}>{stu.firstName} {stu.lastName}</div>
                  {stu.grade && <div style={{ fontSize: 11, opacity: 0.6 }}>{stu.grade}</div>}
                </div>
              </td>
              {SUBJECTS.map((subj) => {
                const cell = bySubj[subj];
                if (!cell) return <td key={subj} style={{ padding: "10px 14px", textAlign: "center", opacity: 0.3 }}>—</td>;
                const color = letterGradeColor(cell.letter);
                const pct = Math.round(cell.pct);
                return (
                  <td key={subj} style={{ padding: "10px 14px", textAlign: "center" }}>
                    <div style={{
                      display: "inline-flex", flexDirection: "column", alignItems: "center",
                      padding: "6px 10px", borderRadius: 10,
                      background: `${color}15`, border: `1px solid ${color}55`,
                    }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{cell.letter}</span>
                      <span style={{ fontSize: 11, opacity: 0.85 }}>{pct}% · {cell.count}×</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── shared ──────────────────────────────────────────────────────── */

function ToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 16px", borderRadius: 999,
      background: active ? "linear-gradient(135deg,#6366f1,#b23a48)" : "rgba(255,255,255,0.05)",
      color: "white",
      border: active ? "1px solid rgba(251,191,36,0.55)" : "1px solid rgba(255,255,255,0.12)",
      fontWeight: 700, cursor: "pointer", fontSize: 13,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
function avatar(): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1, #b23a48)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: 16, color: "white", flexShrink: 0,
  };
}
function th(): React.CSSProperties {
  return {
    textAlign: "left", padding: "12px 14px",
    fontSize: 11, fontWeight: 800, letterSpacing: "0.14em",
    textTransform: "uppercase", opacity: 0.7, color: "white",
  };
}
function closeBtn(): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    cursor: "pointer", fontWeight: 800, fontSize: 14,
  };
}
function letterFromPct(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}
