import React, { useState, useEffect, useSyncExternalStore } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { isWorkUnlocked, isAccessAllowed, clearWorkUnlock, setWorkUnlocked } from "../lib/workUnlock.ts";
import VideoOverlay from "./VideoOverlay.tsx";
import ScreenLockOverlay from "./ScreenLockOverlay.tsx";
import BreakChoiceModal from "./BreakChoiceModal.tsx";
import StudentStarsBadge from "./StudentStarsBadge.tsx";
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
  Sun, Moon, LogOut, Layers, Gamepad2, Globe, Clock, Tv, Menu,
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

  // Collapsible sidebar
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem("sidebarOpen") !== "false"; } catch { return true; }
  });
  const toggleSidebar = () => setSidebarOpen(v => {
    const next = !v;
    try { localStorage.setItem("sidebarOpen", String(next)); } catch {}
    return next;
  });

  // Student mini-dashboard stats
  const [studentStats, setStudentStats] = useState<{ stars: number; rewards: number; rank: number | null } | null>(null);
  useEffect(() => {
    if (!isStudent) return;
    Promise.all([
      api.getMyStars().catch(() => ({ stars: 0, rewards: 0 })),
      api.getLeaderboard().catch(() => [] as any[]),
    ]).then(([starsData, lb]) => {
      const rank = lb.findIndex((e: any) => e.id === user.id);
      setStudentStats({ stars: (starsData as any).stars ?? 0, rewards: (starsData as any).rewards ?? 0, rank: rank >= 0 ? rank + 1 : null });
    }).catch(() => {});
  }, [isStudent, user.id]);

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
        <StudentStarsBadge />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: dk ? "#070714" : "#f0f1f8" }}>

      {/* ── Floating hamburger when sidebar is closed ── */}
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          title="Open menu"
          style={{
            position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)",
            zIndex: 200,
            width: 28, height: 56,
            background: dk ? "rgba(124,58,237,0.85)" : "rgba(124,58,237,0.9)",
            border: "none", borderRadius: "0 10px 10px 0",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            boxShadow: "2px 0 16px rgba(124,58,237,0.35)",
          }}
        >
          <Menu size={15} color="white" />
        </button>
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarOpen ? 210 : 0,
        flexShrink: 0,
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        background: dk
          ? "linear-gradient(180deg, #0d0d24 0%, #0a0b1e 100%)"
          : "linear-gradient(180deg, #ffffff 0%, #f8f8ff 100%)",
        borderRight: sidebarOpen ? `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}` : "none",
        position: "relative",
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        minWidth: 0,
      }}>
        {/* Subtle glow behind logo */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 120,
          background: "radial-gradient(ellipse at 50% -10%, rgba(124,58,237,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Logo row + hamburger close button */}
        <div style={{
          padding: "16px 12px 14px",
          borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"}`,
          position: "relative",
          display: "flex", alignItems: "center", gap: 8,
          minWidth: 210,
        }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flex: 1, minWidth: 0 }}>
            <div style={{
              width: 32, height: 32, flexShrink: 0,
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(124,58,237,0.45)",
            }}>
              <Layers size={14} color="white" />
            </div>
            <span style={{
              fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", whiteSpace: "nowrap",
              background: "linear-gradient(90deg, #a78bfa, #818cf8)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              BlockForge
            </span>
          </Link>
          <button
            onClick={toggleSidebar}
            title="Collapse menu"
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: 8,
              border: `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)"}`,
              background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
              color: dk ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Menu size={13} />
          </button>
        </div>

        {/* Student mini-dashboard card */}
        {isStudent && studentStats !== null && (
          <div style={{
            margin: "10px 8px 4px",
            padding: "12px 12px",
            borderRadius: 12,
            background: "linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(79,70,229,0.12) 100%)",
            border: "1px solid rgba(124,58,237,0.25)",
            minWidth: 194,
          }}>
            {/* User identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontSize: 13, fontWeight: 800,
                boxShadow: "0 2px 8px rgba(124,58,237,0.4)",
              }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Student</div>
              </div>
            </div>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[
                { emoji: "⭐", value: studentStats.stars, label: "Stars" },
                { emoji: "🏆", value: studentStats.rank !== null ? `#${studentStats.rank}` : "—", label: "Rank" },
                { emoji: "🎯", value: studentStats.rewards, label: "Rewards" },
              ].map(({ emoji, value, label }) => (
                <div key={label} style={{
                  background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "6px 4px",
                  textAlign: "center", border: "1px solid rgba(255,255,255,0.08)",
                }}>
                  <div style={{ fontSize: 14 }}>{emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.9)", lineHeight: 1.2 }}>{value}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, minWidth: 194 }}>
          {navItems.map((item, i) => {
            const active =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));
            const isArcade = item.path === "/arcade" || String(item.label).includes("Arcade");
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "10px 10px", borderRadius: 10, textDecoration: "none",
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  minHeight: 42, touchAction: "manipulation",
                  transition: "all 0.15s ease",
                  animationDelay: `${i * 35}ms`,
                  whiteSpace: "nowrap",
                  ...(active
                    ? {
                        background: isArcade
                          ? "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.18))"
                          : dk
                          ? "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(79,70,229,0.15))"
                          : "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(79,70,229,0.08))",
                        color: "#a78bfa",
                        border: `1px solid rgba(124,58,237,${dk ? "0.35" : "0.2"})`,
                        boxShadow: "0 2px 12px rgba(124,58,237,0.18)",
                      }
                    : {
                        background: "transparent",
                        color: dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.5)",
                        border: "1px solid transparent",
                      }),
                }}
              >
                <item.icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.label}
                </span>
                {isArcade && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 6,
                    background: "rgba(139,92,246,0.3)", color: "#c4b5fd",
                  }}>NEW</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "10px 8px 12px", borderTop: `1px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"}`, display: "flex", flexDirection: "column", gap: 5, minWidth: 194 }}>
          <button
            onClick={toggleTheme}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 10px", borderRadius: 10, fontSize: 12, fontWeight: 500,
              minHeight: 40, touchAction: "manipulation",
              cursor: "pointer", border: `1px solid ${dk ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.1)"}`,
              background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
              color: dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
              whiteSpace: "nowrap",
            }}
          >
            {dk ? <Sun size={13} /> : <Moon size={13} />}
            {dk ? "Light mode" : "Dark mode"}
          </button>

          {/* Non-student user card */}
          {!isStudent && (
            <div style={{
              display: "flex", alignItems: "center", gap: 9,
              padding: "8px 10px", borderRadius: 10,
              background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
              border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"}`,
              minWidth: 0,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontSize: 11, fontWeight: 800,
              }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: dk ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)",
                }}>{user.name}</div>
                <div style={{ fontSize: 10, textTransform: "capitalize", color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)" }}>{user.role}</div>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 10px", borderRadius: 10, fontSize: 12, fontWeight: 500,
              minHeight: 40, touchAction: "manipulation",
              cursor: "pointer", border: "1px solid transparent",
              background: "transparent",
              color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)",
              whiteSpace: "nowrap",
            }}
          >
            <LogOut size={13} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto", minWidth: 0 }} className="animate-page-enter">
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
      <StudentStarsBadge />
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
      { path: "/board",              icon: Tv,              label: "Board"      },
      { path: "/teacher/board-settings", icon: Tv,          label: "Board Settings" },
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
      { path: "/teacher/board-settings", icon: Tv, label: "Board Settings" },
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
