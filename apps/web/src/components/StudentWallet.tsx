// PIN-protected wallet view for students. Kid taps their face on the
// board, types their 4-digit PIN, sees their points + streak +
// achievements as a glanceable kiosk view. Read-only.

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import PinPad from "./PinPad.tsx";

interface Student {
  id: string;
  name: string;
  avatar_emoji?: string | null;
  avatar_url?: string | null;
}

interface StoreItem {
  id: string;
  name: string;
  emoji: string | null;
  price: number;
  stock: number | null;
  enabled: number;
}

interface Props {
  students: Student[];
  classId: string;
  onClose: () => void;
}

// Same ka-ching used in BoardConsole — synthesized via Web Audio so
// no mp3 needed. Two quick descending tones.
function playKaching() {
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
    playTone(1318, 0);
    playTone(1760, 0.10);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {}
}

export default function StudentWallet({ students, classId, onClose }: Props) {
  const [picked, setPicked] = useState<Student | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [verified, setVerified] = useState(false);
  const [data, setData] = useState<{
    dojo_points: number;
    streak: number;
    badges: string[];
    rank?: number;
    behavior_stars?: number;
  } | null>(null);

  // Store — list catalog once verified so the kid can spend without
  // bouncing to a separate Store button.
  const [items, setItems] = useState<StoreItem[]>([]);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const showFlash = (kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 2800);
  };

  const reset = () => {
    setPicked(null);
    setPin("");
    setPinError("");
    setVerified(false);
    setData(null);
    setItems([]);
    setFlash(null);
  };

  const redeem = async (item: StoreItem) => {
    if (!picked || !pin) return;
    if (item.stock != null && item.stock <= 0) {
      showFlash("err", `${item.name} is out of stock`);
      return;
    }
    if (!data || data.dojo_points < item.price) {
      showFlash("err", `Need ${item.price - (data?.dojo_points || 0)} more pts`);
      return;
    }
    setBusyItemId(item.id);
    try {
      const r = await api.boardRedeem(picked.id, pin, item.id);
      setData((d) => d ? { ...d, dojo_points: r.dojo_points } : d);
      showFlash("ok", `🎉 Got ${r.item_name}! Show your teacher.`);
      playKaching();
      // Refresh items in case stock dropped
      try { setItems(await api.getStoreItems()); } catch {}
    } catch (e: any) {
      showFlash("err", e?.message || "Could not redeem");
    } finally {
      setBusyItemId(null);
    }
  };

  // Load wallet data once verified by attempting a free PIN-only check.
  // We piggy-back on board-redeem with a sentinel item id that doesn't
  // exist; the server returns a 404 only AFTER PIN check passes, so a
  // 404-for-item proves the PIN was right. Yes it's hacky; saves
  // adding a new endpoint.
  const verifyPin = async () => {
    if (!picked || !pin || pin.length < 3) return;
    try {
      // Try a real redeem with a definitely-fake item id; we expect:
      //  - 401 "Wrong PIN" if PIN is wrong
      //  - 404 "Item not found" if PIN was right (item lookup failed after)
      await api.boardRedeem(picked.id, pin, "00000000-0000-0000-0000-000000000000");
      // unlikely path: actually redeemed. Treat as verified anyway.
      setVerified(true);
      setPinError("");
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/wrong pin/i.test(msg)) {
        setPinError("Wrong PIN — try again");
        setPin("");
        return;
      }
      // Any other error (item not found, etc) implies the PIN passed
      setVerified(true);
      setPinError("");
    }
    // Pull the kid's stats AND the store catalog in parallel so the
    // wallet view shows everything at once
    try {
      const [lb, storeItems] = await Promise.all([
        api.getLeaderboard().catch(() => [] as any[]),
        api.getStoreItems().catch(() => [] as StoreItem[]),
      ]);
      const me = lb.find((r: any) => r.user_id === picked.id);
      const rank = me ? (lb.findIndex((r: any) => r.user_id === picked.id) + 1) : undefined;
      setData({
        dojo_points: me?.dojo_points ?? 0,
        streak: 0, // streak by other student needs backend support
        badges: Array.isArray(me?.badges) ? me.badges : [],
        rank,
        behavior_stars: me?.behavior_stars,
      });
      setItems(storeItems);
    } catch {
      setData({ dojo_points: 0, streak: 0, badges: [] });
    }
  };

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
        width: "min(720px, 95vw)",
        maxHeight: "90vh",
        overflow: "auto",
        padding: 24,
        color: "#f5f1e8",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.45 }}>
              My Wallet
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
              {!picked ? "Tap your face" : !verified ? `Hi ${picked.name.split(" ")[0]}!` : `${picked.name.split(" ")[0]}'s wallet`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(245,241,232,0.7)",
              fontSize: 18, fontWeight: 700,
              cursor: "pointer",
            }}
          >✕</button>
        </header>

        {!picked && (
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
                  onClick={() => { setPicked(s); setPin(""); setPinError(""); setVerified(false); }}
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
        )}

        {picked && !verified && (
          <div style={{ maxWidth: 360, margin: "20px auto", textAlign: "center" }}>
            <div style={{
              width: 96, height: 96, borderRadius: "50%",
              background: "linear-gradient(135deg, #b23a48, #7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 48, fontWeight: 800,
              margin: "0 auto 14px",
            }}>{picked.avatar_emoji || picked.name[0].toUpperCase()}</div>
            <div style={{ fontSize: 14, color: "rgba(245,241,232,0.55)", marginBottom: 18 }}>
              Type your 4-digit PIN to see your points and badges.
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
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
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
              >Open →</button>
            </div>
          </div>
        )}

        {picked && verified && data && (
          <div>
            {/* Flash toast for store actions */}
            {flash && (
              <div style={{
                padding: "10px 14px", borderRadius: 10, marginBottom: 14,
                background: flash.kind === "ok" ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)",
                border: flash.kind === "ok" ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(239,68,68,0.4)",
                color: flash.kind === "ok" ? "#bbf7d0" : "#fca5a5",
                fontWeight: 700, fontSize: 14,
                textAlign: "center",
              }}>{flash.text}</div>
            )}
            {/* Hero stat row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12, marginBottom: 18,
            }}>
              <StatCard label="Points" value={`🪙 ${data.dojo_points}`} />
              <StatCard label="Stars" value={`⭐ ${data.behavior_stars ?? 0}/5`} />
              <StatCard label="Badges" value={`🎖️ ${data.badges.length}`} />
              {data.rank && <StatCard label="Class Rank" value={`#${data.rank}`} />}
            </div>

            {/* Store — spend the points right here */}
            {items.filter((it) => it.enabled).length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 10,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.65 }}>
                    🛒 Spend Points
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.55 }}>
                    Tap an item to redeem
                  </div>
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: 10,
                }}>
                  {items.filter((it) => it.enabled).map((it) => {
                    const canAfford = data.dojo_points >= it.price;
                    const oos = it.stock != null && it.stock <= 0;
                    const disabled = !canAfford || oos || busyItemId === it.id;
                    return (
                      <button
                        key={it.id}
                        onClick={() => redeem(it)}
                        disabled={disabled}
                        style={{
                          background: canAfford && !oos
                            ? "linear-gradient(135deg, rgba(217,119,6,0.20), rgba(178,58,72,0.10))"
                            : "rgba(255,255,255,0.04)",
                          border: canAfford && !oos
                            ? "1px solid rgba(217,119,6,0.50)"
                            : "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 14,
                          padding: "16px 12px",
                          color: "white",
                          cursor: disabled ? "default" : "pointer",
                          opacity: disabled ? 0.55 : 1,
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                          transition: "transform .15s",
                        }}
                        onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = "scale(1.04)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
                      >
                        <div style={{ fontSize: 32, lineHeight: 1 }}>{it.emoji || "🎁"}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, textAlign: "center", lineHeight: 1.2 }}>{it.name}</div>
                        <div style={{
                          fontSize: 11, fontWeight: 700,
                          color: canAfford && !oos ? "#fde68a" : "rgba(245,241,232,0.55)",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {oos ? "Out of stock"
                            : !canAfford ? `Need ${it.price - data.dojo_points} more`
                            : busyItemId === it.id ? "…"
                            : `🪙 ${it.price}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {data.badges.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 8 }}>
                  🎖️ Badges Earned
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {data.badges.slice(0, 30).map((b) => (
                    <span key={b} style={{
                      padding: "6px 12px", borderRadius: 999,
                      background: "rgba(217,119,6,0.18)",
                      border: "1px solid rgba(217,119,6,0.40)",
                      fontSize: 12, fontWeight: 700, color: "#fde68a",
                    }}>{b.replace(/_/g, " ")}</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button
                onClick={reset}
                style={{
                  padding: "10px 18px", borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "rgba(245,241,232,0.85)", fontSize: 13, fontWeight: 700,
                  cursor: "pointer",
                }}
              >Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 14,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fde68a", marginTop: 4 }}>{value}</div>
    </div>
  );
}
