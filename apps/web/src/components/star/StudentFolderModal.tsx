// Student Folder Modal — opens when a STU-{id} barcode is scanned
// (printed from the FolderLabelsGenerator). Shows the kid's pending
// assignments + recent grades + quick actions, all pulled from local
// STAR data so it works offline.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, countsTowardGrade, letterGradeColor,
  type StarStudent, type StarTrackerEntry,
} from "../../lib/star/storage.ts";

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
  const [student] = useState<StarStudent | null>(() => {
    const all = StarStore.getStudents();
    return all.find((s) => s.id === studentId) || null;
  });

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
