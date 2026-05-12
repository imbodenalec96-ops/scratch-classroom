// Student wallet kiosk view. Tap your face → see your points, badges,
// grades, and (during cashout) spend on store items. PIN-less by design:
// this is a glanceable on-board kiosk, not an account login.

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { StarStore, letterGradeColor, countsTowardGrade } from "../lib/star/storage.ts";

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

interface GradeRow {
  assignmentId: string;
  assignmentName: string;
  subject: string;
  pct: number;
  letter: string;
  date: string;
  counted: boolean;
}

interface Props {
  students: Student[];
  classId: string;
  onClose: () => void;
}

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

// Curated emoji palette kids can pick from for their wallet icon.
// Grouped roughly by category so the picker doesn't feel random.
const AVATAR_CHOICES: string[] = [
  // Faces
  "🐱", "🐶", "🐰", "🐼", "🦊", "🐻", "🐨", "🦁", "🐯", "🐸",
  "🐵", "🦄", "🐲", "🐢", "🐙", "🦋", "🐝", "🦉", "🦒", "🦔",
  "🐺", "🐧", "🦩", "🦜", "🐠", "🐬", "🦈", "🐳", "🦖", "🦕",
  // Symbols / objects
  "⭐", "🌟", "✨", "💫", "🌈", "🔥", "❄️", "⚡", "💎", "🎯",
  "🚀", "🛸", "🌙", "☀️", "🌸", "🌺", "🍀", "🍕", "🍔", "🍩",
  "⚽", "🏀", "🎮", "🎨", "🎵", "📚", "🦸", "🧙", "👽", "🤖",
];

export default function StudentWallet({ students, classId: _classId, onClose }: Props) {
  const [picked, setPicked] = useState<Student | null>(null);
  const [data, setData] = useState<{
    dojo_points: number;
    badges: string[];
    rank?: number;
    behavior_stars?: number;
  } | null>(null);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [storeOpen, setStoreOpen] = useState<{ open: boolean; source: string; until: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const saveAvatar = async (emoji: string) => {
    if (!picked) return;
    setSavingAvatar(true);
    try {
      await api.updateStudent(picked.id, { avatar_emoji: emoji });
      // Update local state so the wallet reflects immediately, and the
      // picker grid (when the kid backs out) shows the new icon too.
      const next = { ...picked, avatar_emoji: emoji };
      setPicked(next);
      const idx = students.findIndex((s) => s.id === picked.id);
      if (idx >= 0) students[idx] = next;
      setEditingAvatar(false);
      showFlash("ok", `New icon saved!`);
    } catch {
      showFlash("err", "Couldn't save icon — try again.");
    } finally {
      setSavingAvatar(false);
    }
  };

  const showFlash = (kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 2800);
  };

  const reset = () => {
    setPicked(null);
    setData(null);
    setGrades([]);
    setItems([]);
    setFlash(null);
    setStoreOpen(null);
  };

  // Read this kid's grades from the LOCAL STAR tracker. We try to match
  // by ID first; fall back to first-name match because CSV imports often
  // store names without ids.
  const loadGradesFor = (s: Student): GradeRow[] => {
    const tracker = StarStore.getAsnTrack();
    const first = (s.name || "").trim().split(/\s+/)[0]?.toLowerCase();
    const out: GradeRow[] = [];
    for (const t of Object.values(tracker)) {
      for (const sub of t.submissions || []) {
        const sidMatch = sub.studentId && sub.studentId === s.id;
        const nameMatch = !sidMatch && first && (sub.studentName || "").trim().toLowerCase().split(/\s+/)[0] === first;
        if (!sidMatch && !nameMatch) continue;
        out.push({
          assignmentId: t.id,
          assignmentName: t.name,
          subject: t.subject || "Other",
          pct: sub.pct,
          letter: sub.letterGrade,
          date: sub.completedDate || "",
          counted: countsTowardGrade(sub),
        });
      }
    }
    out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return out;
  };

  // Tap-to-open flow: pick a student → load their stats + store + grades
  // in parallel. No PIN — this is an on-board kiosk view.
  const open = async (s: Student) => {
    setPicked(s);
    setLoading(true);
    setGrades(loadGradesFor(s));
    try {
      const [lb, storeItems, openStatus] = await Promise.all([
        api.getLeaderboard().catch(() => [] as any[]),
        api.getStoreItems().catch(() => [] as StoreItem[]),
        api.isStoreOpenForStudent(s.id).catch(() => ({ open: false, source: "closed" as const, until: null })),
      ]);
      const me = lb.find((r: any) => r.user_id === s.id);
      const rank = me ? (lb.findIndex((r: any) => r.user_id === s.id) + 1) : undefined;
      setData({
        dojo_points: me?.dojo_points ?? 0,
        badges: Array.isArray(me?.badges) ? me.badges : [],
        rank,
        behavior_stars: me?.behavior_stars,
      });
      setItems(storeItems);
      setStoreOpen(openStatus);
    } catch {
      setData({ dojo_points: 0, badges: [] });
    } finally {
      setLoading(false);
    }
  };

  // Live-refresh grades while open: when a teacher logs a new submission,
  // a "submission-saved" board event fires (already used by the gradebook).
  // Re-read local storage so the kid sees their grade immediately.
  useEffect(() => {
    if (!picked) return;
    const onStorage = () => setGrades(loadGradesFor(picked));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  const redeem = async (item: StoreItem) => {
    if (!picked) return;
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
      // boardRedeem still requires a pin parameter on the server. Pass the
      // kid's stored pin if their roster row carries one (most don't), else
      // empty string and let the server reject — wallet UI is read-mostly.
      // The teacher's "Open store" override removes the pin requirement on
      // the server side for cashout periods.
      const r = await api.boardRedeem(picked.id, "", item.id);
      setData((d) => d ? { ...d, dojo_points: r.dojo_points } : d);
      showFlash("ok", `🎉 Got ${r.item_name}! Show your teacher.`);
      playKaching();
      try { setItems(await api.getStoreItems()); } catch {}
    } catch (e: any) {
      showFlash("err", e?.message || "Could not redeem");
    } finally {
      setBusyItemId(null);
    }
  };

  // Aggregates for the GRADES section
  const counted = grades.filter((g) => g.counted);
  const overallPct = counted.length > 0
    ? Math.round(counted.reduce((a, g) => a + g.pct, 0) / counted.length)
    : 0;
  const overallLetter = overallPct >= 90 ? "A" : overallPct >= 80 ? "B" : overallPct >= 70 ? "C" : overallPct >= 60 ? "D" : "F";

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(10,4,20,0.78)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{
        background: "radial-gradient(900px 600px at 0% 0%, rgba(168,85,247,0.18) 0%, transparent 55%), radial-gradient(700px 500px at 100% 100%, rgba(236,72,153,0.16) 0%, transparent 55%), linear-gradient(180deg, #1a0f2e 0%, #0a0414 100%)",
        border: "1px solid rgba(168,85,247,0.30)",
        borderRadius: 22,
        width: "min(760px, 95vw)",
        maxHeight: "92vh",
        overflow: "auto",
        padding: 24,
        color: "#f5f1e8",
        boxShadow: "0 28px 72px -10px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "4px 12px", borderRadius: 999,
              background: "linear-gradient(135deg, rgba(168,85,247,0.20), rgba(236,72,153,0.10))",
              border: "1px solid rgba(168,85,247,0.30)",
              fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase",
              color: "#f9a8d4", marginBottom: 6,
            }}>
              💼 My Wallet
            </div>
            <div style={{
              fontSize: 24, fontWeight: 900, letterSpacing: "-0.025em",
              background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 50%, #f9a8d4 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              {!picked ? "Tap your face" : `${picked.name.split(" ")[0]}'s wallet`}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close wallet"
            style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "rgba(168,85,247,0.10)",
              border: "1px solid rgba(168,85,247,0.30)",
              color: "#fce7f3",
              fontSize: 18, fontWeight: 700,
              cursor: "pointer", touchAction: "manipulation",
            }}
          >✕</button>
        </header>

        {/* PICKER — student grid, mobile-friendly tap targets */}
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
                  onClick={() => open(s)}
                  style={{
                    background: "linear-gradient(180deg, rgba(168,85,247,0.10) 0%, rgba(99,102,241,0.05) 100%)",
                    border: "1px solid rgba(168,85,247,0.25)",
                    borderRadius: 16,
                    padding: "20px 14px",
                    minHeight: 132,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                    cursor: "pointer", touchAction: "manipulation",
                    color: "white",
                    transition: "transform 150ms cubic-bezier(0.22,1,0.36,1), background 180ms",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = "linear-gradient(180deg, rgba(236,72,153,0.20) 0%, rgba(168,85,247,0.10) 100%)";
                    el.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = "linear-gradient(180deg, rgba(168,85,247,0.10) 0%, rgba(99,102,241,0.05) 100%)";
                    el.style.transform = "translateY(0)";
                  }}
                >
                  <div style={{
                    width: 68, height: 68, borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 32, fontWeight: 900, color: "white",
                    boxShadow: "0 8px 22px -6px rgba(168,85,247,0.55), inset 0 2px 0 rgba(255,255,255,0.18)",
                  }}>{s.avatar_emoji || initial}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>{s.name.split(" ")[0]}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* WALLET — stats, grades, store, badges */}
        {picked && (
          <div>
            {flash && (
              <div role="status" aria-live="polite" style={{
                padding: "12px 16px", borderRadius: 12, marginBottom: 14,
                background: flash.kind === "ok"
                  ? "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(168,85,247,0.10))"
                  : "linear-gradient(135deg, rgba(239,68,68,0.25), rgba(236,72,153,0.10))",
                border: flash.kind === "ok" ? "1px solid rgba(16,185,129,0.45)" : "1px solid rgba(239,68,68,0.45)",
                color: flash.kind === "ok" ? "#bbf7d0" : "#fca5a5",
                fontWeight: 800, fontSize: 14, textAlign: "center",
              }}>{flash.text}</div>
            )}

            {loading && !data && (
              <div style={{ padding: 28, textAlign: "center", color: "rgba(196,181,253,0.55)", fontWeight: 600 }}>
                Loading…
              </div>
            )}

            {data && (
              <>
                {/* HERO STATS */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10, marginBottom: 18,
                }}>
                  <StatCard label="Points"     value={`🪙 ${data.dojo_points}`} />
                  <StatCard label="Stars"      value={`⭐ ${data.behavior_stars ?? 0}/5`} />
                  <StatCard label="Grade"      value={counted.length ? `${overallLetter} ${overallPct}%` : "—"} accent={counted.length ? letterGradeColor(overallLetter) : undefined} />
                  {data.rank && <StatCard label="Class Rank" value={`#${data.rank}`} />}
                </div>

                {/* MY ICON — kid can pick a new emoji avatar */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: 14, marginBottom: 16,
                  background: "rgba(168,85,247,0.06)",
                  border: "1px solid rgba(168,85,247,0.20)",
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26, color: "white", fontWeight: 900,
                    boxShadow: "0 6px 16px -4px rgba(168,85,247,0.55)",
                    flexShrink: 0,
                  }}>{picked.avatar_emoji || (picked.name || "?")[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(196,181,253,0.85)", letterSpacing: "0.10em", textTransform: "uppercase" }}>My icon</div>
                    <div style={{ fontSize: 11, color: "rgba(196,181,253,0.55)", marginTop: 2 }}>Pick anything you want!</div>
                  </div>
                  <button
                    onClick={() => setEditingAvatar((v) => !v)}
                    style={{
                      padding: "9px 14px", borderRadius: 10,
                      background: editingAvatar
                        ? "rgba(239,68,68,0.20)"
                        : "linear-gradient(135deg, rgba(168,85,247,0.30), rgba(236,72,153,0.20))",
                      border: editingAvatar
                        ? "1px solid rgba(239,68,68,0.45)"
                        : "1px solid rgba(168,85,247,0.45)",
                      color: editingAvatar ? "#fca5a5" : "#fce7f3",
                      fontWeight: 800, fontSize: 13, cursor: "pointer", touchAction: "manipulation",
                    }}
                  >{editingAvatar ? "✕ Cancel" : "✏️ Change"}</button>
                </div>

                {editingAvatar && (
                  <div style={{
                    padding: 14, borderRadius: 14, marginBottom: 16,
                    background: "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(236,72,153,0.06))",
                    border: "1.5px solid rgba(168,85,247,0.40)",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#f9a8d4", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 10 }}>
                      Pick a new icon
                    </div>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))",
                      gap: 6,
                    }}>
                      {AVATAR_CHOICES.map((emoji) => {
                        const sel = picked.avatar_emoji === emoji;
                        return (
                          <button
                            key={emoji}
                            onClick={() => saveAvatar(emoji)}
                            disabled={savingAvatar}
                            aria-label={`Pick ${emoji}`}
                            style={{
                              width: "100%", aspectRatio: "1 / 1",
                              borderRadius: 10,
                              background: sel ? "rgba(236,72,153,0.30)" : "rgba(0,0,0,0.30)",
                              border: sel ? "2px solid #ec4899" : "1px solid rgba(255,255,255,0.10)",
                              fontSize: 26, cursor: savingAvatar ? "wait" : "pointer",
                              touchAction: "manipulation",
                              transition: "transform 100ms",
                              opacity: savingAvatar ? 0.6 : 1,
                            }}
                          >{emoji}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MY GRADES — aggregated locally so it matches what's in /star */}
                <SectionTitle icon="📊">My Grades {grades.length ? `· ${grades.length}` : ""}</SectionTitle>
                {grades.length === 0 ? (
                  <EmptyHint>
                    No graded work yet. Once your teacher scores an assignment for you, it shows up here.
                  </EmptyHint>
                ) : (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 8, marginBottom: 18,
                  }}>
                    {grades.slice(0, 12).map((g, i) => {
                      const lc = g.counted ? letterGradeColor(g.letter) : "#94a3b8";
                      return (
                        <div key={`${g.assignmentId}-${i}`} style={{
                          padding: "10px 12px", borderRadius: 12,
                          background: `linear-gradient(135deg, ${lc}1f 0%, rgba(10,4,20,0.30) 100%)`,
                          border: `1px solid ${lc}55`,
                          display: "flex", alignItems: "center", gap: 12,
                        }}>
                          <div style={{
                            flexShrink: 0,
                            width: 42, height: 42, borderRadius: 10,
                            background: `${lc}25`, border: `1.5px solid ${lc}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 20, fontWeight: 900, color: lc,
                            textShadow: `0 0 10px ${lc}55`,
                          }}>
                            {g.counted ? g.letter : "—"}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#fce7f3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {g.assignmentName}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>
                              {g.subject}{g.counted ? ` · ${g.pct}%` : " · not counted"}{g.date ? ` · ${g.date}` : ""}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {grades.length > 12 && (
                      <div style={{
                        padding: "10px 12px", borderRadius: 12,
                        background: "rgba(168,85,247,0.06)",
                        border: "1px dashed rgba(168,85,247,0.25)",
                        color: "rgba(196,181,253,0.55)", fontSize: 12, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        + {grades.length - 12} more
                      </div>
                    )}
                  </div>
                )}

                {/* STORE */}
                {items.filter((it) => it.enabled).length > 0 && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <SectionTitle icon="🛒" inline>Spend Points</SectionTitle>
                      <span style={{
                        fontSize: 11, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase",
                        padding: "3px 9px", borderRadius: 999,
                        background: storeOpen?.open ? "rgba(16,185,129,0.18)" : "rgba(148,163,184,0.15)",
                        border: storeOpen?.open ? "1px solid rgba(16,185,129,0.45)" : "1px solid rgba(148,163,184,0.30)",
                        color: storeOpen?.open ? "#86efac" : "rgba(196,181,253,0.55)",
                      }}>
                        {storeOpen?.open
                          ? (storeOpen.source === "override" ? "Open by teacher" : "Cashout time")
                          : "Closed"}
                      </span>
                    </div>

                    {!storeOpen?.open && (
                      <div style={{
                        padding: "12px 14px", borderRadius: 12, marginBottom: 12,
                        background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
                        border: "1px solid rgba(168,85,247,0.30)",
                        color: "#fce7f3",
                        display: "flex", alignItems: "center", gap: 12,
                      }}>
                        <span style={{ fontSize: 22 }}>🔒</span>
                        <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5 }}>
                          <div style={{ fontWeight: 800, marginBottom: 2 }}>Store is closed</div>
                          You can browse, but you can only buy during cashout time. Ask your teacher to open the store!
                        </div>
                      </div>
                    )}

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: 10, marginBottom: 18,
                    }}>
                      {items.filter((it) => it.enabled).map((it) => {
                        const canAfford = data.dojo_points >= it.price;
                        const oos = it.stock != null && it.stock <= 0;
                        const closed = !storeOpen?.open;
                        const disabled = !canAfford || oos || closed || busyItemId === it.id;
                        return (
                          <button
                            key={it.id}
                            onClick={() => redeem(it)}
                            disabled={disabled}
                            title={closed ? "Store is closed" : oos ? "Out of stock" : !canAfford ? `Need ${it.price - data.dojo_points} more pts` : ""}
                            style={{
                              minHeight: 132,
                              background: canAfford && !oos && !closed
                                ? "linear-gradient(135deg, rgba(168,85,247,0.20), rgba(236,72,153,0.10))"
                                : "rgba(168,85,247,0.05)",
                              border: canAfford && !oos && !closed
                                ? "1px solid rgba(236,72,153,0.45)"
                                : "1px solid rgba(168,85,247,0.15)",
                              borderRadius: 14,
                              padding: "14px 12px",
                              color: "white",
                              cursor: disabled ? "not-allowed" : "pointer",
                              opacity: disabled ? 0.55 : 1,
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                              transition: "transform 150ms cubic-bezier(0.22,1,0.36,1)",
                              filter: closed ? "grayscale(0.6)" : "none",
                              touchAction: "manipulation",
                            }}
                            onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
                          >
                            <div style={{ fontSize: 32, lineHeight: 1 }}>{it.emoji || "🎁"}</div>
                            <div style={{ fontSize: 13, fontWeight: 800, textAlign: "center", lineHeight: 1.2, color: "#fce7f3" }}>{it.name}</div>
                            <div style={{
                              fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
                              padding: "2px 8px", borderRadius: 999,
                              color: canAfford && !oos && !closed ? "#fce7f3" : "rgba(196,181,253,0.55)",
                              background: canAfford && !oos && !closed ? "rgba(236,72,153,0.18)" : "rgba(168,85,247,0.06)",
                              border: canAfford && !oos && !closed ? "1px solid rgba(236,72,153,0.40)" : "1px solid rgba(168,85,247,0.18)",
                              fontVariantNumeric: "tabular-nums",
                            }}>
                              {closed ? "🔒 Closed"
                                : oos ? "Out of stock"
                                : !canAfford ? `Need ${it.price - data.dojo_points}`
                                : busyItemId === it.id ? "…"
                                : `🪙 ${it.price}`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* BADGES */}
                {data.badges.length > 0 && (
                  <>
                    <SectionTitle icon="🎖️">Badges</SectionTitle>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
                      {data.badges.slice(0, 30).map((b) => (
                        <span key={b} style={{
                          padding: "5px 11px", borderRadius: 999,
                          background: "linear-gradient(135deg, rgba(236,72,153,0.20), rgba(168,85,247,0.10))",
                          border: "1px solid rgba(236,72,153,0.40)",
                          fontSize: 12, fontWeight: 800, color: "#fbcfe8",
                          letterSpacing: "0.02em",
                        }}>{b.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <button
                onClick={reset}
                style={{
                  padding: "11px 20px", borderRadius: 999,
                  background: "rgba(168,85,247,0.10)",
                  border: "1px solid rgba(168,85,247,0.30)",
                  color: "#fce7f3", fontSize: 13, fontWeight: 800,
                  cursor: "pointer", touchAction: "manipulation",
                }}
              >← Pick another student</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const valueColor = accent || "#fce7f3";
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 14,
      background: "linear-gradient(180deg, rgba(168,85,247,0.10) 0%, rgba(99,102,241,0.05) 100%)",
      border: "1px solid rgba(168,85,247,0.25)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
        color: "rgba(196,181,253,0.65)",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 900, color: valueColor, marginTop: 4,
        letterSpacing: "-0.02em",
        textShadow: accent ? `0 0 14px ${accent}55` : undefined,
      }}>{value}</div>
    </div>
  );
}

function SectionTitle({ icon, children, inline }: { icon: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      marginBottom: inline ? 0 : 10,
      padding: "4px 12px", borderRadius: 999,
      background: "rgba(168,85,247,0.10)",
      border: "1px solid rgba(168,85,247,0.25)",
      fontSize: 10, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase",
      color: "#c4b5fd",
    }}>
      <span aria-hidden>{icon}</span>{children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 12, marginBottom: 18,
      background: "rgba(168,85,247,0.04)",
      border: "1px dashed rgba(168,85,247,0.25)",
      color: "rgba(196,181,253,0.65)", fontSize: 12.5, fontWeight: 600, lineHeight: 1.5,
    }}>{children}</div>
  );
}
