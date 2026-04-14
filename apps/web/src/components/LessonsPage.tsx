import React, { useState } from "react";
import LessonsBrowser from "./LessonsBrowser.tsx";

export default function LessonsPage() {
  const [showBrowser, setShowBrowser] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📖 JavaScript Lessons</h1>
          <p className="text-sm text-white/40 mt-1">Learn JavaScript step by step — see how each concept maps to Scratch blocks!</p>
        </div>
        <button onClick={() => setShowBrowser(true)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-all">
          Open Lessons
        </button>
      </div>

      {/* Lesson cards overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: "📦", title: "Variables & Data", desc: "Store and use data — the building blocks of every program", level: "Beginner", color: "from-emerald-500/20 to-emerald-600/10" },
          { icon: "💬", title: "Printing & Output", desc: "Make your program talk with console.log()", level: "Beginner", color: "from-cyan-500/20 to-cyan-600/10" },
          { icon: "🔢", title: "Math & Operators", desc: "Add, subtract, multiply — and cool Math functions", level: "Beginner", color: "from-blue-500/20 to-blue-600/10" },
          { icon: "🔀", title: "If/Else Decisions", desc: "Make your code choose different paths", level: "Beginner", color: "from-amber-500/20 to-amber-600/10" },
          { icon: "🔄", title: "Loops & Repetition", desc: "Repeat actions with for and while loops", level: "Beginner", color: "from-orange-500/20 to-orange-600/10" },
          { icon: "🧩", title: "Functions (My Blocks!)", desc: "Create reusable code — like Scratch My Blocks", level: "Intermediate", color: "from-violet-500/20 to-violet-600/10" },
          { icon: "📋", title: "Arrays (Lists)", desc: "Store collections with superpowers like filter & map", level: "Intermediate", color: "from-pink-500/20 to-pink-600/10" },
          { icon: "🎭", title: "Objects (Sprites!)", desc: "Group related data — how sprites really work", level: "Intermediate", color: "from-rose-500/20 to-rose-600/10" },
          { icon: "🌐", title: "Web Page Magic (DOM)", desc: "Control web pages with JavaScript", level: "Advanced", color: "from-indigo-500/20 to-indigo-600/10" },
          { icon: "⏳", title: "Async & Promises", desc: "Handle things that take time — loading, waiting", level: "Advanced", color: "from-purple-500/20 to-purple-600/10" },
          { icon: "🎮", title: "Build a Mini Game!", desc: "Put it all together — number guessing game", level: "Intermediate", color: "from-red-500/20 to-red-600/10" },
        ].map((lesson, i) => (
          <button key={i} onClick={() => setShowBrowser(true)}
            className={`group text-left p-5 rounded-2xl bg-gradient-to-br ${lesson.color} border border-white/[0.06] hover:border-violet-500/30 transition-all`}>
            <span className="text-3xl">{lesson.icon}</span>
            <h3 className="text-sm font-bold text-white mt-3 group-hover:text-violet-300 transition-colors">{lesson.title}</h3>
            <p className="text-xs text-white/40 mt-1">{lesson.desc}</p>
            <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full mt-2 ${
              lesson.level === "Beginner" ? "bg-emerald-500/20 text-emerald-400" :
              lesson.level === "Intermediate" ? "bg-amber-500/20 text-amber-400" :
              "bg-red-500/20 text-red-400"
            }`}>{lesson.level}</span>
          </button>
        ))}
      </div>

      {showBrowser && <LessonsBrowser onClose={() => setShowBrowser(false)} />}
    </div>
  );
}
