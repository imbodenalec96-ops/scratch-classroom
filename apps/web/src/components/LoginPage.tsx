import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { Sun, Moon, ArrowRight } from "lucide-react";
import { api } from "../lib/api.ts";

export default function LoginPage() {
  const { user, login, loginAsStudent, register } = useAuth();
  if (user) return <Navigate to="/" replace />;

  const [mode, setMode] = useState<"student" | "signin" | "register">("student");
  const isRegister = mode === "register";
  const setIsRegister = (v: boolean) => setMode(v ? "register" : "signin");
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
      mode={mode} setMode={setMode}
      isRegister={isRegister} setIsRegister={setIsRegister}
      name={name} setName={setName} email={email} setEmail={setEmail}
      password={password} setPassword={setPassword}
      role={role} setRole={setRole}
      error={error} loading={loading}
      handleSubmit={handleSubmit}
      loginAsStudent={loginAsStudent}
      setError={setError}
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
      <path d="M26 18 Q40 12 56 22" stroke="#D97757" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <circle cx="56" cy="22" r="3" fill="#D97757" />
      {/* Text lines */}
      <line x1="26" y1="28" x2="46" y2="28" stroke="#18171a" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="26" y1="34" x2="52" y2="34" stroke="#18171a" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="26" y1="40" x2="42" y2="40" stroke="#18171a" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
    </svg>
  );
}

function LoginPageInner({ mode, setMode, isRegister, setIsRegister, name, setName, email, setEmail, password, setPassword, role, setRole, error, loading, handleSubmit, loginAsStudent, setError }: any) {
  const { theme, toggleTheme } = useTheme();
  const dk = theme === "dark";

  // Student avatar picker state
  const [students, setStudents] = useState<Array<{ id: string; name: string; avatarUrl: string | null }>>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [pickerBusy, setPickerBusy] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string; avatarUrl: string | null } | null>(null);
  const [studentPassword, setStudentPassword] = useState("");
  useEffect(() => {
    if (mode !== "student") return;
    setStudentsLoading(true);
    api.listStudentAccounts()
      .then((rows) => setStudents(rows || []))
      .catch(() => setStudents([]))
      .finally(() => setStudentsLoading(false));
  }, [mode]);
  useEffect(() => {
    setSelectedStudent(null);
    setStudentPassword("");
  }, [mode]);
  const handlePickStudent = (student: { id: string; name: string; avatarUrl: string | null }) => {
    setError("");
    setSelectedStudent(student);
    setStudentPassword("");
  };
  const handleStudentPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setError("");
    setPickerBusy(selectedStudent.id);
    try {
      await loginAsStudent(selectedStudent.id, studentPassword);
    } catch (err: any) {
      setError(err?.message || "Wrong password");
      setPickerBusy(null);
    }
  };
  const initials = (n: string) => String(n || "").split(/\s+/).filter(Boolean).map(p => p[0]).join("").slice(0, 2).toUpperCase() || "👤";
  const avatarColors = ["#D97757","#8b5cf6","#059669","#2563eb","#e11d48","#0d9488","#c2410c","#0284c7","#a855f7"];

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
            {[{ k: "student", l: "I'm a Student" }, { k: "signin", l: "Sign In" }, { k: "register", l: "Register" }].map((t) => {
              const active = mode === t.k;
              return (
                <button
                  key={t.k}
                  onClick={() => { setMode(t.k); setError(""); }}
                  className="pb-2.5 text-sm font-semibold cursor-pointer transition-colors"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-3)",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    marginBottom: "-1px",
                  }}>
                  {t.l}
                </button>
              );
            })}
          </div>

          {/* Student avatar picker — tap avatar, then enter password */}
          {mode === "student" && selectedStudent && (
            <div>
              <style>{`
                @keyframes sfShake { 0%,100%{transform:translateX(0);} 20%{transform:translateX(-6px);} 40%{transform:translateX(6px);} 60%{transform:translateX(-4px);} 80%{transform:translateX(4px);} }
                .sf-shake { animation: sfShake 0.35s ease-in-out; }
              `}</style>
              <button
                onClick={() => { setSelectedStudent(null); setStudentPassword(""); setError(""); }}
                className="text-sm mb-4 cursor-pointer flex items-center gap-1.5"
                style={{ color: "var(--text-3)" }}
              >
                ← Not you? Pick again
              </button>
              <div className="flex flex-col items-center gap-3 mb-5">
                {(() => {
                  const color = avatarColors[students.findIndex(s => s.id === selectedStudent.id) % avatarColors.length] || avatarColors[0];
                  return (
                    <div className="rounded-full flex items-center justify-center font-bold text-white" style={{
                      width: 72, height: 72, fontSize: 26,
                      background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                    }}>
                      {selectedStudent.avatarUrl ? (
                        <img src={selectedStudent.avatarUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                      ) : initials(selectedStudent.name)}
                    </div>
                  );
                })()}
                <div className="font-display text-2xl" style={{ color: "var(--text-1)" }}>{selectedStudent.name}</div>
              </div>
              <form onSubmit={handleStudentPasswordSubmit} className={`space-y-3.5 ${error ? "sf-shake" : ""}`}>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Passcode</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={studentPassword}
                    onChange={(e: any) => setStudentPassword(e.target.value)}
                    className="input"
                    style={error ? { borderColor: "var(--danger)" } : undefined}
                    placeholder="Enter your passcode"
                    autoFocus
                    required
                  />
                </div>
                {error && (
                  <div className="text-sm p-3" style={{
                    color: "var(--danger)",
                    background: "color-mix(in srgb, var(--danger) 10%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                    borderRadius: "var(--r-md)",
                    borderLeft: "2px solid var(--danger)",
                  }}>{error}</div>
                )}
                <button
                  type="submit"
                  disabled={!!pickerBusy || !studentPassword}
                  className="btn btn-primary w-full cursor-pointer disabled:opacity-50"
                >
                  {pickerBusy ? "Signing in…" : "Sign In"}
                </button>
              </form>
            </div>
          )}

          {mode === "student" && !selectedStudent && (
            <div>
              <style>{`
                @keyframes sfShake {
                  0%, 100% { transform: translateX(0); }
                  20% { transform: translateX(-6px); }
                  40% { transform: translateX(6px); }
                  60% { transform: translateX(-4px); }
                  80% { transform: translateX(4px); }
                }
                .sf-shake { animation: sfShake 0.35s ease-in-out; }
              `}</style>
              <p className="text-sm mb-4" style={{ color: "var(--text-2)" }}>
                Tap your picture, then enter your passcode.
              </p>
              {studentsLoading ? (
                <div className="text-sm" style={{ color: "var(--text-3)" }}>Loading students…</div>
              ) : students.length === 0 ? (
                <div className="text-sm" style={{ color: "var(--text-3)" }}>
                  No student accounts yet. Ask your teacher to add you.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3" style={{ maxHeight: 420, overflowY: "auto" }}>
                  {students.map((s, i) => {
                    const color = avatarColors[i % avatarColors.length];
                    const busy = pickerBusy === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handlePickStudent(s)}
                        disabled={!!pickerBusy}
                        className="rounded-2xl p-3 flex flex-col items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                        style={{
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          minHeight: 110,
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.transform = ""; }}
                      >
                        <div className="rounded-full flex items-center justify-center font-bold text-white" style={{
                          width: 56, height: 56, fontSize: 20,
                          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                        }}>
                          {s.avatarUrl ? (
                            <img src={s.avatarUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                          ) : busy ? "…" : initials(s.name)}
                        </div>
                        <div className="text-xs font-semibold text-center" style={{ color: "var(--text-1)" }}>{s.name}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              {error && (
                <div className="text-sm p-3 mt-4" style={{
                  color: "var(--danger)",
                  background: "color-mix(in srgb, var(--danger) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                  borderRadius: "var(--r-md)",
                  borderLeft: "2px solid var(--danger)",
                }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {mode !== "student" && (
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
          )}

          <p className="text-[10px] uppercase tracking-wider text-center mt-8" style={{ color: "var(--text-3)" }}>
            © {new Date().getFullYear()} · Printed in the browser
          </p>
        </div>
      </div>
    </div>
  );
}
