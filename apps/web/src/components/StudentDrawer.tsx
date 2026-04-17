import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.ts";
import {
  X, Lock, LockOpen, Send, Navigation, MessageSquare, Gift, Ban,
  RefreshCcw, ExternalLink, Clock, Zap,
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
  { label: "Dashboard",   path: "/student" },
  { label: "Assignments", path: "/assignments" },
  { label: "Lessons",     path: "/lessons" },
  { label: "Arcade",      path: "/arcade" },
];

/**
 * StudentDrawer — right-side panel for fine-grained per-student control.
 * Opens when teacher clicks a tile on the Monitor.
 */
export default function StudentDrawer({ open, onClose, student, classId, presence, dk }: Props) {
  const [snapshot, setSnapshot] = useState<{ data: string; path: string; capturedAt: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [pushMenu, setPushMenu] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [kidLocked, setKidLocked] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const showFlash = useCallback((txt: string) => {
    setFlash(txt);
    setTimeout(() => setFlash(null), 2500);
  }, []);

  // Poll snapshot at 2s in the drawer (faster than the tile's 6s refresh)
  useEffect(() => {
    if (!open || !student) return;
    let cancelled = false;
    const fetchIt = async () => {
      try {
        const d = await api.getStudentSnapshot(student.id);
        if (!cancelled && d?.data) setSnapshot({ data: d.data, path: d.path || "", capturedAt: d.capturedAt || "" });
      } catch {}
    };
    fetchIt();
    const iv = setInterval(fetchIt, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [open, student]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !student) return null;

  const handleLock = async () => {
    try { await api.lockStudent(student.id, msg); setKidLocked(true); showFlash("🔒 Locked"); }
    catch (e: any) { alert("Failed: " + e.message); }
  };
  const handleUnlock = async () => {
    try { await api.forceUnlockStudent(student.id); setKidLocked(false); showFlash("🔓 Unlocked"); }
    catch (e: any) { alert("Failed: " + e.message); }
  };
  const handleSendMsg = async () => {
    if (!msg.trim()) return;
    try { await api.sendClassCommand(classId, "MESSAGE", msg.trim(), student.id); showFlash("✉️ Sent"); setMsg(""); }
    catch (e: any) { alert("Failed: " + e.message); }
  };
  const handlePush = async (path: string) => {
    try { await api.sendClassCommand(classId, "NAVIGATE", path, student.id); showFlash(`➡️ Pushed to ${path}`); setPushMenu(false); }
    catch (e: any) { alert("Failed: " + e.message); }
  };
  const handleKick = async () => {
    try { await api.sendClassCommand(classId, "KICK", "/student", student.id); showFlash("🏁 Kicked"); }
    catch (e: any) { alert("Failed: " + e.message); }
  };
  const handleGrant = async () => {
    if (!confirm(`Grant free time to ${student.name}? They can use arcade/projects immediately.`)) return;
    try { await api.grantFreeTime(student.id); showFlash("🎁 Free time granted"); }
    catch (e: any) { alert("Failed: " + e.message); }
  };
  const handleRevoke = async () => {
    if (!confirm(`Revoke free time for ${student.name}? They'll be pushed back to assignments.`)) return;
    try { await api.revokeFreeTime(student.id); showFlash("⛔ Free time revoked"); }
    catch (e: any) { alert("Failed: " + e.message); }
  };

  const btnBase = `flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all border`;
  const btn = (color: string) => {
    const map: Record<string, string> = {
      red:     dk ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25"           : "bg-red-50 hover:bg-red-100 text-red-600 border-red-200",
      emerald: dk ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200",
      violet:  dk ? "bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border-violet-500/25"    : "bg-violet-50 hover:bg-violet-100 text-violet-600 border-violet-200",
      blue:    dk ? "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/25"           : "bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200",
      amber:   dk ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/25"       : "bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-200",
      gold:    dk ? "bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border-yellow-500/25"   : "bg-yellow-50 hover:bg-yellow-100 text-yellow-600 border-yellow-200",
    };
    return `${btnBase} ${map[color] || map.blue}`;
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
        display: "flex", justifyContent: "flex-end" }}
    >
      <div
        ref={modalRef}
        style={{
          width: "min(560px, 100vw)", height: "100%",
          background: dk ? "#0f1029" : "#ffffff",
          borderLeft: dk ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb",
          overflowY: "auto",
          animation: "slideInR 0.25s ease-out",
        }}
      >
        <style>{`@keyframes slideInR { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* Header */}
        <div className={`sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b ${
          dk ? "bg-[#0f1029] border-white/[0.06]" : "bg-white border-gray-200"
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0">
              {(student.name || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className={`font-bold text-base truncate ${dk ? "text-white" : "text-gray-900"}`}>{student.name}</div>
              <div className={`text-xs flex items-center gap-2 truncate ${dk ? "text-white/40" : "text-gray-500"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${presence?.isOnline ? "bg-emerald-400 animate-pulse" : "bg-gray-400"}`} />
                {presence?.isOnline ? "Live" : "Offline"} · {presence?.lastAction || "No activity yet"}
              </div>
            </div>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg cursor-pointer ${dk ? "hover:bg-white/[0.06] text-white/40 hover:text-white" : "hover:bg-gray-100 text-gray-400 hover:text-gray-700"}`}>
            <X size={18} />
          </button>
        </div>

        {/* Flash toast */}
        {flash && (
          <div style={{ position: "sticky", top: 80, zIndex: 20, margin: "8px 16px",
            padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: dk ? "rgba(16,185,129,0.15)" : "#d1fae5",
            color: dk ? "#6ee7b7" : "#047857",
            border: `1px solid ${dk ? "rgba(16,185,129,0.3)" : "#6ee7b7"}`,
            animation: "scaleIn 0.2s ease-out" }}>
            {flash}
          </div>
        )}

        <div className="p-5 space-y-5">
          {/* Screen preview — large, 2s refresh */}
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${dk ? "text-white/40" : "text-gray-500"}`}>
              Live Preview
              {snapshot?.capturedAt && (
                <span className={`ml-auto normal-case tracking-normal font-normal ${dk ? "text-white/25" : "text-gray-400"}`}>
                  <Clock size={9} className="inline mr-1" />
                  {Math.max(0, Math.floor((Date.now() - new Date(snapshot.capturedAt).getTime()) / 1000))}s ago
                </span>
              )}
            </div>
            <div style={{
              aspectRatio: "16/9", borderRadius: 12, overflow: "hidden",
              background: "#07071a",
              border: dk ? "1px solid rgba(255,255,255,0.06)" : "1px solid #e5e7eb",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {snapshot?.data ? (
                <img src={snapshot.data} alt={`${student.name}'s screen`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div className={`text-xs ${dk ? "text-white/20" : "text-gray-400"}`}>
                  Waiting for first screenshot from student…
                </div>
              )}
            </div>
            {snapshot?.path && (
              <div className={`text-[10px] mt-1.5 ${dk ? "text-white/30" : "text-gray-400"}`}>
                on <code className={dk ? "text-violet-400" : "text-violet-600"}>{snapshot.path}</code>
              </div>
            )}
          </div>

          {/* Message box */}
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
              Quick message
            </div>
            <div className="flex gap-2">
              <input value={msg} onChange={e => setMsg(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSendMsg()}
                placeholder="Type a short message…"
                className="input text-sm flex-1" />
              <button onClick={handleSendMsg} disabled={!msg.trim()} className="btn-primary px-4 gap-1.5">
                <Send size={13} /> Send
              </button>
            </div>
          </div>

          {/* Actions grid */}
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${dk ? "text-white/40" : "text-gray-500"}`}>
              Controls
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleLock}   className={btn("red")}>       <Lock size={13}/>     Lock This Student</button>
              <button onClick={handleUnlock} className={btn("emerald")}>   <LockOpen size={13}/> Unlock This Student</button>

              <div className="relative col-span-2">
                <button onClick={() => setPushMenu(v => !v)} className={btn("blue") + " w-full"}>
                  <Navigation size={13}/> Push to Page ▾
                </button>
                {pushMenu && (
                  <div className={`absolute top-full mt-1 left-0 right-0 rounded-xl shadow-2xl border z-50 overflow-hidden ${dk ? "bg-[#0f1029] border-white/[0.08]" : "bg-white border-gray-200"}`}>
                    {PUSH_PAGES.map(p => (
                      <button key={p.path} onClick={() => handlePush(p.path)}
                        className={`w-full text-left px-4 py-2.5 text-xs cursor-pointer transition-colors ${dk ? "hover:bg-white/[0.05] text-white/70 hover:text-white" : "hover:bg-gray-50 text-gray-700"}`}>
                        → {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={handleKick} className={btn("amber") + " col-span-2"}>
                <Navigation size={13}/> Kick to Dashboard
              </button>

              <button onClick={handleGrant}  className={btn("gold")}>   <Gift size={13}/> Grant Free Time</button>
              <button onClick={handleRevoke} className={btn("red")}>    <Ban  size={13}/> Revoke Free Time</button>
            </div>
          </div>

          {/* Last snapshot & activity footer */}
          <div className={`text-[10px] pt-4 border-t ${dk ? "border-white/[0.05] text-white/25" : "border-gray-100 text-gray-400"}`}>
            Student ID: <code>{student.id.slice(0, 8)}</code> · Class <code>{classId.slice(0, 8)}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
