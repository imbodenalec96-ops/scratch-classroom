import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { useSocket } from "../lib/ws.ts";
import {
  isWorkUnlocked,
  isAccessAllowed,
  setWorkUnlocked,
  clearWorkUnlock,
} from "../lib/workUnlock.ts";
import { useClassConfig } from "../lib/useClassConfig.ts";
import { useBlockInfo } from "../lib/useCurrentBlock.ts";
import { usePresencePing } from "../lib/presence.ts";
import {
  motion,
  prefersReducedMotion,
  getSubjectPalette,
} from "../lib/motionPresets.ts";
import {
  Users,
  CheckCircle,
  Star,
  Lock,
  Megaphone,
  Trophy,
  Clock,
  Gamepad2,
} from "lucide-react";
import { LearningAppTile, LearningAppGrid } from "./LearningAppTile.tsx";

type Phase = "welcome" | "loading" | "working" | "done";

/* ── Count-up hook ── */
function useCountUp(target: number, duration = 900, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const t = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const pct = Math.min((now - start) / duration, 1);
        setValue(Math.round((1 - Math.pow(1 - pct, 3)) * target));
        if (pct < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [target, duration, delay]);
  return value;
}

/* ── Starfall palettes: bright, playful, pastel per subject. Used by the
 *    assignment doer (WorkScreen) so every subject has its own warm backdrop. */
/* Soft tint wash over Paper cream (#FAF9F7) — subtle, not candy-shop. */
const STARFALL_PALETTES: Record<
  string,
  { bg: string; accent: string; emoji: string; label: string }
> = {
  reading: {
    bg: "linear-gradient(160deg, #f5eeff 0%, #faf9f7 60%)",
    accent: "#8b5cf6",
    emoji: "📖",
    label: "Reading",
  },
  math: {
    bg: "linear-gradient(160deg, #fff5e0 0%, #faf9f7 60%)",
    accent: "#D97757",
    emoji: "🔢",
    label: "Math",
  },
  writing: {
    bg: "linear-gradient(160deg, #eaf5ec 0%, #faf9f7 60%)",
    accent: "#059669",
    emoji: "✏️",
    label: "Writing",
  },
  spelling: {
    bg: "linear-gradient(160deg, #e6f0fb 0%, #faf9f7 60%)",
    accent: "#2563eb",
    emoji: "🔤",
    label: "Spelling",
  },
  sel: {
    bg: "linear-gradient(160deg, #fdeaec 0%, #faf9f7 60%)",
    accent: "#e11d48",
    emoji: "💛",
    label: "SEL",
  },
  daily_news: {
    bg: "linear-gradient(160deg, #e4f0fa 0%, #faf9f7 60%)",
    accent: "#0284c7",
    emoji: "📰",
    label: "Daily News",
  },
  review: {
    bg: "linear-gradient(160deg, #f1e8fa 0%, #faf9f7 60%)",
    accent: "#a855f7",
    emoji: "🔁",
    label: "Review",
  },
  science: {
    bg: "linear-gradient(160deg, #e0f2ed 0%, #faf9f7 60%)",
    accent: "#0d9488",
    emoji: "🔬",
    label: "Science",
  },
  social_studies: {
    bg: "linear-gradient(160deg, #fbecd8 0%, #faf9f7 60%)",
    accent: "#c2410c",
    emoji: "🌎",
    label: "Social Studies",
  },
};
function getStarfallPalette(subject?: string | null) {
  const key = String(subject || "")
    .toLowerCase()
    .trim();
  return (
    STARFALL_PALETTES[key] || {
      bg: "linear-gradient(160deg, #f1e8fa 0%, #faf9f7 60%)",
      accent: "#8b5cf6",
      emoji: "📝",
      label: "Today's Work",
    }
  );
}

const TTS_API =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "https://scratch-classroom-api-td1x.vercel.app/api");

let _ttsKeyAvailable: boolean | null = null;

async function speakViaTtsApi(word: string): Promise<boolean> {
  if (_ttsKeyAvailable === false) return false;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${TTS_API}/ai/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text: word }),
    });
    if (res.status === 503) { _ttsKeyAvailable = false; return false; }
    if (!res.ok) return false;
    _ttsKeyAvailable = true;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

function getBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred = [
    /google us english female/i,
    /google us english/i,
    /google uk english female/i,
    /samantha/i,
    /karen/i,
    /serena/i,
    /microsoft jenny/i,
    /microsoft aria/i,
    /microsoft zira/i,
    /en.*female|female.*en/i,
    /.*/,
  ];
  const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  for (const pattern of preferred) {
    const match = enVoices.find((v) => pattern.test(v.name));
    if (match) return match;
  }
  return voices[0] ?? null;
}

function speakTextFallback(text: string, rate = 0.82) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const doSpeak = () => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text || ""));
      u.rate = rate;
      u.pitch = 1.0;
      u.lang = "en-US";
      const voice = getBestVoice();
      if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
    } catch { /* best effort */ }
  };
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) doSpeak();
  else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
  }
}

function speakText(text: string, rate = 0.82) {
  speakTextFallback(text, rate);
}

/** Extract the actual word from a spelling question like "Spell the word: cat" → "cat" */
function extractSpellingWord(questionText: string): string {
  const match = questionText.match(/spell(?:\s+the\s+word)?[:\s]+([a-zA-Z''-]+)/i);
  if (match) return match[1];
  // If the whole text is just a word (no spaces), use it directly
  const trimmed = questionText.trim();
  if (/^[a-zA-Z''-]+$/.test(trimmed)) return trimmed;
  return questionText.trim();
}

/** Speak a spelling word using OpenAI TTS if available, otherwise Web Speech API.
 *  Says the word twice at a clear pace — like a spelling bee announcer. */
async function speakSpellingWord(questionText: string) {
  const word = extractSpellingWord(questionText);
  const usedApi = await speakViaTtsApi(word);
  if (usedApi) return;
  // Web Speech fallback: say the word, pause, say it again
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const doSpeak = () => {
    try {
      window.speechSynthesis.cancel();
      const voice = getBestVoice();
      const say = (text: string, rate: number) => {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = rate;
        u.pitch = 1.0;
        u.lang = "en-US";
        if (voice) u.voice = voice;
        return u;
      };
      window.speechSynthesis.speak(say(word, 0.75));
      window.speechSynthesis.speak(say(word, 0.65));
    } catch { /* best effort */ }
  };
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) doSpeak();
  else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
  }
}

function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); } catch {}
}

/* ── Confetti ── */
function spawnConfetti() {
  const glyphs = ["🎉", "✨", "🌟", "💫", "🎊", "⭐", "🏆"];
  for (let i = 0; i < 20; i++) {
    const el = document.createElement("span");
    el.textContent = glyphs[i % glyphs.length];
    el.style.cssText = `position:fixed;left:${Math.random() * 100}vw;top:-2rem;font-size:${1.2 + Math.random()}rem;pointer-events:none;z-index:9999;animation:confettiFall 2s ease-in forwards;animation-delay:${Math.random() * 0.8}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
  if (!document.getElementById("confetti-style")) {
    const s = document.createElement("style");
    s.id = "confetti-style";
    s.textContent = `@keyframes confettiFall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }`;
    document.head.appendChild(s);
  }
}

/* ── YouTubeRequestForm — inline request-a-video form ── */
function YouTubeRequestForm({
  dk,
  userId,
  onSent,
}: {
  dk: boolean;
  userId?: string;
  onSent?: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const submit = async () => {
    if (!title.trim() || !userId) return;
    setSending(true);
    try {
      await api.createYouTubeRequest({
        student_id: userId,
        title: title.trim(),
      });
      setTitle("");
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      onSent?.();
    } catch (e: any) {
      alert("Couldn't send request: " + e.message);
    } finally {
      setSending(false);
    }
  };
  return (
    <div>
      <div
        className="text-xs font-bold mb-2"
        style={{ color: dk ? "rgba(255,255,255,0.6)" : "#64748b" }}
      >
        🎬 Want a video? Ask your teacher:
      </div>
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. fun math song about fractions"
          className="input text-sm flex-1"
          style={{ minHeight: 40 }}
        />
        <button
          onClick={submit}
          disabled={!title.trim() || sending}
          className={`text-xs font-bold px-4 rounded-xl cursor-pointer transition-all ${
            sent ? "bg-emerald-500 text-white" : "btn-primary"
          }`}
          style={{ minHeight: 40 }}
        >
          {sent ? "✓ Sent!" : sending ? "…" : "Request"}
        </button>
      </div>
      <p
        className="text-[10px] mt-1.5"
        style={{ color: dk ? "rgba(255,255,255,0.25)" : "#94a3b8" }}
      >
        Your teacher will find the video and approve it for you.
      </p>
    </div>
  );
}

/* ── Avatar Gallery ── */
const AVATAR_SECTIONS = [
  {
    label: "🐾 Animals",
    items: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐸",
      "🐵",
      "🐔",
      "🐧",
      "🐦",
      "🦅",
      "🦆",
      "🦉",
      "🦋",
      "🐢",
      "🐬",
      "🐳",
      "🦈",
      "🦓",
      "🦒",
      "🦘",
      "🐘",
      "🦏",
      "🐆",
      "🦝",
      "🦦",
      "🦥",
      "🐿️",
      "🦔",
      "🐇",
      "🦌",
      "🐓",
      "🦃",
      "🦚",
      "🦜",
      "🦩",
      "🐾",
    ],
  },
  {
    label: "⚽ Sports",
    items: [
      "⚽",
      "🏀",
      "🏈",
      "⚾",
      "🎾",
      "🏐",
      "🏉",
      "🎱",
      "🏸",
      "🏒",
      "🎿",
      "⛷️",
      "🏄",
      "🤸",
      "🏋️",
      "🤼",
      "🥊",
      "🎯",
      "🏹",
      "🛹",
      "🛼",
      "🚴",
      "🧗",
      "🤺",
      "🏊",
      "🏇",
      "⛸️",
      "🥋",
      "🏌️",
    ],
  },
  {
    label: "🚀 Sci-fi & Fantasy",
    items: [
      "🚀",
      "🤖",
      "👾",
      "🛸",
      "🌌",
      "🔭",
      "🪐",
      "⭐",
      "🌟",
      "💫",
      "✨",
      "🌠",
      "🧙",
      "🧚",
      "🧜",
      "🧝",
      "🦄",
      "🐉",
      "🔮",
      "🧿",
      "🗺️",
      "⚔️",
      "🛡️",
      "🪄",
      "🏰",
      "🗡️",
      "🌀",
      "🌊",
      "🔥",
      "⚡",
    ],
  },
  {
    label: "🎨 Arts & Music",
    items: [
      "🎨",
      "🖌️",
      "✏️",
      "📐",
      "🎵",
      "🎸",
      "🎹",
      "🥁",
      "🎺",
      "🎻",
      "🎤",
      "🎧",
      "📸",
      "🎬",
      "🎭",
      "🎪",
      "🖼️",
      "🎠",
      "🎡",
      "🎢",
      "🃏",
      "🎲",
      "🧩",
      "♟️",
      "🎰",
      "🎳",
    ],
  },
  {
    label: "🍕 Food & Treats",
    items: [
      "🍕",
      "🍦",
      "🍩",
      "🍪",
      "🎂",
      "🧁",
      "🍫",
      "🍬",
      "🍭",
      "🍿",
      "🌮",
      "🍔",
      "🌯",
      "🥞",
      "🧇",
      "🍣",
      "🍜",
      "🧃",
      "🥤",
      "☕",
      "🍵",
      "🧋",
      "🍓",
      "🍇",
      "🍉",
      "🍒",
      "🍑",
      "🥝",
      "🍋",
      "🍊",
    ],
  },
  {
    label: "🌿 Nature",
    items: [
      "🌺",
      "🌻",
      "🌸",
      "🌷",
      "🌹",
      "🌼",
      "💐",
      "🌴",
      "🌵",
      "🎋",
      "🍀",
      "🌿",
      "🍁",
      "🍂",
      "🌾",
      "🌱",
      "🪴",
      "🌲",
      "🌳",
      "🌙",
      "☀️",
      "⛅",
      "🌈",
      "❄️",
      "⚡",
      "🔥",
      "🌊",
      "🌪️",
      "🪐",
      "🗻",
    ],
  },
  {
    label: "🚗 Vehicles",
    items: [
      "🚀",
      "✈️",
      "🚁",
      "🛸",
      "🚂",
      "🚢",
      "🚗",
      "🚕",
      "🏎️",
      "🚒",
      "🚑",
      "🚓",
      "🚜",
      "🚛",
      "🛻",
      "🏍️",
      "🛵",
      "🚲",
      "🛺",
      "⛵",
      "🛥️",
      "🚤",
      "🛶",
      "🚡",
      "🚟",
      "🛳️",
      "🛰️",
      "🪂",
      "🚠",
      "🚃",
    ],
  },
  {
    label: "✨ Magic & Objects",
    items: [
      "🎃",
      "🎄",
      "🎁",
      "🎀",
      "🎈",
      "🎉",
      "🎊",
      "🪆",
      "🧸",
      "🪀",
      "🪁",
      "🎏",
      "🔮",
      "🪄",
      "💎",
      "👑",
      "🏆",
      "🥇",
      "🌟",
      "💫",
      "⭐",
      "🌠",
      "🌈",
      "🎆",
      "🎇",
      "✨",
      "💥",
      "🔔",
      "📯",
      "🪘",
    ],
  },
];
const AVATAR_GALLERY = AVATAR_SECTIONS.flatMap((s) => s.items);

function AvatarPickerModal({
  userId,
  current,
  onSelect,
  onClose,
}: {
  userId: string;
  current: string;
  onSelect: (e: string) => void;
  onClose: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState(0);
  const pick = async (emoji: string) => {
    setSaving(true);
    try {
      await api.setMyAvatar(userId, emoji);
      onSelect(emoji);
      onClose();
    } catch {
      setSaving(false);
    }
  };
  const section = AVATAR_SECTIONS[activeSection];
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.80)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "linear-gradient(160deg, #1a0d3a, #0d1a3a)",
          border: "1px solid rgba(139,92,246,0.35)",
          borderRadius: 24,
          padding: "20px",
          maxWidth: 500,
          width: "100%",
          boxShadow:
            "0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
          animation: "dbPop .25s ease both",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>
              Choose Your Avatar
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.4)",
                marginTop: 2,
              }}
            >
              {current ? `Current: ${current}` : "Pick something that's you!"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "none",
              borderRadius: 10,
              width: 32,
              height: 32,
              cursor: "pointer",
              color: "rgba(255,255,255,0.6)",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
        {/* Category tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 10,
            marginBottom: 10,
            scrollbarWidth: "none",
          }}
        >
          {AVATAR_SECTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSection(i)}
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                border:
                  i === activeSection
                    ? "1.5px solid rgba(139,92,246,0.7)"
                    : "1.5px solid rgba(255,255,255,0.1)",
                background:
                  i === activeSection
                    ? "rgba(139,92,246,0.3)"
                    : "rgba(255,255,255,0.04)",
                color:
                  i === activeSection ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gap: 8,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {section.items.map((emoji) => (
            <button
              key={emoji}
              onClick={() => pick(emoji)}
              disabled={saving}
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: 12,
                fontSize: 26,
                lineHeight: 1,
                border:
                  emoji === current
                    ? "2.5px solid #a78bfa"
                    : "1.5px solid rgba(255,255,255,0.08)",
                background:
                  emoji === current
                    ? "rgba(139,92,246,0.35)"
                    : "rgba(255,255,255,0.04)",
                cursor: "pointer",
                transition: "all 0.13s",
                boxShadow:
                  emoji === current ? "0 0 16px rgba(139,92,246,0.6)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "rgba(139,92,246,0.28)";
                (e.currentTarget as HTMLElement).style.transform =
                  "scale(1.22)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  emoji === current
                    ? "rgba(139,92,246,0.35)"
                    : "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLElement).style.transform = "";
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
        {current && (
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <button
              onClick={() => pick("")}
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.3)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Use initials instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Flying Word-Buddy (butterfly companion) ── */
function FlyingBuddy({ active = true }: { active?: boolean }) {
  const rm = prefersReducedMotion();
  if (rm || !active) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: "15%",
        right: "3%",
        zIndex: 45,
        pointerEvents: "none",
        animation: "buddyFloat 8s ease-in-out infinite",
        transformOrigin: "center",
      }}
    >
      <style>{`
        @keyframes buddyFloat {
          0%   { transform: translate(0, 0) rotate(-5deg) scaleX(1); }
          20%  { transform: translate(-40px, -30px) rotate(5deg) scaleX(-1); }
          40%  { transform: translate(-80px, 10px) rotate(-8deg) scaleX(1); }
          60%  { transform: translate(-40px, 40px) rotate(6deg) scaleX(-1); }
          80%  { transform: translate(20px, 15px) rotate(-4deg) scaleX(1); }
          100% { transform: translate(0, 0) rotate(-5deg) scaleX(1); }
        }
        @keyframes wingFlap {
          0%, 100% { transform: scaleY(1); }
          50%       { transform: scaleY(0.6); }
        }
      `}</style>
      <svg width="52" height="44" viewBox="0 0 52 44" fill="none">
        {/* Left wings */}
        <ellipse
          cx="14"
          cy="18"
          rx="13"
          ry="17"
          fill="#f9a8d4"
          opacity="0.85"
          style={{ animation: "wingFlap 0.4s ease-in-out infinite" }}
        />
        <ellipse
          cx="12"
          cy="30"
          rx="10"
          ry="10"
          fill="#fda4af"
          opacity="0.7"
          style={{ animation: "wingFlap 0.4s ease-in-out infinite 0.1s" }}
        />
        {/* Right wings */}
        <ellipse
          cx="38"
          cy="18"
          rx="13"
          ry="17"
          fill="#c4b5fd"
          opacity="0.85"
          style={{ animation: "wingFlap 0.4s ease-in-out infinite 0.05s" }}
        />
        <ellipse
          cx="40"
          cy="30"
          rx="10"
          ry="10"
          fill="#a5b4fc"
          opacity="0.7"
          style={{ animation: "wingFlap 0.4s ease-in-out infinite 0.15s" }}
        />
        {/* Body */}
        <ellipse cx="26" cy="22" rx="4" ry="14" fill="#7c3aed" />
        {/* Head */}
        <circle cx="26" cy="7" r="5" fill="#6d28d9" />
        {/* Eyes */}
        <circle cx="24" cy="6" r="1.2" fill="white" />
        <circle cx="28" cy="6" r="1.2" fill="white" />
        <circle cx="24.5" cy="6" r="0.6" fill="#1e293b" />
        <circle cx="28.5" cy="6" r="0.6" fill="#1e293b" />
        {/* Smile */}
        <path
          d="M23.5 8.5 Q26 10.5 28.5 8.5"
          stroke="#f9a8d4"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
        />
        {/* Antennae */}
        <line
          x1="24"
          y1="3"
          x2="21"
          y2="-1"
          stroke="#7c3aed"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <line
          x1="28"
          y1="3"
          x2="31"
          y2="-1"
          stroke="#7c3aed"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <circle cx="21" cy="-1" r="1.5" fill="#f9a8d4" />
        <circle cx="31" cy="-1" r="1.5" fill="#c4b5fd" />
        {/* Wing letter accents */}
        <text
          x="10"
          y="21"
          fontSize="8"
          fill="white"
          opacity="0.7"
          fontWeight="bold"
        >
          A
        </text>
        <text
          x="36"
          y="21"
          fontSize="8"
          fill="white"
          opacity="0.7"
          fontWeight="bold"
        >
          B
        </text>
      </svg>
    </div>
  );
}

/* ── TypewriterText ── */
function TypewriterText({
  text,
  speed = 28,
  className,
  style,
}: {
  text: string;
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const rm = prefersReducedMotion();
  useEffect(() => {
    if (rm) {
      setDisplayed(text);
      setDone(true);
      return;
    }
    setDisplayed("");
    setDone(false);
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(iv);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed, rm]);
  return (
    <span
      className={className}
      style={style}
      onClick={() => {
        setDisplayed(text);
        setDone(true);
      }}
    >
      {displayed}
      {!done && (
        <span
          style={{
            borderRight: "2px solid currentColor",
            marginLeft: 1,
            animation: "blink 0.7s step-end infinite",
          }}
        />
      )}
    </span>
  );
}

/* ── StreakCounter ── */
function StreakCounter({ streak }: { streak: number }) {
  const rm = prefersReducedMotion();
  if (streak < 2) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        left: 16,
        zIndex: 46,
        background: "linear-gradient(135deg, #f59e0b, #ef4444)",
        borderRadius: 20,
        padding: "6px 14px",
        color: "white",
        fontWeight: 800,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        gap: 6,
        boxShadow: "0 4px 16px rgba(245,158,11,0.3)",
        animation: rm ? "none" : "scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        pointerEvents: "none",
      }}
    >
      🔥 {streak} in a row!
    </div>
  );
}

/* ── Mascot Star SVG ── */
function MascotStar({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M32 5L39 24H59L43.5 35.5L49.5 54.5L32 43L14.5 54.5L20.5 35.5L5 24H25L32 5Z"
        fill="#fbbf24"
        stroke="#f59e0b"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="25.5" cy="29" r="2.8" fill="#1e293b" />
      <circle cx="38.5" cy="29" r="2.8" fill="#1e293b" />
      <circle cx="26.8" cy="27.5" r="0.9" fill="white" />
      <circle cx="39.8" cy="27.5" r="0.9" fill="white" />
      <path
        d="M25.5 37 Q32 43.5 38.5 37"
        stroke="#1e293b"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="22" cy="35" r="3.2" fill="#fb7185" opacity="0.35" />
      <circle cx="42" cy="35" r="3.2" fill="#fb7185" opacity="0.35" />
    </svg>
  );
}

/* ── Mascot component ── */
function Mascot({
  state,
  style,
}: {
  state: "idle" | "cheer";
  style?: React.CSSProperties;
}) {
  const rm = prefersReducedMotion();
  return (
    <div
      className={rm ? "" : state === "idle" ? "mascot-bop" : "mascot-cheer"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
      aria-hidden="true"
    >
      <MascotStar size={state === "cheer" ? 80 : 64} />
    </div>
  );
}

/* ── Welcome Screen ── */
function WelcomeScreen({ name }: { name: string }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(var(--text-1) 1px, transparent 1px), linear-gradient(90deg, var(--text-1) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative z-10 text-center space-y-4 animate-page-enter max-w-md px-6">
        <div className="section-label mb-3">
          — {new Date().toLocaleDateString("en-US", { weekday: "long" })} —
        </div>
        <h1
          className="font-display text-6xl leading-[1.02]"
          style={{ color: "var(--text-1)" }}
        >
          {greeting},<br />
          <em style={{ color: "var(--accent)", fontStyle: "italic" }}>
            {name.split(" ")[0]}.
          </em>
        </h1>
        <p className="text-sm mt-4" style={{ color: "var(--text-2)" }}>
          Setting your desk up…
        </p>
        <div className="flex justify-center gap-1.5 mt-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{
                background: "var(--accent)",
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


/* ── Progress dots ── */
function ProgressDots({
  total,
  current,
  answers,
  onDotClick,
}: {
  total: number;
  current: number;
  answers: Record<number, string>;
  onDotClick?: (index: number) => void;
}) {
  return (
    <div
      className="flex items-center justify-center gap-1.5 flex-wrap"
      role="tablist"
      aria-label="Questions"
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          role="tab"
          aria-selected={i === current}
          onClick={() => onDotClick?.(i)}
          style={onDotClick ? { cursor: "pointer" } : undefined}
          className={`rounded-full transition-all duration-300 ${i === current ? "w-6 h-3 bg-violet-500" : answers[i] !== undefined ? "w-3 h-3 bg-emerald-500" : "w-3 h-3 bg-gray-200"}`}
        />
      ))}
    </div>
  );
}

function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const id = u.hostname.includes("youtu.be")
        ? u.pathname.slice(1).split("?")[0]
        : (u.searchParams.get("v") ?? u.pathname.split("/").pop());
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    }
  } catch {}
  return null;
}

/* ── Interactive Assignment Worker ── */
function DrawCanvas({
  onDraw,
  cardKey,
  accentColor,
}: {
  onDraw: (dataUrl: string) => void;
  cardKey: number;
  accentColor: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const lastPos = React.useRef<{ x: number; y: number } | null>(null);

  const drawGuides = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#ddd8ff";
    ctx.lineWidth = 1.5;
    for (let y = 80; y < canvas.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    // dotted midline
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "#c4bcf7";
    for (let y = 40; y < canvas.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }, []);

  React.useEffect(() => {
    drawGuides();
    onDraw("draw-ready");
  }, [cardKey, drawGuides, onDraw]);

  const getPos = (
    e:
      | React.TouchEvent<HTMLCanvasElement>
      | React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (
    e:
      | React.TouchEvent<HTMLCanvasElement>
      | React.MouseEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  };

  const doDraw = (
    e:
      | React.TouchEvent<HTMLCanvasElement>
      | React.MouseEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault();
    if (!drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#3b28cc";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    onDraw(canvasRef.current.toDataURL());
  };

  const stopDraw = () => {
    drawing.current = false;
    lastPos.current = null;
  };

  const clear = () => {
    drawGuides();
    onDraw("draw-ready");
  };

  return (
    <div className="space-y-3">
      <div
        className="text-[12px] font-bold uppercase tracking-wide"
        style={{ color: accentColor }}
      >
        ✏️ Use your finger to write below
      </div>
      <canvas
        ref={canvasRef}
        width={900}
        height={360}
        style={{
          width: "100%",
          height: 220,
          borderRadius: 16,
          border: `2px solid ${accentColor}55`,
          background: "#f9f8ff",
          touchAction: "none",
          cursor: "crosshair",
          display: "block",
        }}
        onMouseDown={startDraw}
        onMouseMove={doDraw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={doDraw}
        onTouchEnd={stopDraw}
      />
      <button
        onClick={clear}
        className="text-[12px] font-semibold px-4 py-2 rounded-xl"
        style={{
          background: `${accentColor}14`,
          color: accentColor,
          border: `1px solid ${accentColor}33`,
        }}
      >
        🗑 Clear
      </button>
    </div>
  );
}

function WorkScreen({
  assignment,
  parsed,
  dk,
  onComplete,
  onBack,
  onSkip,
  questionsAnswered,
  setQuestionsAnswered,
  ttsPassages = true,
  ttsSpelling = true,
}: {
  assignment: any;
  parsed: any;
  dk: boolean;
  onComplete: (answers: Record<number, string>) => void;
  onBack: () => void;
  onSkip?: () => void;
  questionsAnswered: number;
  setQuestionsAnswered: (n: number) => void;
  ttsPassages?: boolean;
  ttsSpelling?: boolean;
}) {
  const allQuestions: Array<{
    q: any;
    sectionTitle: string;
    passage?: string;
  }> =
    parsed?.sections?.flatMap((s: any) =>
      s.questions.map((q: any) => ({
        q,
        sectionTitle: s.title,
        passage: s.passage,
      })),
    ) ?? [];
  const total = allQuestions.length;
  const draftKey = `assignment-draft-${assignment?.id || "unknown"}`;
  const [currentQ, setCurrentQ] = useState(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d?.currentQ === "number") return d.currentQ;
      }
    } catch {}
    return 0;
  });
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    // Restore mid-assignment progress so kids don't lose work to refresh / battery death.
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.answers && typeof d.answers === "object") return d.answers;
      }
    } catch {}
    return {};
  });

  // Auto-save draft answers + current question to localStorage on every change.
  // Cleared by handleWorkComplete on submit.
  useEffect(() => {
    if (!assignment?.id) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ answers, currentQ, savedAt: Date.now() }));
    } catch {}
  }, [answers, currentQ, draftKey, assignment?.id]);
  const [submitted, setSubmitted] = useState(false);
  const [mascotState, setMascotState] = useState<"idle" | "cheer">("idle");
  const [cardKey, setCardKey] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [videoChoice, setVideoChoice] = useState<"pending" | "watch" | "skip">(
    "pending",
  );
  const [passageState, setPassageState] = useState<"idle" | "loading" | "playing">("idle");
  const passageAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipCode, setSkipCode]           = useState("");
  const [skipError, setSkipError]         = useState("");
  const [skipLoading, setSkipLoading]     = useState(false);
  const [showNavModal, setShowNavModal]   = useState(false);
  const [navTarget, setNavTarget]         = useState(0);
  const [navCode, setNavCode]             = useState("");
  const [navError, setNavError]           = useState("");
  const [navLoading, setNavLoading]       = useState(false);
  const q = allQuestions[currentQ];
  const currentAnswer = answers[currentQ] ?? "";
  const rm = prefersReducedMotion();

  const subjectPal = getSubjectPalette(parsed?.subject);
  // Starfall overlay palette — brighter pastel backdrop per subject
  const starfall = getStarfallPalette(parsed?.subject);
  // Stop any in-flight speech when leaving the screen or switching questions
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    stopSpeaking();
    // Stop any playing passage audio when question changes
    if (passageAudioRef.current) {
      passageAudioRef.current.pause();
      passageAudioRef.current = null;
    }
    setPassageState("idle");
    // Auto-read spelling words aloud when the question changes (only if TTS allowed)
    if (ttsSpelling && String(parsed?.subject || "").toLowerCase() === "spelling" && q?.q?.text) {
      const timer = setTimeout(() => speakSpellingWord(q.q.text), 600);
      return () => clearTimeout(timer);
    }
  }, [currentQ]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (value: string) => {
    const isNew = answers[currentQ] === undefined;
    setAnswers((prev) => ({ ...prev, [currentQ]: value }));
    if (isNew) {
      const next = questionsAnswered + 1;
      setQuestionsAnswered(next);
      setStreak((s) => s + 1);
      // Briefly cheer the mascot
      setMascotState("cheer");
      setTimeout(() => setMascotState("idle"), 800);
    }
    setShowHint(false); // hide hint on new answer
  };

  const handleNext = () => {
    if (currentQ < total - 1) {
      setCurrentQ(currentQ + 1);
      setCardKey((k) => k + 1);
      setShowHint(false);
    }
  };
  const handlePrev = () => {
    if (currentQ > 0) {
      setCurrentQ(currentQ - 1);
      setCardKey((k) => k + 1);
      setStreak(0);
      setShowHint(false);
    }
  };

  const handleSubmit = () => {
    spawnConfetti();
    setMascotState("cheer");
    setSubmitted(true);
    setTimeout(() => onComplete(answers), 2200);
  };

  const handleAdminSkip = async () => {
    if (!skipCode.trim()) return;
    setSkipLoading(true);
    setSkipError("");
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${TTS_API}/admin-settings/check-skip-code?code=${encodeURIComponent(skipCode.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await r.json();
      if (data.valid) {
        setAnswers(prev => ({ ...prev, [currentQ]: "__SKIPPED__" }));
        setShowSkipModal(false);
        setSkipCode("");
        if (currentQ < total - 1) {
          setCurrentQ(currentQ + 1);
          setCardKey(k => k + 1);
        } else {
          handleSubmit();
        }
      } else {
        setSkipError("Incorrect code. Try again.");
      }
    } catch {
      setSkipError("Could not verify. Check connection.");
    } finally {
      setSkipLoading(false);
    }
  };

  const handleNavJump = async () => {
    if (!navCode.trim()) return;
    setNavLoading(true);
    setNavError("");
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${TTS_API}/admin-settings/check-skip-code?code=${encodeURIComponent(navCode.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await r.json();
      if (data.valid) {
        setCurrentQ(navTarget);
        setCardKey(k => k + 1);
        setShowNavModal(false);
        setNavCode("");
      } else {
        setNavError("Incorrect code. Try again.");
      }
    } catch {
      setNavError("Could not verify. Check connection.");
    } finally {
      setNavLoading(false);
    }
  };

  if (submitted) {
    const submittedCount = Object.keys(answers).length;
    const starfallSubmit = getStarfallPalette(parsed?.subject);
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 starfall-doer"
        style={{ background: starfallSubmit.bg }}
      >
        <div
          className="relative z-10 text-center max-w-md px-8 py-10 rounded-3xl animate-fade-in"
          style={{
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,0,0,0.04)",
            boxShadow: `0 8px 24px ${starfallSubmit.accent}14`,
          }}
        >
          <div style={{ fontSize: 64 }}>🎉</div>
          <div
            className="text-xs uppercase tracking-[0.18em] font-semibold mt-2 mb-1"
            style={{ color: starfallSubmit.accent }}
          >
            All done!
          </div>
          <h2
            className="font-display text-5xl leading-[1.05]"
            style={{ color: "#1e293b" }}
          >
            Nice
            <em style={{ color: starfallSubmit.accent, fontStyle: "italic" }}>
              {" "}
              work!
            </em>
          </h2>
          <p className="text-sm mt-4" style={{ color: "#64748b" }}>
            {submittedCount} of {total} answered · heading home…
          </p>
        </div>
      </div>
    );
  }

  const todayName = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date().getDay()];
  const answeredCount = Object.keys(answers).length;
  const progress = total > 0 ? (answeredCount / total) * 100 : 0;

  // Starfall-themed backdrop — bright pastel per subject, same in light + dark
  // so kids get the same warm feel regardless of theme.
  const starfallBg = starfall.bg;

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto starfall-doer"
      style={{ background: starfallBg, touchAction: "pan-y" }}
    >
      <div
        className="mx-auto px-6 py-12 space-y-7"
        style={{ maxWidth: 720 }}
      >
        {/* ── Editorial header: exit + subject eyebrow + progress strip ── */}
        <div className="animate-slide-up" style={{ animationDelay: "0ms" }}>
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <button
              onClick={() => {
                // Answers auto-save to localStorage as the student types, so
                // leaving and coming back is safe — no warning needed.
                onBack();
              }}
              className="btn-ghost text-xs gap-1.5"
              style={{ padding: "6px 10px" }}
            >
              ← Back
            </button>
            <div
              className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em]"
              style={{ color: "#6B6860" }}
            >
              <span style={{ fontSize: 16 }}>{subjectPal.emoji}</span>
              <span>{parsed?.subject || subjectPal.label}</span>
              <span style={{ color: "#D4CEC2" }}>·</span>
              <span>{todayName}</span>
            </div>
            {onSkip ? (
              <button
                onClick={() => {
                  if (!confirm("Skip this one and try a different assignment? You can come back to this one later.")) return;
                  onSkip();
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 800,
                  background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                  color: "#3a2410",
                  border: "1px solid #fcd34d",
                  boxShadow: "0 4px 12px rgba(245,158,11,0.3)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  touchAction: "manipulation",
                }}
                title="Skip this one — try a different assignment"
                aria-label="Try a different assignment"
              >
                🔄 Try a different one
              </button>
            ) : <span />}
          </div>

          {/* Masthead */}
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2"
            style={{ color: starfall.accent }}
          >
            — Today's assignment —
          </div>
          <h1
            className="font-display text-3xl sm:text-4xl leading-[1.05]"
            style={{ color: "#1A1915" }}
          >
            {assignment.title}
            <em style={{ color: starfall.accent, fontStyle: "italic" }}>.</em>
          </h1>
        </div>
        {/* ── Video embed with opt-in prompt ── */}
        {(() => {
          const vurl = assignment.video_url || parsed?.video_url;
          if (!vurl || !youtubeEmbedUrl(vurl)) return null;
          if (videoChoice === "pending")
            return (
              <div
                className="animate-slide-up"
                style={{
                  animationDelay: "40ms",
                  borderRadius: 16,
                  padding: "20px 24px",
                  background: "rgba(0,0,0,0.06)",
                  border: "1px solid rgba(0,0,0,0.1)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>📺</div>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  There's a video for this assignment
                </p>
                <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
                  Would you like to watch it before answering?
                </p>
                <div
                  style={{ display: "flex", gap: 10, justifyContent: "center" }}
                >
                  <button
                    onClick={() => setVideoChoice("watch")}
                    style={{
                      padding: "10px 22px",
                      borderRadius: 12,
                      background: starfall.accent,
                      color: "white",
                      fontWeight: 700,
                      fontSize: 14,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Watch Video
                  </button>
                  <button
                    onClick={() => setVideoChoice("skip")}
                    style={{
                      padding: "10px 22px",
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.08)",
                      fontWeight: 600,
                      fontSize: 14,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            );
          if (videoChoice === "watch")
            return (
              <div
                className="animate-slide-up"
                style={{ animationDelay: "40ms" }}
              >
                <div
                  style={{
                    borderRadius: 16,
                    overflow: "hidden",
                    aspectRatio: "16/9",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
                  }}
                >
                  <iframe
                    src={youtubeEmbedUrl(vurl)!}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Assignment video"
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: 8,
                  }}
                >
                  <button
                    onClick={() => setVideoChoice("skip")}
                    style={{
                      fontSize: 12,
                      opacity: 0.5,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Hide video
                  </button>
                </div>
              </div>
            );
          return null;
        })()}
        {/* ── Editorial progress strip: dots + counter + slim bar ── */}
        <div className="animate-slide-up" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center justify-between mb-2">
            <div
              className="text-[11px] uppercase tracking-wider font-semibold"
              style={{ color: "#6B6860" }}
            >
              Question {currentQ + 1}{" "}
              <span style={{ color: "#D4CEC2" }}>of</span> {total}
            </div>
            <div
              className="text-[11px] uppercase tracking-wider font-semibold"
              style={{ color: starfall.accent }}
            >
              {answeredCount} answered · {Math.round(progress)}%
            </div>
          </div>
          <div
            style={{
              height: 3,
              background: "rgba(26,25,21,0.08)",
              overflow: "hidden",
              borderRadius: 2,
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: starfall.accent,
                transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          </div>
        </div>
        {/* ── Section label ── */}
        {q && (
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.12em] animate-slide-up"
            style={{ animationDelay: "90ms", color: starfall.accent }}
          >
            — {q.sectionTitle} —
          </div>
        )}
        {/* ── Lesson — teaches the concept before any questions ── */}
        {parsed?.lesson && (
          <div
            className="rounded-2xl p-6 animate-fade-in"
            style={{
              background: "linear-gradient(135deg, #1e1b2e 0%, #16132a 100%)",
              border: `1px solid ${starfall.accent}33`,
              borderLeft: `3px solid ${starfall.accent}`,
            }}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-widest mb-3"
              style={{ color: starfall.accent }}
            >
              💡 Today's lesson
            </div>
            <p
              className="leading-relaxed"
              style={{
                color: "#e2e0f0",
                fontSize: "clamp(1rem, 1.6vw, 1.15rem)",
                whiteSpace: "pre-wrap",
              }}
            >
              {parsed.lesson}
            </p>
          </div>
        )}
        {/* ── Passage / reading text ── */}
        {q?.passage && (
          <div
            className="rounded-2xl p-6 animate-fade-in"
            style={{
              background: "linear-gradient(135deg, #1e1b2e 0%, #16132a 100%)",
              border: `1px solid ${starfall.accent}33`,
              borderLeft: `3px solid ${starfall.accent}`,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: starfall.accent }}
              >
                📖 Read this first
              </div>
              {ttsPassages && <button
                onClick={async () => {
                  if (passageState === "playing") {
                    passageAudioRef.current?.pause();
                    passageAudioRef.current = null;
                    setPassageState("idle");
                    return;
                  }
                  setPassageState("loading");
                  try {
                    const token = localStorage.getItem("token");
                    const apiBase = (import.meta as any)?.env?.VITE_API_BASE ||
                      (window.location.hostname === "localhost"
                        ? "http://localhost:4000/api"
                        : "https://scratch-classroom-api-td1x.vercel.app/api");
                    const res = await fetch(`${apiBase}/ai/tts`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      },
                      body: JSON.stringify({ text: q.passage, mode: "passage" }),
                    });
                    if (!res.ok) throw new Error("tts_failed");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const audio = new Audio(url);
                    passageAudioRef.current = audio;
                    audio.onended = () => {
                      URL.revokeObjectURL(url);
                      setPassageState("idle");
                    };
                    audio.onerror = () => setPassageState("idle");
                    await audio.play();
                    setPassageState("playing");
                  } catch {
                    setPassageState("idle");
                  }
                }}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all cursor-pointer"
                style={{
                  background: passageState === "playing" ? `${starfall.accent}30` : `${starfall.accent}18`,
                  color: starfall.accent,
                  border: `1px solid ${starfall.accent}55`,
                  opacity: passageState === "loading" ? 0.6 : 1,
                }}
                disabled={passageState === "loading"}
              >
                {passageState === "loading" && (
                  <span style={{ display: "inline-block", width: 10, height: 10, border: `2px solid ${starfall.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                )}
                {passageState === "playing" ? "⏸ Stop" : passageState === "loading" ? "Loading…" : "🎧 Listen"}
              </button>}
            </div>
            <p
              className="leading-relaxed"
              style={{
                color: "#e2e0f0",
                fontSize: "clamp(1rem, 1.6vw, 1.15rem)",
                whiteSpace: "pre-wrap",
              }}
            >
              {q.passage}
            </p>
          </div>
        )}
        {/* ── Question card — editorial: big serif, generous whitespace ── */}
        {q && (
          <div
            key={`card-${cardKey}`}
            className={rm ? "" : "animate-fade-in"}
            style={{ animationDelay: "80ms" }}
          >
            <div
              className="p-8 sm:p-10 space-y-6"
              style={{
                background: "#ffffff",
                border: "1px solid rgba(0,0,0,0.05)",
                borderLeft: `3px solid ${starfall.accent}`,
                borderRadius: 20,
                boxShadow: `0 4px 16px rgba(24,23,30,0.05)`,
              }}
            >
              {/* Reading passage / context — shown above the question */}
              {q.q.context && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "#f8f6ff",
                    border: "1px solid #e0d8ff",
                    borderLeft: `3px solid ${starfall.accent}`,
                  }}
                >
                  <div
                    className="text-[10px] font-bold uppercase tracking-widest mb-2"
                    style={{ color: starfall.accent }}
                  >
                    Read this story
                  </div>
                  <p
                    style={{
                      color: "#2d2a3e",
                      fontSize: "clamp(0.95rem, 1.5vw, 1.05rem)",
                      lineHeight: 1.7,
                    }}
                  >
                    {q.q.context}
                  </p>
                </div>
              )}
              {/* Question text — Fraunces serif, typewriter reveal, tap-to-listen */}
              <div className="flex items-start gap-3">
                <p
                  className="font-display leading-[1.3] flex-1"
                  style={{
                    color: "#1A1915",
                    fontSize: "clamp(1.75rem, 2.4vw, 2.25rem)",
                  }}
                >
                  <TypewriterText text={q.q.text} speed={28} />
                </p>
                <button
                  onClick={() => {
                    const subj = String(parsed?.subject || "").toLowerCase();
                    if (subj === "spelling" && ttsSpelling) speakSpellingWord(q.q.text);
                    else if (subj !== "spelling") speakText(q.q.text);
                  }}
                  className="flex-shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 hover:scale-105"
                  style={{
                    width: 44,
                    height: 44,
                    background: `${starfall.accent}14`,
                    color: starfall.accent,
                    border: `1px solid ${starfall.accent}33`,
                    touchAction: "manipulation",
                  }}
                  title="Read aloud"
                  aria-label="Read question aloud"
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>🔊</span>
                </button>
              </div>

              {/* Hint — always light (Starfall surface is always light) */}
              {q.q.hint && (
                <div>
                  {showHint ? (
                    <div
                      className="rounded-2xl p-3 border animate-fade-in"
                      style={{ background: "#fffbeb", borderColor: "#fde68a" }}
                    >
                      <span
                        className="text-xs font-bold"
                        style={{ color: "#92400e" }}
                      >
                        💡 Hint:{" "}
                      </span>
                      <span className="text-sm" style={{ color: "#5A4B1F" }}>
                        {q.q.hint}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowHint(true)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-all"
                      style={{
                        background: "#fffbeb",
                        color: "#92400e",
                        border: "1px solid #fde68a",
                      }}
                    >
                      💡 Show Hint
                    </button>
                  )}
                </div>
              )}

              {/* ── Multiple choice ── */}
              {q.q.type === "multiple_choice" &&
              Array.isArray(q.q.options) &&
              q.q.options.length > 0 ? (
                <div className="space-y-3">
                  {q.q.options.map((opt: string, oi: number) => {
                    const isSelected = currentAnswer === opt;
                    const letter = String.fromCharCode(65 + oi);
                    return (
                      <button
                        key={oi}
                        onClick={() => handleSelect(opt)}
                        className="w-full text-left rounded-2xl font-medium transition-colors duration-150 cursor-pointer flex items-center gap-4 animate-fade-in"
                        style={{
                          minHeight: 68,
                          padding: "14px 20px",
                          fontSize: 17,
                          background: isSelected
                            ? `${starfall.accent}0d`
                            : "#ffffff",
                          border: `1px solid ${isSelected ? starfall.accent : "rgba(0,0,0,0.08)"}`,
                          color: "#1A1915",
                          touchAction: "manipulation",
                          animationDelay: `${oi * 40}ms`,
                        }}
                        aria-pressed={isSelected}
                      >
                        <span
                          className="flex-shrink-0 rounded-full flex items-center justify-center font-bold transition-colors"
                          style={{
                            width: 36,
                            height: 36,
                            background: isSelected
                              ? starfall.accent
                              : `${starfall.accent}12`,
                            color: isSelected ? "white" : starfall.accent,
                            fontSize: 15,
                          }}
                        >
                          {isSelected ? "✓" : letter}
                        </span>
                        <span
                          className="flex-1"
                          style={{ fontWeight: 600, color: "#1A1915" }}
                        >
                          {opt.replace(/^[A-D]\.\s*/, "")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : q.q.type === "draw" ? (
                <DrawCanvas
                  onDraw={handleSelect}
                  cardKey={cardKey}
                  accentColor={starfall.accent}
                />
              ) : (
                (() => {
                  /* ── Fallback input for anything that isn't MC: short_answer,
                   fill_blank, computation, undefined, etc. Math subject →
                   numeric keypad. Enter advances/submits. ── */
                  const isMath =
                    String(parsed?.subject || "").toLowerCase() === "math";
                  const isShort =
                    q.q.type === "short_answer" && (q.q.lines || 0) > 1;
                  const onEnter = (
                    e: React.KeyboardEvent<
                      HTMLInputElement | HTMLTextAreaElement
                    >,
                  ) => {
                    if (e.key === "Enter" && !e.shiftKey && !isShort) {
                      e.preventDefault();
                      if (String(currentAnswer).trim()) {
                        if (currentQ < total - 1) handleNext();
                        else handleSubmit();
                      }
                    }
                  };
                  const sharedStyle: React.CSSProperties = {
                    width: "100%",
                    minHeight: isShort ? 140 : 64,
                    padding: "16px 20px",
                    fontSize: isShort ? 17 : 22,
                    fontFamily: isShort
                      ? undefined
                      : "'Fraunces', ui-serif, Georgia, serif",
                    fontWeight: 600,
                    color: "#1A1915",
                    background: "#FAF9F7",
                    border: `2px solid ${starfall.accent}33`,
                    borderRadius: 16,
                    outline: "none",
                    touchAction: "manipulation",
                  };
                  const placeholder = isShort
                    ? "Write your answer here…"
                    : isMath
                      ? "Type your answer…"
                      : "Type your answer…";
                  return (
                    <div>
                      {isShort ? (
                        <textarea
                          value={currentAnswer}
                          onChange={(e) => handleSelect(e.target.value)}
                          placeholder={placeholder}
                          rows={q.q.lines || 4}
                          style={{ ...sharedStyle, resize: "vertical" }}
                          onFocus={(e) =>
                            (e.currentTarget.style.borderColor =
                              starfall.accent)
                          }
                          onBlur={(e) =>
                            (e.currentTarget.style.borderColor = `${starfall.accent}33`)
                          }
                        />
                      ) : (
                        <input
                          type={isMath ? "text" : "text"}
                          inputMode={isMath ? "numeric" : "text"}
                          autoComplete="off"
                          autoCorrect={isMath ? "off" : "on"}
                          value={currentAnswer}
                          onChange={(e) => handleSelect(e.target.value)}
                          onKeyDown={onEnter}
                          placeholder={placeholder}
                          style={sharedStyle}
                          onFocus={(e) =>
                            (e.currentTarget.style.borderColor =
                              starfall.accent)
                          }
                          onBlur={(e) =>
                            (e.currentTarget.style.borderColor = `${starfall.accent}33`)
                          }
                        />
                      )}
                      <div
                        className="text-[11px] mt-2"
                        style={{ color: "#8A867E" }}
                      >
                        {isShort
                          ? "Shift + Enter for a new line"
                          : "Press Enter to continue"}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}
        {/* ── Navigation buttons ── */}
        {(() => {
          const answered =
            q.q.type === "draw" || String(currentAnswer).trim().length > 0;
          const isLast = currentQ >= total - 1;
          return (
            <div
              className="flex items-center gap-3 animate-slide-up"
              style={{ animationDelay: "180ms" }}
            >
              <button
                onClick={handlePrev}
                disabled={currentQ === 0}
                className="rounded-2xl font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  minHeight: 56,
                  minWidth: 100,
                  padding: "0 20px",
                  fontSize: 15,
                  background: "#ffffff",
                  color: "#5A564F",
                  border: "1px solid rgba(0,0,0,0.1)",
                  touchAction: "manipulation",
                }}
              >
                ← Back
              </button>
              {/* Admin skip — always visible in the nav row */}
              <button
                onClick={() => { setShowSkipModal(true); setSkipCode(""); setSkipError(""); }}
                title="Admin skip (requires passcode)"
                style={{
                  minHeight: 56,
                  minWidth: 56,
                  padding: "0 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(0,0,0,0.14)",
                  background: "#ffffff",
                  color: "#5A564F",
                  fontSize: 18,
                  cursor: "pointer",
                  touchAction: "manipulation",
                  flexShrink: 0,
                }}
              >
                🔑
              </button>
              <button
                onClick={isLast ? handleSubmit : handleNext}
                disabled={!answered}
                className="flex-1 rounded-2xl font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  minHeight: 56,
                  fontSize: 16,
                  color: "white",
                  background: answered
                    ? isLast
                      ? "linear-gradient(135deg, #10b981, #059669)"
                      : starfall.accent
                    : "#D4CEC2",
                  border: "none",
                  touchAction: "manipulation",
                }}
                title={answered ? undefined : "Answer the question to continue"}
              >
                {isLast ? "Submit Work ✓" : "Next Question →"}
              </button>
            </div>
          );
        })()}
        {/* ── Progress dots — clicking requires admin passcode ── */}
        <ProgressDots
          total={total}
          current={currentQ}
          answers={answers}
          onDotClick={i => { if (i !== currentQ) { setNavTarget(i); setNavCode(""); setNavError(""); setShowNavModal(true); } }}
        />

        <div style={{ height: 80 }} />{" "}
        {/* spacer so mascot doesn't overlap last button */}
      </div>

      {/* ── Admin skip modal ── */}
      {showSkipModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) { setShowSkipModal(false); setSkipCode(""); setSkipError(""); } }}
        >
          <div style={{ background: "white", borderRadius: 20, padding: 28, width: "min(360px, 90vw)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>🔑</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e1b4b", marginBottom: 4 }}>Admin Skip</div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginBottom: 20 }}>
              Enter the teacher passcode to skip question {currentQ + 1}.
            </div>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={skipCode}
              onChange={e => { setSkipCode(e.target.value); setSkipError(""); }}
              onKeyDown={e => e.key === "Enter" && handleAdminSkip()}
              placeholder="Enter passcode…"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 18, letterSpacing: "0.2em", borderRadius: 12, border: skipError ? "1.5px solid #ef4444" : "1.5px solid rgba(0,0,0,0.15)", outline: "none", marginBottom: skipError ? 8 : 16, textAlign: "center" }}
            />
            {skipError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14, textAlign: "center" }}>{skipError}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setShowSkipModal(false); setSkipCode(""); setSkipError(""); }}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "transparent", fontSize: 14, cursor: "pointer", color: "rgba(0,0,0,0.5)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdminSkip}
                disabled={skipLoading || !skipCode.trim()}
                style={{ flex: 2, padding: "11px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#7c3aed,#6366f1)", color: "white", fontSize: 14, fontWeight: 700, cursor: skipLoading || !skipCode.trim() ? "default" : "pointer", opacity: skipLoading || !skipCode.trim() ? 0.5 : 1 }}
              >
                {skipLoading ? "Checking…" : "Skip Question"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Nav jump modal (dot-click) ── */}
      {showNavModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) { setShowNavModal(false); setNavCode(""); setNavError(""); } }}
        >
          <div style={{ background: "white", borderRadius: 20, padding: 28, width: "min(360px, 90vw)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e1b4b", marginBottom: 4 }}>Jump to Question {navTarget + 1}?</div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginBottom: 20 }}>
              Enter the teacher passcode to navigate to a different question.
            </div>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={navCode}
              onChange={e => { setNavCode(e.target.value); setNavError(""); }}
              onKeyDown={e => e.key === "Enter" && handleNavJump()}
              placeholder="Enter passcode…"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 18, letterSpacing: "0.2em", borderRadius: 12, border: navError ? "1.5px solid #ef4444" : "1.5px solid rgba(0,0,0,0.15)", outline: "none", marginBottom: navError ? 8 : 16, textAlign: "center" }}
            />
            {navError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14, textAlign: "center" }}>{navError}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setShowNavModal(false); setNavCode(""); setNavError(""); }}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "transparent", fontSize: 14, cursor: "pointer", color: "rgba(0,0,0,0.5)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleNavJump}
                disabled={navLoading || !navCode.trim()}
                style={{ flex: 2, padding: "11px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#7c3aed,#6366f1)", color: "white", fontSize: 14, fontWeight: 700, cursor: navLoading || !navCode.trim() ? "default" : "pointer", opacity: navLoading || !navCode.trim() ? 0.5 : 1 }}
              >
                {navLoading ? "Checking…" : "Go to Question"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Streak counter */}
      <StreakCounter streak={streak} />
    </div>
  );
}

/* ── Simple Assignment Card (for non-AI / unstructured assignments) ── */
function SimpleAssignmentCard({
  assignment,
  dk,
  onComplete,
}: {
  assignment: any;
  dk: boolean;
  onComplete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const todayName = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date().getDay()];
  const subjectPal = getSubjectPalette(assignment?.description);

  const lightBg = `linear-gradient(160deg, ${subjectPal.bg} 0%, #faf9ff 60%, #f0f1ff 100%)`;

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto flex flex-col items-center justify-center p-6"
      style={{ background: dk ? "#07071a" : lightBg }}
    >
      <div className={`w-full max-w-lg space-y-6 animate-spring-in`}>
        <div
          className={
            dk
              ? "rounded-3xl p-8 space-y-5 shadow-2xl border border-white/[0.07] bg-white/[0.04]"
              : "clay-card p-8 space-y-5"
          }
        >
          {/* Subject icon + title */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-md flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${subjectPal.border}, ${subjectPal.bg})`,
              }}
            >
              {subjectPal.emoji}
            </div>
            <div>
              <div
                className="text-xs font-bold uppercase tracking-widest mb-1"
                style={{
                  color: dk ? "rgba(255,255,255,0.4)" : subjectPal.accent,
                }}
              >
                📅 {todayName}'s Assignment
              </div>
              <h1
                className="font-student text-2xl font-extrabold"
                style={{ color: dk ? "white" : "#1e293b" }}
              >
                {assignment.title}
              </h1>
            </div>
          </div>

          {/* Instructions box */}
          {assignment.description && (
            <div
              className="rounded-2xl p-5 border-2"
              style={{
                background: dk ? "rgba(245,158,11,0.06)" : "#fffbeb",
                borderColor: dk ? "rgba(245,158,11,0.2)" : "#fde68a",
              }}
            >
              <div
                className="font-bold text-sm mb-2"
                style={{ color: dk ? "#fbbf24" : "#92400e" }}
              >
                📋 Instructions from your teacher
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: dk ? "rgba(251,191,36,0.7)" : "#78350f" }}
              >
                {assignment.description}
              </p>
            </div>
          )}

          {assignment.due_date && (
            <p
              className="text-xs"
              style={{ color: dk ? "rgba(255,255,255,0.3)" : "#94a3b8" }}
            >
              Due: {new Date(assignment.due_date).toLocaleDateString()}
            </p>
          )}

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className={
                dk
                  ? "w-full py-4 rounded-2xl font-bold text-white text-lg cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                  : "clay-btn w-full text-lg"
              }
              style={{
                minHeight: 64,
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "white",
                borderColor: dk ? "transparent" : "rgba(16,185,129,0.3)",
              }}
            >
              I'm Done ✓
            </button>
          ) : (
            <div className="space-y-3 animate-spring-in">
              <p
                className="text-center text-sm font-semibold"
                style={{ color: dk ? "rgba(255,255,255,0.6)" : "#64748b" }}
              >
                Are you sure you've finished?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  className={
                    dk
                      ? "flex-1 py-3 rounded-2xl font-semibold text-sm border border-white/10 text-white/50 hover:bg-white/[0.05] cursor-pointer"
                      : "clay-btn flex-1"
                  }
                  style={
                    !dk
                      ? {
                          background: "#f1f5f9",
                          color: "#475569",
                          borderColor: "#e2e8f0",
                          fontSize: 15,
                        }
                      : { minHeight: 52 }
                  }
                >
                  Not yet
                </button>
                <button
                  onClick={onComplete}
                  className={
                    dk
                      ? "flex-1 py-3 rounded-2xl font-bold text-sm text-white cursor-pointer"
                      : "clay-btn flex-1"
                  }
                  style={{
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    color: "white",
                    borderColor: "rgba(16,185,129,0.3)",
                    ...(dk ? { minHeight: 52 } : {}),
                  }}
                >
                  Yes, submit! 🌟
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard (shown after work is done) ── */
export default function StudentDashboard() {
  // Back button handler
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/student");
    }
  };

  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("welcome");
  // Reactive unlock state — students get dashboard access when on a 10-min
  // break OR after teacher-granted free time OR after submitting all work.
  // Re-polled every second + on `breakstate-change` + on `storage` so the
  // UI flips without a refresh when any of those flags change.
  const [accessUnlocked, setAccessUnlocked] =
    useState<boolean>(isAccessAllowed);
  // When access flips from unlocked → locked (e.g. break timer just ended,
  // teacher revoked freetime), re-fetch pending assignments so the WorkScreen
  // has fresh data. Without this the dashboard stays on phase='done' and
  // renders the playground even though the student should be back at work.
  const prevAccessRef = React.useRef<boolean>(accessUnlocked);
  useEffect(() => {
    if (prevAccessRef.current && !accessUnlocked) {
      setPhase("loading");
    }
    prevAccessRef.current = accessUnlocked;
  }, [accessUnlocked]);
  useEffect(() => {
    const refresh = () => setAccessUnlocked(isAccessAllowed());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "workDoneDate" || e.key === null) refresh();
    };
    window.addEventListener("breakstate-change", refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("blockforge:workdone-change", refresh);
    const iv = setInterval(refresh, 1000);
    return () => {
      window.removeEventListener("breakstate-change", refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("blockforge:workdone-change", refresh);
      clearInterval(iv);
    };
  }, []);
  const [classes, setClasses] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lockedScreen, setLockedScreen] = useState(false);
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [mascotCelebrating, setMascotCelebrating] = useState(false);
  const [badgeToast, setBadgeToast] = useState<Array<{ id: string; label: string; icon: string }> | null>(null);
  const [youtubeLibrary, setYoutubeLibrary] = useState<any[]>([]);
  const [playingLibVideo, setPlayingLibVideo] = useState<{
    videoId: string;
    title: string;
  } | null>(null);
  // Teacher-granted websites (Poki-style per-student URL library)
  const WS_CACHE = "sw_cache_v1";
  const [myWebsites, setMyWebsites] = useState<any[]>(() => {
    try {
      const c = localStorage.getItem(WS_CACHE);
      return c ? JSON.parse(c) : [];
    } catch {
      return [];
    }
  });
  const [websitesLoading, setWebsitesLoading] = useState(
    myWebsites.length === 0,
  );
  const [showWebsiteRequest, setShowWebsiteRequest] = useState(false);
  const [websiteRequestTitle, setWebsiteRequestTitle] = useState("");
  const [websiteRequestSent, setWebsiteRequestSent] = useState(false);
  useEffect(() => {
    api
      .getMyWebsites()
      .then((data) => {
        const list = data || [];
        setMyWebsites(list);
        setWebsitesLoading(false);
        try {
          localStorage.setItem(WS_CACHE, JSON.stringify(list));
        } catch {}
      })
      .catch(() => setWebsitesLoading(false));
  }, []);
  const classConfig = useClassConfig();
  const blockInfo = useBlockInfo(classes[0]?.id ?? null);


  // Reload YouTube library from ALL classes (merged) so we never miss videos
  useEffect(() => {
    if (classes.length === 0) return;
    const loadAll = async () => {
      const results = await Promise.all(
        classes.map((c) =>
          api.getYouTubeLibrary(c.id).catch(() => [] as any[]),
        ),
      );
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const arr of results) {
        for (const v of arr) {
          if (!seen.has(v.id)) {
            seen.add(v.id);
            merged.push(v);
          }
        }
      }
      setYoutubeLibrary(merged);
    };
    loadAll();
    const iv = setInterval(loadAll, 60_000);
    return () => clearInterval(iv);
  }, [classes]);

  // Work state
  const [pendingAssignment, setPendingAssignment] = useState<any>(null);
  const [parsedAssignment, setParsedAssignment] = useState<any>(null);
  const [allPendingAssignments, setAllPendingAssignments] = useState<any[]>([]);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [ttsPassages, setTtsPassages] = useState(true);
  const [ttsSpelling, setTtsSpelling] = useState(true);

  // Pending quizzes
  const [pendingQuizzes, setPendingQuizzes] = useState<any[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizResult, setQuizResult] = useState<{ score: number } | null>(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);

  // Stats
  const [statClasses, setStatClasses] = useState(0);
  const [statSubmitted, setStatSubmitted] = useState(0);
  const [statGraded, setStatGraded] = useState(0);
  const c0 = useCountUp(statClasses, 900, 200);
  const c1 = useCountUp(statSubmitted, 900, 290);
  const c2 = useCountUp(statGraded, 900, 380);

  // Behavior stars
  const [myStars, setMyStars] = useState({ stars: 0, rewards: 0 });
  useEffect(() => {
    if (user?.role !== "student") return;
    let cancelled = false;
    const load = () =>
      api
        .getMyStars()
        .then((d) => {
          if (!cancelled)
            setMyStars({ stars: d.stars ?? 0, rewards: d.rewards ?? 0 });
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [user?.role]);

  // Classroom-store points (ClassDojo-style). Separate from behavior stars —
  // cumulative teacher-awarded currency students spend at /cashout.
  const [dojoPoints, setDojoPoints] = useState<number | null>(null);
  useEffect(() => {
    if (user?.role !== "student") return;
    let cancelled = false;
    const load = () =>
      api
        .getMyBalance()
        .then((d) => {
          if (!cancelled) setDojoPoints(d?.dojo_points ?? 0);
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [user?.role]);

  // Avatar emoji (persisted to server)
  const [avatarEmoji, setAvatarEmoji] = useState<string>(
    (user as any)?.avatarEmoji || "",
  );
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // Welcome → loading transition
  useEffect(() => {
    const t = setTimeout(() => setPhase("loading"), 1800);
    return () => clearTimeout(t);
  }, []);

  // Load data (with 7s global timeout — if anything stalls, fail-open so the
  // student sees the dashboard rather than an infinite spinner)
  useEffect(() => {
    if (phase !== "loading") return;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setPhase("done");
    }, 7000);
    const load = async () => {
      try {
        const apiBase = (import.meta as any)?.env?.VITE_API_BASE ||
          (window.location.hostname === "localhost" ? "http://localhost:4000/api" : "https://scratch-classroom-api-td1x.vercel.app/api");
        const [clsList, subList, lb, adminSettings] = await Promise.all([
          api.getClasses().catch(() => [] as any[]),
          api.getMySubmissions().catch(() => [] as any[]),
          api.getLeaderboard().catch(() => [] as any[]),
          fetch(`${apiBase}/admin-settings`).then(r => r.json()).catch(() => ({})),
        ]);
        if (adminSettings?.tts_passages_allowed === "false") setTtsPassages(false);
        if (adminSettings?.tts_spelling_allowed === "false") setTtsSpelling(false);
        if (timedOut) return;
        setClasses(clsList);
        setSubmissions(subList);
        setLeaderboard(lb);
        setStatClasses(clsList.length);
        setStatSubmitted(subList.length);
        setStatGraded(subList.filter((s: any) => s.grade !== null).length);

        // Load YouTube library for first enrolled class
        if (clsList.length > 0) {
          api
            .getYouTubeLibrary(clsList[0].id)
            .then(setYoutubeLibrary)
            .catch(() => {});
        }

        let found: any = null;
        let foundParsed: any = null;

        // Fetch pending assignments + quizzes for all classes in parallel
        const classResults = await Promise.all(
          clsList.map(async (cls: any) => {
            const [pending, quizzes] = await Promise.all([
              api.getPendingAssignments(cls.id).catch(() => [] as any[]),
              api.getPendingQuizzes(cls.id).catch(() => [] as any[]),
            ]);
            return { pending, quizzes };
          })
        );

        const allQuizzes: any[] = [];
        const collectedPending: any[] = [];
        for (const { pending, quizzes } of classResults) {
          if (Array.isArray(pending)) {
            pending.forEach((a: any) => collectedPending.push(a));
            if (!found && pending.length > 0) {
              found = pending[0];
              // Content excluded from list for perf — fetch on demand
              if (found.content) {
                try {
                  const p = JSON.parse(found.content);
                  if (p?.sections?.length > 0) foundParsed = p;
                } catch {}
              } else {
                try {
                  const full = await api.getAssignment(found.id);
                  if (full?.content) {
                    const p = JSON.parse(full.content);
                    if (p?.sections?.length > 0) foundParsed = p;
                    found = { ...found, content: full.content };
                  }
                } catch {}
              }
            }
          }
          if (Array.isArray(quizzes) && quizzes.length) {
            quizzes.forEach((q: any) => allQuizzes.push(q));
          }
        }
        setPendingQuizzes(allQuizzes);
        setAllPendingAssignments(collectedPending);

        if (found) {
          clearWorkUnlock();
          setAccessUnlocked(isAccessAllowed());
          setPendingAssignment(found);
          setParsedAssignment(foundParsed);
        }
        setPhase("done");
        clearTimeout(timer);
      } catch {
        clearTimeout(timer);
        setPhase("done");
      }
    };
    load();
    return () => clearTimeout(timer);
  }, [phase]);

  // Auto-discover new pending assignments while the student is on the
  // "done" dashboard. Without this, a student who finished morning work
  // before the teacher added afternoon work is stuck on the celebratory
  // screen until they manually refresh. Polls every 30s; when new pending
  // is found, clears the workDone flag and surfaces the assignment hero.
  useEffect(() => {
    if (phase !== "done") return;
    if (pendingAssignment) return;
    if (classes.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const results = await Promise.all(
          classes.map((c: any) => api.getPendingAssignments(c.id).catch(() => null as any[] | null)),
        );
        if (cancelled) return;
        const anySucceeded = results.some((r) => r !== null);
        if (!anySucceeded) return;
        const flat = results.filter(Array.isArray).flat();
        if (flat.length === 0) return;
        // New work appeared — fetch content for the first one and surface it
        let next: any = flat[0];
        let nextParsed: any = null;
        if (next.content) {
          try { const p = JSON.parse(next.content); if (p?.sections?.length > 0) nextParsed = p; } catch {}
        } else {
          try {
            const full = await api.getAssignment(next.id);
            if (full?.content) {
              const p = JSON.parse(full.content);
              if (p?.sections?.length > 0) nextParsed = p;
              next = { ...next, content: full.content };
            }
          } catch {}
        }
        if (cancelled) return;
        clearWorkUnlock();
        setAccessUnlocked(isAccessAllowed());
        setAllPendingAssignments(flat);
        setPendingAssignment(next);
        setParsedAssignment(nextParsed);
      } catch { /* network blip — try again next tick */ }
    };
    const iv = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [phase, pendingAssignment, classes]);


  // Poll for screen lock
  useEffect(() => {
    if (classes.length === 0) return;
    const checkLock = async () => {
      for (const cls of classes) {
        try {
          const ctrl = await api.getMyControls(cls.id);
          if (ctrl?.screen_locked) {
            setLockedScreen(true);
            return;
          }
        } catch {}
      }
      setLockedScreen(false);
    };
    checkLock();
    const iv = setInterval(checkLock, 5000);
    return () => clearInterval(iv);
  }, [classes]);

  const phaseActivity =
    phase === "welcome"
      ? "Just logged in 👋"
      : phase === "loading"
        ? "Loading dashboard 🔄"
        : phase === "working"
          ? `Working on assignment 📝${pendingAssignment ? ` — ${pendingAssignment.title}` : ""}`
          : "Free time! 🎉";
  usePresencePing(phaseActivity);

  useSocket("class:lock", (data) => setLockedScreen(data.locked));
  useSocket("class:reload", () => window.location.reload());
  useSocket("class:broadcast", (data) => {
    setBroadcast(`${data.from}: ${data.message}`);
    setTimeout(() => setBroadcast(null), 10000);
  });

  const handleWorkComplete = useCallback(
    async (answers: Record<number, string>) => {
      if (pendingAssignment) {
        try {
          await api.submitAssignmentWithAnswers(pendingAssignment.id, answers);
        } catch {}
        // Clear any saved draft for this assignment — student finished it.
        try { localStorage.removeItem(`assignment-draft-${pendingAssignment.id}`); } catch {}
      }
      spawnConfetti();
      setMascotCelebrating(true);
      setTimeout(() => setMascotCelebrating(false), 3000);
      try {
        const subs = await api.getMySubmissions();
        setSubmissions(subs);
        setStatSubmitted(subs.length);
        setStatGraded(subs.filter((s: any) => s.grade !== null).length);
      } catch {}

      // Auto-award milestone badges (5, 10, 25, 50, 100 assignments). If
      // the student crossed a threshold, pop a toast so they get the
      // satisfaction of seeing it.
      try {
        const result = await api.autoAwardBadges();
        if (result.awarded && result.awarded.length > 0) {
          setBadgeToast(result.awarded);
          setTimeout(() => setBadgeToast(null), 6000);
        }
      } catch { /* non-fatal — milestone might just be off by one this round */ }

      // Remove the just-completed assignment from the cached list and check
      // whether there are more to do. Using the locally-cached list avoids any
      // API error/timing issue that could falsely declare the student "done".
      const submittedId = pendingAssignment?.id;
      const remaining = allPendingAssignments.filter((a: any) => a.id !== submittedId);
      setAllPendingAssignments(remaining);

      let nextAssignment: any = remaining.length > 0 ? remaining[0] : null;
      let nextParsed: any = null;

      if (nextAssignment) {
        // Fetch content for the next assignment on demand
        if (nextAssignment.content) {
          try {
            const p = JSON.parse(nextAssignment.content);
            if (p?.sections?.length > 0) nextParsed = p;
          } catch {}
        } else {
          try {
            const full = await api.getAssignment(nextAssignment.id);
            if (full?.content) {
              const p = JSON.parse(full.content);
              if (p?.sections?.length > 0) nextParsed = p;
              nextAssignment = { ...nextAssignment, content: full.content };
            }
          } catch {}
        }
        setQuestionsAnswered(0);
        setPendingAssignment(nextAssignment);
        setParsedAssignment(nextParsed);
        setPhase("working");
      } else {
        // Local list is empty — do a final API check to confirm before unlocking.
        // This catches any assignments added by the teacher during the session.
        let confirmedDone = true;
        try {
          const freshResults = await Promise.all(
            classes.map((cls: any) => api.getPendingAssignments(cls.id).catch(() => null as any[] | null))
          );
          const anySucceeded = freshResults.some(r => r !== null);
          if (anySucceeded) {
            // We got valid results — check if there's truly nothing left
            const freshRemaining = freshResults
              .filter(Array.isArray)
              .flat()
              .filter((a: any) => a.id !== submittedId);
            if (freshRemaining.length > 0) {
              // Teacher added new work during the session
              confirmedDone = false;
              setAllPendingAssignments(freshRemaining);
              nextAssignment = freshRemaining[0];
              if (nextAssignment.content) {
                try { const p = JSON.parse(nextAssignment.content); if (p?.sections?.length > 0) nextParsed = p; } catch {}
              } else {
                try {
                  const full = await api.getAssignment(nextAssignment.id);
                  if (full?.content) {
                    const p = JSON.parse(full.content);
                    if (p?.sections?.length > 0) nextParsed = p;
                    nextAssignment = { ...nextAssignment, content: full.content };
                  }
                } catch {}
              }
              setQuestionsAnswered(0);
              setPendingAssignment(nextAssignment);
              setParsedAssignment(nextParsed);
              setPhase("working");
            }
            // anySucceeded + freshRemaining empty → genuinely done
          } else {
            // All API calls failed — don't unlock, let student see dashboard and retry
            confirmedDone = false;
          }
        } catch { confirmedDone = false; }

        if (confirmedDone) {
          setWorkUnlocked();
          setPendingAssignment(null);
          setParsedAssignment(null);
          setPhase("done");
        } else if (!nextAssignment) {
          // API failed — go back to dashboard without unlocking
          setPendingAssignment(null);
          setParsedAssignment(null);
          setPhase("done");
        }
      }
    },
    [pendingAssignment, allPendingAssignments, classes],
  );

  // Skip the current assignment without submitting it. Pulls the next one
  // from the cached pending list so the student keeps working instead of
  // bailing to Arcade. The skipped assignment stays pending and they can
  // come back to it later.
  const handleSkip = useCallback(async () => {
    if (!pendingAssignment) return;
    const skippedId = pendingAssignment.id;
    // Move skipped to the end of the list so we don't immediately re-show it
    const others = allPendingAssignments.filter((a: any) => a.id !== skippedId);
    const skipped = allPendingAssignments.find((a: any) => a.id === skippedId);
    const reordered = skipped ? [...others, skipped] : others;
    setAllPendingAssignments(reordered);

    let nextAssignment: any = others.length > 0 ? others[0] : null;
    let nextParsed: any = null;
    if (nextAssignment) {
      if (nextAssignment.content) {
        try { const p = JSON.parse(nextAssignment.content); if (p?.sections?.length > 0) nextParsed = p; } catch {}
      } else {
        try {
          const full = await api.getAssignment(nextAssignment.id);
          if (full?.content) {
            const p = JSON.parse(full.content);
            if (p?.sections?.length > 0) nextParsed = p;
            nextAssignment = { ...nextAssignment, content: full.content };
          }
        } catch {}
      }
      setQuestionsAnswered(0);
      setPendingAssignment(nextAssignment);
      setParsedAssignment(nextParsed);
      setPhase("working");
    } else {
      // Nothing else to skip to — drop them back to the dashboard
      setPendingAssignment(null);
      setParsedAssignment(null);
      setPhase("done");
    }
  }, [pendingAssignment, allPendingAssignments]);


  const myEntry = leaderboard.find((e: any) => e.user_id === user?.id);
  const rm = prefersReducedMotion();

  // ── RENDER ──

  if (lockedScreen) {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center ${dk ? "bg-[#07071a]/98" : "bg-white/95"} backdrop-blur-xl`}
      >
        <div className="text-center">
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 ${dk ? "bg-white/[0.06]" : "bg-gray-100"}`}
          >
            <Lock
              size={36}
              className={dk ? "text-white/60" : "text-gray-400"}
            />
          </div>
          <h2
            className={`text-2xl font-bold ${dk ? "text-white" : "text-gray-900"}`}
          >
            Screen Locked
          </h2>
          <p
            className={`mt-2 text-sm ${dk ? "text-white/40" : "text-gray-500"}`}
          >
            Your teacher has locked screens.
          </p>
        </div>
      </div>
    );
  }

  const lockBanner = null;

  if (phase === "welcome")
    return <WelcomeScreen name={user?.name || "Student"} />;

  if (phase === "loading")
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0f0726, #0a0b20)" }}
      >
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-white/50 text-sm">Checking your assignments…</p>
        </div>
      </div>
    );

  // Access-unlocked short-circuit: while the student is on a 10-min break OR
  // after teacher granted free time / all work submitted, skip the "do your
  // work" gate and render the full dashboard so Arcade/Projects/YouTube are
  // reachable. This is what makes the dashboard flip in real-time when the
  // teacher clicks Grant Free Time or the student starts a break.

  if (phase === "working" && pendingAssignment && parsedAssignment) {
    return (
      <WorkScreen
        assignment={pendingAssignment}
        parsed={parsedAssignment}
        dk={dk}
        onComplete={handleWorkComplete}
        onBack={() => setPhase("done")}
        onSkip={handleSkip}
        questionsAnswered={questionsAnswered}
        setQuestionsAnswered={setQuestionsAnswered}
        ttsPassages={ttsPassages}
        ttsSpelling={ttsSpelling}
      />
    );
  }

  if (phase === "working" && pendingAssignment && !parsedAssignment) {
    return (
      <SimpleAssignmentCard
        assignment={pendingAssignment}
        dk={dk}
        onComplete={() => handleWorkComplete({})}
      />
    );
  }

  // ── DONE / DASHBOARD ──
  const unlocked = accessUnlocked;
  const starsCount = Math.max(0, Math.min(5, myStars.stars));
  const firstName = user?.name?.split(" ")[0] || "Student";
  const badgeCount = myEntry?.badges
    ? Array.isArray(myEntry.badges)
      ? myEntry.badges.length
      : 0
    : 0;

  const DB_ANIM = `
    @keyframes dbGrad { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
    @keyframes dbFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
    @keyframes dbPop { from{opacity:0;transform:scale(.85) translateY(10px)} to{opacity:1;transform:none} }
    @keyframes dbStarPulse { 0%,100%{filter:drop-shadow(0 0 3px rgba(251,191,36,.8))} 50%{filter:drop-shadow(0 0 9px rgba(251,191,36,1)) drop-shadow(0 0 18px rgba(245,158,11,.6))} }
    @keyframes dbSlide { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
    @keyframes dbShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
    @keyframes lootShake { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-8deg)} 75%{transform:rotate(8deg)} }
    @keyframes lootOpen { from{transform:scaleY(0);opacity:0;transform-origin:top} to{transform:scaleY(1);opacity:1;transform-origin:top} }
  `;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0f1628",
        backgroundImage:
          "radial-gradient(circle at 15% 0%, rgba(139,92,246,0.12), transparent 60%), radial-gradient(circle at 95% 30%, rgba(245,158,11,0.08), transparent 55%)",
        color: "white",
        fontFamily: "'Baloo 2', 'Inter', system-ui, sans-serif",
        paddingBottom: 80,
        position: "relative",
      }}
    >
      <style>{DB_ANIM}</style>

      {lockBanner}

      {broadcast && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            padding: "12px 24px",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 700,
            background: "linear-gradient(90deg, #7c3aed, #6d28d9)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Megaphone size={15} />
          {broadcast}
        </div>
      )}

      {/* Achievement toast — shown for ~6s when a milestone badge lands */}
      {badgeToast && badgeToast.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            padding: "16px 22px",
            borderRadius: 18,
            background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
            color: "#3a2410",
            fontWeight: 900,
            fontSize: 16,
            textAlign: "center",
            boxShadow: "0 12px 40px rgba(245,158,11,0.55)",
            border: "2px solid #fef3c7",
            animation: "dbPop .5s cubic-bezier(0.22,1,0.36,1) both",
            cursor: "pointer",
            maxWidth: "92vw",
          }}
          onClick={() => setBadgeToast(null)}
        >
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7, marginBottom: 6 }}>
            🎉 Achievement unlocked!
          </div>
          {badgeToast.map((b, i) => (
            <div key={b.id || i} style={{ fontSize: 18, lineHeight: 1.3, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
              <span style={{ fontSize: 26 }}>{b.icon}</span>
              <span>{b.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Avatar picker modal */}
      {showAvatarPicker && user && (
        <AvatarPickerModal
          userId={user.id}
          current={avatarEmoji}
          onSelect={setAvatarEmoji}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {/* Website request modal */}
      {showWebsiteRequest && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(0,0,0,0.7)",
          }}
          onClick={() => setShowWebsiteRequest(false)}
        >
          <div
            style={{
              maxWidth: 440,
              width: "100%",
              padding: 24,
              borderRadius: 20,
              background: "linear-gradient(135deg,#1a0f40,#0f1a3a)",
              border: "1px solid rgba(139,92,246,.4)",
              boxShadow: "0 20px 60px rgba(0,0,0,.6)",
              color: "white",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
              Request a website
            </h3>
            <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 16 }}>
              Tell your teacher the name of the site you'd like to use. They'll
              review it and unlock it for you.
            </p>
            {websiteRequestSent ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#34d399" }}>
                  Request sent! Your teacher will review it.
                </p>
                <button
                  onClick={() => setShowWebsiteRequest(false)}
                  style={{
                    marginTop: 16,
                    padding: "10px 24px",
                    borderRadius: 12,
                    background: "#7c3aed",
                    color: "white",
                    border: "none",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={websiteRequestTitle}
                  onChange={(e) => setWebsiteRequestTitle(e.target.value)}
                  placeholder="e.g. Typing Club, Prodigy, Cool Math…"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    marginBottom: 14,
                    background: "rgba(255,255,255,0.09)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "white",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  maxLength={200}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && websiteRequestTitle.trim()) {
                      try {
                        await api.requestWebsite(websiteRequestTitle.trim());
                        setWebsiteRequestSent(true);
                      } catch {}
                    }
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={() => setShowWebsiteRequest(false)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.07)",
                      color: "rgba(255,255,255,0.7)",
                      border: "none",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!websiteRequestTitle.trim()}
                    onClick={async () => {
                      try {
                        await api.requestWebsite(websiteRequestTitle.trim());
                        setWebsiteRequestSent(true);
                      } catch {}
                    }}
                    style={{
                      padding: "10px 22px",
                      borderRadius: 12,
                      background: "#7c3aed",
                      color: "white",
                      border: "none",
                      fontWeight: 700,
                      cursor: "pointer",
                      opacity: websiteRequestTitle.trim() ? 1 : 0.4,
                    }}
                  >
                    Send request
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 16px" }}>
        {/* ── Header: big friendly greeting with avatar ── */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "24px 4px 18px",
            animation: "dbPop .4s ease both",
            position: "relative",
          }}
        >
          {/* Back Button in header */}
          <button
            onClick={handleBack}
            style={{
              position: "relative",
              marginRight: 10,
              background: dk ? "rgba(139,92,246,0.18)" : "#ede9fe",
              color: dk ? "#c4b5fd" : "#6d28d9",
              border: "none",
              borderRadius: 14,
              padding: "8px 16px 8px 12px",
              fontWeight: 700,
              fontSize: 15,
              boxShadow: dk
                ? "0 2px 8px rgba(139,92,246,0.12)"
                : "0 2px 8px #ede9fe",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              transition: "background 0.18s, color 0.18s",
            }}
            className="back-btn"
            aria-label="Back"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 22 22"
              fill="none"
              style={{ marginRight: 3 }}
            >
              <path
                d="M13.5 17L8.5 12L13.5 7"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>
          <button
            onClick={() => setShowAvatarPicker(true)}
            title="Change your avatar"
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              flexShrink: 0,
              background: avatarEmoji
                ? "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(79,70,229,0.25))"
                : "linear-gradient(135deg, #7c3aed, #4f46e5)",
              border: "3px solid rgba(255,255,255,0.15)",
              boxShadow: "0 8px 24px rgba(139,92,246,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: avatarEmoji ? 40 : 28,
              fontWeight: 900,
              color: "white",
              cursor: "pointer",
              transition: "transform 0.18s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "";
            }}
          >
            {avatarEmoji || firstName[0].toUpperCase()}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                opacity: 0.5,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                marginBottom: 4,
                fontWeight: 700,
              }}
            >
              {new Date().toLocaleDateString("en-US", { weekday: "long" })}
            </div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 800,
                lineHeight: 1,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              {unlocked ? `Free time, ${firstName}! 🎉` : `Hi, ${firstName}!`}
            </h1>
          </div>
        </header>

        {/* ── Stats row: Points (big) + Stars (compact) — one clean line ── */}
        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            animation: "dbSlide .4s ease both",
          }}
        >
          {/* Points — clickable → store. Biggest visual element. */}
          {dojoPoints != null && (
            <Link
              to="/cashout"
              style={{
                flex: 2,
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 18,
                textDecoration: "none",
                background:
                  "linear-gradient(135deg, rgba(245,158,11,0.22), rgba(217,119,6,0.08))",
                border: "1px solid rgba(245,158,11,0.35)",
                boxShadow: "0 2px 14px rgba(245,158,11,0.12)",
                color: "white",
              }}
              aria-label="Your points — tap to visit the store"
            >
              <span style={{ fontSize: 34 }}>🪙</span>
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    color: "#fbbf24",
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {dojoPoints}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    opacity: 0.8,
                    marginTop: 3,
                    fontWeight: 700,
                  }}
                >
                  points · tap to shop →
                </span>
              </span>
            </Link>
          )}
          {/* Stars — simple, amber when they've earned rewards */}
          <div
            style={{
              flex: 1,
              borderRadius: 18,
              padding: "12px 14px",
              background:
                myStars.rewards > 0
                  ? "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.08))"
                  : "rgba(255,255,255,0.05)",
              border:
                myStars.rewards > 0
                  ? "1px solid rgba(245,158,11,0.3)"
                  : "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
              {Array.from({ length: 5 }, (_, i) => (
                <svg
                  key={i}
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill={i < starsCount ? "#fbbf24" : "none"}
                  stroke={i < starsCount ? "#f59e0b" : "rgba(255,255,255,0.18)"}
                  strokeWidth="2"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ))}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(255,255,255,0.55)",
              }}
            >
              {myStars.rewards > 0
                ? `🏆 ${myStars.rewards} reward${myStars.rewards === 1 ? "" : "s"}`
                : `${starsCount} / 5 stars`}
            </div>
          </div>
        </div>



        {/* Progress badge — visual card with circular progress so kids can
            tell at a glance how much work is left. Stays visible whenever
            there's pending work; switches to a celebration state at 100%. */}
        {(() => {
          const remaining = allPendingAssignments.length;
          const doneToday = statSubmitted;
          const total = doneToday + remaining;
          if (total === 0) return null;
          const pct = Math.max(0, Math.min(100, Math.round((doneToday / total) * 100)));
          const allDone = remaining === 0;
          // Circular progress geometry
          const size = 72;
          const stroke = 8;
          const r = (size - stroke) / 2;
          const c = 2 * Math.PI * r;
          const offset = c * (1 - pct / 100);
          return (
            <div
              style={{
                marginBottom: 14,
                padding: "16px 18px",
                borderRadius: 20,
                background: allDone
                  ? "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(22,163,74,0.10))"
                  : "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(99,102,241,0.10))",
                border: allDone
                  ? "1px solid rgba(34,197,94,0.4)"
                  : "1px solid rgba(139,92,246,0.4)",
                display: "flex",
                alignItems: "center",
                gap: 16,
                animation: "dbSlide .4s ease both",
                boxShadow: allDone
                  ? "0 8px 24px rgba(34,197,94,0.18)"
                  : "0 8px 24px rgba(139,92,246,0.18)",
              }}
            >
              {/* Circular progress ring */}
              <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
                <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                  <circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={stroke}
                  />
                  <circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none"
                    stroke={allDone ? "#22c55e" : "#a78bfa"}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 18,
                    color: allDone ? "#22c55e" : "#c4b5fd",
                  }}
                >
                  {pct}%
                </div>
              </div>
              {/* Stats */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: allDone ? "#86efac" : "#ddd6fe", lineHeight: 1.1 }}>
                  {allDone
                    ? "🎉 All done for today!"
                    : `${doneToday} of ${total} assignments done`}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.65)",
                    marginTop: 4,
                  }}
                >
                  {allDone
                    ? "Great work — your bonus and tomorrow's work will appear here."
                    : remaining === 1
                    ? "Just 1 more to go — you've got this!"
                    : `${remaining} more to go — keep it up!`}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Today's assignment — prominent hero when there's one to do */}
        {pendingAssignment && (
          <div
            onClick={() => {
              setPhase("working");
            }}
            style={{
              borderRadius: 20,
              padding: "20px 22px",
              marginBottom: 14,
              cursor: "pointer",
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(99,102,241,0.22))",
              border: "1px solid rgba(139,92,246,0.55)",
              display: "flex",
              alignItems: "center",
              gap: 18,
              animation: "dbSlide .4s ease both",
              transition: "transform .15s",
              boxShadow: "0 8px 28px rgba(139,92,246,0.25)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform =
                "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "";
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                flexShrink: 0,
                background: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                boxShadow: "0 8px 20px rgba(139,92,246,0.4)",
              }}
            >
              📝
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  opacity: 0.7,
                  marginBottom: 3,
                }}
              >
                Today's Assignment
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {pendingAssignment.title}
              </div>
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 3 }}>
                Tap to start →
              </div>
            </div>
            <div style={{ fontSize: 22, opacity: 0.7 }}>›</div>
          </div>
        )}

        {/* ── Menu — admin-dashboard-style tile grid with circle icons ── */}
        {(() => {
          type Tile = {
            to?: string;
            onClick?: () => void;
            icon: string;
            label: string;
            desc: string;
            grad: string;
            glow: string;
          };
          const TILES: Tile[] = [
            // Always visible — the schoolwork core
            {
              to: "/assignments",
              icon: "📝",
              label: "Assignments",
              desc: "Work to do",
              grad: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
              glow: "rgba(139,92,246,0.35)",
            },
            {
              to: "/lessons",
              icon: "📖",
              label: "Lessons",
              desc: "Read & review",
              grad: "linear-gradient(135deg,#3b82f6,#2563eb)",
              glow: "rgba(59,130,246,0.35)",
            },
            {
              to: "/achievements",
              icon: "🎖️",
              label: "Achievements",
              desc: "Your badges",
              grad: "linear-gradient(135deg,#10b981,#059669)",
              glow: "rgba(16,185,129,0.35)",
            },
            // Store only visible during the cashout block
            ...(blockInfo.state === "current" &&
            (blockInfo as any).block?.subject?.toLowerCase() === "cashout"
              ? ([
                  {
                    to: "/cashout",
                    icon: "🪙",
                    label: "Store",
                    desc:
                      dojoPoints != null ? `${dojoPoints} pts` : "Spend points",
                    grad: "linear-gradient(135deg,#fbbf24,#f59e0b)",
                    glow: "rgba(251,191,36,0.35)",
                  },
                ] as Tile[])
              : []),
            // Free-time only — Websites, Videos, Arcade, Projects
            ...(unlocked
              ? ([
                  {
                    to: "/websites",
                    icon: "🌐",
                    label: "Websites",
                    desc:
                      myWebsites.length > 0
                        ? `${myWebsites.length} apps`
                        : "Apps",
                    grad: "linear-gradient(135deg,#6366f1,#4f46e5)",
                    glow: "rgba(99,102,241,0.35)",
                  },
                  ...(classConfig.youtubeEnabled
                    ? ([
                        {
                          to: "/student/videos",
                          icon: "📺",
                          label: "Videos",
                          desc:
                            youtubeLibrary.length > 0
                              ? `${youtubeLibrary.length} ready`
                              : "Teacher's picks",
                          grad: "linear-gradient(135deg,#ef4444,#dc2626)",
                          glow: "rgba(239,68,68,0.35)",
                        },
                      ] as Tile[])
                    : []),
                  {
                    to: "/arcade",
                    icon: "🎮",
                    label: "Arcade",
                    desc: "31 games",
                    grad: "linear-gradient(135deg,#ec4899,#db2777)",
                    glow: "rgba(236,72,153,0.35)",
                  },
                  {
                    to: "/projects",
                    icon: "💻",
                    label: "Projects",
                    desc: "2D · 3D · Unity",
                    grad: "linear-gradient(135deg,#14b8a6,#0d9488)",
                    glow: "rgba(20,184,166,0.35)",
                  },
                ] as Tile[])
              : []),
            // Sign out button
            {
              onClick: logout,
              icon: "🚪",
              label: "Sign Out",
              desc: "Logout",
              grad: "linear-gradient(135deg,#6b7280,#4b5563)",
              glow: "rgba(107,114,128,0.35)",
            },
          ];
          return (
            <div
              style={{
                marginTop: 18,
                marginBottom: 18,
                animation: "dbSlide .45s ease both",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
                  gap: 12,
                }}
              >
                {TILES.map((t, i) => {
                  const inner = (
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 18,
                        overflow: "hidden",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        transition:
                          "transform .15s, box-shadow .15s, border-color .15s",
                        display: "flex",
                        flexDirection: "column",
                        animation: "dbPop .4s ease both",
                        animationDelay: `${i * 40}ms`,
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.transform = "translateY(-4px)";
                        el.style.boxShadow = `0 12px 32px ${t.glow}`;
                        el.style.borderColor = "rgba(255,255,255,0.16)";
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.transform = "";
                        el.style.boxShadow = "";
                        el.style.borderColor = "rgba(255,255,255,0.08)";
                      }}
                    >
                      <div style={{ height: 3, background: t.grad }} />
                      <div
                        style={{
                          padding: "16px 14px 18px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: "50%",
                            background: t.grad,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 28,
                            color: "white",
                            boxShadow: `0 8px 20px ${t.glow}`,
                          }}
                        >
                          {t.icon}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 900,
                              color: "white",
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {t.label}
                          </div>
                          <div
                            style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}
                          >
                            {t.desc}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  if (t.to) {
                    return (
                      <Link
                        key={i}
                        to={t.to}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        {inner}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={i}
                      onClick={t.onClick}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        color: "inherit",
                      }}
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Quiz tiles */}
        {pendingQuizzes.length > 0 &&
          !activeQuiz &&
          pendingQuizzes.map((q) => (
            <button
              key={q.id}
              onClick={() => {
                setActiveQuiz(q);
                setQuizAnswers(new Array((q.questions || []).length).fill(-1));
                setQuizResult(null);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "18px 20px",
                borderRadius: 16,
                marginBottom: 10,
                cursor: "pointer",
                background:
                  "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(234,179,8,0.12))",
                border: "1px solid rgba(245,158,11,0.45)",
                color: "white",
                animation: "dbSlide .48s ease both",
                transition: "transform .15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform =
                  "scale(1.01)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "";
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  flexShrink: 0,
                  background: "rgba(245,158,11,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                }}
              >
                🧠
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 900 }}>
                  {q.title || "Quiz"}
                </div>
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                  {q._className} · {(q.questions || []).length} questions
                  {q.estimated_minutes ? ` · ~${q.estimated_minutes} min` : ""}
                </div>
              </div>
              <div style={{ fontSize: 18, opacity: 0.6 }}>›</div>
            </button>
          ))}

        {/* Inline quiz taker */}
        {activeQuiz && (
          <div
            style={{
              borderRadius: 16,
              padding: "20px",
              marginBottom: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(139,92,246,.4)",
              animation: "dbSlide .4s ease both",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    opacity: 0.4,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    marginBottom: 4,
                  }}
                >
                  Quiz
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
                  {activeQuiz.title}
                </h2>
              </div>
              <button
                onClick={() => {
                  setActiveQuiz(null);
                  setQuizResult(null);
                }}
                style={{
                  fontSize: 13,
                  opacity: 0.5,
                  background: "none",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
            {quizResult ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div
                  style={{ fontSize: 52, fontWeight: 900, color: "#a78bfa" }}
                >
                  {quizResult.score}%
                </div>
                <div style={{ opacity: 0.6, marginTop: 8 }}>
                  Quiz submitted. Nice work! 🎉
                </div>
                <button
                  onClick={() => {
                    setPendingQuizzes((p) =>
                      p.filter((x) => x.id !== activeQuiz.id),
                    );
                    setActiveQuiz(null);
                    setQuizResult(null);
                  }}
                  style={{
                    marginTop: 16,
                    padding: "10px 24px",
                    borderRadius: 12,
                    background: "#7c3aed",
                    color: "white",
                    border: "none",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {(activeQuiz.questions || []).map((q: any, qi: number) => (
                    <div
                      key={qi}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.05)",
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>
                        {qi + 1}. {q.text}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {(q.options || []).map((opt: string, oi: number) => (
                          <label
                            key={oi}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              cursor: "pointer",
                              padding: "8px 10px",
                              borderRadius: 10,
                              background:
                                quizAnswers[qi] === oi
                                  ? "rgba(139,92,246,.3)"
                                  : "rgba(255,255,255,.04)",
                              border:
                                quizAnswers[qi] === oi
                                  ? "1px solid rgba(139,92,246,.5)"
                                  : "1px solid rgba(255,255,255,.06)",
                            }}
                          >
                            <input
                              type="radio"
                              name={`q-${qi}`}
                              checked={quizAnswers[qi] === oi}
                              onChange={() =>
                                setQuizAnswers((a) => {
                                  const n = [...a];
                                  n[qi] = oi;
                                  return n;
                                })
                              }
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  disabled={quizSubmitting || quizAnswers.some((a) => a < 0)}
                  onClick={async () => {
                    setQuizSubmitting(true);
                    try {
                      const r = await api.submitQuiz(
                        activeQuiz.id,
                        quizAnswers,
                      );
                      setQuizResult({ score: r.score });
                    } catch (e: any) {
                      alert(
                        "Could not submit: " + (e?.message || "unknown error"),
                      );
                    } finally {
                      setQuizSubmitting(false);
                    }
                  }}
                  style={{
                    marginTop: 16,
                    padding: "12px 24px",
                    borderRadius: 12,
                    background: "#7c3aed",
                    color: "white",
                    border: "none",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity:
                      quizSubmitting || quizAnswers.some((a) => a < 0)
                        ? 0.4
                        : 1,
                  }}
                >
                  {quizSubmitting ? "Submitting…" : "Submit quiz"}
                </button>
              </>
            )}
          </div>
        )}



        {/* ── ACHIEVEMENTS: loot-box cards ── */}
        {(myStars.rewards > 0 || badgeCount > 0) && (
          <div style={{ marginTop: 22 }}>
            <div
              style={{
                marginBottom: 10,
                fontSize: 10,
                fontWeight: 700,
                opacity: 0.4,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
              }}
            >
              🎁 Achievements
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                gap: 10,
              }}
            >
              {Array.from({ length: myStars.rewards || badgeCount || 0 }).map(
                (_, i) => (
                  <LootBox key={i} index={i} />
                ),
              )}
            </div>
          </div>
        )}

      </div>
      {/* end max-width wrapper */}
    </div>
  );
}

/* ── LootBox achievement card ── */
const LOOT_PRIZES = [
  "🎉",
  "🌟",
  "🏆",
  "💎",
  "🎖️",
  "🦄",
  "🔥",
  "✨",
  "👑",
  "🎯",
  "🚀",
  "🎪",
];
function LootBox({ index }: { index: number }) {
  const [opened, setOpened] = React.useState(false);
  const prize = LOOT_PRIZES[index % LOOT_PRIZES.length];
  return (
    <button
      onClick={() => setOpened(true)}
      style={{
        padding: "16px 10px",
        borderRadius: 16,
        cursor: opened ? "default" : "pointer",
        background: opened
          ? "linear-gradient(135deg, rgba(245,158,11,0.3), rgba(234,179,8,0.15))"
          : "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(79,70,229,0.18))",
        border: opened
          ? "1px solid rgba(245,158,11,0.5)"
          : "1px solid rgba(99,102,241,0.5)",
        textAlign: "center",
        color: "white",
        transition: "transform .15s",
        animation: opened ? "dbPop .3s ease both" : undefined,
      }}
      onMouseEnter={(e) => {
        if (!opened) {
          (e.currentTarget as HTMLElement).style.transform = "scale(1.08)";
          (e.currentTarget as HTMLElement).style.animation =
            "lootShake .3s ease both";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.animation = "";
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 6 }}>
        {opened ? prize : "🎁"}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.65 }}>
        {opened ? "Earned!" : "Tap to open"}
      </div>
    </button>
  );
}
