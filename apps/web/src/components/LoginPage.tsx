import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { Layers, Sun, Moon, ArrowRight } from "lucide-react";

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
        await register(email.trim().toLowerCase(), password, name.trim(), role);
      } else {
        await login(email.trim().toLowerCase(), password);
      }
    } catch (err: any) {
      setError(err?.message || "Sign in failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <LoginPageInner
      isRegister={isRegister} setIsRegister={setIsRegister}
      name={name} setName={setName} email={email} setEmail={setEmail}
      password={password} setPassword={setPassword}
      role={role} setRole={setRole}
      error={error} loading={loading}
      handleSubmit={handleSubmit} login={login}
      setError={setError} setLoading={setLoading}
    />
  );
}

function LoginPageInner({ isRegister, setIsRegister, name, setName, email, setEmail, password, setPassword, role, setRole, error, loading, handleSubmit, login, setError, setLoading }: any) {
  const { theme, toggleTheme } = useTheme();
  const dk = theme === "dark";


  return (
    <div className={`min-h-screen flex ${dk ? "bg-[#07071a]" : "bg-[#f2f3f8]"}`}>
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden items-center justify-center p-16">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-1/3 left-1/4 w-[480px] h-[480px] rounded-full blur-[120px] ${dk ? "bg-violet-600/20" : "bg-violet-400/25"}`} />
          <div className={`absolute bottom-1/3 right-1/4 w-[360px] h-[360px] rounded-full blur-[100px] ${dk ? "bg-indigo-600/15" : "bg-indigo-400/20"}`} />
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[160px] ${dk ? "bg-cyan-500/8" : "bg-cyan-400/10"}`} />
        </div>

        {/* Grid pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        <div className="relative z-10 text-center max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-violet-600/40 animate-float">
              <Layers size={30} className="text-white" />
            </div>
          </div>
          <h1 className={`text-5xl font-extrabold tracking-tight mb-4 ${dk ? "text-white" : "text-gray-900"}`}>
            Build. Code.{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400">
              Create.
            </span>
          </h1>
          <p className={`text-lg leading-relaxed mb-10 ${dk ? "text-white/45" : "text-gray-500"}`}>
            A visual coding platform where students build real projects with drag-and-drop blocks, 2D sprites, and 3D worlds.
          </p>

          <div className="grid grid-cols-3 gap-3 text-left">
            {[
              { icon: "65+", label: "Code Blocks" },
              { icon: "2D/3D", label: "Stage Modes" },
              { icon: "AI", label: "Assistant" },
            ].map((f) => (
              <div key={f.label} className={`rounded-2xl p-4 border ${dk ? "bg-white/[0.04] border-white/[0.06]" : "bg-white border-gray-200 shadow-sm"}`}>
                <div className="text-violet-400 font-extrabold text-lg mb-1">{f.icon}</div>
                <div className={`text-xs font-medium ${dk ? "text-white/50" : "text-gray-500"}`}>{f.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className={`w-full lg:w-[480px] flex flex-col items-center justify-center p-8 relative ${
        dk ? "bg-[#0a0b20] border-l border-white/[0.05]" : "bg-white border-l border-gray-100 shadow-xl"
      }`}>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={`absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            dk ? "bg-white/[0.06] hover:bg-white/[0.12] text-white/60" : "bg-gray-100 hover:bg-gray-200 text-gray-500"
          }`}
        >
          {dk ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-600/30">
              <Layers size={17} className="text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400">
              BlockForge
            </span>
          </div>

          <div className="mb-7">
            <h2 className={`text-2xl font-bold tracking-tight ${dk ? "text-white" : "text-gray-900"}`}>
              {isRegister ? "Create your account" : "Welcome back"}
            </h2>
            <p className={`text-sm mt-1 ${dk ? "text-white/40" : "text-gray-500"}`}>
              {isRegister ? "Join BlockForge and start building" : "Sign in to continue coding"}
            </p>
          </div>

          {/* Tab switcher */}
          <div className={`flex mb-6 rounded-xl p-1 gap-1 ${dk ? "bg-white/[0.04]" : "bg-gray-100"}`}>
            {["Sign In", "Register"].map((label, i) => (
              <button
                key={label}
                onClick={() => setIsRegister(i === 1)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                  (isRegister ? i === 1 : i === 0)
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                    : dk ? "text-white/35 hover:text-white/60" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${dk ? "text-white/50" : "text-gray-500"}`}>
                    Full Name
                  </label>
                  <input
                    value={name}
                    onChange={(e: any) => setName(e.target.value)}
                    className="input"
                    placeholder="Your name"
                    required
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${dk ? "text-white/50" : "text-gray-500"}`}>
                    Role
                  </label>
                  <select value={role} onChange={(e: any) => setRole(e.target.value)} className="input">
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${dk ? "text-white/50" : "text-gray-500"}`}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e: any) => setEmail(e.target.value)}
                className="input"
                placeholder="you@school.edu"
                required
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${dk ? "text-white/50" : "text-gray-500"}`}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e: any) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-2.5 text-sm mt-2" disabled={loading}>
              {loading ? (
                <span className="opacity-60">Loading…</span>
              ) : (
                <>
                  {isRegister ? "Create Account" : "Sign In"}
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
}
