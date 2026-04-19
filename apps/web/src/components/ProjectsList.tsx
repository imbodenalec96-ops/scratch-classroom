import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { Plus, FolderOpen, Box, Palette, Trash2, ExternalLink, X } from "lucide-react";

// Route-level ProjectsGuard in App.tsx already enforces access — only students
// who have completed their work OR teachers/admins reach this component.
export default function ProjectsList() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"2d" | "3d" | "unity">("2d");

  useEffect(() => {
    api.getProjects().then(setProjects).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const p = await api.createProject(name, mode);
    navigate(`/project/${p.id}`);
  };

  const handleDelete = async (id: string) => {
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="p-7 space-y-6 animate-page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${dk ? "text-white" : "text-gray-900"}`}>Projects</h1>
          <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
            Create and manage your BlockForge projects
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary gap-2">
          <Plus size={15} />
          New Project
        </button>
      </div>

      {showNew && (
        <div className={`card border-violet-500/25 ${dk ? "bg-violet-500/[0.04]" : "bg-violet-50"}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-base font-semibold ${dk ? "text-white" : "text-gray-900"}`}>Create New Project</h2>
            <button onClick={() => setShowNew(false)} className="btn-ghost p-1.5">
              <X size={15} />
            </button>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className={`block text-xs font-medium mb-1.5 ${dk ? "text-white/45" : "text-gray-500"}`}>
                Project Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Game"
                className="input"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${dk ? "text-white/45" : "text-gray-500"}`}>
                Mode
              </label>
              <div className={`flex rounded-xl overflow-hidden border ${dk ? "border-white/[0.08]" : "border-gray-200"}`}>
                {([
                  { id: "2d",    label: "2D",    icon: "🎨" },
                  { id: "3d",    label: "3D",    icon: "🧊" },
                  { id: "unity", label: "Unity", icon: "🎮" },
                ] as const).map(({ id: m, label, icon }) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      mode === m
                        ? "bg-violet-600 text-white"
                        : dk ? "bg-white/[0.03] text-white/35 hover:text-white/60" : "bg-gray-50 text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    <span>{icon}</span> {label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleCreate} className="btn-primary">Create</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {projects.map((p) => (
          <div key={p.id} className="card-hover group relative overflow-hidden">
            <div className={`h-32 rounded-xl flex items-center justify-center mb-4 border transition-all ${
              dk
                ? "bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border-white/[0.05] group-hover:from-violet-500/15 group-hover:to-indigo-500/15"
                : "bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-100 group-hover:from-violet-100 group-hover:to-indigo-100"
            }`}>
              {p.mode === "3d"
                ? <Box size={36} className="text-violet-400 opacity-50" />
                : <Palette size={36} className="text-violet-400 opacity-50" />
              }
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className={`font-semibold text-sm truncate group-hover:text-violet-400 transition-colors ${dk ? "text-white" : "text-gray-900"}`}>
                  {p.name || p.title}
                </h3>
                <p className={`text-xs mt-0.5 ${dk ? "text-white/25" : "text-gray-400"}`}>
                  {(p.mode || "2d").toUpperCase()} · {new Date(p.updated_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <Link
                  to={`/project/${p.id}`}
                  className="p-1.5 rounded-lg bg-violet-600/80 text-white hover:bg-violet-500 transition-colors"
                >
                  <ExternalLink size={13} />
                </Link>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {projects.length === 0 && !showNew && (
          <div className="col-span-3 text-center py-20">
            <FolderOpen size={40} className={`mx-auto mb-3 ${dk ? "text-white/15" : "text-gray-300"}`} />
            <p className={`text-sm ${dk ? "text-white/30" : "text-gray-400"}`}>
              No projects yet — create one to get started!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
