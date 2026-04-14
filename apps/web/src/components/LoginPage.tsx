import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";

export default function LoginPage() {
  const { user, login, register } = useAuth();
  if (user) return <Navigate to="/" replace />;

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, name, role);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-violet-600/20 rounded-full blur-[128px] animate-pulse-slow" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px] animate-pulse-slow" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-violet-500/30 rotate-3">
              <span className="text-2xl font-black text-white">B</span>
            </div>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400">BlockForge</span>
          </h1>
          <p className="text-white/40 mt-2 text-sm">Build, code, and create in 2D & 3D</p>
        </div>

        <div className="bg-white/[0.04] backdrop-blur-2xl rounded-3xl border border-white/[0.08] p-8 shadow-2xl shadow-black/20 animate-slide-up">
          <div className="flex mb-8 bg-white/[0.04] rounded-xl p-1">
            <button onClick={() => setIsRegister(false)}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${!isRegister ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20" : "text-white/40 hover:text-white/60"}`}>
              Sign In
            </button>
            <button onClick={() => setIsRegister(true)}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${isRegister ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20" : "text-white/40 hover:text-white/60"}`}>
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Your full name" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@school.edu" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="••••••••" required />
            </div>
            {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</div>}
            <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
              {loading ? "..." : isRegister ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/[0.06]">
            <p className="text-xs text-white/30 text-center mb-3">Quick demo access</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { email: "admin@school.edu", label: "Admin", icon: "👑", gradient: "from-amber-500 to-orange-600" },
                { email: "teacher@school.edu", label: "Teacher", icon: "📚", gradient: "from-blue-500 to-cyan-600" },
                { email: "student1@school.edu", label: "Student", icon: "🎓", gradient: "from-emerald-500 to-green-600" },
              ].map((demo) => (
                <button key={demo.email}
                  onClick={() => { setEmail(demo.email); setPassword("password123"); setIsRegister(false); }}
                  className={`bg-gradient-to-r ${demo.gradient} text-white text-xs py-2 px-3 rounded-xl hover:opacity-90 transition-all duration-200 active:scale-95 font-medium shadow-lg shadow-black/20 flex flex-col items-center gap-0.5`}>
                  <span className="text-base">{demo.icon}</span>
                  {demo.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-white/20 text-xs mt-6">BlockForge — Next-gen visual coding platform</p>
        <a href="/playground"
          className="block text-center mt-3 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors">
          🎨 Try Playground (no login needed)
        </a>
      </div>
    </div>
  );
}
