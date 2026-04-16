import React, { useState, useCallback } from "react";
import { useTheme } from "../lib/theme.tsx";
import { X, Play, Star, Zap, Grid3X3, Sword, Puzzle, Trophy, ChevronRight } from "lucide-react";

/* ── Game catalogue ─────────────────────────────────────────── */
interface Game {
  id: string;
  title: string;
  description: string;
  category: string;
  stars: number;
  plays: string;
  color: string;
  accentColor: string;
  emoji: string;
  embedUrl: string; // Turbowarp embed or internal playground path
  isInternal?: boolean;
}

const GAMES: Game[] = [
  {
    id: "blockforge-playground",
    title: "BlockForge Playground",
    description: "Build and run your own programs with drag-and-drop blocks. Full motion, looks, sound and game systems.",
    category: "Creative",
    stars: 5,
    plays: "∞",
    color: "#1a1040",
    accentColor: "#8b5cf6",
    emoji: "🔮",
    embedUrl: "/playground",
    isInternal: true,
  },
  {
    id: "scratch-maze",
    title: "Maze Runner",
    description: "Navigate the cat through a tricky maze. Use arrow keys to move, reach the star to win!",
    category: "Puzzle",
    stars: 4,
    plays: "12K",
    color: "#0f2027",
    accentColor: "#06b6d4",
    emoji: "🌀",
    embedUrl: "https://turbowarp.org/embed/10128407",
  },
  {
    id: "pong",
    title: "Pong Classic",
    description: "The timeless two-player paddle game. First to 7 wins!",
    category: "Action",
    stars: 4,
    plays: "8K",
    color: "#0d1117",
    accentColor: "#22c55e",
    emoji: "🏓",
    embedUrl: "https://turbowarp.org/embed/10128407",
  },
  {
    id: "platformer",
    title: "Super Jump",
    description: "Classic side-scrolling platformer. Collect coins, avoid enemies, reach the flag.",
    category: "Platformer",
    stars: 5,
    plays: "24K",
    color: "#1a0a05",
    accentColor: "#f97316",
    emoji: "🕹️",
    embedUrl: "https://turbowarp.org/embed/10128407",
  },
  {
    id: "quiz-blitz",
    title: "Quiz Blitz",
    description: "Race the clock! Answer coding trivia questions and climb the leaderboard.",
    category: "Education",
    stars: 4,
    plays: "6K",
    color: "#0a1628",
    accentColor: "#f59e0b",
    emoji: "🧠",
    embedUrl: "https://turbowarp.org/embed/10128407",
  },
  {
    id: "snake",
    title: "Snake XL",
    description: "Grow your snake, eat the apples, don't hit the walls. How long can you get?",
    category: "Action",
    stars: 4,
    plays: "15K",
    color: "#071a10",
    accentColor: "#4ade80",
    emoji: "🐍",
    embedUrl: "https://turbowarp.org/embed/10128407",
  },
  {
    id: "space-shooter",
    title: "Pixel Space",
    description: "Blast alien invaders with your laser cannon. Power-ups and boss battles!",
    category: "Action",
    stars: 5,
    plays: "31K",
    color: "#07071a",
    accentColor: "#a78bfa",
    emoji: "🚀",
    embedUrl: "https://turbowarp.org/embed/10128407",
  },
  {
    id: "memory",
    title: "Memory Match",
    description: "Flip cards and find all the pairs. Beat your best time!",
    category: "Puzzle",
    stars: 3,
    plays: "4K",
    color: "#1a0d28",
    accentColor: "#e879f9",
    emoji: "🃏",
    embedUrl: "https://turbowarp.org/embed/10128407",
  },
];

const CATEGORIES = ["All", "Action", "Platformer", "Puzzle", "Education", "Creative"];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  All: <Grid3X3 size={14} />,
  Action: <Sword size={14} />,
  Platformer: <Zap size={14} />,
  Puzzle: <Puzzle size={14} />,
  Education: <Trophy size={14} />,
  Creative: <Star size={14} />,
};

/* ── Sub-components ─────────────────────────────────────────── */

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={11}
          className={s <= stars ? "text-yellow-400 fill-yellow-400" : "text-white/20"}
        />
      ))}
    </div>
  );
}

function GameCard({
  game,
  onPlay,
  index,
}: {
  game: Game;
  onPlay: (g: Game) => void;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative group rounded-2xl overflow-hidden cursor-pointer select-none"
      style={{
        background: game.color,
        border: `1px solid ${game.accentColor}22`,
        animationDelay: `${index * 60}ms`,
        transform: hovered ? "translateY(-4px) scale(1.02)" : "translateY(0) scale(1)",
        transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease",
        boxShadow: hovered
          ? `0 16px 40px ${game.accentColor}44, 0 4px 12px rgba(0,0,0,0.4)`
          : `0 2px 8px rgba(0,0,0,0.3)`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPlay(game)}
    >
      {/* Card thumbnail area */}
      <div
        className="h-36 flex items-center justify-center relative overflow-hidden"
        style={{ background: `radial-gradient(ellipse at 60% 40%, ${game.accentColor}30 0%, transparent 70%)` }}
      >
        {/* Decorative background circles */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(circle at 80% 20%, ${game.accentColor} 0%, transparent 50%)`,
          }}
        />
        <span
          className="text-5xl relative z-10 transition-transform duration-300"
          style={{ transform: hovered ? "scale(1.15) rotate(5deg)" : "scale(1) rotate(0deg)" }}
        >
          {game.emoji}
        </span>
        {/* Category badge */}
        <span
          className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: game.accentColor + "33", color: game.accentColor, border: `1px solid ${game.accentColor}55` }}
        >
          {game.category}
        </span>
        {/* Play overlay on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
          style={{ opacity: hovered ? 1 : 0, background: "rgba(0,0,0,0.4)" }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: game.accentColor }}
          >
            <Play size={20} fill="white" className="text-white ml-0.5" />
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-sm font-bold text-white leading-tight">{game.title}</h3>
          <ChevronRight
            size={14}
            className="text-white/30 flex-shrink-0 mt-0.5 transition-transform duration-200 group-hover:translate-x-0.5"
            style={{ color: hovered ? game.accentColor : undefined }}
          />
        </div>
        <p className="text-[11px] text-white/50 leading-snug mb-2.5 line-clamp-2">{game.description}</p>
        <div className="flex items-center justify-between">
          <StarRating stars={game.stars} />
          <span className="text-[10px] text-white/30 font-medium">{game.plays} plays</span>
        </div>
      </div>
    </div>
  );
}

function EmbeddedPlayer({ game, onClose }: { game: Game; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-4xl rounded-2xl overflow-hidden animate-page-enter"
        style={{
          background: game.color,
          border: `1px solid ${game.accentColor}44`,
          boxShadow: `0 40px 80px ${game.accentColor}33, 0 0 0 1px rgba(255,255,255,0.05)`,
        }}
      >
        {/* Player header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${game.accentColor}22` }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{game.emoji}</span>
            <div>
              <div className="text-sm font-bold text-white">{game.title}</div>
              <div className="text-[11px]" style={{ color: game.accentColor }}>{game.category}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Iframe or internal route */}
        {game.isInternal ? (
          <iframe
            src={game.embedUrl}
            className="w-full"
            style={{ height: "70vh", border: "none" }}
            title={game.title}
            allow="autoplay; microphone"
          />
        ) : (
          <iframe
            src={game.embedUrl}
            className="w-full"
            style={{ height: "70vh", border: "none" }}
            title={game.title}
            allow="autoplay; fullscreen"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}

        {/* Footer */}
        <div
          className="px-4 py-2 flex items-center justify-between"
          style={{ background: "rgba(0,0,0,0.4)", borderTop: `1px solid ${game.accentColor}22` }}
        >
          <StarRating stars={game.stars} />
          <span className="text-[11px] text-white/30">{game.plays} plays</span>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────── */
export default function ArcadePage() {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [activeCategory, setActiveCategory] = useState("All");
  const [playingGame, setPlayingGame] = useState<Game | null>(null);
  const [featured] = useState<Game>(GAMES[0]);

  const filtered = activeCategory === "All"
    ? GAMES
    : GAMES.filter((g) => g.category === activeCategory);

  const handlePlay = useCallback((game: Game) => {
    setPlayingGame(game);
  }, []);

  return (
    <div
      className="min-h-screen animate-page-enter"
      style={{ background: dk ? "#07071a" : "#f2f3f8" }}
    >
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-end gap-3 mb-1">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}
          >
            <Zap size={18} fill="white" className="text-white" />
          </div>
          <div>
            <h1
              className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, #a78bfa, #818cf8)" }}
            >
              Arcade
            </h1>
            <p className={`text-xs mt-0.5 ${dk ? "text-white/40" : "text-gray-400"}`}>
              Pick a game, click Play — have fun!
            </p>
          </div>
        </div>
      </div>

      {/* Featured banner */}
      <div className="px-6 mb-6">
        <div
          className="relative rounded-2xl overflow-hidden cursor-pointer group"
          style={{
            background: "linear-gradient(135deg, #1a1040 0%, #0f071a 100%)",
            border: "1px solid #8b5cf633",
            boxShadow: "0 8px 32px #8b5cf622",
          }}
          onClick={() => handlePlay(featured)}
        >
          <div className="absolute inset-0 opacity-30"
            style={{ background: "radial-gradient(ellipse at 80% 50%, #8b5cf6 0%, transparent 60%)" }} />
          <div className="relative z-10 flex items-center gap-5 px-6 py-5">
            <span className="text-6xl flex-shrink-0 transition-transform duration-300 group-hover:scale-110">
              {featured.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-1">
                ⭐ Featured
              </div>
              <h2 className="text-xl font-extrabold text-white mb-1">{featured.title}</h2>
              <p className="text-sm text-white/60 leading-snug">{featured.description}</p>
            </div>
            <button
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white flex-shrink-0 transition-all duration-200 group-hover:scale-105"
              style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}
            >
              <Play size={15} fill="white" />
              Play
            </button>
          </div>
        </div>
      </div>

      {/* Category filter chips */}
      <div className="px-6 mb-5">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => {
            const active = cat === activeCategory;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200"
                style={{
                  background: active ? "#8b5cf6" : dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)",
                  color: active ? "white" : dk ? "rgba(255,255,255,0.5)" : "#666",
                  border: active ? "1px solid #7c3aed" : "1px solid transparent",
                  transform: active ? "scale(1.04)" : "scale(1)",
                }}
              >
                {CATEGORY_ICONS[cat]}
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Game grid */}
      <div className="px-6 pb-10">
        <div className="text-xs font-semibold mb-3" style={{ color: dk ? "rgba(255,255,255,0.3)" : "#999" }}>
          {filtered.length} game{filtered.length !== 1 ? "s" : ""}
        </div>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {filtered.map((game, i) => (
            <div key={game.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <GameCard game={game} onPlay={handlePlay} index={i} />
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🎮</div>
            <p className={`text-sm ${dk ? "text-white/40" : "text-gray-400"}`}>No games in this category yet.</p>
          </div>
        )}
      </div>

      {/* Embedded player modal */}
      {playingGame && (
        <EmbeddedPlayer game={playingGame} onClose={() => setPlayingGame(null)} />
      )}
    </div>
  );
}
