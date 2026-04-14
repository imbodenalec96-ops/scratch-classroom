import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";

export default function ProjectsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"2d" | "3d">("2d");

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
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Projects</h1>
          <p className="text-white/40 text-sm mt-1">Create and manage your BlockForge projects</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="btn-primary flex items-center gap-2">
          <span className="text-lg leading-none">+</span> New Project
        </button>
      </div>

      {showNew && (
        <div className="card border-violet-500/20">
          <h2 className="text-lg font-semibold text-white mb-4">Create New Project</h2>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs text-white/40 mb-1.5">Project Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Awesome Game"
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:border-violet-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Mode</label>
              <div className="flex rounded-xl overflow-hidden border border-white/[0.08]">
                {(["2d", "3d"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`px-5 py-2.5 text-sm font-medium transition-colors ${mode === m
                      ? "bg-violet-600 text-white" : "bg-white/[0.04] text-white/40 hover:text-white/60"}`}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleCreate} className="btn-primary">Create</button>
            <button onClick={() => setShowNew(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {projects.map((p) => (
          <div key={p.id} className="card-hover group relative">
            <div className="h-36 rounded-xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 flex items-center justify-center mb-4 border border-white/[0.04]">
              <span className="text-4xl opacity-40">{p.mode === "3d" ? "🧊" : "🎮"}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white group-hover:text-violet-300 transition-colors">{p.name}</h3>
                <p className="text-xs text-white/30 mt-0.5">{p.mode?.toUpperCase() || "2D"} · Updated {new Date(p.updated_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link to={`/project/${p.id}`}
                  className="px-3 py-1.5 text-xs rounded-lg bg-violet-600/80 text-white hover:bg-violet-500 transition-colors">Open</Link>
                <button onClick={() => handleDelete(p.id)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {projects.length === 0 && !showNew && (
          <div className="col-span-3 text-center py-20">
            <div className="text-5xl mb-4 opacity-30">🎨</div>
            <div className="text-white/30 text-sm">No projects yet. Create one to get started!</div>
          </div>
        )}
      </div>
    </div>
  );
}
