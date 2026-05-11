// Movement modal — pops when SPECIALS-OUT/IN or LUNCH-OUT/IN scans.
//
// OUT scan: shows roster grid → tap kid(s) to mark "out" with a
//           timestamp. Multi-pick lets you tag the whole group at once.
// IN  scan: shows the kids currently out → tap to bring them back.
//           Each row shows live elapsed minutes.

import { useEffect, useState } from "react";
import {
  StarStore,
  type StarStudent, type ActiveMovement,
} from "../../lib/star/storage.ts";
import { successBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";
import { fireStarBoardEvent } from "../../lib/star/boardEvents.ts";
import { Modal } from "./ui.tsx";

interface Props {
  kind: "specials" | "lunch";
  direction: "out" | "in";
  onClose: () => void;
}

const KIND_META = {
  specials: { icon: "🎨", label: "Specials" },
  lunch:    { icon: "🍱", label: "Lunch" },
} as const;

export default function MovementModal({ kind, direction, onClose }: Props) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [active, setActive] = useState<ActiveMovement[]>(() => StarStore.getActiveMovement());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(iv);
  }, []);

  const refresh = () => setActive(StarStore.getActiveMovement());
  const meta = KIND_META[kind];

  const start = (student: StarStudent) => {
    if (active.find((m) => m.studentId === student.id && m.kind === kind)) {
      errorBeep();
      return;
    }
    const studentName = `${student.firstName} ${student.lastName}`.trim();
    StarStore.startMovement({
      studentId: student.id, studentName, kind,
      startedAt: new Date().toISOString(),
    });
    refresh();
    successBeep();
    fireStarBoardEvent({
      kind: "movement-out" as any,
      studentName, studentId: student.id,
      detail: `${meta.icon} ${meta.label}`,
    });
  };

  const end = (m: ActiveMovement) => {
    const log = StarStore.endMovement(m.studentId, m.kind);
    refresh();
    loggedBeep();
    if (log) {
      const mins = Math.floor(log.elapsedSec / 60);
      fireStarBoardEvent({
        kind: "movement-in" as any,
        studentName: m.studentName, studentId: m.studentId,
        detail: `${meta.icon} ${meta.label} · ${mins} min`,
      });
    }
  };

  const fmtElapsed = (startedAt: string): string => {
    const elapsed = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
    const m = Math.floor(elapsed / 60);
    return m === 0 ? "<1m" : `${m}m`;
  };

  // Active for THIS kind only (don't conflate specials with lunch)
  const activeHere = active.filter((m) => m.kind === kind);

  return (
    <Modal
      onClose={onClose}
      kicker={`${meta.icon} ${meta.label}`}
      title={direction === "out" ? `Heading to ${meta.label}` : `Back from ${meta.label}`}
      width={560}
    >
      {direction === "out" ? (
        <>
          {activeHere.length > 0 && (
            <div style={hint()}>
              Already out for {meta.label.toLowerCase()}: <b>{activeHere.map((m) => m.studentName.split(" ")[0]).join(" · ")}</b>
            </div>
          )}
          <SectionPill icon="🎒">Tap kids leaving the room</SectionPill>
          <div style={{ marginTop: 8, ...gridStyle() }}>
            {students.map((s) => {
              const onIt = active.find((m) => m.studentId === s.id && m.kind === kind);
              return (
                <button
                  key={s.id}
                  onClick={() => start(s)}
                  disabled={!!onIt}
                  style={tile(!!onIt, "out")}
                >
                  {s.firstName}
                  {s.grade && <div style={subLabel()}>{s.grade}</div>}
                  {onIt && <div style={badgeOnIt()}>out</div>}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {activeHere.length === 0 ? (
            <div style={empty()}>
              No kids currently at {meta.label.toLowerCase()}. Scan {meta.icon} {meta.label}-OUT first.
            </div>
          ) : (
            <>
              <SectionPill icon="🚪">Tap each kid as they walk back in</SectionPill>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {activeHere.map((m) => (
                  <button
                    key={`${m.studentId}-${m.startedAt}`}
                    onClick={() => end(m)}
                    style={inRow()}
                  >
                    <div style={avatarStyle()}>{(m.studentName || "?").charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#fce7f3" }}>{m.studentName}</div>
                      <div style={{ fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>
                        out for {fmtElapsed(m.startedAt)}
                      </div>
                    </div>
                    <div style={inBadge()}>Mark in</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: "rgba(196,181,253,0.55)", fontWeight: 600 }}>
        💡 Scan {meta.icon} {meta.label}-{direction === "out" ? "IN" : "OUT"} to {direction === "out" ? "bring kids back" : "send a new group out"}.
      </div>
    </Modal>
  );
}

/* ── styling helpers ─────────────────────────────────────────────── */

function gridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
    gap: 8,
  };
}
function tile(disabled: boolean, _direction: "out" | "in"): React.CSSProperties {
  return {
    position: "relative",
    padding: "12px 8px", borderRadius: 12,
    background: disabled
      ? "rgba(168,85,247,0.06)"
      : "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
    border: disabled ? "1px solid rgba(168,85,247,0.18)" : "1px solid rgba(168,85,247,0.30)",
    color: disabled ? "rgba(196,181,253,0.45)" : "#fce7f3",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14, fontWeight: 800, minHeight: 64,
    touchAction: "manipulation",
  };
}
function subLabel(): React.CSSProperties {
  return { fontSize: 10, opacity: 0.65, marginTop: 3, fontWeight: 600 };
}
function badgeOnIt(): React.CSSProperties {
  return {
    fontSize: 9, marginTop: 4, color: "#f9a8d4", fontWeight: 700,
    letterSpacing: "0.18em", textTransform: "uppercase",
  };
}
function inRow(): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 12,
    padding: "10px 14px", borderRadius: 12,
    background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.08))",
    border: "1px solid rgba(168,85,247,0.40)",
    color: "#fce7f3", cursor: "pointer", textAlign: "left",
    width: "100%", touchAction: "manipulation",
  };
}
function inBadge(): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase",
    color: "#86efac",
    padding: "4px 10px", borderRadius: 999,
    background: "rgba(16,185,129,0.18)",
    border: "1px solid rgba(16,185,129,0.45)",
  };
}
function avatarStyle(): React.CSSProperties {
  return {
    width: 38, height: 38, borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: 16, color: "white", flexShrink: 0,
    boxShadow: "0 2px 8px -2px rgba(168,85,247,0.55)",
  };
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
function hint(): React.CSSProperties {
  return {
    padding: "10px 14px", borderRadius: 10, marginBottom: 12,
    background: "rgba(168,85,247,0.06)",
    border: "1px solid rgba(168,85,247,0.20)",
    color: "rgba(196,181,253,0.85)", fontSize: 12, fontWeight: 600,
  };
}
function empty(): React.CSSProperties {
  return {
    padding: "16px 18px", borderRadius: 12,
    background: "rgba(168,85,247,0.04)",
    border: "1px dashed rgba(168,85,247,0.25)",
    color: "rgba(196,181,253,0.65)", fontSize: 13, fontWeight: 600, textAlign: "center",
  };
}
