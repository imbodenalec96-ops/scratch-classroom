import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { Sun, Moon, ArrowRight } from "lucide-react";

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
      if (isRegister) await register(email.trim().toLowerCase(), password, name.trim(), role);
      else            await login(email.trim().toLowerCase(), password);
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
      handleSubmit={handleSubmit}
    />
  );
}

/** Hand-drawn brand mark — paper stack + marigold flourish */
function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* Paper stack */}
      <rect x="10" y="18" width="44" height="36" rx="2" fill="#f8ecd2" stroke="#18171a" strokeWidth="2"/>
      <rect x="14" y="14" width="44" height="36" rx="2" fill="#fdfaf3" stroke="#18171a" strokeWidth="2"/>
      <rect x="18" y="10" width="44" height="36" rx="2" fill="#f6f1e6" stroke="#18171a" strokeWidth="2"/>
      {/* Marigold swoosh */}
      <path d="M26 18 Q40 12 56 22" stroke="#d97706" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <circle cx="56" cy="22" r="3" fill="#d97706" />
      {/* Text lines */}
      <line x1="26" y1="28" x2="46" y2="28" stroke="#18171a" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="26" y1="34" x2="52" y2="34" stroke="#18171a" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="26" y1="40" x2="42" y2="40" stroke="#18171a" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
    </svg>
  );
}

function LoginPageInner({ isRegister, setIsRegister, name, setName, email, setEmail, password, setPassword, role, setRole, error, loading, handleSubmit }: any) {
  const { theme, toggleTheme } = useTheme();
  const dk = theme === "dark";

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      {/* Left panel — editorial brand story */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden p-16" style={{ background: "var(--bg-sidebar)" }}>
        {/* Subtle paper grid — very low opacity */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(var(--text-1) 1px, transparent 1px), linear-gradient(90deg, var(--text-1) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }} />

        {/* Top — wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--text-accent)" }}>
              A publication for makers
            </div>
            <div className="font-display text-2xl leading-none" style={{ color: "var(--text-1)" }}>
              BlockForge
            </div>
          </div>
        </div>

        {/* Center — editorial hero */}
        <div className="relative z-10 mt-auto mb-auto max-w-xl">
          <div className="stamp mb-5">Issue Nº 01 · Classroom Edition</div>
          <h1 className="font-display text-6xl leading-[1.05]" style={{ color: "var(--text-1)" }}>
            Build.<br/>
            Code.<br/>
            <em style={{ color: "var(--accent)", fontStyle: "italic" }}>Create&nbsp;something.</em>
          </h1>
          <p className="mt-7 text-base leading-relaxed max-w-md" style={{ color: "var(--text-2)" }}>
            A classroom platform where students build real projects with drag-and-drop blocks,
            2D sprites, and 3D worlds. Teachers monitor, nudge, and celebrate. No algorithms
            telling anyone what to think.
          </p>

          {/* Feature rail — tight, editorial */}
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            {[
              { n: "65+",  l: "Code blocks" },
              { n: "2D/3D", l: "Stage modes" },
              { n: "29",   l: "Arcade games" },
              { n: "K-8",  l: "Grade levels" },
            ].map(f => (
              <div key={f.l} className="flex items-baseline gap-2">
                <div className="font-display text-2xl" style={{ color: "var(--accent)" }}>{f.n}</div>
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{f.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom — masthead-style footer */}
        <div className="relative z-10 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] border-t pt-4" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
          <span>Vol. IV · No. 01</span>
          <span>Est. 2026</span>
          <span>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}</span>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="w-full lg:w-[460px] flex flex-col items-center justify-center p-8 relative border-l"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <button
          onClick={toggleTheme}
          className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center transition-colors cursor-pointer"
          style={{ borderRadius: "var(--r-md)", color: "var(--text-2)", background: "var(--bg-hover)", border: "1px solid var(--border)" }}
        >
          {dk ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <div className="w-full max-w-sm">
          {/* Mobile wordmark */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <BrandMark size={32} />
            <span className="font-display text-xl" style={{ color: "var(--text-1)" }}>BlockForge</span>
          </div>

          <div className="mb-7">
            <div className="section-label mb-1.5">
              {isRegister ? "— New reader —" : "— Welcome back —"}
            </div>
            <h2 className="font-display text-3xl leading-tight" style={{ color: "var(--text-1)" }}>
              {isRegister ? "Start your subscription." : "Pick up where you left off."}
            </h2>
            <p className="text-sm mt-2" style={{ color: "var(--text-3)" }}>
              {isRegister ? "No card required. Teachers can bulk-import students." : "Sign in with the email your teacher gave you."}
            </p>
          </div>

          {/* Tab switcher — editorial underline, not a pill */}
          <div className="flex gap-6 mb-6 border-b" style={{ borderColor: "var(--border)" }}>
            {["Sign In", "Register"].map((label, i) => {
              const active = (isRegister ? i === 1 : i === 0);
              return (
                <button
                  key={label}
                  onClick={() => setIsRegister(i === 1)}
                  className="pb-2.5 text-sm font-semibold cursor-pointer transition-colors"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-3)",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    marginBottom: "-1px",
                  }}>
                  {label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isRegister && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Full Name</label>
                  <input value={name} onChange={(e: any) => setName(e.target.value)} className="input" placeholder="Your name" required />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Role</label>
                  <select value={role} onChange={(e: any) => setRole(e.target.value)} className="input">
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Email</label>
              <input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} className="input" placeholder="you@school.edu" required />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Password</label>
              <input type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} className="input" placeholder="••••••••" required />
            </div>

            {error && (
              <div className="text-sm p-3" style={{
                color: "var(--danger)",
                background: "color-mix(in srgb, var(--danger) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                borderRadius: "var(--r-md)",
                borderLeft: "2px solid var(--danger)",
              }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-2.5 text-sm mt-3" disabled={loading}>
              {loading ? <span className="opacity-70">Loading…</span> : (
                <>{isRegister ? "Create account" : "Sign in"} <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <p className="text-[10px] uppercase tracking-wider text-center mt-8" style={{ color: "var(--text-3)" }}>
            © {new Date().getFullYear()} · Printed in the browser
          </p>
        </div>
      </div>
    </div>
  );
}
