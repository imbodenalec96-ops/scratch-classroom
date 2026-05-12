// Behavior Scan Modal — opens when a BH-{defId} barcode is scanned.
// Shows the behavior + a roster grid; tap a kid to log the instance
// (with optional note + optional point reward). Same data path as
// the BehaviorTracker tab — entries appear in the per-kid frequency
// report immediately.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore,
  type StarStudent, type BehaviorDef,
} from "../../lib/star/storage.ts";
import { api } from "../../lib/api.ts";
import { successBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";

interface Props {
  defId: string;
  onClose: () => void;
}

const TONE_COLOR: Record<BehaviorDef["tone"], string> = {
  positive:  "#10b981",
  neutral:   "#3b82f6",
  challenge: "#f59e0b",
};

export default function BehaviorScanModal({ defId, onClose }: Props) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [defs] = useState<BehaviorDef[]>(() => StarStore.getBehaviorDefs());
  const def = useMemo(() => defs.find((d) => d.id === defId), [defs, defId]);
  const [pickedStudentId, setPickedStudentId] = useState<string>("");
  const [note, setNote] = useState("");
  const [pointDelta, setPointDelta] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const showFlash = (kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 1800);
  };

  const submit = async () => {
    if (!def || !pickedStudentId) return;
    setBusy(true);
    try {
      StarStore.recordBehavior(def.id, pickedStudentId, note.trim() || undefined);
      loggedBeep();
      if (pointDelta !== 0) {
        try { await api.addPoints(pickedStudentId, pointDelta); } catch {}
      }
      const stu = students.find((s) => s.id === pickedStudentId);
      showFlash("ok", `Logged · ${def.emoji} ${def.label}${pointDelta !== 0 ? ` (${pointDelta > 0 ? "+" : ""}${pointDelta} pts)` : ""} for ${stu?.firstName || "kid"}`);
      // Reset for next scan-loop entry
      setNote("");
      setPointDelta(0);
      setPickedStudentId("");
      // Auto-close after the flash so the teacher can scan again.
      setTimeout(() => onClose(), 700);
    } catch (e: any) {
      errorBeep();
      showFlash("err", `Failed: ${e?.message || "couldn't save"}`);
    } finally {
      setBusy(false);
    }
  };

  // Quick "tap to log" — single tap on a roster card logs the
  // behavior with no note and no points. Held tap (long-press)
  // expands the panel to add a note + points.
  const quickLog = (sid: string) => {
    if (!def) return;
    StarStore.recordBehavior(def.id, sid);
    loggedBeep();
    successBeep();
    const stu = students.find((s) => s.id === sid);
    showFlash("ok", `Logged · ${def.emoji} ${def.label} for ${stu?.firstName || "kid"}`);
    setTimeout(() => onClose(), 600);
  };

  if (!def) {
    return (
      <Backdrop onClose={onClose}>
        <div style={panel()}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fce7f3", marginBottom: 8 }}>Behavior not found</h1>
          <p style={{ color: "rgba(196,181,253,0.65)", marginBottom: 12 }}>
            That barcode doesn't match any behavior definition. Open <b>/star → 📈 Behavior</b> to add it.
          </p>
          <button onClick={onClose} style={primary(false)}>Close</button>
        </div>
      </Backdrop>
    );
  }

  const c = TONE_COLOR[def.tone];
  // Filter the roster down — if this is a per-student behavior, only
  // show that one kid (auto-pick them).
  const eligible = def.scope === "student" && def.studentId
    ? students.filter((s) => s.id === def.studentId)
    : students;

  return (
    <Backdrop onClose={onClose}>
      <div style={panel()}>
        {/* HERO — the behavior chip you scanned */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
          borderRadius: 14, marginBottom: 14,
          background: `${c}1a`,
          border: `1.5px solid ${c}77`,
        }}>
          <div style={{ fontSize: 42, lineHeight: 1 }}>{def.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: c, marginBottom: 4 }}>
              📈 Log behavior
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fce7f3" }}>{def.label}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtn()}>✕</button>
        </div>

        {flash && (
          <div role="status" aria-live="polite" style={{
            padding: "10px 14px", borderRadius: 10, marginBottom: 12,
            background: flash.kind === "ok" ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)",
            border: `1px solid ${flash.kind === "ok" ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"}`,
            color: flash.kind === "ok" ? "#bbf7d0" : "#fca5a5",
            fontWeight: 800, fontSize: 13, textAlign: "center",
          }}>{flash.text}</div>
        )}

        {/* Roster — tap kid to log instantly OR pick + add note/points */}
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "rgba(196,181,253,0.65)", marginBottom: 8,
        }}>
          Tap a kid to log instantly · or pick + add note/points below
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 8, marginBottom: 16,
        }}>
          {eligible.map((s) => {
            const sel = pickedStudentId === s.id;
            return (
              <div key={s.id} style={{ position: "relative" }}>
                <button
                  onClick={() => quickLog(s.id)}
                  onContextMenu={(e) => { e.preventDefault(); setPickedStudentId(s.id); }}
                  style={{
                    width: "100%", padding: "12px 8px", borderRadius: 12,
                    background: sel
                      ? `${c}25`
                      : "linear-gradient(180deg, rgba(168,85,247,0.10) 0%, rgba(99,102,241,0.05) 100%)",
                    border: sel ? `2px solid ${c}` : "1px solid rgba(168,85,247,0.30)",
                    color: "#fce7f3", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    touchAction: "manipulation",
                  }}
                  title="Tap to log instantly · long-press / right-click to add note + points"
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 900, color: "white",
                  }}>{(s.firstName || "?")[0].toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{s.firstName}</div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setPickedStudentId(s.id); }}
                  style={{
                    position: "absolute", top: 4, right: 4,
                    width: 22, height: 22, borderRadius: 6,
                    background: "rgba(0,0,0,0.30)",
                    border: "1px solid rgba(168,85,247,0.30)",
                    color: "rgba(196,181,253,0.85)",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
                  }}
                  aria-label="Pick + add note"
                  title="Pick + add note + points"
                >+</button>
              </div>
            );
          })}
        </div>

        {/* Picked-kid panel — note + point bonus, then save */}
        {pickedStudentId && (
          <div style={{
            padding: 14, borderRadius: 14,
            background: "rgba(168,85,247,0.10)",
            border: "1.5px solid rgba(168,85,247,0.45)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#fce7f3", marginBottom: 8 }}>
              Logging for: <span style={{ color: "#f9a8d4" }}>
                {students.find((s) => s.id === pickedStudentId)?.firstName} {students.find((s) => s.id === pickedStudentId)?.lastName}
              </span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional note — what happened, what worked"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                background: "rgba(0,0,0,0.30)", color: "white",
                border: "1px solid rgba(168,85,247,0.25)",
                fontSize: 13, outline: "none", boxSizing: "border-box",
                resize: "vertical", fontFamily: "inherit", marginBottom: 10,
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              <span style={{ alignSelf: "center", fontSize: 11, fontWeight: 800, color: "rgba(196,181,253,0.65)", marginRight: 4 }}>+pts:</span>
              {[0, 1, 2, 5, -1, -5].map((n) => (
                <button
                  key={n}
                  onClick={() => setPointDelta(n)}
                  style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: pointDelta === n
                      ? (n > 0 ? "rgba(16,185,129,0.30)" : n < 0 ? "rgba(239,68,68,0.30)" : "rgba(168,85,247,0.30)")
                      : "rgba(255,255,255,0.04)",
                    border: pointDelta === n
                      ? `1.5px solid ${n > 0 ? "#10b981" : n < 0 ? "#ef4444" : "#a855f7"}`
                      : "1px solid rgba(255,255,255,0.10)",
                    color: pointDelta === n
                      ? (n > 0 ? "#bbf7d0" : n < 0 ? "#fca5a5" : "#f9a8d4")
                      : "rgba(245,241,232,0.85)",
                    fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "Menlo, monospace",
                  }}
                >{n === 0 ? "—" : n > 0 ? `+${n}` : n}</button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button onClick={() => { setPickedStudentId(""); setNote(""); setPointDelta(0); }} style={ghost()}>Cancel</button>
              <button onClick={submit} disabled={busy} style={primary(busy)}>
                {busy ? "Saving…" : "✅ Save log"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Backdrop>
  );
}

/* ── tiny UI helpers ────────────────────────────────────────────── */

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
function closeBtn(): React.CSSProperties {
  return {
    width: 40, height: 40, borderRadius: "50%",
    background: "rgba(168,85,247,0.10)", border: "1px solid rgba(168,85,247,0.30)",
    color: "#fce7f3", fontSize: 16, fontWeight: 700, cursor: "pointer",
    flexShrink: 0,
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
