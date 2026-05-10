// Free-time modal — pops when a FREETIME-* barcode is scanned. Shows
// any kids currently on free time (so a second scan ends theirs)
// plus a student grid to start a new session at the selected duration.
//
// One active free-time session per student. End-by-second-scan or
// auto-pulse-red after the planned duration ends.

import { useEffect, useState } from "react";
import { StarStore, type StarStudent, type ActiveFreetime } from "../../lib/star/storage.ts";
import { successBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";
import { fireStarBoardEvent } from "../../lib/star/boardEvents.ts";
import { Modal } from "./ui.tsx";

interface Props {
  minutes: number;
  onClose: () => void;
}

export default function FreetimeModal({ minutes, onClose }: Props) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [active, setActive] = useState<ActiveFreetime[]>(() => StarStore.getActiveFreetime());
  const [now, setNow] = useState(Date.now());
  const [reason, setReason] = useState("");

  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  const refresh = () => setActive(StarStore.getActiveFreetime());

  const start = (student: StarStudent) => {
    if (active.find((f) => f.studentId === student.id)) {
      errorBeep();
      return;
    }
    const session: ActiveFreetime = {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      durationMin: minutes,
      startedAt: new Date().toISOString(),
      reason: reason.trim() || undefined,
    };
    StarStore.startFreetime(session);
    refresh();
    successBeep();
    fireStarBoardEvent({
      kind: "freetime-start" as any,
      studentName: session.studentName,
      studentId: session.studentId,
      detail: `${minutes} min${session.reason ? ` · ${session.reason}` : ""}`,
    });
  };

  const end = (studentId: string, studentName: string) => {
    const log = StarStore.endFreetime(studentId);
    refresh();
    loggedBeep();
    if (log) {
      const mins = Math.floor(log.elapsedSec / 60);
      const secs = log.elapsedSec % 60;
      fireStarBoardEvent({
        kind: "freetime-end" as any,
        studentName,
        studentId,
        detail: `${mins}:${String(secs).padStart(2, "0")}`,
      });
    }
  };

  const fmtElapsed = (startedAt: string): { mmss: string; over: boolean; pct: number } => {
    const elapsed = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const sess = active.find((f) => f.startedAt === startedAt);
    const total = (sess?.durationMin ?? minutes) * 60;
    return {
      mmss: `${m}:${String(s).padStart(2, "0")}`,
      over: elapsed >= total,
      pct: Math.min(100, Math.round((elapsed / total) * 100)),
    };
  };

  return (
    <Modal
      onClose={onClose}
      kicker="🎮 Free Time"
      title={`${minutes} min`}
      width={560}
    >
      {/* Active sessions */}
      {active.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionPill icon="⏱">
            On free time · {active.length}
          </SectionPill>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {active.map((f) => {
              const t = fmtElapsed(f.startedAt);
              return (
                <button
                  key={`${f.studentId}-${f.startedAt}`}
                  onClick={() => end(f.studentId, f.studentName)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 12,
                    background: t.over
                      ? "linear-gradient(135deg, rgba(239,68,68,0.22), rgba(236,72,153,0.10))"
                      : "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.08))",
                    border: t.over
                      ? "1px solid rgba(239,68,68,0.55)"
                      : "1px solid rgba(168,85,247,0.40)",
                    color: "#fce7f3", cursor: "pointer", textAlign: "left",
                    width: "100%", touchAction: "manipulation",
                    boxShadow: t.over ? "0 0 18px rgba(239,68,68,0.35)" : undefined,
                  }}
                  title="Tap to end this session"
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: 16, color: "white", flexShrink: 0,
                  }}>{(f.studentName || "?").charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{f.studentName}</div>
                    <div style={{ fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>
                      {f.durationMin} min planned{f.reason ? ` · ${f.reason}` : ""}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: "Menlo, monospace", fontWeight: 900, fontSize: 18,
                    color: t.over ? "#fecaca" : "#fce7f3",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {t.mmss}{t.over && <span style={{ marginLeft: 6, color: "#fca5a5", fontSize: 11 }}>· over</span>}
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase",
                    color: t.over ? "#fca5a5" : "rgba(196,181,253,0.65)",
                    padding: "4px 10px", borderRadius: 999,
                    background: t.over ? "rgba(239,68,68,0.18)" : "rgba(168,85,247,0.12)",
                    border: t.over ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(168,85,247,0.30)",
                  }}>End</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional reason */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 5 }}>
          Reason (optional)
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Earned for finishing math · Behavior plan reward · …"
          style={inp()}
        />
      </div>

      {/* Student picker */}
      <SectionPill icon="🎒">Pick a kid to start</SectionPill>
      <div style={{
        marginTop: 8,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: 8,
      }}>
        {students.map((s) => {
          const onIt = active.find((f) => f.studentId === s.id);
          return (
            <button
              key={s.id}
              onClick={() => start(s)}
              disabled={!!onIt}
              title={onIt ? "Already on free time" : `Start ${minutes} min for ${s.firstName}`}
              style={{
                padding: "12px 8px", borderRadius: 12,
                background: onIt
                  ? "rgba(168,85,247,0.06)"
                  : "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
                border: onIt
                  ? "1px solid rgba(168,85,247,0.18)"
                  : "1px solid rgba(168,85,247,0.30)",
                color: onIt ? "rgba(196,181,253,0.45)" : "#fce7f3",
                cursor: onIt ? "not-allowed" : "pointer",
                fontSize: 14, fontWeight: 800,
                minHeight: 64,
                touchAction: "manipulation",
              }}
            >
              {s.firstName}
              {s.grade && <div style={{ fontSize: 10, opacity: 0.65, marginTop: 3, fontWeight: 600 }}>{s.grade}</div>}
              {onIt && <div style={{ fontSize: 9, marginTop: 4, color: "#f9a8d4", fontWeight: 700 }}>on it</div>}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: "rgba(196,181,253,0.55)", fontWeight: 600 }}>
        💡 Scan FREETIME-X again at any point to end the session for a kid (just tap their row above).
      </div>
    </Modal>
  );
}

function SectionPill({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "4px 12px", borderRadius: 999,
      background: "rgba(168,85,247,0.10)",
      border: "1px solid rgba(168,85,247,0.30)",
      fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
      color: "#c4b5fd",
    }}>
      <span aria-hidden>{icon}</span>{children}
    </span>
  );
}

function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    background: "rgba(10,4,20,0.45)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 14, outline: "none", fontWeight: 600,
    boxSizing: "border-box",
  };
}
