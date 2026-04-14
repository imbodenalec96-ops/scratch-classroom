import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  if (!user) return null;
  const navItems = getNavItems(user.role);

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex">
      <aside className="w-60 bg-white/[0.02] border-r border-white/[0.06] flex flex-col backdrop-blur-xl">
        <div className="p-5 border-b border-white/[0.06]">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20 group-hover:shadow-violet-500/40 transition-all duration-300 rotate-2 group-hover:rotate-0">
              <span className="text-sm font-black text-white">B</span>
            </div>
            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400">BlockForge</span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link key={item.path} to={item.path}
                className={active ? "nav-link-active" : "nav-link-inactive"}>
                <span className="text-base w-6 text-center">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-violet-500/20">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{user.name}</div>
              <div className="text-[11px] text-white/30 capitalize">{user.role}</div>
            </div>
          </div>
          <button onClick={logout}
            className="w-full text-xs py-2 px-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl text-white/50 hover:text-white transition-all duration-200">
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function getNavItems(role: string) {
  const common = [
    { path: "/", icon: "⌂", label: "Dashboard" },
    { path: "/projects", icon: "◆", label: "Projects" },
    { path: "/lessons", icon: "📖", label: "Lessons" },
  ];
  if (role === "admin") {
    return [...common,
      { path: "/analytics", icon: "◎", label: "Analytics" },
    ];
  }
  if (role === "teacher") {
    return [...common,
      { path: "/assignments", icon: "✎", label: "Assignments" },
      { path: "/quizzes", icon: "?", label: "Quizzes" },
      { path: "/grading", icon: "✓", label: "Grading" },
      { path: "/analytics", icon: "◎", label: "Analytics" },
      { path: "/monitor", icon: "◉", label: "Monitor" },
      { path: "/leaderboard", icon: "★", label: "Leaderboard" },
    ];
  }
  return [...common,
    { path: "/assignments", icon: "✎", label: "Assignments" },
    { path: "/leaderboard", icon: "★", label: "Leaderboard" },
    { path: "/achievements", icon: "◈", label: "Achievements" },
  ];
}
