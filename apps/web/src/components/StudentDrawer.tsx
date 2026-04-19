import React, { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../lib/api.ts";
import {
  X, Lock, LockOpen, Send, Navigation, Gift, Ban,
  Coffee, Youtube, Square, MessageSquare, Shield, Zap,
  Clock, Monitor, ChevronDown, ChevronRight, Check,
  Wifi, WifiOff, BookOpen, Gamepad2,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  student: any | null;
  classId: string;
  presence: any;
  dk: boolean;
}

const PUSH_PAGES = [
  { label: "Dashboard",   path: "/student",      icon: "🏠" },
  { label: "Assignments", path: "/assignments",   icon: "📝" },
  { label: "Lessons",     path: "/lessons",       icon: "📖" },
  { label: "Arcade",      path: "/arcade",        icon: "🎮" },
];

/* 4-state status — mirrors MonitorPage */
type StatusKey = "online" | "working" | "idle" | "offline";
const STATUS_META: Record<StatusKey, { label: string; color: string; ring: string; dot: string; pulse: boolean }> = {
  working: { label: "Working",  color: "#a78bfa", ring: "rgba(139,92,246,0.55)",  dot: "#7c3aed", pulse: true  },
  online:  { label: "Online",   color: "#34d399", ring: "rgba(52,211,153,0.45)",  dot: "#10b981", pulse: false },
  idle:    { label: "Idle",     color: "#fbbf24", ring: "rgba(251,191,36,0.4)",   dot: "#f59e0b", pulse: false },
  offline: { label: "Offline",  color: "#6b7280", ring: "rgba(107,114,128,0.3)",  dot: "#4b5563", pulse: false },
};
function deriveStatus(presence: any): StatusKey {
  if (!presence?.isOnline) return "offline";
  const action = (presence.lastAction || "").toLowerCase();
  const secsAgo = presence.lastSeenAt
    ? Math.floor((Date.now() - new Date(presence.lastSeenAt).getTime()) / 1000)
    : 999;
  if (/assignment|project|quiz|lesson|work/.test(action)) return "working";
  if (secsAgo > 120) return "idle";
  return "online";
}

/* Section header — icon-badged, matching TeacherBoardSettings style */
function SectionHeader({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: color + "22", color,
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--t3)" }}>
        {label}
      </span>
    </div>
  );
}

/* Control button — semantically styled */
function CtrlBtn({
  onClick, icon, label, variant = "neutral", fullWidth = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  variant?: "destructive" | "positive" | "neutral" | "warning" | "accent";
  fullWidth?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    destructive: { background: "rgba(239,68,68,0.1)",    color: "#f87171", border: "1px solid rgba(239,68,68,0.25)"    },
    positive:    { background: "rgba(52,211,153,0.1)",   color: "#34d399", border: "1px solid rgba(52,211,153,0.25)"   },
    neutral:     { background: "rgba(99,102,241,0.1)",   color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)"   },
    warning:     { background: "rgba(251,191,36,0.1)",   color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)"   },
    accent:      { background: "rgba(139,92,246,0.12)",  color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)"    },
  };
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 7, padding: "9px 14px", borderRadius: 10,
        fontSize: 12, fontWeight: 600, cursor: "pointer",
        width: fullWidth ? "100%" : undefined,
        transition: "opacity 0.15s, transform 0.1s",
        ...styles[variant],
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1";   (e.currentTarget as HTMLElement).style.transform = ""; }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

export default function StudentDrawer({ open, onClose, student, classId, presence, dk }: Props) {
  const [snapshot, setSnapshot] = useState<{ data: string; path: string; capturedAt: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [pushMenu, setPushMenu] = useState(false);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const [kidLocked, setKidLocked] = useState(false);
  const [broadcastUrl, setBroadcastUrl] = useState("");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const showFlash = useCallback((txt: string, ok = true) => {
    setFlash({ text: txt, ok });
    setTimeout(() => setFlash(null), 2500);
  }, []);

  // Poll snapshot at 2s + tell student to go high-res while drawer is open
  useEffect(() => {
    if (!open || !student) return;
    let cancelled = false;
    setImgLoaded(false);
    api.focusStudent(student.id, true).catch(() => {});
    const fetchIt = async () => {
      try {
        const d = await api.getStudentSnapshot(student.id);
        if (!cancelled && d?.data) {
          setSnapshot({ data: d.data, path: d.path || "", capturedAt: d.capturedAt || "" });
          setImgLoaded(false);
        }
      } catch {}
    };
    fetchIt();
    const iv = setInterval(fetchIt, 2000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      api.focusStudent(student.id, false).catch(() => {});
    };
  }, [open, student]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !student) return null;

  const status    = deriveStatus(presence);
  const statusMeta = STATUS_META[status];
  const initials  = (student.name || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const secsAgo   = snapshot?.capturedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(snapshot.capturedAt).getTime()) / 1000))
    : null;

  /* ── Handlers ── */
  const handleLock    = async () => { try { await api.lockStudent(student.id, msg); api.lockStudentCmd(student.id, msg || undefined).catch(() => {}); setKidLocked(true); showFlash("Locked"); } catch (e: any) { showFlash(e.message, false); } };
  const handleUnlock  = async () => { try { await api.unlockStudent(student.id); await api.forceUnlockStudent(student.id).catch(() => {}); api.unlockStudentCmd(student.id).catch(() => {}); setKidLocked(false); showFlash("Unlocked"); } catch (e: any) { showFlash(e.message, false); } };
  const handleSendMsg = async () => {
    if (!msg.trim()) return;
    try { await api.sendClassCommand(classId, "MESSAGE", msg.trim(), student.id); api.sendStudentMessage(student.id, msg.trim()).catch(() => {}); showFlash("Message sent"); setMsg(""); }
    catch (e: any) { showFlash(e.message, false); }
  };
  const handlePush  = async (path: string) => { try { await api.sendClassCommand(classId, "NAVIGATE", path, student.id); showFlash(`Pushed to ${path}`); setPushMenu(false); } catch (e: any) { showFlash(e.message, false); } };
  const handleKick  = async () => { try { await api.sendClassCommand(classId, "KICK", "/student", student.id); showFlash("Kicked to dashboard"); } catch (e: any) { showFlash(e.message, false); } };
  const handleGrant = async () => {
    if (!confirm(`Grant free time to ${student.name}?`)) return;
    try { await api.grantStudentFreeTime(student.id, 15); showFlash("Free time granted"); } catch (e: any) { showFlash(e.message, false); }
  };
  const handleRevoke = async () => {
    if (!confirm(`Revoke free time for ${student.name}?`)) return;
    try { await api.revokeStudentFreeTime(student.id); showFlash("Free time revoked"); } catch (e: any) { showFlash(e.message, false); }
  };
  const handleBroadcast = async () => {
    const url = broadcastUrl.trim();
    if (!url) return;
    try { await api.broadcastStudentVideo(student.id, url); showFlash("Video broadcast sent"); setBroadcastUrl(""); setBroadcastOpen(false); } catch (e: any) { showFlash(e.message, false); }
  };
  const handleEndBroadcast = async () => { try { await api.endStudentBroadcast(student.id); showFlash("Video ended"); } catch (e: any) { showFlash(e.message, false); } };
  const handleEndBreak = async () => {
    if (!confirm(`End ${student.name}'s break early?`)) return;
    try { await Promise.allSettled([api.endStudentBreak(student.id), api.endBreak(student.id)]); showFlash("Break ended"); } catch (e: any) { showFlash(e.message, false); }
  };

  const bg   = "#0c0d22";
  const surf = "rgba(255,255,255,0.03)";
  const bdr  = "rgba(255,255,255,0.07)";

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(3,3,20,0.72)", backdropFilter: "blur(8px)",
        display: "flex", justifyContent: "flex-end" }}
    >
      <style>{`
        @keyframes sd-in  { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes sd-flash { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sd-pulse { 0%,100%{ box-shadow: 0 0 0 0 var(--sd-pc); } 60%{ box-shadow: 0 0 0 6px transparent; } }
      `}</style>

      <div
        ref={modalRef}
        style={{
          width: "min(520px,100vw)", height: "100%",
          background: bg,
          borderLeft: `1px solid ${bdr}`,
          display: "flex", flexDirection: "column",
          animation: "sd-in 0.22s cubic-bezier(0.22,1,0.36,1)",
          overflowY: "auto",
        }}
      >
        {/* ── Hero header ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: bg,
          borderBottom: `1px solid ${bdr}`,
          padding: "20px 20px 16px",
        }}>
          {/* Top row: label + close */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
              Student Monitor
            </span>
            <button onClick={onClose} style={{
              display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
              borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
              background: "rgba(255,255,255,0.05)", border: `1px solid ${bdr}`,
              color: "rgba(255,255,255,0.45)", transition: "background 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
            >
              <X size={11} /> Close
            </button>
          </div>

          {/* Avatar + name + status */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Avatar with status ring */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%",
                background: `linear-gradient(135deg, #7c3aed, #4f46e5)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 800, color: "white",
                border: `2.5px solid ${statusMeta.ring}`,
                boxShadow: status === "working"
                  ? `0 0 0 0 ${statusMeta.ring}, 0 4px 20px rgba(124,58,237,0.3)`
                  : `0 4px 16px rgba(0,0,0,0.3)`,
                // @ts-ignore
                "--sd-pc": statusMeta.ring,
                animation: status === "working" ? "sd-pulse 2s ease-in-out infinite" : undefined,
              }}>
                {initials}
              </div>
              {/* Online dot */}
              <div style={{
                position: "absolute", bottom: 1, right: 1,
                width: 12, height: 12, borderRadius: "50%",
                background: statusMeta.dot,
                border: `2px solid ${bg}`,
                boxShadow: status !== "offline" ? `0 0 6px ${statusMeta.dot}` : "none",
              }} />
            </div>

            {/* Name + activity */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {student.name}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {presence?.lastAction || "No activity yet"}
              </div>
            </div>

            {/* Status badge */}
            <div style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
              padding: "5px 11px", borderRadius: 20,
              background: statusMeta.color + "18",
              border: `1px solid ${statusMeta.color + "40"}`,
              fontSize: 11, fontWeight: 700, color: statusMeta.color,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: statusMeta.color,
                display: "inline-block",
                animation: statusMeta.pulse ? "sd-pulse 2s ease-in-out infinite" : undefined,
              }} />
              {statusMeta.label}
            </div>
          </div>

          {/* Time-on-task + current path chips */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {secsAgo !== null && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                background: "rgba(255,255,255,0.05)", border: `1px solid ${bdr}`,
                color: "rgba(255,255,255,0.35)",
              }}>
                <Clock size={9} /> {secsAgo < 60 ? `${secsAgo}s ago` : `${Math.floor(secsAgo/60)}m ago`}
              </div>
            )}
            {snapshot?.path && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)",
                color: "#a78bfa",
              }}>
                <Monitor size={9} /> {snapshot.path}
              </div>
            )}
            {kidLocked && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                color: "#f87171",
              }}>
                <Lock size={9} /> LOCKED
              </div>
            )}
          </div>
        </div>

        {/* Flash toast */}
        {flash && (
          <div style={{
            position: "sticky", top: 88, zIndex: 20, margin: "8px 16px",
            padding: "9px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: flash.ok ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
            color: flash.ok ? "#6ee7b7" : "#f87171",
            border: `1px solid ${flash.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            display: "flex", alignItems: "center", gap: 7,
            animation: "sd-flash 0.2s ease-out",
          }}>
            {flash.ok ? <Check size={13} /> : <X size={13} />}
            {flash.text}
          </div>
        )}

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 22 }}>

          {/* ── Section 1: Live Preview ── */}
          <section>
            <SectionHeader icon={<Monitor size={13} />} label="Live Preview" color="#6366f1" />

            {/* Device mockup frame */}
            <div style={{
              borderRadius: 14, overflow: "hidden",
              background: "#070714",
              border: "1.5px solid rgba(255,255,255,0.09)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset",
              position: "relative",
            }}>
              {/* Browser chrome bar */}
              <div style={{
                height: 28, background: "rgba(255,255,255,0.04)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: 5, padding: "0 10px",
              }}>
                {["#f87171","#fbbf24","#34d399"].map((c, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c, opacity: 0.7 }} />
                ))}
                <div style={{
                  flex: 1, height: 14, background: "rgba(255,255,255,0.05)",
                  borderRadius: 4, margin: "0 8px",
                  display: "flex", alignItems: "center", paddingLeft: 8,
                  fontSize: 9, color: "rgba(255,255,255,0.25)",
                }}>
                  {snapshot?.path || "scratch-classroom.vercel.app"}
                </div>
              </div>

              {/* Screenshot area */}
              <div style={{ aspectRatio: "16/9", position: "relative", overflow: "hidden" }}>
                {!snapshot?.data && (
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 8, color: "rgba(255,255,255,0.2)",
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.08)",
                      borderTopColor: "#7c3aed",
                      animation: "spin 1s linear infinite",
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <span style={{ fontSize: 11 }}>Waiting for first screenshot…</span>
                  </div>
                )}
                {snapshot?.data && (
                  <img
                    src={snapshot.data}
                    alt={`${student.name}'s screen`}
                    onLoad={() => setImgLoaded(true)}
                    style={{
                      width: "100%", height: "100%", objectFit: "cover",
                      transition: "opacity 0.3s",
                      opacity: imgLoaded ? 1 : 0,
                    }}
                  />
                )}
              </div>
            </div>
          </section>

          {/* ── Section 2: Communication ── */}
          <section>
            <SectionHeader icon={<MessageSquare size={13} />} label="Communication" color="#0ea5e9" />
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={msg}
                onChange={e => setMsg(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSendMsg()}
                placeholder="Send a message to this student…"
                style={{
                  flex: 1, padding: "9px 13px", borderRadius: 10, fontSize: 12,
                  background: surf, border: `1px solid ${bdr}`,
                  color: "#f1f5f9", outline: "none",
                }}
              />
              <button
                onClick={handleSendMsg}
                disabled={!msg.trim()}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "9px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: "#7c3aed", color: "white", border: "none",
                  cursor: msg.trim() ? "pointer" : "not-allowed",
                  opacity: msg.trim() ? 1 : 0.4,
                  transition: "opacity 0.15s",
                }}
              >
                <Send size={13} /> Send
              </button>
            </div>
          </section>

          {/* ── Section 3: Access Controls ── */}
          <section>
            <SectionHeader icon={<Shield size={13} />} label="Access" color="#6366f1" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <CtrlBtn onClick={handleLock}   icon={<Lock size={13} />}     label="Lock"             variant="destructive" />
              <CtrlBtn onClick={handleUnlock} icon={<LockOpen size={13} />} label="Unlock"           variant="positive"    />

              {/* Push to page */}
              <div style={{ position: "relative", gridColumn: "1 / -1" }}>
                <button
                  onClick={() => setPushMenu(v => !v)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 7, padding: "9px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                    background: "rgba(99,102,241,0.1)", color: "#a5b4fc",
                    border: "1px solid rgba(99,102,241,0.25)", cursor: "pointer",
                    transition: "opacity 0.15s",
                  }}
                >
                  <Navigation size={13} /> Push to Page
                  {pushMenu ? <ChevronDown size={11} style={{ marginLeft: "auto" }} /> : <ChevronRight size={11} style={{ marginLeft: "auto" }} />}
                </button>
                {pushMenu && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "#0f1029", border: `1px solid ${bdr}`,
                    borderRadius: 12, overflow: "hidden", zIndex: 50,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                  }}>
                    {PUSH_PAGES.map(p => (
                      <button
                        key={p.path}
                        onClick={() => handlePush(p.path)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 14px", fontSize: 12, fontWeight: 600,
                          background: "transparent", border: "none", cursor: "pointer",
                          color: "rgba(255,255,255,0.7)", textAlign: "left",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <span style={{ fontSize: 16 }}>{p.icon}</span> {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <CtrlBtn onClick={handleKick} icon={<Navigation size={13} />} label="Kick to Dashboard" variant="warning" fullWidth />
            </div>
          </section>

          {/* ── Section 4: Rewards & Breaks ── */}
          <section>
            <SectionHeader icon={<Gift size={13} />} label="Rewards & Breaks" color="#f59e0b" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <CtrlBtn onClick={handleGrant}    icon={<Gift size={13} />}   label="Grant Free Time"  variant="positive"    />
              <CtrlBtn onClick={handleRevoke}   icon={<Ban size={13} />}    label="Revoke Free Time" variant="destructive"  />
              <CtrlBtn onClick={handleEndBreak} icon={<Coffee size={13} />} label="End Break Now"    variant="accent"      fullWidth />
            </div>
          </section>

          {/* ── Section 5: Broadcast ── */}
          <section>
            <SectionHeader icon={<Youtube size={13} />} label="Broadcast" color="#dc2626" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => setBroadcastOpen(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                  background: "rgba(220,38,38,0.1)", color: "#fca5a5",
                  border: "1px solid rgba(220,38,38,0.25)", cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
              >
                <Youtube size={13} /> Broadcast Video to This Student
                {broadcastOpen ? <ChevronDown size={11} style={{ marginLeft: "auto" }} /> : <ChevronRight size={11} style={{ marginLeft: "auto" }} />}
              </button>

              {broadcastOpen && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={broadcastUrl}
                    onChange={e => setBroadcastUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleBroadcast(); }}
                    placeholder="https://youtu.be/…"
                    style={{
                      flex: 1, padding: "9px 13px", borderRadius: 10, fontSize: 12,
                      background: surf, border: `1px solid ${bdr}`,
                      color: "#f1f5f9", outline: "none",
                    }}
                  />
                  <button onClick={handleBroadcast} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "9px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                    background: "rgba(220,38,38,0.2)", color: "#fca5a5",
                    border: "1px solid rgba(220,38,38,0.35)", cursor: "pointer",
                  }}>
                    <Send size={13} /> Send
                  </button>
                </div>
              )}

              <CtrlBtn onClick={handleEndBroadcast} icon={<Square size={13} />} label="End Video" variant="warning" fullWidth />
            </div>
          </section>

          {/* ── Footer: ID chips ── */}
          <div style={{
            display: "flex", gap: 8, flexWrap: "wrap",
            paddingTop: 16, borderTop: `1px solid ${bdr}`,
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 20,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${bdr}`,
              fontSize: 10, color: "rgba(255,255,255,0.3)",
            }}>
              <span style={{ opacity: 0.5 }}>Student</span>
              <code style={{ color: "#a78bfa", fontFamily: "monospace" }}>{student.id.slice(0, 8)}…</code>
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 20,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${bdr}`,
              fontSize: 10, color: "rgba(255,255,255,0.3)",
            }}>
              <span style={{ opacity: 0.5 }}>Class</span>
              <code style={{ color: "#a78bfa", fontFamily: "monospace" }}>{classId.slice(0, 8)}…</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
