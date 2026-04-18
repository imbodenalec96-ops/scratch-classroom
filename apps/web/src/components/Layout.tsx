import React, { useState, useEffect, useSyncExternalStore } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { isWorkUnlocked, isAccessAllowed, clearWorkUnlock, setWorkUnlocked } from "../lib/workUnlock.ts";
import VideoOverlay from "./VideoOverlay.tsx";
import ScreenLockOverlay from "./ScreenLockOverlay.tsx";
import BreakChoiceModal from "./BreakChoiceModal.tsx";
import CurrentBlockStrip from "./CurrentBlockStrip.tsx";
import { useClassCommands } from "../lib/useClassCommands.ts";
import { useStudentCommands } from "../lib/useStudentCommands.ts";
import { useBlockAutoNav } from "../lib/useBlockAutoNav.ts";
import { api } from "../lib/api.ts";
import { studentLockStore } from "../lib/studentLockStore.ts";
import { studentMessageStore } from "../lib/studentMessageStore.ts";
import { studentFreetimeStore } from "../lib/studentFreetimeStore.ts";
import { studentVideoStore } from "../lib/studentVideoStore.ts";
import { usePresencePing, activityFromPath } from "../lib/presence.ts";
import { useScreenshotCapture } from "../lib/useScreenshotCapture.ts";
import { markWorkStart, isOnBreak, setBreakState } from "../lib/breakSystem.ts";
import { useCurrentBlock } from "../lib/useCurrentBlock.ts";
import { subjectToRoute } from "../lib/useBlockAutoNav.ts";
import {
  LayoutDashboard, FolderOpen, BookOpen, Monitor, BarChart3,
  Trophy, ClipboardList, HelpCircle, CheckSquare, Medal,
  Sun, Moon, LogOut, Layers, Gamepad2, Globe, Clock, Tv,
} from "lucide-react";

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  // Re-compute nav whenever location changes OR break state flips so
  // arcade/projects appear immediately after submitting work or starting a break.
  const [accessAllowed, setAccessAllowed] = useState(isAccessAllowed);
  useEffect(() => { setAccessAllowed(isAccessAllowed()); }, [location.pathname]);
  useEffect(() => {
    const refresh = () => setAccessAllowed(isAccessAllowed());
    window.addEventListener("breakstate-change", refresh);
    // Also poll every second — break state expires client-side via Date.now().
    const iv = setInterval(refresh, 1000);
    return () => { window.removeEventListener("breakstate-change", refresh); clearInterval(iv); };
  }, []);

  // GoGuardian: students poll for lock/commands; teachers/admin skip
  const isStudent = user?.role === "student";
  const classCommands = useClassCommands(isStudent);
  // New per-student command pipe. LOCK/UNLOCK wired; other actions follow
  // in subsequent commits. The hook auto-consumes each row after its handler
  // runs, so the poll keeps running while locked (UNLOCK can still arrive).
  useStudentCommands(isStudent, {
    LOCK: (row) => {
      let msg: string | null = null;
      try { msg = JSON.parse(row.payload || "{}").message ?? null; } catch { msg = row.payload || null; }
      studentLockStore.setLocked(true, msg);
    },
    UNLOCK: () => studentLockStore.setLocked(false, null),
    MESSAGE: (row) => {
      // Payload is the raw message text (matches legacy class_commands
      // MESSAGE payload shape so the server fan-out writes the same string
      // to both pipes).
      studentMessageStore.setMessage(row.payload || "");
    },
    GRANT_FREETIME: (row) => {
      let until: string | null = null;
      try { until = JSON.parse(row.payload || "{}").until ?? null; } catch { /* payload malformed — fall back to indefinite-until-revoke */ }
      studentFreetimeStore.setGranted(until);
    },
    REVOKE_FREETIME: () => {
      studentFreetimeStore.setRevoked(Date.now() + 60_000);
      studentMessageStore.setMessage("Free time ended — back to work 📚");
      navigate("/assignments");
    },
    END_BREAK: () => {
      // Clear the localStorage break state so isOnBreak() flips false and the
      // break modal doesn't immediately re-offer. We set path=fullwork + zero
      // out the start/end times (matches chooseFullWork's "keep grinding" exit
      // and won't re-prompt because breakOffered stays true).
      setBreakState({ path: "fullwork", breakStartAt: 0, breakEndAt: 0, breakOffered: true });
      clearWorkUnlock();
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
      } catch { /* malformed payload — nothing to show */ }
      if (videoId) studentVideoStore.setBroadcast(videoId, url);
    },
    END_BROADCAST: () => studentVideoStore.clear(),
  });
  // Subscribe to the new lock store and OR it into the existing overlay
  // props. Legacy class_commands lock (from useClassCommands) stays
  // authoritative for class-wide state until the old pipe is retired.
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
  // Rich activity labels tied to pathname — every route change re-pings
  usePresencePing(user ? activityFromPath(location.pathname) : "");
  // Screenshot thumbnails for teacher monitor (students only)
  useScreenshotCapture(isStudent);
  // Break system: start the work timer the first time a student loads the app
  useEffect(() => { if (isStudent) markWorkStart(); }, [isStudent]);

  // Schedule auto-nav: at block boundaries, push students to the right page
  // unless the teacher has recently NAVIGATEd them elsewhere (5-min grace).
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

  // Block-scoped lockdown. Subjects that imply "content mode" (single-route
  // focus, no sidebar, no escape) vs. "free" blocks (break, coding, review).
  const currentBlock = useCurrentBlock(isStudent ? studentClassId : null);
  const blockSubject = (currentBlock?.subject || "").toLowerCase();
  const LOCKDOWN_SUBJECTS = new Set([
    "daily_news", "sel", "math", "reading", "writing", "spelling",
    "video_learning", "ted_talk", "cashout", "dismissal",
  ]);
  // Scheduled break block → full free-time (arcade/projects/YouTube/Unity).
  const scheduledBreakActive = !!(currentBlock?.is_break);
  // Coding/Art/Gym: free if work already done today; otherwise lockdown to
  // assignments until the student finishes.
  const codingArtGymBlock = blockSubject === "coding_art_gym";
  const workDone = isWorkUnlocked();
  const codingArtGymLockdown = codingArtGymBlock && !workDone;
  const blockLockdown = !!(currentBlock && !currentBlock.is_break && LOCKDOWN_SUBJECTS.has(blockSubject));
  const blockRoute = currentBlock ? subjectToRoute(currentBlock) : null;

  // Effective access for the sidebar: break blocks + coding/art/gym (once
  // work is done) grant free-time browsing regardless of the older localStorage
  // workDoneDate flag.
  const effectiveAccess = accessAllowed || scheduledBreakActive || (codingArtGymBlock && workDone);

  // Takeover = either (a) the current block forces content-only mode, or
  // (b) coding/art/gym active but today's work isn't done, or
  // (c) no block info and access isn't allowed.
  // Scheduled breaks never trigger takeover — they grant freedom.
  const takeover = isStudent && !scheduledBreakActive && (blockLockdown || codingArtGymLockdown || (!currentBlock && !accessAllowed));

  // Redirect: when locked down, bounce any off-route navigation to the
  // block's target route (or /student if unknown). Only students, only when
  // the teacher hasn't recently pushed them elsewhere (5-min grace handled in
  // useBlockAutoNav).
  useEffect(() => {
    if (!takeover) return;
    const p = location.pathname;
    // Coding/Art/Gym lockdown (work not done) redirects to assignments,
    // not to /coding — they have to finish first.
    const target = codingArtGymLockdown ? "/student" : (blockRoute || "/student");
    // Allow the target route and its /student fallback while loading.
    const allowed =
      p === target ||
      p === "/student" ||
      p === "/" ||
      p.startsWith(target + "/");
    if (!allowed) navigate(target, { replace: true });
  }, [takeover, blockRoute, location.pathname, navigate, codingArtGymLockdown]);

  if (!user) return null;
  const navItems = getNavItems(user.role, effectiveAccess);
  const dk = theme === "dark";

  // Takeover mode: full-screen doer, no sidebar, no nav. Break modal + lock
  // overlay + break countdown pill still float above so escape routes
  // (earn-break, teacher override) keep working.
  if (takeover) {
    return (
      <div className={`min-h-screen ${dk ? "bg-[#07071a]" : "bg-[#f2f3f8]"}`}>
        <main className="min-h-screen animate-page-enter">
          <Outlet />
        </main>
        <VideoOverlay />
        <ScreenLockOverlay
          isLocked={classCommands.isLocked || newLock.locked}
          message={newLock.locked && newLock.message ? newLock.message : classCommands.lockMessage}
          lockedBy={classCommands.lockedBy}
          pendingMessage={newMessage || classCommands.pendingMessage}
          onDismissMessage={() => { studentMessageStore.dismiss(); classCommands.dismissMessage(); }}
        />
        <BreakChoiceModal />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex ${dk ? "bg-[#07071a]" : "bg-[#f2f3f8]"}`}>
      {/* Sidebar */}
      <aside className={`w-[220px] flex flex-col flex-shrink-0 border-r ${
        dk ? "bg-[#0a0b20] border-white/[0.05]" : "bg-white border-gray-200/80"
      }`}>
        {/* Logo */}
        <div className={`px-5 py-5 border-b ${dk ? "border-white/[0.05]" : "border-gray-100"}`}>
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-600/30 group-hover:shadow-violet-500/50 transition-all duration-300">
              <Layers size={15} className="text-white" />
            </div>
            <span className="text-[17px] font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400">
              BlockForge
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item, i) => {
            const active =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));
            const isArcade = item.path === "/arcade";
            if (isArcade) {
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="animate-slide-in flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 mt-1"
                  style={{
                    animationDelay: `${i * 40}ms`,
                    background: active ? "rgba(139,92,246,0.25)" : "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))",
                    border: `1px solid rgba(139,92,246,${active ? "0.5" : "0.3"})`,
                    color: active ? "#a78bfa" : "#c4b5fd",
                    boxShadow: "0 2px 8px rgba(139,92,246,0.2)",
                  }}
                >
                  <item.icon size={15} className="flex-shrink-0" />
                  🎮 Arcade
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.3)", color: "#c4b5fd" }}>NEW</span>
                </Link>
              );
            }
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`${active ? "nav-link-active" : "nav-link-inactive"} animate-slide-in`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className={`nav-dot ${active ? "nav-dot-active" : "nav-dot-inactive"}`} />
                <item.icon size={16} className="flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`px-3 pb-4 pt-3 border-t space-y-2 ${dk ? "border-white/[0.05]" : "border-gray-100"}`}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer ${
              dk
                ? "bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 border border-white/[0.05]"
                : "bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 border border-gray-200"
            }`}
          >
            {dk ? <Sun size={14} /> : <Moon size={14} />}
            {dk ? "Light Mode" : "Dark Mode"}
          </button>

          {/* User */}
          <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded-xl ${
            dk ? "bg-white/[0.03]" : "bg-gray-50"
          }`}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-violet-600/20 flex-shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold truncate leading-tight ${dk ? "text-white" : "text-gray-900"}`}>
                {user.name}
              </div>
              <div className={`text-[11px] capitalize leading-tight ${dk ? "text-white/30" : "text-gray-400"}`}>
                {user.role}
              </div>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={logout}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer ${
              dk
                ? "text-white/35 hover:text-red-400 hover:bg-red-500/[0.08]"
                : "text-gray-400 hover:text-red-500 hover:bg-red-50"
            }`}
          >
            <LogOut size={13} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto animate-page-enter min-w-0">
        {/* Schedule-block header — display-only. Renders nothing when no class,
            no schedule, or the wall clock is outside every block. */}
        <CurrentBlockStrip />
        <Outlet />
      </main>

      {/* Video lockdown overlay for students */}
      <VideoOverlay />

      {/* GoGuardian: screen lock + teacher message overlay (students only) */}
      {isStudent && (
        <ScreenLockOverlay
          isLocked={classCommands.isLocked || newLock.locked}
          message={newLock.locked && newLock.message ? newLock.message : classCommands.lockMessage}
          lockedBy={classCommands.lockedBy}
          pendingMessage={newMessage || classCommands.pendingMessage}
          onDismissMessage={() => { studentMessageStore.dismiss(); classCommands.dismissMessage(); }}
        />
      )}

      {/* Break system: modal + countdown banner */}
      {isStudent && <BreakChoiceModal />}
    </div>
  );
}

function getNavItems(role: string, workDone = isWorkUnlocked() || isOnBreak()) {
  const common = [
    { path: "/",           icon: LayoutDashboard, label: "Dashboard"   },
    { path: "/projects",   icon: FolderOpen,      label: "Projects"    },
    { path: "/lessons",    icon: BookOpen,        label: "Lessons"     },
    { path: "/arcade",     icon: Gamepad2,        label: "Arcade"      },
  ];
  if (role === "admin") {
    return [
      { path: "/admin-dashboard", icon: LayoutDashboard, label: "Admin Home" },
      { path: "/monitor",         icon: Monitor,         label: "Monitor"    },
      { path: "/assignments",     icon: ClipboardList,   label: "Assignments"},
      { path: "/quizzes",         icon: HelpCircle,      label: "Quizzes"    },
      { path: "/class-grades",    icon: Medal,           label: "Class Grades"},
      { path: "/teacher/gradebook", icon: CheckSquare,    label: "Gradebook"  },
      { path: "/teacher/websites", icon: Globe,           label: "Websites"   },
      { path: "/teacher/schedule", icon: Clock,           label: "Schedule"   },
      { path: "/board",           icon: Tv,              label: "Board"      },
      { path: "/analytics",       icon: BarChart3,       label: "Analytics"  },
      { path: "/leaderboard",     icon: Trophy,          label: "Leaderboard"},
      { path: "/lessons",         icon: BookOpen,        label: "Lessons"    },
      { path: "/projects",        icon: FolderOpen,      label: "Projects"   },
    ];
  }
  if (role === "teacher") {
    return [...common,
      { path: "/assignments", icon: ClipboardList, label: "Assignments" },
      { path: "/quizzes",     icon: HelpCircle,    label: "Quizzes"     },
      { path: "/teacher/gradebook", icon: CheckSquare, label: "Gradebook" },
      { path: "/teacher/websites", icon: Globe,     label: "Websites"    },
      { path: "/teacher/schedule", icon: Clock,     label: "Schedule"    },
      { path: "/board",       icon: Tv,            label: "Board"       },
      { path: "/analytics",   icon: BarChart3,     label: "Analytics"   },
      { path: "/monitor",     icon: Monitor,       label: "Monitor"     },
      { path: "/leaderboard", icon: Trophy,        label: "Leaderboard" },
    ];
  }
  // Students: base nav + arcade/projects unlocked after completing work
  const studentBase = [
    { path: "/",             icon: LayoutDashboard, label: "Dashboard"   },
    { path: "/lessons",      icon: BookOpen,        label: "Lessons"     },
    { path: "/assignments",  icon: ClipboardList,   label: "Assignments" },
    { path: "/leaderboard",  icon: Trophy,          label: "Leaderboard" },
    { path: "/achievements", icon: Medal,           label: "Achievements"},
  ];
  if (workDone) {
    studentBase.push(
      { path: "/arcade",    icon: Gamepad2,   label: "🎮 Arcade"  },
      { path: "/projects",  icon: FolderOpen, label: "💻 Projects" },
    );
  }
  return studentBase;
}
