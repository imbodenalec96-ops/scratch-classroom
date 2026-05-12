// Student Folder Modal — opens when a STU-{id} barcode is scanned
// (printed from the FolderLabelsGenerator). Shows the kid's pending
// assignments + recent grades + quick actions, all pulled from local
// STAR data so it works offline.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, countsTowardGrade, letterGradeColor,
  type StarStudent, type StarTrackerEntry, type BehaviorDef,
} from "../../lib/star/storage.ts";
import { api } from "../../lib/api.ts";
import { successBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";
import BehaviorScanModal from "./BehaviorScanModal.tsx";

interface Props {
  studentId: string;
  onClose: () => void;
}

interface PendingItem {
  barcode: string;
  name: string;
  subject: string;
  createdDate: string;
}

interface GradedItem {
  barcode: string;
  name: string;
  subject: string;
  pct: number;
  letter: string;
  date: string;
  counted: boolean;
}

export default function StudentFolderModal({ studentId, onClose }: Props) {
  // Case-insensitive lookup so a pasted/scanned UUID in upper case
  // (the global scanner uppercases everything) still matches the
  // lowercase IDs we store in /star.
  const [student] = useState<StarStudent | null>(() => {
    const all = StarStore.getStudents();
    const wantLower = studentId.toLowerCase();
    return all.find((s) => s.id.toLowerCase() === wantLower) || null;
  });

  // Behavior + points state — refreshed when actions land so chip
  // counts update live.
  const [defs, setDefs] = useState<BehaviorDef[]>(() => StarStore.getBehaviorDefs());
  const [logTick, setLogTick] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteDefId, setNoteDefId] = useState<string>("");
  const [pointsBusy, setPointsBusy] = useState(false);
  const [pointsCustom, setPointsCustom] = useState("");
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Pop the full ABC report form (BehaviorScanModal) for a chosen
  // behavior, with this student already pre-picked.
  const [reportForDefId, setReportForDefId] = useState<string | null>(null);
  const [pickReportBehavior, setPickReportBehavior] = useState(false);

  const showFlash = (kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 2400);
  };

  const visibleDefs = useMemo(() => {
    return defs.filter((d) => !d.archived && (d.scope === "class" || d.studentId === studentId));
  }, [defs, studentId]);

  const todayCounts = useMemo(() => {
    const log = StarStore.getBehaviorLog();
    const today = (() => {
      const d = new Date(Date.now() - 7 * 3600_000);
      return d.toISOString().slice(0, 10);
    })();
    const counts: Record<string, number> = {};
    for (const e of log) {
      if (e.studentId !== studentId || e.date !== today) continue;
      counts[e.defId] = (counts[e.defId] || 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, logTick]);

  const recordBehavior = (defId: string, note?: string) => {
    StarStore.recordBehavior(defId, studentId, note);
    setLogTick((t) => t + 1);
    successBeep();
    const def = defs.find((d) => d.id === defId);
    showFlash("ok", `Logged · ${def?.emoji || ""} ${def?.label || ""}${note ? " (with note)" : ""}`);
  };

  const openNoteDialog = (defId: string) => {
    setNoteDefId(defId);
    setNoteText("");
    setNoteOpen(true);
  };
  const submitNote = () => {
    if (!noteDefId) return;
    recordBehavior(noteDefId, noteText.trim() || undefined);
    setNoteOpen(false);
    setNoteDefId("");
    setNoteText("");
  };

  const givePoints = async (delta: number) => {
    if (!delta) return;
    setPointsBusy(true);
    try {
      await api.addPoints(studentId, delta);
      loggedBeep();
      showFlash("ok", `${delta > 0 ? "+" : ""}${delta} points awarded`);
      setPointsCustom("");
    } catch (e: any) {
      errorBeep();
      showFlash("err", `Failed: ${e?.message || "couldn't reach server"}`);
    } finally {
      setPointsBusy(false);
    }
  };

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Defs may change in another tab — refresh on focus.
  useEffect(() => {
    const refresh = () => setDefs(StarStore.getBehaviorDefs());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const { pending, graded, overallLetter, overallPct } = useMemo(() => {
    const tracker = StarStore.getAsnTrack();
    const first = (student?.firstName || "").trim().toLowerCase();
    const isMine = (sid: string | undefined, sname: string | undefined): boolean => {
      if (sid && sid === studentId) return true;
      if (!sid && sname) return (sname || "").trim().toLowerCase().split(/\s+/)[0] === first;
      return false;
    };
    const pending: PendingItem[] = [];
    const graded: GradedItem[] = [];
    for (const t of Object.values(tracker) as StarTrackerEntry[]) {
      // Belongs to this kid if either: it was minted with their id,
      // OR they have a submission in it.
      const minted = isMine(t.studentId, t.studentName);
      const subs = (t.submissions || []).filter((sub) => isMine(sub.studentId, sub.studentName));
      if (subs.length > 0) {
        for (const sub of subs) {
          graded.push({
            barcode: t.id, name: t.name, subject: t.subject || "Other",
            pct: sub.pct, letter: sub.letterGrade,
            date: sub.completedDate || "",
            counted: countsTowardGrade(sub),
          });
        }
      }
      // Pending = minted-for-this-kid AND no submission from them yet.
      if (minted && subs.length === 0) {
        pending.push({
          barcode: t.id, name: t.name, subject: t.subject || "Other",
          createdDate: t.createdDate || "",
        });
      }
    }
    pending.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
    graded.sort((a, b) => b.date.localeCompare(a.date));
    const counted = graded.filter((g) => g.counted);
    const overallPct = counted.length ? Math.round(counted.reduce((a, g) => a + g.pct, 0) / counted.length) : 0;
    const overallLetter = overallPct >= 90 ? "A" : overallPct >= 80 ? "B" : overallPct >= 70 ? "C" : overallPct >= 60 ? "D" : "F";
    return { pending, graded, overallLetter, overallPct };
  }, [student, studentId]);

  if (!student) {
    return (
      <Backdrop onClose={onClose}>
        <div style={panel()}>
          <h1 style={titleStyle()}>Student not found</h1>
          <p style={{ color: "rgba(196,181,253,0.65)", marginBottom: 16 }}>
            No student in /star with id <code style={code()}>{studentId}</code>.
            Open /star → Settings to add them, or print a fresh folder label.
          </p>
          <button onClick={onClose} style={primary(false)}>Close</button>
        </div>
      </Backdrop>
    );
  }

  const initial = (student.firstName || "?")[0].toUpperCase();

  return (
    <Backdrop onClose={onClose}>
      <div style={panel()}>
        {/* HERO */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, fontWeight: 900, color: "white",
            boxShadow: "0 10px 24px -6px rgba(168,85,247,0.55)",
            flexShrink: 0,
          }}>{initial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase", color: "#f9a8d4", marginBottom: 4 }}>
              📁 Folder · {student.grade || "—"}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.025em", color: "#fce7f3" }}>
              {student.firstName} {student.lastName}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtn()}>✕</button>
        </div>

        {/* STAT STRIP */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
          <Stat label="Pending" value={pending.length} accent="#f59e0b" />
          <Stat label="Graded" value={graded.length} accent="#a855f7" />
          <Stat label="Overall" value={graded.filter((g) => g.counted).length ? `${overallLetter} · ${overallPct}%` : "—"} accent={graded.filter((g) => g.counted).length ? letterGradeColor(overallLetter) : "#94a3b8"} />
        </div>

        {/* FLASH */}
        {flash && (
          <div role="status" aria-live="polite" style={{
            padding: "10px 14px", borderRadius: 10, marginBottom: 14,
            background: flash.kind === "ok" ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)",
            border: `1px solid ${flash.kind === "ok" ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"}`,
            color: flash.kind === "ok" ? "#bbf7d0" : "#fca5a5",
            fontWeight: 800, fontSize: 13, textAlign: "center",
          }}>{flash.text}</div>
        )}

        {/* QUICK POINTS — fast cash-out style */}
        <Section title="🪙 Give points" count={0}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[1, 2, 5, 10].map((n) => (
              <button key={`+${n}`} onClick={() => givePoints(n)} disabled={pointsBusy} style={ptsBtn(false)}>
                +{n}
              </button>
            ))}
            {[-1, -5].map((n) => (
              <button key={n} onClick={() => givePoints(n)} disabled={pointsBusy} style={ptsBtn(true)}>
                {n}
              </button>
            ))}
            <input
              type="number"
              value={pointsCustom}
              onChange={(e) => setPointsCustom(e.target.value)}
              placeholder="Custom"
              style={{
                width: 80, padding: "10px 12px", borderRadius: 10,
                background: "rgba(0,0,0,0.30)", color: "white",
                border: "1px solid rgba(168,85,247,0.25)",
                fontSize: 13, outline: "none",
              }}
            />
            <button
              onClick={() => { const n = Number(pointsCustom); if (Number.isFinite(n) && n !== 0) givePoints(n); }}
              disabled={pointsBusy || !pointsCustom.trim() || !Number.isFinite(Number(pointsCustom)) || Number(pointsCustom) === 0}
              style={primary(pointsBusy || !pointsCustom.trim())}
            >Give</button>
          </div>
        </Section>

        {/* WRITE A FULL INCIDENT REPORT — opens the BehaviorScanModal */}
        <Section title="📝 Full incident report" count={0}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={() => setPickReportBehavior(true)}
              disabled={visibleDefs.length === 0}
              style={{
                padding: "12px 16px", borderRadius: 12,
                background: visibleDefs.length === 0
                  ? "rgba(168,85,247,0.15)"
                  : "linear-gradient(135deg, rgba(245,158,11,0.30), rgba(239,68,68,0.20))",
                border: `1.5px solid ${visibleDefs.length === 0 ? "rgba(168,85,247,0.30)" : "rgba(245,158,11,0.60)"}`,
                color: visibleDefs.length === 0 ? "rgba(245,241,232,0.45)" : "#fde68a",
                fontWeight: 800, fontSize: 14, cursor: visibleDefs.length === 0 ? "not-allowed" : "pointer",
                textAlign: "left", display: "flex", alignItems: "center", gap: 10,
              }}
            >
              <span style={{ fontSize: 22 }}>📈</span>
              <div style={{ flex: 1 }}>
                <div>Write a full ABC incident report</div>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, marginTop: 2 }}>
                  {visibleDefs.length === 0 ? "No behaviors defined yet — open /star → 📈 Behavior" : "Antecedent · Behavior · Consequence + severity, points, parent notify, follow-up"}
                </div>
              </div>
              <span style={{ fontSize: 18, opacity: 0.65 }}>→</span>
            </button>

            {pickReportBehavior && (
              <div style={{
                padding: 12, borderRadius: 12,
                background: "rgba(0,0,0,0.30)",
                border: "1px solid rgba(168,85,247,0.30)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 8 }}>
                  Which behavior?
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {visibleDefs.map((d) => {
                    const c = d.tone === "positive" ? "#10b981" : d.tone === "challenge" ? "#f59e0b" : "#3b82f6";
                    return (
                      <button
                        key={d.id}
                        onClick={() => { setReportForDefId(d.id); setPickReportBehavior(false); }}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "8px 12px", borderRadius: 999,
                          background: `${c}1a`, border: `1.5px solid ${c}77`,
                          color: "#fce7f3", cursor: "pointer", fontSize: 13, fontWeight: 800,
                        }}
                      >
                        <span style={{ fontSize: 18 }}>{d.emoji}</span>
                        <span>{d.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, textAlign: "right" }}>
                  <button onClick={() => setPickReportBehavior(false)} style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.05)", color: "white",
                    border: "1px solid rgba(255,255,255,0.15)",
                    fontWeight: 700, cursor: "pointer", fontSize: 12,
                  }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* QUICK BEHAVIOR LOG */}
        <Section title="📈 Quick log a behavior" count={visibleDefs.length}>
          {visibleDefs.length === 0 ? (
            <Empty>No behaviors defined yet. Open /star → 📈 Behavior to add some.</Empty>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {visibleDefs.map((d) => {
                const c = d.tone === "positive" ? "#10b981" : d.tone === "challenge" ? "#f59e0b" : "#3b82f6";
                const todayN = todayCounts[d.id] || 0;
                let pressTimer: number | null = null;
                return (
                  <button
                    key={d.id}
                    onClick={() => recordBehavior(d.id)}
                    onMouseDown={() => { pressTimer = window.setTimeout(() => openNoteDialog(d.id), 600); }}
                    onMouseUp={() => { if (pressTimer) window.clearTimeout(pressTimer); }}
                    onMouseLeave={() => { if (pressTimer) window.clearTimeout(pressTimer); }}
                    onTouchStart={() => { pressTimer = window.setTimeout(() => openNoteDialog(d.id), 600); }}
                    onTouchEnd={() => { if (pressTimer) window.clearTimeout(pressTimer); }}
                    onContextMenu={(e) => { e.preventDefault(); openNoteDialog(d.id); }}
                    title="Tap to log · long-press for a note"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      padding: "10px 14px", borderRadius: 999,
                      background: `${c}1a`,
                      border: `1.5px solid ${c}77`,
                      color: "#fce7f3",
                      cursor: "pointer", fontSize: 14, fontWeight: 800,
                      touchAction: "manipulation",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{d.emoji}</span>
                    <span>{d.label}</span>
                    {todayN > 0 && (
                      <span style={{ marginLeft: 4, padding: "2px 8px", borderRadius: 999, background: c, color: "white", fontSize: 11, fontWeight: 900 }}>{todayN}</span>
                    )}
                  </button>
                );
              })}
              <button onClick={() => openNoteDialog("")} style={{
                padding: "10px 14px", borderRadius: 999,
                background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.10))",
                border: "1.5px solid rgba(168,85,247,0.45)",
                color: "#fce7f3",
                cursor: "pointer", fontSize: 13, fontWeight: 800,
              }}>📝 Free-text note</button>
            </div>
          )}
        </Section>

        {/* NOTE DIALOG */}
        {noteOpen && (
          <div style={{
            padding: 12, marginBottom: 14, borderRadius: 12,
            background: "rgba(245,158,11,0.10)",
            border: "1.5px solid rgba(245,158,11,0.45)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#fde68a", marginBottom: 6 }}>
              {noteDefId
                ? `Add a note for: ${defs.find((d) => d.id === noteDefId)?.emoji} ${defs.find((d) => d.id === noteDefId)?.label}`
                : "Write a behavior log entry"}
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="What happened? What you tried? Use the kid's exact words if possible…"
              autoFocus
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                background: "rgba(0,0,0,0.30)", color: "white",
                border: "1px solid rgba(168,85,247,0.25)",
                fontSize: 13, outline: "none", boxSizing: "border-box",
                resize: "vertical", fontFamily: "inherit", marginBottom: 8,
              }}
            />
            {!noteDefId && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 6 }}>
                  Pick the behavior:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {visibleDefs.map((d) => {
                    const sel = noteDefId === d.id;
                    const c = d.tone === "positive" ? "#10b981" : d.tone === "challenge" ? "#f59e0b" : "#3b82f6";
                    return (
                      <button key={d.id} onClick={() => setNoteDefId(d.id)} style={{
                        padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800,
                        background: sel ? `${c}30` : "rgba(255,255,255,0.04)",
                        border: `1px solid ${sel ? c + "88" : "rgba(255,255,255,0.10)"}`,
                        color: sel ? c : "rgba(245,241,232,0.65)",
                        cursor: "pointer",
                      }}>{d.emoji} {d.label}</button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button onClick={() => { setNoteOpen(false); setNoteText(""); setNoteDefId(""); }} style={ghost()}>Cancel</button>
              <button onClick={submitNote} disabled={!noteDefId} style={primary(!noteDefId)}>Save log</button>
            </div>
          </div>
        )}

        {/* PENDING ASSIGNMENTS */}
        <Section title="📥 To do" count={pending.length}>
          {pending.length === 0 ? (
            <Empty>All caught up! No pending assignments.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pending.map((p) => (
                <div key={p.barcode} style={row()}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fce7f3" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>
                      {p.subject}{p.createdDate ? ` · created ${p.createdDate.slice(0, 10)}` : ""}
                    </div>
                  </div>
                  <code style={miniCode()}>{p.barcode}</code>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* RECENT GRADES */}
        <Section title="📊 Recent grades" count={graded.length}>
          {graded.length === 0 ? (
            <Empty>No graded work yet.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {graded.slice(0, 8).map((g, i) => {
                const c = g.counted ? letterGradeColor(g.letter) : "#94a3b8";
                return (
                  <div key={`${g.barcode}-${i}`} style={{
                    ...row(),
                    background: `linear-gradient(135deg, ${c}1a, rgba(0,0,0,0.30))`,
                    border: `1px solid ${c}55`,
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: `${c}25`, border: `1.5px solid ${c}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 900, color: c,
                      flexShrink: 0,
                    }}>{g.counted ? g.letter : "—"}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#fce7f3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>
                        {g.subject}{g.counted ? ` · ${g.pct}%` : ""}{g.date ? ` · ${g.date}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
              {graded.length > 8 && (
                <div style={{ textAlign: "center", fontSize: 11, color: "rgba(196,181,253,0.55)", fontWeight: 700, padding: 6 }}>
                  + {graded.length - 8} more · open /star → Reports for the full list
                </div>
              )}
            </div>
          )}
        </Section>

        <div style={{ marginTop: 12, fontSize: 10, opacity: 0.55, textAlign: "center" }}>
          Pulled from local STAR data · {studentId}
        </div>
      </div>

      {reportForDefId && (
        <BehaviorScanModal
          defId={reportForDefId}
          prePickedStudentId={studentId}
          onClose={() => { setReportForDefId(null); setLogTick((t) => t + 1); }}
        />
      )}
    </Backdrop>
  );
}

/* ── small UI helpers ───────────────────────────────────────────── */

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, backdropFilter: "blur(4px)",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 720 }}>
        {children}
      </div>
    </div>
  );
}

function panel(): React.CSSProperties {
  return {
    background: "radial-gradient(900px 600px at 0% 0%, rgba(168,85,247,0.16) 0%, transparent 55%), radial-gradient(700px 500px at 100% 100%, rgba(236,72,153,0.14) 0%, transparent 55%), linear-gradient(180deg, #1a0f2e 0%, #0a0414 100%)",
    border: "1px solid rgba(168,85,247,0.30)",
    borderRadius: 22,
    padding: 22,
    color: "#f5f1e8",
    maxHeight: "92vh",
    overflow: "auto",
    boxShadow: "0 28px 72px -10px rgba(168,85,247,0.45)",
  };
}
function titleStyle(): React.CSSProperties {
  return { fontSize: 24, fontWeight: 900, color: "#fce7f3", marginBottom: 8 };
}
function closeBtn(): React.CSSProperties {
  return {
    width: 40, height: 40, borderRadius: "50%",
    background: "rgba(168,85,247,0.10)", border: "1px solid rgba(168,85,247,0.30)",
    color: "#fce7f3", fontSize: 16, fontWeight: 700, cursor: "pointer",
    flexShrink: 0,
  };
}
function row(): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: 10,
    background: "rgba(0,0,0,0.30)",
    border: "1px solid rgba(168,85,247,0.20)",
  };
}
function code(): React.CSSProperties {
  return {
    fontFamily: "Menlo, monospace", fontSize: 12,
    background: "rgba(0,0,0,0.40)", padding: "2px 6px", borderRadius: 4,
    color: "#f9a8d4",
  };
}
function miniCode(): React.CSSProperties {
  return {
    fontFamily: "Menlo, monospace", fontSize: 10,
    background: "rgba(0,0,0,0.40)", padding: "2px 6px", borderRadius: 4,
    color: "rgba(196,181,253,0.65)", flexShrink: 0,
  };
}
function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: disabled ? "rgba(168,85,247,0.18)" : "linear-gradient(135deg, #6366f1, #a855f7, #ec4899)",
    color: "white", border: "none", fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14,
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
function ptsBtn(negative: boolean): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10, minWidth: 56,
    background: negative
      ? "linear-gradient(135deg, rgba(239,68,68,0.30), rgba(239,68,68,0.10))"
      : "linear-gradient(135deg, rgba(16,185,129,0.30), rgba(16,185,129,0.10))",
    border: `1.5px solid ${negative ? "rgba(239,68,68,0.55)" : "rgba(16,185,129,0.55)"}`,
    color: negative ? "#fca5a5" : "#bbf7d0",
    fontWeight: 900, fontSize: 14, cursor: "pointer",
    fontFamily: "Menlo, monospace",
  };
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 10,
      background: "rgba(0,0,0,0.30)",
      border: `1px solid ${accent}55`,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase",
        color: "rgba(196,181,253,0.85)", marginBottom: 8,
      }}>
        {title} {count > 0 && <span style={{ color: "#f9a8d4" }}>· {count}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: 12, borderRadius: 10, textAlign: "center",
      background: "rgba(0,0,0,0.20)",
      border: "1px dashed rgba(168,85,247,0.20)",
      color: "rgba(196,181,253,0.55)", fontSize: 12, fontWeight: 700,
    }}>{children}</div>
  );
}
