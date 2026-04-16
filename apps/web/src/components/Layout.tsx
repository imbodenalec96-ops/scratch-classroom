import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import {
  LayoutDashboard, FolderOpen, BookOpen, Monitor, BarChart3,
  Trophy, ClipboardList, HelpCircle, CheckSquare, Medal,
  Sun, Moon, LogOut, Layers, Gamepad2,
} from "lucide-react";

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  if (!user) return null;
  const navItems = getNavItems(user.role);
  const dk = theme === "dark";

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
        <Outlet />
      </main>
    </div>
  );
}

function getNavItems(role: string) {
  const common = [
    { path: "/",           icon: LayoutDashboard, label: "Dashboard"   },
    { path: "/projects",   icon: FolderOpen,      label: "Projects"    },
    { path: "/lessons",    icon: BookOpen,        label: "Lessons"     },
    { path: "/arcade",     icon: Gamepad2,        label: "Arcade"      },
  ];
  if (role === "admin") {
    return [...common,
      { path: "/monitor",    icon: Monitor,   label: "Monitor"    },
      { path: "/analytics",  icon: BarChart3, label: "Analytics"  },
      { path: "/leaderboard",icon: Trophy,    label: "Leaderboard"},
    ];
  }
  if (role === "teacher") {
    return [...common,
      { path: "/assignments", icon: ClipboardList, label: "Assignments" },
      { path: "/quizzes",     icon: HelpCircle,    label: "Quizzes"     },
      { path: "/grading",     icon: CheckSquare,   label: "Grading"     },
      { path: "/analytics",   icon: BarChart3,     label: "Analytics"   },
      { path: "/monitor",     icon: Monitor,       label: "Monitor"     },
      { path: "/leaderboard", icon: Trophy,        label: "Leaderboard" },
    ];
  }
  return [...common,
    { path: "/assignments",  icon: ClipboardList, label: "Assignments" },
    { path: "/leaderboard",  icon: Trophy,        label: "Leaderboard" },
    { path: "/achievements", icon: Medal,         label: "Achievements"},
  ];
}
