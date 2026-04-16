import React from "react";
import { Link } from "react-router-dom";
import { Gamepad2, Code2, LogIn, ChevronRight, Zap, Sword, Puzzle, GraduationCap } from "lucide-react";

const PREVIEW_GAMES = [
  { emoji: "🧱", title: "Brick Breaker", cat: "Action", color: "#f97316", desc: "Break every brick before you run out of lives." },
  { emoji: "🐍", title: "Snake XL",     cat: "Action", color: "#4ade80", desc: "Grow your snake. Don't hit yourself!" },
  { emoji: "🃏", title: "Memory Match", cat: "Puzzle", color: "#e879f9", desc: "Flip cards and find all the emoji pairs." },
  { emoji: "🧠", title: "Math Blitz",   cat: "Education", color: "#f59e0b", desc: "10 rapid-fire math questions. Beat the clock!" },
];

export default function LandingPage() {
  return (
    <div className="text-white" style={{ background: "#07071a" }}>
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 py-24 overflow-hidden">
        {/* Background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6 animate-fade-in"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }}
          >
            <Zap size={11} fill="#a78bfa" />
            Free to play — no account needed
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-4 animate-fade-in leading-[1.08]"
            style={{ animationDelay: "80ms", backgroundImage: "linear-gradient(135deg, #ffffff 30%, #a78bfa)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>
            Learn to Code.<br />Play to Win.
          </h1>

          <p className="text-lg text-white/55 mb-10 max-w-xl mx-auto animate-fade-in" style={{ animationDelay: "160ms" }}>
            BlockForge is the classroom coding platform with a built-in arcade. Students play real games — teachers build lessons. Everyone wins.
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in" style={{ animationDelay: "240ms" }}>
            <Link
              to="/arcade"
              className="group flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl font-bold text-base text-white transition-all duration-200"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                boxShadow: "0 8px 24px rgba(139,92,246,0.45)",
              }}
            >
              <Gamepad2 size={18} />
              Play the Arcade
              <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/playground"
              className="flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl font-bold text-base transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.75)",
              }}
            >
              <Code2 size={18} />
              Try the Editor
            </Link>
          </div>
        </div>
      </section>

      {/* ── Game preview grid ───────────────────────────────────── */}
      <section className="px-6 pb-16 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-white">Games in the Arcade</h2>
          <Link
            to="/arcade"
            className="flex items-center gap-1 text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors"
          >
            View all <ChevronRight size={15} />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PREVIEW_GAMES.map((g, i) => (
            <Link
              key={g.title}
              to="/arcade"
              className="group rounded-2xl overflow-hidden cursor-pointer animate-arcade-card"
              style={{
                animationDelay: `${i * 60}ms`,
                background: "#0a0b1e",
                border: `1px solid ${g.color}22`,
                transition: "transform 0.2s cubic-bezier(0.34,1.4,0.64,1), box-shadow 0.2s ease",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-4px) scale(1.03)"; (e.currentTarget as HTMLElement).style.boxShadow = `0 16px 36px ${g.color}44`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
            >
              <div className="h-24 flex items-center justify-center relative" style={{ background: `radial-gradient(ellipse at 60% 40%, ${g.color}20 0%, transparent 65%)` }}>
                <span className="text-4xl group-hover:scale-110 transition-transform duration-300">{g.emoji}</span>
                <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: g.color + "25", color: g.color }}>
                  {g.cat}
                </span>
              </div>
              <div className="px-3 pb-3">
                <div className="text-xs font-bold text-white mb-0.5">{g.title}</div>
                <div className="text-[10px] text-white/40 leading-snug">{g.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-5 text-center">
          <Link
            to="/arcade"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}
          >
            <Gamepad2 size={15} />
            Open Full Arcade →
          </Link>
        </div>
      </section>

      {/* ── For educators strip ─────────────────────────────────── */}
      <section
        className="mx-6 mb-16 rounded-2xl px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-6"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-1">For Educators</div>
          <h3 className="text-xl font-extrabold text-white mb-1">Teach coding with BlockForge</h3>
          <p className="text-sm text-white/45">Classes, assignments, live monitoring, AI assistant — all in one place.</p>
        </div>
        <Link
          to="/login"
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white flex-shrink-0 transition-all"
          style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", boxShadow: "0 6px 16px rgba(139,92,246,0.35)" }}
        >
          <LogIn size={15} />
          Sign In to Dashboard
        </Link>
      </section>

      {/* Footer */}
      <footer className="text-center px-6 py-8 text-xs text-white/20 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        BlockForge · Educational coding platform · Games free to play, no account needed
      </footer>
    </div>
  );
}
