// Teacher console for the ClassroomBoard. Big, bold, room-friendly UI
// for the projector/board now that iPads are away. Two main flows:
//
//   1. Manual Progress — tally how many assignments each kid has done
//      (paper work). Numbers feed the board's per-student progress bar.
//
//   2. Store — kid walks up, taps avatar, types their 4-digit PIN,
//      picks an item, redeems. PIN check goes to the server; teacher
//      stays in control of when the store is open.

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import PinPad from "./PinPad.tsx";

/** Open a print-ready sheet of "Hi {Name}, your PIN is {1234}" cards.
 *  3-up grid, big readable PIN, one card per kid. New window so the
 *  user can preview, hit ⌘P, and close without losing the console. */
function printPinCards(rows: Array<{ name: string; kiosk_pin: string | null; avatar_emoji: string | null }>): void {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  const cardsHtml = rows.map((r) => `
    <div class="card">
      <div class="emoji">${r.avatar_emoji || "🎒"}</div>
      <div class="hi">Hi ${escapeHtml(r.name.split(" ")[0])}!</div>
      <div class="label">Your store PIN</div>
      <div class="pin">${(r.kiosk_pin || "").split("").join(" ")}</div>
      <div class="footer">Tap your face on the board, then type your PIN.</div>
    </div>
  `).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Student PIN Cards</title>
    <style>
      @page { size: letter; margin: 0.4in; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 12px; background: white; color: #1a1915; }
      h1 { font-size: 14px; font-weight: 800; margin: 0 0 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #5a4632; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .card { border: 2px dashed #c8b690; border-radius: 14px; padding: 18px 14px; text-align: center;
              background: linear-gradient(180deg, #fffaed, #fef5dc); page-break-inside: avoid;
              box-shadow: inset 0 0 0 1px #fff; }
      .emoji { font-size: 38px; line-height: 1; }
      .hi { font-size: 18px; font-weight: 800; margin-top: 6px; color: #3a2410; }
      .label { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
               color: #7a5e3a; margin-top: 14px; }
      .pin { font-size: 38px; font-weight: 900; letter-spacing: 0.22em; margin-top: 6px;
             color: #b23a48; font-variant-numeric: tabular-nums; }
      .footer { font-size: 10px; color: #7a5e3a; margin-top: 14px; line-height: 1.4; }
      @media print { h1 { display: none; } body { padding: 0; } }
    </style></head><body>
    <h1>Student Store PINs · Print &amp; cut · ${rows.length} card${rows.length===1?"":"s"}</h1>
    <div class="grid">${cardsHtml}</div>
    <script>setTimeout(()=>window.print(), 300);</script>
  </body></html>`);
  w.document.close();
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

type Student = {
  id: string;
  name: string;
  avatar_emoji?: string | null;
  avatar_url?: string | null;
  dojo_points?: number;
};

type StoreItem = {
  id: string;
  name: string;
  emoji: string | null;
  price: number;
  stock: number | null;
  enabled: number;
};

interface Props {
  classId: string;
  students: Student[];
  /** If true, skip the tab UI and only show the Store. Used for the
   *  board's standalone Store button (no teacher PIN, kid-PIN only). */
  storeOnly?: boolean;
  onClose: () => void;
}

export default function BoardConsole({ classId, students, storeOnly = false, onClose }: Props) {
  const [tab, setTab] = useState<"progress" | "store" | "pins" | "points" | "spinner" | "groups" | "stars">(storeOnly ? "store" : "progress");

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{
        background: "linear-gradient(180deg, #0f172a 0%, #1e1b2e 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 22,
        width: "min(900px, 95vw)",
        maxHeight: "90vh",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        color: "#f5f1e8",
      }}>
        <header style={{
          padding: "18px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.45 }}>
              {storeOnly ? "Classroom Store" : "Teacher Console"}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
              {storeOnly
                ? "Tap your face to start"
                : tab === "progress" ? "Manual Progress" : "Classroom Store"}
            </div>
          </div>
          {!storeOnly && (
            <div style={{ display: "flex", gap: 6, padding: 4, background: "rgba(255,255,255,0.05)", borderRadius: 12, flexWrap: "wrap" }}>
              {(["progress", "points", "stars", "spinner", "groups", "store", "pins"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: tab === t ? "linear-gradient(135deg, #b23a48, #d97706)" : "transparent",
                    color: tab === t ? "white" : "rgba(245,241,232,0.65)",
                    fontWeight: 700, fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {t === "progress" ? "📋 Progress"
                    : t === "points" ? "🪙 Points"
                    : t === "stars" ? "⭐ Stars"
                    : t === "spinner" ? "🎲 Spinner"
                    : t === "groups" ? "👥 Groups"
                    : t === "store" ? "🛒 Store"
                    : "🔑 PINs"}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(245,241,232,0.7)",
              fontSize: 18, fontWeight: 700,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </header>

        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          {tab === "progress" && <ProgressTab classId={classId} students={students} />}
          {tab === "points"   && <PointsTab classId={classId} students={students} />}
          {tab === "stars"    && <StarsTab students={students} />}
          {tab === "spinner"  && <SpinnerTab students={students} />}
          {tab === "groups"   && <GroupsTab students={students} />}
          {tab === "store"    && <StoreTab classId={classId} students={students} />}
          {tab === "pins"     && <PinsTab classId={classId} />}
        </div>
      </div>
    </div>
  );
}

/* ── Manual progress tab ─────────────────────────────────────────── */

function ProgressTab({ classId, students }: { classId: string; students: Student[] }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  // Show "+N pts" badge that pops on the kid's card after save so the
  // teacher can SEE the points award happened.
  const [pointsFlash, setPointsFlash] = useState<{ id: string; pts: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getManualProgress(classId)
      .then((d) => {
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const r of d?.byStudent || []) next[r.student_id] = Number(r.count) || 0;
        setCounts(next);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [classId]);

  const adjust = async (s: Student, delta: number) => {
    const cur = counts[s.id] || 0;
    const next = Math.max(0, Math.min(99, cur + delta));
    if (next === cur) return;
    setSavingId(s.id);
    setCounts({ ...counts, [s.id]: next });
    try {
      const result = await api.setManualProgress(s.id, next);
      setSavedFlash(s.id);
      // Surface the dojo-points award so the teacher sees it
      if (typeof result.pointsDelta === "number" && result.pointsDelta !== 0) {
        setPointsFlash({ id: s.id, pts: result.pointsDelta });
        setTimeout(() => setPointsFlash((p) => p?.id === s.id ? null : p), 1800);
      }
      setTimeout(() => setSavedFlash((id) => id === s.id ? null : id), 1200);
    } catch {
      // Revert on failure
      setCounts({ ...counts, [s.id]: cur });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <style>{`
        @keyframes pointsPop {
          0%   { opacity: 0; transform: translateY(8px) scale(0.7); }
          25%  { opacity: 1; transform: translateY(-6px) scale(1.1); }
          70%  { opacity: 1; transform: translateY(-14px) scale(1); }
          100% { opacity: 0; transform: translateY(-30px) scale(0.95); }
        }
      `}</style>
      <div style={{ fontSize: 13, color: "rgba(245,241,232,0.55)", marginBottom: 18 }}>
        Tap + and − to tally assignments. Each one earns the kid <strong style={{ color: "#fde68a" }}>+1 🪙</strong> automatically.
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, opacity: 0.5 }}>Loading…</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}>
          {students.map((s) => {
            const count = counts[s.id] || 0;
            const initial = (s.name || "?")[0].toUpperCase();
            const flashing = savedFlash === s.id;
            return (
              <div key={s.id} style={{
                position: "relative",
                background: flashing
                  ? "linear-gradient(135deg, rgba(34,197,94,0.20), rgba(16,185,129,0.10))"
                  : "rgba(255,255,255,0.04)",
                border: flashing
                  ? "1px solid rgba(34,197,94,0.50)"
                  : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 12,
                transition: "background .25s, border .25s",
              }}>
                {/* +N pts pop — floats up + fades when teacher
                    awards points via the +/− buttons */}
                {pointsFlash?.id === s.id && (
                  <div style={{
                    position: "absolute",
                    top: -10, right: 16,
                    padding: "4px 10px", borderRadius: 999,
                    background: pointsFlash.pts > 0
                      ? "linear-gradient(135deg, #15803d, #22c55e)"
                      : "linear-gradient(135deg, #b91c1c, #ef4444)",
                    color: "white",
                    fontSize: 12, fontWeight: 900,
                    fontVariantNumeric: "tabular-nums",
                    boxShadow: "0 4px 12px rgba(34,197,94,0.45)",
                    pointerEvents: "none",
                    animation: "pointsPop 1.6s ease-out both",
                  }}>
                    {pointsFlash.pts > 0 ? "+" : ""}{pointsFlash.pts} pt{Math.abs(pointsFlash.pts)===1?"":"s"} 🪙
                  </div>
                )}
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "linear-gradient(135deg, #b23a48, #7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, color: "white", fontWeight: 800, flexShrink: 0,
                }}>{s.avatar_emoji || initial}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.55 }}>today</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={() => adjust(s, -1)}
                    disabled={savingId === s.id || count <= 0}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "white", fontSize: 18, fontWeight: 800,
                      cursor: count <= 0 ? "default" : "pointer",
                      opacity: count <= 0 ? 0.3 : 1,
                    }}
                  >−</button>
                  <div style={{
                    minWidth: 36, textAlign: "center",
                    fontSize: 22, fontWeight: 900,
                    fontVariantNumeric: "tabular-nums",
                    color: "#fde68a",
                  }}>{count}</div>
                  <button
                    onClick={() => adjust(s, 1)}
                    disabled={savingId === s.id}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: "linear-gradient(135deg, #b23a48, #d97706)",
                      border: "none",
                      color: "white", fontSize: 18, fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >+</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Stars tab — manage McDonald's progress per kid ─────────────── */
// Each kid's stars (0–5). 5 = "earned McDonald's" — the 🍔 pill on
// their roster card lights up automatically. Reset (after handing
// out McDonald's) by tapping the 🍔 button which clears their stars
// and bumps reward_count.

function StarsTab({ students }: { students: Student[] }) {
  const [stars, setStars] = useState<Record<string, number>>(
    Object.fromEntries(students.map((s: any) => [s.id, Number(s.behavior_stars) || 0]))
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const bump = async (s: Student, delta: number) => {
    const cur = stars[s.id] || 0;
    const next = Math.max(0, Math.min(5, cur + delta));
    if (next === cur) return;
    setBusyId(s.id);
    try {
      const r: any = await api.bumpStudentStars(s.id, delta);
      setStars((prev) => ({ ...prev, [s.id]: typeof r?.behavior_stars === "number" ? r.behavior_stars : next }));
      if (next === 5 && cur < 5) {
        setFlash(`🍔 ${s.name.split(" ")[0]} earned McDonald's!`);
        setTimeout(() => setFlash(null), 2400);
      }
    } catch {}
    setBusyId(null);
  };

  const reset = async (s: Student) => {
    if (!confirm(`Reset ${s.name.split(" ")[0]}'s stars after giving them McDonald's?`)) return;
    setBusyId(s.id);
    try {
      const r: any = await api.bumpStudentStars(s.id, -5);
      setStars((prev) => ({ ...prev, [s.id]: typeof r?.behavior_stars === "number" ? r.behavior_stars : 0 }));
      setFlash(`✓ ${s.name.split(" ")[0]} cashed in McDonald's`);
      setTimeout(() => setFlash(null), 1800);
    } catch {}
    setBusyId(null);
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: "rgba(245,241,232,0.65)", marginBottom: 18 }}>
        Tap stars to add or remove. <strong style={{ color: "#fde68a" }}>5 stars = McDonald's earned!</strong> 🍔 pill shows on their roster card. Tap 🍔 to reset stars after handing out the reward.
      </div>

      {flash && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 14,
          background: "linear-gradient(135deg, rgba(217,119,6,0.30), rgba(178,58,72,0.18))",
          border: "1px solid rgba(217,119,6,0.50)",
          color: "#fde68a", fontWeight: 800, fontSize: 14, textAlign: "center",
          animation: "pointsPop 1.4s ease-out both",
        }}>{flash}</div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}>
        {students.map((s) => {
          const count = stars[s.id] || 0;
          const isFull = count >= 5;
          const initial = (s.name || "?")[0].toUpperCase();
          return (
            <div key={s.id} style={{
              position: "relative",
              background: isFull
                ? "linear-gradient(135deg, rgba(217,119,6,0.18), rgba(178,58,72,0.10))"
                : "rgba(255,255,255,0.04)",
              border: isFull ? "1px solid rgba(217,119,6,0.55)" : "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: "14px 14px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: isFull
                  ? "linear-gradient(135deg, #fbbf24, #d97706)"
                  : "linear-gradient(135deg, #b23a48, #7c3aed)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, color: "white", fontWeight: 800, flexShrink: 0,
              }}>{s.avatar_emoji || initial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.name.split(" ")[0]}
                </div>
                <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        // Tap a star slot: if it's already filled, reduce to that index;
                        // if it's empty, set to that index + 1.
                        const target = i + 1;
                        const delta = target - count;
                        if (delta === 0) bump(s, -1);
                        else bump(s, delta);
                      }}
                      disabled={busyId === s.id}
                      style={{
                        fontSize: 22, lineHeight: 1,
                        background: "transparent", border: "none",
                        cursor: "pointer",
                        color: i < count ? (isFull ? "#fbbf24" : "#fcd34d") : "rgba(245,241,232,0.20)",
                        filter: i < count ? `drop-shadow(0 0 ${isFull ? 8 : 3}px rgba(251,191,36,${isFull ? 0.7 : 0.4}))` : "none",
                        padding: 2,
                        transition: "color .15s, filter .15s",
                      }}
                    >★</button>
                  ))}
                </div>
              </div>
              {isFull && (
                <button
                  onClick={() => reset(s)}
                  disabled={busyId === s.id}
                  title="Cashed in McDonald's — reset stars"
                  style={{
                    padding: "8px 12px", borderRadius: 999,
                    background: "linear-gradient(135deg, #dc2626, #f97316)",
                    border: "none", color: "white", fontSize: 12, fontWeight: 800,
                    cursor: "pointer",
                    flexShrink: 0,
                    boxShadow: "0 0 12px rgba(249,115,22,0.55)",
                  }}
                >🍔 Reset</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Spinner tab — pick a random kid, fun roulette animation ────── */

function SpinnerTab({ students }: { students: Student[] }) {
  const [spinning, setSpinning] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const [winner, setWinner] = useState<Student | null>(null);
  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set());

  const eligible = students.filter((s) => !excludeIds.has(s.id));

  const spin = () => {
    if (spinning || eligible.length === 0) return;
    setWinner(null);
    setSpinning(true);
    // Roulette: cycle through highlights, slowing down, landing on a random kid
    const targetIdx = Math.floor(Math.random() * eligible.length);
    let i = 0;
    const total = 24 + targetIdx; // enough cycles to look random
    let delay = 60;
    const step = () => {
      setHighlightIdx(i % eligible.length);
      i += 1;
      if (i >= total) {
        const finalIdx = (i - 1) % eligible.length;
        setHighlightIdx(finalIdx);
        setWinner(eligible[finalIdx]);
        setSpinning(false);
        return;
      }
      // Ease-out: slow down toward the end
      const remaining = total - i;
      delay = remaining < 8 ? delay + 30 : delay;
      setTimeout(step, delay);
    };
    step();
  };

  const reset = () => { setWinner(null); setHighlightIdx(null); };
  const exclude = (id: string) => {
    setExcludeIds((prev) => new Set([...prev, id]));
    setWinner(null);
    setHighlightIdx(null);
  };
  const reseed = () => {
    setExcludeIds(new Set());
    setWinner(null);
    setHighlightIdx(null);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "rgba(245,241,232,0.65)" }}>
          Pick a random student. Tap a name to exclude them from future spins.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {excludeIds.size > 0 && (
            <button
              onClick={reseed}
              style={{
                padding: "8px 14px", borderRadius: 999,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(245,241,232,0.85)", fontSize: 12, fontWeight: 700,
                cursor: "pointer",
              }}
            >🔄 Reset ({excludeIds.size})</button>
          )}
          <button
            onClick={spin}
            disabled={spinning || eligible.length === 0}
            style={{
              padding: "10px 22px", borderRadius: 999,
              background: spinning ? "rgba(255,255,255,0.10)" : "linear-gradient(135deg,#b23a48,#d97706)",
              border: "none", color: "white", fontSize: 14, fontWeight: 800,
              cursor: spinning || eligible.length === 0 ? "default" : "pointer",
              opacity: spinning || eligible.length === 0 ? 0.6 : 1,
            }}
          >🎲 {spinning ? "Spinning…" : "Spin!"}</button>
        </div>
      </div>

      {/* Big winner display */}
      {winner && (
        <div style={{
          marginBottom: 24, padding: "26px 24px", borderRadius: 18,
          background: "linear-gradient(135deg, rgba(217,119,6,0.18), rgba(178,58,72,0.10))",
          border: "1px solid rgba(217,119,6,0.50)",
          display: "flex", alignItems: "center", gap: 18,
          animation: "dbPop .4s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>
          <div style={{
            width: 84, height: 84, borderRadius: "50%",
            background: "linear-gradient(135deg, #b23a48, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 42, color: "white", fontWeight: 900,
            boxShadow: "0 0 24px rgba(178,58,72,0.55)",
          }}>{winner.avatar_emoji || winner.name[0].toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>
              You're up!
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fde68a", lineHeight: 1.05, marginTop: 4 }}>
              {winner.name}
            </div>
          </div>
          <button
            onClick={() => exclude(winner.id)}
            style={{
              padding: "10px 16px", borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(245,241,232,0.85)", fontSize: 12, fontWeight: 700,
              cursor: "pointer",
            }}
          >Exclude next time</button>
        </div>
      )}

      {/* Roulette grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: 10,
      }}>
        {students.map((s, i) => {
          const eligibleIdx = eligible.indexOf(s);
          const isHighlighted = highlightIdx === eligibleIdx && eligibleIdx >= 0;
          const isExcluded = excludeIds.has(s.id);
          const initial = (s.name || "?")[0].toUpperCase();
          return (
            <div
              key={s.id}
              onClick={() => !spinning && exclude(s.id)}
              style={{
                background: isHighlighted
                  ? "linear-gradient(135deg, #b23a48, #d97706)"
                  : isExcluded
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(255,255,255,0.04)",
                border: isHighlighted
                  ? "2px solid #fbbf24"
                  : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                padding: "14px 10px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                opacity: isExcluded ? 0.30 : 1,
                cursor: spinning ? "default" : "pointer",
                transform: isHighlighted ? "scale(1.06)" : "none",
                transition: "transform .12s, background .12s",
                textDecoration: isExcluded ? "line-through" : "none",
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "linear-gradient(135deg, #b23a48, #7c3aed)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, fontWeight: 800, color: "white",
              }}>{s.avatar_emoji || initial}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "white", textAlign: "center" }}>
                {s.name.split(" ")[0]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Groups tab — split the class into random groups of N ────────── */

function GroupsTab({ students }: { students: Student[] }) {
  const [groupSize, setGroupSize] = useState<number>(3);
  const [groups, setGroups] = useState<Student[][] | null>(null);

  const make = () => {
    const shuffled = [...students].sort(() => Math.random() - 0.5);
    const result: Student[][] = [];
    for (let i = 0; i < shuffled.length; i += groupSize) {
      result.push(shuffled.slice(i, i + groupSize));
    }
    setGroups(result);
  };

  const colors = [
    { from: "#b23a48", to: "#d97706" },
    { from: "#0f766e", to: "#10b981" },
    { from: "#7c3aed", to: "#4f46e5" },
    { from: "#dc2626", to: "#f97316" },
    { from: "#0284c7", to: "#0ea5e9" },
    { from: "#c026d3", to: "#a21caf" },
    { from: "#ca8a04", to: "#facc15" },
    { from: "#65a30d", to: "#84cc16" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "rgba(245,241,232,0.65)" }}>
          Shuffle the class into random groups for centers or pair work.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, opacity: 0.55, fontWeight: 700 }}>Group size:</span>
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setGroupSize(n)}
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: groupSize === n ? "linear-gradient(135deg,#b23a48,#d97706)" : "rgba(255,255,255,0.05)",
                border: groupSize === n ? "none" : "1px solid rgba(255,255,255,0.10)",
                color: "white", fontWeight: 800, fontSize: 14,
                cursor: "pointer",
              }}
            >{n}</button>
          ))}
          <button
            onClick={make}
            style={{
              padding: "10px 18px", borderRadius: 999,
              background: "linear-gradient(135deg,#b23a48,#d97706)",
              border: "none", color: "white", fontSize: 13, fontWeight: 800,
              cursor: "pointer",
              marginLeft: 8,
            }}
          >🎲 {groups ? "Re-shuffle" : "Make Groups"}</button>
        </div>
      </div>

      {!groups && (
        <div style={{
          textAlign: "center", padding: 60, opacity: 0.55,
          border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 14,
        }}>
          Pick a group size and tap "Make Groups".
        </div>
      )}

      {groups && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
        }}>
          {groups.map((g, gi) => {
            const c = colors[gi % colors.length];
            return (
              <div key={gi} style={{
                borderRadius: 16,
                background: `linear-gradient(160deg, ${c.from}33, ${c.to}11)`,
                border: `1px solid ${c.from}88`,
                padding: "14px 16px",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: c.from,
                  marginBottom: 4,
                }}>Group {gi + 1}</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
                  {g.length} {g.length === 1 ? "student" : "students"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {g.map((s) => (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 10,
                      background: "rgba(255,255,255,0.04)",
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, fontWeight: 800, color: "white",
                      }}>{s.avatar_emoji || s.name[0].toUpperCase()}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{s.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Points tab — hand out (or take away) dojo points per kid ────── */
// Quick deltas: −5, −1, +1, +5, +10. Live balance reads from the
// leaderboard so teachers see updates immediately. Bulk action lets
// the teacher reward the whole class at once.

function PointsTab({ classId, students }: { classId: string; students: Student[] }) {
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const loadBalances = async () => {
    try {
      const lb: any[] = await api.getLeaderboard();
      const next: Record<string, number> = {};
      for (const r of lb) next[r.user_id] = Number(r.dojo_points) || 0;
      setBalances(next);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadBalances(); }, []);

  const adjust = async (s: Student, delta: number) => {
    setBusyId(s.id);
    try {
      const r = await api.adjustStudentPoints(s.id, delta);
      setBalances((b) => ({ ...b, [s.id]: r.dojo_points }));
      setFlash(`${delta > 0 ? "+" : ""}${delta} → ${s.name.split(" ")[0]}`);
      setTimeout(() => setFlash(null), 1200);
    } catch (e: any) {
      setFlash(`Error: ${e?.message || "failed"}`);
      setTimeout(() => setFlash(null), 2000);
    }
    setBusyId(null);
  };

  const bulkAdjust = async (delta: number) => {
    if (!confirm(`${delta > 0 ? "Award" : "Remove"} ${Math.abs(delta)} pts ${delta > 0 ? "to" : "from"} every student?`)) return;
    setBusyId("__bulk__");
    try {
      await api.adjustClassPoints(classId, delta);
      await loadBalances();
      setFlash(`${delta > 0 ? "+" : ""}${delta} → whole class`);
      setTimeout(() => setFlash(null), 1500);
    } catch {}
    setBusyId(null);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "rgba(245,241,232,0.65)" }}>
          Tap a delta to award (or remove) points. Whole-class bulk on the right.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[-1, 1, 5].map((d) => (
            <button
              key={d}
              onClick={() => bulkAdjust(d)}
              disabled={busyId === "__bulk__"}
              style={{
                padding: "8px 12px", borderRadius: 999,
                background: d > 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
                border: d > 0 ? "1px solid rgba(34,197,94,0.40)" : "1px solid rgba(239,68,68,0.40)",
                color: d > 0 ? "#86efac" : "#fca5a5",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >👥 {d > 0 ? "+" : ""}{d} all</button>
          ))}
        </div>
      </div>

      {flash && (
        <div style={{
          padding: "8px 14px", borderRadius: 10, marginBottom: 14,
          background: flash.startsWith("Error")
            ? "rgba(239,68,68,0.18)"
            : "rgba(34,197,94,0.18)",
          border: flash.startsWith("Error")
            ? "1px solid rgba(239,68,68,0.4)"
            : "1px solid rgba(34,197,94,0.4)",
          color: flash.startsWith("Error") ? "#fca5a5" : "#bbf7d0",
          fontWeight: 700, fontSize: 13,
        }}>{flash}</div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, opacity: 0.5 }}>Loading…</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}>
          {students.map((s) => {
            const initial = (s.name || "?")[0].toUpperCase();
            const bal = balances[s.id] || 0;
            return (
              <div key={s.id} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                padding: "14px 14px",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: "linear-gradient(135deg, #b23a48, #7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: "white", fontWeight: 800, flexShrink: 0,
                }}>{s.avatar_emoji || initial}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name.split(" ")[0]}</div>
                  <div style={{
                    fontSize: 16, fontWeight: 900, color: "#fde68a",
                    fontVariantNumeric: "tabular-nums",
                  }}>🪙 {bal}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[-1, 1, 5, 10].map((d) => (
                    <button
                      key={d}
                      onClick={() => adjust(s, d)}
                      disabled={busyId === s.id}
                      style={{
                        width: 38, height: 38, borderRadius: 8,
                        background: d > 0
                          ? "linear-gradient(135deg, #15803d, #22c55e)"
                          : "rgba(239,68,68,0.10)",
                        border: d > 0 ? "none" : "1px solid rgba(239,68,68,0.40)",
                        color: d > 0 ? "white" : "#fca5a5",
                        fontSize: 13, fontWeight: 800,
                        cursor: "pointer",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >{d > 0 ? "+" : ""}{d}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── PINs tab — teacher manages each kid's 4-digit kiosk PIN ─────── */
// Exported so the AdminDashboard can drop the same UI into its own page.

export function PinsTab({ classId }: { classId: string }) {
  const [list, setList] = useState<Array<{ id: string; name: string; kiosk_pin: string | null; avatar_emoji: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  const refresh = async () => {
    try {
      const rows = await api.getStudentPins(classId);
      setList(rows);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [classId]);

  const generateAll = async () => {
    if (!confirm("Generate a random PIN for every student who doesn't have one yet?")) return;
    setBusyId("__all__");
    try {
      await api.generateMissingPins(classId);
      await refresh();
    } catch {}
    setBusyId(null);
  };
  const regenerate = async (s: { id: string; name: string }) => {
    setBusyId(s.id);
    try {
      const r = await api.setStudentPin(s.id);
      setList((prev) => prev.map((row) => row.id === s.id ? { ...row, kiosk_pin: r.pin } : row));
    } catch {}
    setBusyId(null);
  };
  const saveCustom = async (s: { id: string }) => {
    const pin = draft.replace(/\D/g, "");
    if (pin.length < 3) { setEditing(null); return; }
    setBusyId(s.id);
    try {
      const r = await api.setStudentPin(s.id, pin);
      setList((prev) => prev.map((row) => row.id === s.id ? { ...row, kiosk_pin: r.pin } : row));
      setEditing(null);
      setDraft("");
    } catch {}
    setBusyId(null);
  };

  const missing = list.filter((s) => !s.kiosk_pin).length;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 18, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 13, color: "rgba(245,241,232,0.65)" }}>
          Each student needs a 4-digit PIN to redeem from the board store.
          {missing > 0 && <> <span style={{ color: "#fcd34d", fontWeight: 700 }}>{missing} student{missing===1?"":"s"} still need one.</span></>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setReveal((v) => !v)}
            style={{
              padding: "8px 14px", borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(245,241,232,0.85)", fontSize: 12, fontWeight: 700,
              cursor: "pointer",
            }}
          >{reveal ? "🙈 Hide" : "👁 Show PINs"}</button>
          <button
            onClick={() => printPinCards(list.filter((s) => !!s.kiosk_pin))}
            disabled={list.filter((s) => !!s.kiosk_pin).length === 0}
            title="Open a printable sheet of PIN cards in a new window"
            style={{
              padding: "8px 14px", borderRadius: 999,
              background: "rgba(124,58,237,0.18)",
              border: "1px solid rgba(124,58,237,0.40)",
              color: "#c4b5fd", fontSize: 12, fontWeight: 700,
              cursor: list.filter((s) => !!s.kiosk_pin).length === 0 ? "default" : "pointer",
              opacity: list.filter((s) => !!s.kiosk_pin).length === 0 ? 0.4 : 1,
            }}
          >🖨 Print Cards</button>
          {missing > 0 && (
            <button
              onClick={generateAll}
              disabled={busyId === "__all__"}
              style={{
                padding: "8px 14px", borderRadius: 999,
                background: "linear-gradient(135deg,#b23a48,#d97706)",
                border: "none", color: "white", fontSize: 12, fontWeight: 800,
                cursor: "pointer",
              }}
            >🎲 Generate Missing</button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, opacity: 0.5 }}>Loading…</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}>
          {list.map((s) => {
            const initial = (s.name || "?")[0].toUpperCase();
            const has = !!s.kiosk_pin;
            const pin = s.kiosk_pin || "";
            const isEditing = editing === s.id;
            return (
              <div key={s.id} style={{
                background: "rgba(255,255,255,0.04)",
                border: has ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(252,211,77,0.40)",
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "linear-gradient(135deg, #b23a48, #7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, color: "white", fontWeight: 800, flexShrink: 0,
                }}>{s.avatar_emoji || initial}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                  {isEditing ? (
                    <input
                      autoFocus type="password" inputMode="numeric" maxLength={6}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveCustom(s); if (e.key === "Escape") { setEditing(null); setDraft(""); } }}
                      onBlur={() => saveCustom(s)}
                      placeholder="••••"
                      style={{
                        width: "90%", marginTop: 4, padding: "4px 8px",
                        fontSize: 18, fontVariantNumeric: "tabular-nums",
                        letterSpacing: "0.2em", textAlign: "center",
                        borderRadius: 6, border: "1px solid rgba(255,255,255,0.20)",
                        background: "rgba(0,0,0,0.40)", color: "white", outline: "none",
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => { if (has) { setEditing(s.id); setDraft(pin); } }}
                      title={has ? "Click to change" : "Not set"}
                      style={{
                        fontSize: 22, fontWeight: 900,
                        fontVariantNumeric: "tabular-nums", letterSpacing: "0.18em",
                        color: has ? "#fde68a" : "rgba(245,241,232,0.35)",
                        cursor: has ? "pointer" : "default",
                      }}
                    >{has ? (reveal ? pin : "••••") : "— not set —"}</div>
                  )}
                </div>
                <button
                  onClick={() => regenerate(s)}
                  disabled={busyId === s.id}
                  title={has ? "Generate a new PIN" : "Assign a PIN"}
                  style={{
                    padding: "8px 12px", borderRadius: 8,
                    background: has ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#b23a48,#d97706)",
                    border: has ? "1px solid rgba(255,255,255,0.15)" : "none",
                    color: "white", fontSize: 12, fontWeight: 800,
                    cursor: "pointer", flexShrink: 0,
                  }}
                >{has ? "🎲 New" : "🎲 Set"}</button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 18, padding: "10px 14px", background: "rgba(15,118,110,0.10)", borderRadius: 10, fontSize: 12, color: "rgba(167,243,208,0.9)" }}>
        💡 Tip: Click "👁 Show PINs" to reveal them, write each on a card for the kid, then hide again. Tap any 4-digit PIN to type a custom one.
      </div>
    </div>
  );
}

/* ── Store tab — pick student → enter PIN → pick item ─────────────── */

function StoreTab({ classId: _classId, students }: { classId: string; students: Student[] }) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [picked, setPicked] = useState<Student | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    api.getStoreItems().then(setItems).catch(() => {});
  }, []);

  const reset = () => {
    setPicked(null);
    setPin("");
    setPinError("");
    setPinVerified(false);
    setBalance(0);
  };

  const showFlash = (kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 2800);
  };

  const verifyPin = async () => {
    if (!picked || !pin || pin.length < 3) return;
    // We piggy-back on the redeem call by trying a $0 free redemption —
    // simpler to just verify by attempting; if PIN is wrong, server
    // returns 401. To avoid burning an item, do a tiny GET-style check:
    // load the kid's own balance via a separate auth-less endpoint
    // (none exists), so we mark "verified" once they pick an item and
    // the redeem succeeds. Until then, store the PIN locally.
    setPinVerified(true);
    setPinError("");
    // We don't actually know their balance until they redeem something;
    // hide it for now or fetch via the leaderboard.
    try {
      const lb: any[] = await api.getLeaderboard();
      const me = lb.find((r: any) => r.user_id === picked.id);
      setBalance(me?.dojo_points ?? 0);
    } catch {}
  };

  const redeem = async (item: StoreItem) => {
    if (!picked || !pin) return;
    if (item.stock != null && item.stock <= 0) {
      showFlash("err", `${item.name} is out of stock`);
      return;
    }
    setBusyItemId(item.id);
    try {
      const r = await api.boardRedeem(picked.id, pin, item.id);
      setBalance(r.dojo_points);
      showFlash("ok", `🎉 ${r.student_name} got ${r.item_name}! Show the teacher.`);
      // 🔔 ka-ching — synthesized via Web Audio API so we don't need
      // to ship an mp3. Two quick chimes, descending, bright timbre.
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playTone = (freq: number, when: number, dur = 0.18) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = freq;
          osc.type = "triangle";
          gain.gain.setValueAtTime(0, ctx.currentTime + when);
          gain.gain.linearRampToValueAtTime(0.30, ctx.currentTime + when + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + when);
          osc.stop(ctx.currentTime + when + dur + 0.02);
        };
        playTone(1318, 0);     // E6
        playTone(1760, 0.10);  // A6
        setTimeout(() => ctx.close().catch(() => {}), 600);
      } catch { /* audio best-effort */ }
      // Refresh items in case stock dropped
      try { setItems(await api.getStoreItems()); } catch {}
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (/wrong pin/i.test(msg)) {
        setPinError("Wrong PIN — try again");
        setPinVerified(false);
        setPin("");
      } else {
        showFlash("err", msg);
      }
    } finally {
      setBusyItemId(null);
    }
  };

  // Step 1: pick a student
  if (!picked) {
    return (
      <div>
        <div style={{ fontSize: 13, color: "rgba(245,241,232,0.55)", marginBottom: 18 }}>
          Tap your avatar to start. You'll need your 4-digit PIN.
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
        }}>
          {students.map((s) => {
            const initial = (s.name || "?")[0].toUpperCase();
            return (
              <button
                key={s.id}
                onClick={() => { setPicked(s); setPin(""); setPinError(""); setPinVerified(false); }}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 16,
                  padding: "18px 14px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                  cursor: "pointer",
                  color: "white",
                  transition: "transform .15s, background .15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(178,58,72,0.15)"; (e.currentTarget as HTMLElement).style.transform = "scale(1.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.transform = ""; }}
              >
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: "linear-gradient(135deg, #b23a48, #7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 32, fontWeight: 800,
                }}>{s.avatar_emoji || initial}</div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{s.name.split(" ")[0]}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Step 2: PIN entry
  if (!pinVerified) {
    return (
      <div style={{ maxWidth: 360, margin: "20px auto", textAlign: "center" }}>
        <div style={{
          width: 96, height: 96, borderRadius: "50%",
          background: "linear-gradient(135deg, #b23a48, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 48, fontWeight: 800,
          margin: "0 auto 14px",
        }}>{picked.avatar_emoji || picked.name[0].toUpperCase()}</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Hi {picked.name.split(" ")[0]}!</div>
        <div style={{ fontSize: 13, color: "rgba(245,241,232,0.55)", marginBottom: 22 }}>
          Type your 4-digit PIN to open the store.
        </div>
        <PinPad
          value={pin}
          onChange={(v) => { setPin(v); setPinError(""); }}
          onSubmit={verifyPin}
          maxLength={6}
          size="lg"
          warm
        />
        {pinError && <div style={{ fontSize: 13, color: "#fca5a5", marginTop: 14 }}>{pinError}</div>}
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={reset}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 12,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(245,241,232,0.70)", fontWeight: 700, cursor: "pointer",
            }}
          >← Back</button>
          <button
            onClick={verifyPin}
            disabled={pin.length < 3}
            style={{
              flex: 2, padding: "12px 0", borderRadius: 12,
              background: pin.length < 3 ? "rgba(255,255,255,0.10)" : "linear-gradient(135deg,#b23a48,#d97706)",
              border: "none", color: "white", fontWeight: 800,
              cursor: pin.length < 3 ? "default" : "pointer",
              opacity: pin.length < 3 ? 0.5 : 1,
            }}
          >Open Store →</button>
        </div>
      </div>
    );
  }

  // Step 3: catalog
  return (
    <div>
      {flash && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 14,
          background: flash.kind === "ok" ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)",
          border: flash.kind === "ok" ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(239,68,68,0.4)",
          color: flash.kind === "ok" ? "#bbf7d0" : "#fca5a5",
          fontWeight: 700, fontSize: 13,
        }}>{flash.text}</div>
      )}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 18,
        padding: "10px 14px", borderRadius: 12,
        background: "rgba(217,119,6,0.10)",
        border: "1px solid rgba(217,119,6,0.30)",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: "linear-gradient(135deg, #b23a48, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 800,
        }}>{picked.avatar_emoji || picked.name[0].toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{picked.name.split(" ")[0]}</div>
          <div style={{ fontSize: 11, opacity: 0.55 }}>{balance} pts available</div>
        </div>
        <button
          onClick={reset}
          style={{
            padding: "8px 14px", borderRadius: 999,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(245,241,232,0.7)", fontSize: 12, fontWeight: 700,
            cursor: "pointer",
          }}
        >Switch student</button>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 12,
      }}>
        {items.filter((it) => it.enabled).map((it) => {
          const canAfford = balance >= it.price;
          const oos = it.stock != null && it.stock <= 0;
          const disabled = !canAfford || oos || busyItemId === it.id;
          return (
            <button
              key={it.id}
              onClick={() => redeem(it)}
              disabled={disabled}
              style={{
                background: canAfford && !oos
                  ? "linear-gradient(135deg, rgba(217,119,6,0.18), rgba(178,58,72,0.10))"
                  : "rgba(255,255,255,0.04)",
                border: canAfford && !oos
                  ? "1px solid rgba(217,119,6,0.50)"
                  : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                padding: "16px 14px",
                color: "white",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.5 : 1,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                transition: "transform .15s",
              }}
              onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = "scale(1.03)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            >
              <div style={{ fontSize: 36, lineHeight: 1 }}>{it.emoji || "🎁"}</div>
              <div style={{ fontSize: 14, fontWeight: 800, textAlign: "center" }}>{it.name}</div>
              <div style={{
                fontSize: 12, fontWeight: 700,
                color: canAfford && !oos ? "#fde68a" : "rgba(245,241,232,0.55)",
                fontVariantNumeric: "tabular-nums",
              }}>
                {oos ? "Out of stock"
                  : !canAfford ? `Need ${it.price - balance} more`
                  : busyItemId === it.id ? "Redeeming…"
                  : `${it.price} pts`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
