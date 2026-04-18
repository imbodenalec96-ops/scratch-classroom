import React, { useEffect, useState, useSyncExternalStore } from "react";
import { useBlockAutoNav } from "../lib/useBlockAutoNav.ts";
import { api } from "../lib/api.ts";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { Layers, Gamepad2, Code2, LogIn } from "lucide-react";
import { useClassCommands } from "../lib/useClassCommands.ts";
import { useStudentCommands } from "../lib/useStudentCommands.ts";
import { studentLockStore } from "../lib/studentLockStore.ts";
import { studentMessageStore } from "../lib/studentMessageStore.ts";
import { studentFreetimeStore } from "../lib/studentFreetimeStore.ts";
import { studentVideoStore } from "../lib/studentVideoStore.ts";
import { setBreakState } from "../lib/breakSystem.ts";
import { usePresencePing, activityFromPath } from "../lib/presence.ts";
import { useScreenshotCapture } from "../lib/useScreenshotCapture.ts";
import ScreenLockOverlay from "./ScreenLockOverlay.tsx";
import BreakChoiceModal from "./BreakChoiceModal.tsx";

export default function PublicLayout() {
  const { user } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();

  // Students on public routes (like /arcade) still need the lock overlay +
  // command polling — otherwise teachers can't lock them when they're
  // playing arcade games.
  const isStudent = user?.role === "student";
  const classCommands = useClassCommands(isStudent);
  // New pipe — same LOCK/UNLOCK wiring as Layout so arcade-page students
  // also respond to student_commands lock.
  useStudentCommands(isStudent, {
    LOCK: (row) => {
      let msg: string | null = null;
      try { msg = JSON.parse(row.payload || "{}").message ?? null; } catch { msg = row.payload || null; }
      studentLockStore.setLocked(true, msg);
    },
    UNLOCK: () => studentLockStore.setLocked(false, null),
    MESSAGE: (row) => {
      studentMessageStore.setMessage(row.payload || "");
    },
    GRANT_FREETIME: (row) => {
      let until: string | null = null;
      try { until = JSON.parse(row.payload || "{}").until ?? null; } catch { /* malformed payload — fall through */ }
      studentFreetimeStore.setGranted(until);
    },
    REVOKE_FREETIME: () => {
      studentFreetimeStore.setRevoked();
      studentMessageStore.setMessage("Free time ended — back to work 📚");
      navigate("/assignments");
    },
    END_BREAK: () => {
      setBreakState({ path: "fullwork", breakStartAt: 0, breakEndAt: 0, breakOffered: true });
      studentMessageStore.setMessage("Break ended — back to work 📚");
      navigate("/assignments");
    },
    BROADCAST_VIDEO: (row) => {
      let videoId: string | null = null;
      let url: string | null = null;
      try {
        const p = JSON.parse(row.payload || "{}");
        videoId = p.videoId ?? null;
        url = p.url ?? null;
      } catch { /* malformed payload */ }
      if (videoId) studentVideoStore.setBroadcast(videoId, url);
    },
    END_BROADCAST: () => studentVideoStore.clear(),
  });
  const newLock = useSyncExternalStore(
    studentLockStore.subscribe,
    studentLockStore.getSnapshot,
    studentLockStore.getSnapshot,
  );
  const newMessage = useSyncExternalStore(
    studentMessageStore.subscribe,
    studentMessageStore.getSnapshot,
    studentMessageStore.getSnapshot,
  );
  // Rich activity labels for authenticated users
  usePresencePing(user ? activityFromPath(loc.pathname) : "");

  // Schedule auto-nav — pulls students back to class at block boundaries even
  // when they're on public routes like /arcade.
  const [studentClassId, setStudentClassId] = useState<string | null>(null);
  useEffect(() => {
    if (!isStudent) { setStudentClassId(null); return; }
    let cancelled = false;
    api.getClasses()
      .then((cs: any[]) => { if (!cancelled) setStudentClassId((cs || [])[0]?.id ?? null); })
      .catch(() => { if (!cancelled) setStudentClassId(null); });
    return () => { cancelled = true; };
  }, [isStudent, user?.id]);
  useBlockAutoNav(isStudent, studentClassId);
  // Screenshot thumbnails for teacher monitor (students on public routes too)
  useScreenshotCapture(isStudent);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#07071a" }}>
      {/* Top nav */}
      <nav
        className="flex items-center justify-between px-6 py-3 flex-shrink-0 sticky top-0 z-40"
        style={{ background: "rgba(7,7,26,0.9)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(139,92,246,0.12)" }}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-600/30 group-hover:shadow-violet-500/50 transition-all">
            <Layers size={15} className="text-white" />
          </div>
          <span className="text-[16px] font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400">
            BlockForge
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          <Link
            to="/arcade"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{
              color: loc.pathname.startsWith("/arcade") ? "#a78bfa" : "rgba(255,255,255,0.6)",
              background: loc.pathname.startsWith("/arcade") ? "rgba(139,92,246,0.12)" : "transparent",
            }}
          >
            <Gamepad2 size={15} />
            Arcade
          </Link>
          <Link
            to="/playground"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <Code2 size={15} />
            Editor
          </Link>
        </div>

        {/* Auth button */}
        {user ? (
          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)" }}
          >
            Dashboard →
          </Link>
        ) : (
          <Link
            to="/login"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", boxShadow: "0 4px 12px rgba(139,92,246,0.35)" }}
          >
            <LogIn size={14} />
            Sign In
          </Link>
        )}
      </nav>

      {/* Page content */}
      <div className="flex-1">
        <Outlet />
      </div>

      {/* GoGuardian overlay — only for authenticated students */}
      {isStudent && (
        <ScreenLockOverlay
          isLocked={classCommands.isLocked || newLock.locked}
          message={newLock.locked && newLock.message ? newLock.message : classCommands.lockMessage}
          lockedBy={classCommands.lockedBy}
          pendingMessage={newMessage || classCommands.pendingMessage}
          onDismissMessage={() => { studentMessageStore.dismiss(); classCommands.dismissMessage(); }}
        />
      )}

      {/* Break system — same modal + banner work everywhere */}
      {isStudent && <BreakChoiceModal />}
    </div>
  );
}
