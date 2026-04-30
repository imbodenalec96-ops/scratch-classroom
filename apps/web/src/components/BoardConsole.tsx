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
  const [tab, setTab] = useState<"progress" | "store" | "pins">(storeOnly ? "store" : "progress");

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
            <div style={{ display: "flex", gap: 6, padding: 4, background: "rgba(255,255,255,0.05)", borderRadius: 12 }}>
              {(["progress", "store", "pins"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: tab === t ? "linear-gradient(135deg, #b23a48, #d97706)" : "transparent",
                    color: tab === t ? "white" : "rgba(245,241,232,0.65)",
                    fontWeight: 700, fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {t === "progress" ? "📋 Progress" : t === "store" ? "🛒 Store" : "🔑 PINs"}
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
      await api.setManualProgress(s.id, next);
      setSavedFlash(s.id);
      setTimeout(() => setSavedFlash((id) => id === s.id ? null : id), 800);
    } catch {
      // Revert on failure
      setCounts({ ...counts, [s.id]: cur });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: "rgba(245,241,232,0.55)", marginBottom: 18 }}>
        Tap + and − to tally how many assignments each student has finished today.
        Numbers add to the board's progress bar in real time.
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

/* ── PINs tab — teacher manages each kid's 4-digit kiosk PIN ─────── */

function PinsTab({ classId }: { classId: string }) {
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
        <input
          autoFocus type="password" inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") verifyPin(); }}
          placeholder="••••"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "16px 18px",
            fontSize: 28, letterSpacing: "0.3em",
            textAlign: "center",
            borderRadius: 14,
            border: pinError ? "1.5px solid #ef4444" : "1.5px solid rgba(255,255,255,0.20)",
            background: "rgba(0,0,0,0.30)",
            color: "white", outline: "none",
            marginBottom: pinError ? 8 : 16,
          }}
        />
        {pinError && <div style={{ fontSize: 13, color: "#fca5a5", marginBottom: 14 }}>{pinError}</div>}
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
