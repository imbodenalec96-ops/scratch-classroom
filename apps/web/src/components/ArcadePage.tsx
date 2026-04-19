import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTheme } from "../lib/theme.tsx";
import { useAuth } from "../lib/auth.tsx";
import { usePresencePing } from "../lib/presence.ts";
import { isOnBreak, BREAK_ALLOWED_GAME_IDS, breakSecondsRemaining } from "../lib/breakSystem.ts";
import { useClassConfig, isGameAllowed } from "../lib/useClassConfig.ts";
import { X, Play, Star, Zap, Grid3X3, Sword, Puzzle, Trophy, GraduationCap, Wand2, Package, Gamepad2 } from "lucide-react";
import SnakeGame from "./games/SnakeGame.tsx";
import PongGame from "./games/PongGame.tsx";
import MemoryGame from "./games/MemoryGame.tsx";
import ColorCatcher from "./games/ColorCatcher.tsx";
import BrickBreaker from "./games/BrickBreaker.tsx";
import UnityGame from "./games/UnityGame.tsx";
import WhackAMole from "./games/WhackAMole.tsx";
import FlappyBird from "./games/FlappyBird.tsx";
import SpaceShooter from "./games/SpaceShooter.tsx";
import TetrisGame from "./games/TetrisGame.tsx";
import Game2048 from "./games/Game2048.tsx";
import TicTacToe from "./games/TicTacToe.tsx";
import ConnectFour from "./games/ConnectFour.tsx";
import EndlessRunner from "./games/EndlessRunner.tsx";
import BubbleShooter from "./games/BubbleShooter.tsx";
import ColoringBook from "./games/ColoringBook.tsx";
import DressUp from "./games/DressUp.tsx";
import PixelArt from "./games/PixelArt.tsx";
import BridgeBuilder from "./games/BridgeBuilder.tsx";
import Basketball from "./games/Basketball.tsx";
import SimonSays from "./games/SimonSays.tsx";
import TowerDefense from "./games/TowerDefense.tsx";
import RacingGame from "./games/RacingGame.tsx";
import Minesweeper from "./games/Minesweeper.tsx";
import WordSearch from "./games/WordSearch.tsx";
import Sudoku from "./games/Sudoku.tsx";
import Sandbox from "./games/Sandbox.tsx";

/* ── Types ──────────────────────────────────────────────────── */
interface Game {
  id: string;
  title: string;
  description: string;
  category: string;
  stars: number;
  plays: string;
  accentColor: string;
  emoji: string;
  component?: React.ComponentType;
  embedUrl?: string;
  /** "unity" means render via UnityGame iframe embedder */
  type?: "unity" | "iframe" | "component";
  hint?: string;
  comingSoon?: boolean;
}

/* ── Game catalogue ─────────────────────────────────────────── */
const GAMES: Game[] = [
  {
    id: "snake",
    title: "Snake XL",
    description: "Grow your snake by eating food. Don't hit the walls or your own tail. How long can you get?",
    category: "Action",
    stars: 5,
    plays: "15K",
    accentColor: "#4ade80",
    emoji: "🐍",
    component: SnakeGame,
    hint: "Arrow keys / WASD / swipe",
  },
  {
    id: "pong",
    title: "Pong vs AI",
    description: "The timeless paddle duel. W/S to move — beat the AI before it figures you out!",
    category: "Action",
    stars: 4,
    plays: "8K",
    accentColor: "#a78bfa",
    emoji: "🏓",
    component: PongGame,
    hint: "W / S or ↑ / ↓",
  },
  {
    id: "brickbreaker",
    title: "Brick Breaker",
    description: "Launch the ball, break every brick. Harder rows need more hits. 3 lives — don't drop it!",
    category: "Action",
    stars: 5,
    plays: "21K",
    accentColor: "#f97316",
    emoji: "🧱",
    component: BrickBreaker,
    hint: "Mouse / ← →",
  },
  {
    id: "colorcatcher",
    title: "Color Catcher",
    description: "Catch the falling color drops in your bucket — dodge the bombs before they drain your lives!",
    category: "Action",
    stars: 4,
    plays: "9K",
    accentColor: "#f43f5e",
    emoji: "🎨",
    component: ColorCatcher,
    hint: "Mouse / ← → / touch",
  },
  {
    id: "memory",
    title: "Memory Match",
    description: "Flip cards to find emoji pairs. Race for the fewest moves and beat your personal best!",
    category: "Puzzle",
    stars: 4,
    plays: "6K",
    accentColor: "#e879f9",
    emoji: "🃏",
    component: MemoryGame,
    hint: "Click the cards",
  },
  {
    id: "mathblitz",
    title: "Math Blitz",
    description: "10 rapid-fire math questions — add, subtract, multiply, divide. Beat the timer for bonus points!",
    category: "Education",
    stars: 5,
    plays: "12K",
    accentColor: "#f59e0b",
    emoji: "🧠",
    component: React.lazy(() => import("./games/NumberQuiz.tsx")),
    hint: "Click the answer",
  },
  {
    id: "playground",
    title: "BlockForge Studio",
    description: "Build and run your own programs with the full drag-and-drop block editor — effects, sounds, and all.",
    category: "Creative",
    stars: 5,
    plays: "∞",
    accentColor: "#8b5cf6",
    emoji: "🔮",
    embedUrl: "/playground",
    hint: "The full editor",
  },
  {
    id: "fps-microgame",
    title: "FPS Microgame",
    description: "Neon sci-fi first-person shooter. Survive 3 waves of humanoid enemies. Click to aim, WASD to move, R to reload!",
    category: "Unity",
    stars: 5,
    plays: "NEW",
    accentColor: "#ef4444",
    emoji: "🔫",
    type: "unity",
    embedUrl: "/unity-games/fps-microgame/index.html",
    hint: "Click to start · WASD · Mouse look · Click to shoot · R reload",
  },
  {
    id: "unity-sandbox",
    title: "BlockForge 3D Stage",
    description: "The full Unity 3D stage — move your character, spawn objects, add enemies and collectibles with blocks.",
    category: "Unity",
    stars: 5,
    plays: "∞",
    accentColor: "#22d3ee",
    emoji: "🎮",
    type: "unity",
    embedUrl: "/unity-games/blockforge-stage/index.html",
    hint: "WASD to move · Space to jump",
  },
  {
    id: "whackamole",
    title: "Whack-a-Mole",
    description: "Moles pop up — whack them fast! 30 seconds on the clock. Can you beat your own score?",
    category: "Action",
    stars: 4,
    plays: "3K",
    accentColor: "#84cc16",
    emoji: "🐹",
    component: WhackAMole,
    hint: "Tap / click the moles",
  },
  {
    id: "flappy",
    title: "Flappy Bird",
    description: "Tap to flap through the pipes. One touch is all it takes — and one mistake ends it all!",
    category: "Action",
    stars: 5,
    plays: "20K",
    accentColor: "#facc15",
    emoji: "🐦",
    component: FlappyBird,
    hint: "Tap / click to flap",
  },
  {
    id: "spaceshooter",
    title: "Space Shooter",
    description: "Pilot your ship against waves of alien fighters. Move to dodge, auto-fire to survive!",
    category: "Action",
    stars: 5,
    plays: "12K",
    accentColor: "#38bdf8",
    emoji: "🚀",
    component: SpaceShooter,
    hint: "Arrow keys / WASD · drag on mobile",
  },
  // ── Classic games ────────────────────────────────────────────
  {
    id: "tetris",
    title: "Tetris",
    description: "Stack falling tetrominoes and clear lines before they reach the top. A timeless classic!",
    category: "Classic",
    stars: 5,
    plays: "30K",
    accentColor: "#67e8f9",
    emoji: "🟦",
    component: TetrisGame,
    hint: "← → move · ↑ rotate · ↓ soft drop · Space = hard drop",
  },
  {
    id: "2048",
    title: "2048",
    description: "Slide tiles to merge matching numbers. Reach 2048 to win — but can you go further?",
    category: "Classic",
    stars: 5,
    plays: "25K",
    accentColor: "#fde68a",
    emoji: "🔢",
    component: Game2048,
    hint: "Arrow keys / WASD / swipe to slide",
  },
  {
    id: "tictactoe",
    title: "Tic-Tac-Toe",
    description: "Get three in a row to beat the AI. Sounds easy — but can you outsmart it?",
    category: "Classic",
    stars: 4,
    plays: "10K",
    accentColor: "#d8b4fe",
    emoji: "⭕",
    component: TicTacToe,
    hint: "Click / tap a square · You = X",
  },
  {
    id: "connect4",
    title: "Connect Four",
    description: "Drop tokens to get four in a row — horizontally, vertically, or diagonally. Beat the AI!",
    category: "Classic",
    stars: 5,
    plays: "18K",
    accentColor: "#fbbf24",
    emoji: "🔴",
    component: ConnectFour,
    hint: "Click a column to drop · 4 in a row wins",
  },
  // ── Batch 2 ──────────────────────────────────────────────────
  {
    id: "runner",
    title: "Endless Runner",
    description: "Sprint through three lanes, jump over obstacles, collect stars! How far can you go?",
    category: "Action",
    stars: 5,
    plays: "NEW",
    accentColor: "#38bdf8",
    emoji: "🏃",
    component: EndlessRunner,
    hint: "← → lanes · Space / tap = jump · swipe to change lane",
  },
  {
    id: "bubbles",
    title: "Bubble Shooter",
    description: "Aim and fire colored bubbles to match 3 or more. Clear the board to win!",
    category: "Action",
    stars: 5,
    plays: "NEW",
    accentColor: "#a78bfa",
    emoji: "🫧",
    component: BubbleShooter,
    hint: "Move to aim · click / tap to shoot · match 3+",
  },
  {
    id: "coloringbook",
    title: "Coloring Book",
    description: "Pick a color and paint beautiful scenes — flowers, a cozy house, and an ocean world!",
    category: "Creative",
    stars: 5,
    plays: "NEW",
    accentColor: "#f472b6",
    emoji: "🎨",
    component: ColoringBook,
    hint: "Pick color · tap any region to fill · 3 scenes",
  },
  // ── Batch 3 ──────────────────────────────────────────────────
  {
    id: "dressup",
    title: "Avatar Creator",
    description: "Design your own character! Mix and match skin tones, hair, eyes, outfits and accessories.",
    category: "Creative",
    stars: 5,
    plays: "NEW",
    accentColor: "#d8b4fe",
    emoji: "👗",
    component: DressUp,
    hint: "Tap the tabs · pick styles · make your look!",
  },
  {
    id: "pixelart",
    title: "Pixel Art Studio",
    description: "Draw pixel art on a 32×32 grid! Use the draw, erase, and fill tools. Save as PNG!",
    category: "Creative",
    stars: 5,
    plays: "NEW",
    accentColor: "#818cf8",
    emoji: "🖼️",
    component: PixelArt,
    hint: "Click/drag to draw · fill bucket · save PNG",
  },
  {
    id: "bridgebuilder",
    title: "Bridge Builder",
    description: "Place planks between anchor points to build a bridge. Test it — can the car cross?",
    category: "Puzzle",
    stars: 5,
    plays: "NEW",
    accentColor: "#f59e0b",
    emoji: "🌉",
    component: BridgeBuilder,
    hint: "Drag between dots to place planks · test the bridge",
  },
  // ── Batch 4 ──────────────────────────────────────────────────
  {
    id: "basketball",
    title: "Basketball Shots",
    description: "Aim, hold to charge power, release to shoot! Score as many baskets as you can.",
    category: "Sports",
    stars: 5,
    plays: "NEW",
    accentColor: "#f97316",
    emoji: "🏀",
    component: Basketball,
    hint: "Move to aim · hold = power · release to shoot",
  },
  {
    id: "simonsays",
    title: "Simon Says",
    description: "Watch the color pattern light up, then repeat it! How long can your memory go?",
    category: "Puzzle",
    stars: 5,
    plays: "NEW",
    accentColor: "#a78bfa",
    emoji: "🎮",
    component: SimonSays,
    hint: "Watch · repeat · Q W A S keys or tap",
  },
  {
    id: "towerdefense",
    title: "Flower Defense",
    description: "Plant flower towers to stop the bug invasion! Send waves and spend gold wisely.",
    category: "Action",
    stars: 5,
    plays: "NEW",
    accentColor: "#4ade80",
    emoji: "🌻",
    component: TowerDefense,
    hint: "Click lanes to place towers · send waves to battle!",
  },
  // ── Batch 5 ──────────────────────────────────────────────────
  {
    id: "racing",
    title: "Road Rush",
    description: "Dodge traffic at high speed — collect lightning boosts and survive as long as you can!",
    category: "Sports",
    stars: 5,
    plays: "NEW",
    accentColor: "#f97316",
    emoji: "🚗",
    component: RacingGame,
    hint: "← → / A D keys · tap sides · collect ⚡ boosts",
  },
  {
    id: "minesweeper",
    title: "Flower Field",
    description: "Uncover the field without hitting a hidden bomb! Use numbers to find safe squares.",
    category: "Puzzle",
    stars: 4,
    plays: "NEW",
    accentColor: "#22c55e",
    emoji: "🌸",
    component: Minesweeper,
    hint: "Click to reveal · right-click to flag · avoid 💣",
  },
  {
    id: "wordsearch",
    title: "Word Search",
    description: "Find hidden words in the letter grid — drag to select, any direction, 4 themes!",
    category: "Education",
    stars: 5,
    plays: "NEW",
    accentColor: "#a855f7",
    emoji: "🔤",
    component: WordSearch,
    hint: "Click-drag to select · words go any direction",
  },
  {
    id: "sudoku",
    title: "Sudoku",
    description: "Fill the grid so every row, column and box has each number exactly once. 4×4 and 9×9!",
    category: "Education",
    stars: 5,
    plays: "NEW",
    accentColor: "#3b82f6",
    emoji: "🔢",
    component: Sudoku,
    hint: "Tap cell · tap number · 💡 hint if you're stuck",
  },
  {
    id: "sandbox",
    title: "Sandbox Builder",
    description: "Build your own world on a 2D grid. 24 tiles, day/night modes, random worlds, auto-saves. Pure creative play — no rules.",
    category: "Sandbox",
    stars: 5,
    plays: "NEW",
    accentColor: "#10b981",
    emoji: "🏗️",
    component: Sandbox,
    hint: "Pick a tile · click/drag to paint · eraser to remove",
  },
  {
    id: "sandbox-3d",
    title: "3D Stage",
    description: "The Unity 3D creative stage — walk around, place props, build scenes with others in your class in real time.",
    category: "Sandbox",
    stars: 5,
    plays: "NEW",
    accentColor: "#22d3ee",
    emoji: "🎮",
    type: "unity",
    embedUrl: "/unity-games/blockforge-stage/index.html",
    hint: "WASD / arrow keys · mouse to look around",
  },
];

const CATEGORIES = ["All", "Classic", "Action", "Puzzle", "Education", "Creative", "Sandbox", "Sports", "Unity"];
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  All: <Grid3X3 size={13} />,
  Classic: <Gamepad2 size={13} />,
  Action: <Sword size={13} />,
  Puzzle: <Puzzle size={13} />,
  Education: <GraduationCap size={13} />,
  Creative: <Wand2 size={13} />,
  Sports: <Trophy size={13} />,
  Unity: <Package size={13} />,
};

/* ── Star rating ─────────────────────────────────────────────── */
function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} size={10} className={s <= stars ? "text-yellow-400 fill-yellow-400" : "text-white/20"} />
      ))}
    </div>
  );
}

/* ── Game card ──────────────────────────────────────────────── */
function GameCard({ game, index, onPlay }: { game: Game; index: number; onPlay: () => void }) {
  const [hov, setHov] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <div
      className="animate-arcade-card arcade-card-press relative rounded-2xl overflow-hidden cursor-pointer select-none group"
      style={{
        animationDelay: `${index * 55}ms`,
        background: "#0a0b1e",
        border: `1px solid ${game.accentColor}22`,
        /* hover handled by CSS .arcade-card-press:hover; pressed here overrides */
        transform: pressed ? "scale(0.95)" : undefined,
        transition: pressed ? "transform 0.10s ease" : "transform 0.22s cubic-bezier(0.34,1.4,0.64,1), box-shadow 0.22s ease",
        boxShadow: hov
          ? `0 20px 44px ${game.accentColor}44, 0 4px 16px rgba(0,0,0,0.5)`
          : `0 2px 8px rgba(0,0,0,0.4)`,
        // Kill 300ms tap delay on mobile for card taps
        touchAction: "manipulation",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => { setPressed(false); }}
      onTouchStart={() => setPressed(true)}
      // Don't fire onPlay from touchEnd — the synthesized click that follows
      // will call onClick, which handles both mouse + tap. Firing here too
      // double-triggers on mobile (a real reported "arcade is glitchy" source).
      onTouchEnd={() => setPressed(false)}
      onTouchCancel={() => setPressed(false)}
      onClick={onPlay}
    >
      {/* Shimmer overlay */}
      {hov && <div className="absolute inset-0 z-10 pointer-events-none animate-arcade-shimmer rounded-2xl" />}

      {/* Thumbnail — taller on wider screens via aspect-ratio hint */}
      <div
        className="h-40 flex items-center justify-center relative overflow-hidden"
        style={{ background: `radial-gradient(ellipse at 65% 40%, ${game.accentColor}28 0%, transparent 65%)` }}
      >
        <div className="absolute inset-0 animate-arcade-ken-burns opacity-30"
          style={{ background: `radial-gradient(circle at 75% 25%, ${game.accentColor} 0%, transparent 55%)` }} />
        <span
          className="text-5xl relative z-10"
          style={{
            transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
            transform: hov ? "scale(1.2) rotate(6deg)" : "scale(1) rotate(0deg)",
            filter: hov ? `drop-shadow(0 0 12px ${game.accentColor})` : "none",
          }}
        >
          {game.emoji}
        </span>

        {/* Category badge */}
        <span
          className="absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: game.accentColor + "25", color: game.accentColor, border: `1px solid ${game.accentColor}50` }}
        >
          {game.category}
        </span>

        {/* Play overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-all duration-200"
          style={{ opacity: hov ? 1 : 0, background: "rgba(0,0,0,0.45)" }}
        >
          <div
            className="w-13 h-13 rounded-full flex items-center justify-center transition-transform duration-200"
            style={{
              background: game.accentColor,
              width: 52, height: 52,
              transform: hov ? "scale(1)" : "scale(0.6)",
              boxShadow: `0 0 24px ${game.accentColor}88`,
            }}
          >
            <Play size={22} fill="white" className="text-white ml-0.5" />
          </div>
        </div>

        {/* Coming-soon badge */}
        {game.comingSoon && (
          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold"
            style={{ background: "rgba(34,211,238,0.2)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.4)" }}>
            SOON
          </div>
        )}

        {/* Idle glow pulse dot */}
        {!hov && !game.comingSoon && (
          <div
            className="absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full animate-glow-pulse"
            style={{ background: game.accentColor, boxShadow: `0 0 6px ${game.accentColor}` }}
          />
        )}
      </div>

      {/* Body */}
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-[13px] font-bold text-white leading-tight">{game.title}</h3>
          {game.hint && (
            <span className="text-[9px] text-white/30 font-mono flex-shrink-0">{game.hint}</span>
          )}
        </div>
        <p className="text-[11px] text-white/45 leading-snug mb-2.5 line-clamp-2">{game.description}</p>
        <div className="flex items-center justify-between">
          <StarRating stars={game.stars} />
          <span className="text-[10px] text-white/30 font-medium">{game.plays} plays</span>
        </div>
      </div>
    </div>
  );
}

/* ── Embedded player modal ───────────────────────────────────── */
function PlayerModal({ game, onClose, showBrowseLink }: { game: Game; onClose: () => void; showBrowseLink?: boolean }) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 180);
  }, [onClose]);

  // Close on Escape; also prevent scroll keys from bubbling to the page while modal is open
  useEffect(() => {
    const SCROLL_KEYS = new Set([
      "ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ",
      "w","W","s","S","a","A","d","D",
      "PageUp","PageDown","Home","End",
    ]);
    const isTypingTarget = (el: EventTarget | null) => {
      const n = el as HTMLElement | null;
      if (!n || !n.tagName) return false;
      const t = n.tagName;
      return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || (n as any).isContentEditable === true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      // Don't swallow keys when the user is typing inside a game input
      // (e.g. WordSearch guess field, NumberQuiz answer).
      if (isTypingTarget(e.target)) return;
      if (SCROLL_KEYS.has(e.key)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Lock background page scroll while a game is open — prevents the dashboard
  // from scrolling behind the modal on mobile / trackpad. Restores prior value
  // on unmount so we don't leak this style if something else set it.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = (document.body.style as any).overscrollBehavior;
    document.body.style.overflow = "hidden";
    (document.body.style as any).overscrollBehavior = "contain";
    return () => {
      document.body.style.overflow = prevOverflow;
      (document.body.style as any).overscrollBehavior = prevOverscroll;
    };
  }, []);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-arcade-modal-bg"
      style={{
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(14px)",
        opacity: closing ? 0 : 1,
        transition: closing ? "opacity 0.18s ease" : undefined,
        // Stop two-finger pan / rubber-band scrolling the page behind the modal
        overscrollBehavior: "contain",
        touchAction: "none",
      }}
      onClick={e => { if (e.target === backdropRef.current) close(); }}
    >
      <div
        className="relative w-full flex flex-col rounded-2xl overflow-hidden animate-arcade-modal"
        style={{
          maxWidth: 700,
          maxHeight: "90vh",
          /* On touch / coarse-pointer devices (iPad, phones) expand to near full-screen */
          width: "min(700px, 100vw - 16px)",
          height: "min(90vh, 100dvh - 16px)",
          background: "#08081f",
          border: `1px solid ${game.accentColor}44`,
          boxShadow: `0 40px 80px ${game.accentColor}33, 0 0 0 1px rgba(255,255,255,0.04)`,
          opacity: closing ? 0 : 1,
          transform: closing ? "scale(0.92) translateY(12px)" : undefined,
          transition: closing ? "opacity 0.18s ease, transform 0.18s ease" : undefined,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: "rgba(0,0,0,0.5)", borderBottom: `1px solid ${game.accentColor}22` }}
        >
          <div className="flex items-center gap-3">
            <span
              className="text-2xl animate-arcade-float"
              style={{ filter: `drop-shadow(0 0 8px ${game.accentColor}99)` }}
            >{game.emoji}</span>
            <div>
              <div className="text-sm font-bold text-white leading-tight">{game.title}</div>
              <div className="text-[11px] font-medium" style={{ color: game.accentColor }}>{game.category}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showBrowseLink && (
              <button
                onClick={close}
                className="text-[11px] font-semibold text-white/60 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                title="Open the game picker"
              >
                Play something else →
              </button>
            )}
            <button
              onClick={close}
              className="rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all duration-150"
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Game area */}
        <div className="flex-1 overflow-auto" style={{ minHeight: 380, overscrollBehavior: "contain", touchAction: "none" }}>
          {game.comingSoon ? (
            /* Coming-soon slot — Unity placeholder */
            <div className="flex flex-col items-center justify-center gap-5 p-10 text-center" style={{ minHeight: 420 }}>
              <div className="text-5xl animate-arcade-float">🎮</div>
              <div className="text-white font-extrabold text-xl">Unity WebGL — Coming Soon</div>
              <div className="text-white/45 text-sm max-w-sm leading-relaxed">
                Export any Unity project as <strong className="text-white/70">WebGL</strong>, drop the build output into
                <code className="mx-1 px-1.5 py-0.5 rounded text-cyan-400" style={{ background: "rgba(34,211,238,0.1)", fontSize: "0.75rem" }}>
                  /public/unity-games/&lt;name&gt;/
                </code>
                and register it in <code className="text-violet-400" style={{ fontSize: "0.75rem" }}>ArcadePage.tsx</code>.
              </div>
              <div className="rounded-xl p-4 text-left text-xs font-mono" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#a78bfa", maxWidth: 380, width: "100%" }}>
                <div className="text-white/30 mb-1">{`// ArcadePage.tsx → GAMES array`}</div>
                <div>{`{`}</div>
                <div className="pl-4 text-cyan-400">id: <span className="text-green-400">"my-unity-game"</span>,</div>
                <div className="pl-4 text-cyan-400">type: <span className="text-green-400">"unity"</span>,</div>
                <div className="pl-4 text-cyan-400">embedUrl: <span className="text-green-400">"/unity-games/my-game/index.html"</span>,</div>
                <div className="pl-4 text-cyan-400">title: <span className="text-green-400">"My Unity Game"</span>,</div>
                <div>{`}`}</div>
              </div>
              <div className="text-white/25 text-xs">See <code className="text-cyan-400">/public/unity-games/README.md</code> for full instructions</div>
            </div>
          ) : game.type === "unity" && game.embedUrl ? (
            <UnityGame src={game.embedUrl} title={game.title} />
          ) : game.component ? (
            <React.Suspense fallback={
              <div className="h-80 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              </div>
            }>
              <game.component />
            </React.Suspense>
          ) : (
            <iframe
              src={game.embedUrl}
              className="w-full"
              style={{ height: "70vh", border: "none" }}
              title={game.title}
              allow="autoplay; microphone; fullscreen"
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-2 flex-shrink-0"
          style={{ background: "rgba(0,0,0,0.4)", borderTop: `1px solid ${game.accentColor}18` }}
        >
          <StarRating stars={game.stars} />
          <span className="text-[10px] text-white/25">
            {game.plays} plays &bull; {typeof window !== "undefined" && "ontouchstart" in window ? "Tap × to close" : "Press Esc to close"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Featured banner ─────────────────────────────────────────── */
function FeaturedBanner({ game, onPlay }: { game: Game; onPlay: () => void }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      className="arcade-card-press relative rounded-2xl overflow-hidden cursor-pointer group"
      style={{
        background: "linear-gradient(135deg, #0f0a28 0%, #080714 100%)",
        border: `1px solid ${game.accentColor}33`,
        boxShadow: `0 8px 32px ${game.accentColor}22`,
        transition: "box-shadow 0.25s ease",
        touchAction: "manipulation",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onPlay}
    >
      {/* Ken-burns background */}
      <div
        className="absolute inset-0 animate-arcade-ken-burns opacity-25"
        style={{ background: `radial-gradient(ellipse at 80% 50%, ${game.accentColor} 0%, transparent 60%)` }}
      />
      {/* Shimmer */}
      {hov && <div className="absolute inset-0 animate-arcade-shimmer pointer-events-none" />}

      <div className="relative z-10 flex items-center gap-5 px-6 py-5">
        <span
          className="text-6xl flex-shrink-0 animate-arcade-float"
          style={{
            filter: `drop-shadow(0 0 16px ${game.accentColor})`,
            transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
            transform: hov ? "scale(1.12) rotate(-4deg)" : "scale(1) rotate(0deg)",
          }}
        >
          {game.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: game.accentColor }}>
            ⭐ Featured Game
          </div>
          <h2 className="text-xl font-extrabold text-white mb-1 leading-tight">{game.title}</h2>
          <p className="text-sm text-white/55 leading-snug line-clamp-2">{game.description}</p>
        </div>
        <button
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white flex-shrink-0 transition-all duration-200"
          style={{
            background: `linear-gradient(135deg, ${game.accentColor}, ${game.accentColor}bb)`,
            boxShadow: hov ? `0 8px 20px ${game.accentColor}66` : `0 4px 10px ${game.accentColor}33`,
            transform: hov ? "scale(1.06)" : "scale(1)",
          }}
        >
          <Play size={14} fill="white" />
          Play Now
        </button>
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────── */
export default function ArcadePage() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const dk = theme === "dark";
  const [activeCategory, setActiveCategory] = useState("All");
  const [prevCategory, setPrevCategory] = useState("All");
  const [playingGame, setPlayingGame] = useState<Game | null>(null);
  const [cardKey, setCardKey] = useState(0); // remount grid to re-trigger entrance anims
  // Auto-launch indicator — only true on the initial mount when we restored
  // the last-played game from localStorage. Controls the "Play something
  // else →" link in the modal header so the student can still get to the grid.
  const [autoLaunched, setAutoLaunched] = useState(false);
  // Per-student last-played key. Falls back to a shared key for anon/teacher
  // tabs — teachers skip auto-launch anyway via the role gate below.
  const lastPlayedKey = `arcade.lastGameId.${user?.id || "anon"}`;

  // Presence ping — students show as "Playing in Arcade 🎮" in teacher monitor
  const arcadeActivity = playingGame
    ? `Playing ${playingGame.title} 🎮`
    : "Browsing Arcade 🎮";
  usePresencePing(user?.role === "student" ? arcadeActivity : "");

  // Break-mode gating: students on a 10-min break only see approved games
  const [onBreak, setOnBreak] = useState(isOnBreak());
  useEffect(() => {
    const iv = setInterval(() => setOnBreak(isOnBreak()), 2000);
    const onChange = () => setOnBreak(isOnBreak());
    window.addEventListener("breakstate-change", onChange);
    return () => { clearInterval(iv); window.removeEventListener("breakstate-change", onChange); };
  }, []);

  // Teacher-set feature flags (allowedGameIds, unityEnabled, blockforgeEnabled)
  const classConfig = useClassConfig();

  const configGated = (games: Game[]) => {
    if (user?.role !== "student") return games;
    return games.filter(g => {
      if (g.type === "unity" && !classConfig.unityEnabled) return false;
      if (g.id === "playground" && !classConfig.blockforgeEnabled) return false;
      if (!isGameAllowed(classConfig, g.id)) return false;
      return true;
    });
  };

  // During a break, show ALL games (no filter) — break-mode access is
  // intentionally broad. Class-config gates still apply.
  void onBreak; // retained for future use (e.g. badge in header)

  const filtered = configGated(
    activeCategory === "All" ? GAMES : GAMES.filter(g => g.category === activeCategory)
  );

  // If teacher has disabled the arcade wholesale, show a block message
  const arcadeHardDisabled = user?.role === "student" && !classConfig.arcadeEnabled;

  const featured = GAMES.find(g => g.id === "brickbreaker") ?? GAMES[0];

  const changeCategory = (cat: string) => {
    if (cat === activeCategory) return;
    setPrevCategory(activeCategory);
    setActiveCategory(cat);
    setCardKey(k => k + 1); // re-trigger entrance animations
  };

  const handlePlay = useCallback((game: Game) => {
    // Persist per-student so the next /arcade visit skips the browse grid.
    // Teachers/admins also write the key but auto-launch is role-gated below,
    // so it only affects them if they later become a student.
    try { localStorage.setItem(lastPlayedKey, game.id); } catch { /* storage quota / private mode */ }
    setPlayingGame(game);
  }, [lastPlayedKey]);

  // One-shot auto-launch: on first mount, if the student has a saved last-
  // played game that still exists in the catalog (and passes config gating),
  // open it directly instead of making them scroll through the grid.
  // Teachers/admins skip this entirely. Deliberately NOT in a ref-guarded
  // loop — the dependency array includes `user?.id` only so remounts under
  // the same student don't re-fire after a Close.
  const didAutoLaunchRef = useRef(false);
  useEffect(() => {
    if (didAutoLaunchRef.current) return;
    if (user?.role !== "student") return;
    // Respect the same gates the grid uses — arcade hard-disabled or game
    // removed from the allow-list should NOT auto-launch.
    if (arcadeHardDisabled) return;
    let stored: string | null = null;
    try { stored = localStorage.getItem(lastPlayedKey); } catch { stored = null; }
    if (!stored) return;
    const match = GAMES.find(g => g.id === stored);
    if (!match) return;
    const gated = configGated([match]);
    if (gated.length === 0) return;
    didAutoLaunchRef.current = true;
    setPlayingGame(match);
    setAutoLaunched(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, arcadeHardDisabled, classConfig]);

  // Teacher disabled the arcade entirely — show a blocking page
  if (arcadeHardDisabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: dk ? "#07071a" : "#f0f1f8" }}>
        <div className="text-6xl mb-4">🔒</div>
        <h1 className={`text-2xl font-bold mb-2 ${dk ? "text-white" : "text-gray-900"}`}>Arcade is paused</h1>
        <p className={`text-sm max-w-sm ${dk ? "text-white/45" : "text-gray-500"}`}>
          Your teacher has turned off the arcade for now. You'll see it come back when they turn it on.
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen animate-page-enter"
      style={{ background: dk ? "#07071a" : "#f0f1f8" }}
    >
      {/* ── Header ── */}
      <div className="px-6 pt-8 pb-5">
        <div className="flex items-end gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 animate-arcade-float"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", boxShadow: "0 6px 20px rgba(139,92,246,0.4)" }}
          >
            <Zap size={20} fill="white" className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, #a78bfa, #818cf8, #60a5fa)" }}>
              Arcade
            </h1>
            <p className={`text-xs mt-0.5 ${dk ? "text-white/35" : "text-gray-400"}`}>
              {GAMES.length} games ready to play
            </p>
          </div>
        </div>
      </div>

      {/* ── Featured banner ── */}
      <div className="px-6 mb-6">
        <FeaturedBanner game={featured} onPlay={() => handlePlay(featured)} />
      </div>

      {/* ── Category chips ── */}
      <div className="px-6 mb-5">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => {
            const active = cat === activeCategory;
            return (
              <button
                key={cat}
                onClick={() => changeCategory(cat)}
                className={active ? "animate-arcade-chip" : ""}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "10px 14px",
                  minHeight: 44,
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  touchAction: "manipulation",
                  transition: "background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease",
                  background: active ? "#8b5cf6" : dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)",
                  color: active ? "white" : dk ? "rgba(255,255,255,0.45)" : "#777",
                  border: active ? "1px solid #7c3aed" : "1px solid transparent",
                  boxShadow: active ? "0 4px 12px rgba(139,92,246,0.4)" : "none",
                }}
              >
                {CATEGORY_ICONS[cat]}
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Game grid ── */}
      <div className="px-6 pb-12">
        <div className={`text-[11px] font-semibold mb-3.5 ${dk ? "text-white/25" : "text-gray-400"}`}>
          {filtered.length} game{filtered.length !== 1 ? "s" : ""} • {activeCategory}
        </div>
        {/*
          auto-fill minmax(260px, 1fr) gives:
          - 600px  → 2 cols  (iPad portrait)
          - 768px  → 2-3 cols (iPad portrait / small Chromebook)
          - 1024px → 3 cols  (iPad landscape / Chromebook)
          - 1366px → 4 cols  (Chromebook HD)
          - 1440px+→ 4-5 cols (desktop / iPad Pro landscape)
        */}
        <div
          key={cardKey} // remount to re-trigger stagger
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
        >
          {filtered.map((game, i) => (
            <GameCard key={game.id} game={game} index={i} onPlay={() => handlePlay(game)} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3 animate-arcade-float">🎮</div>
            <p className={`text-sm ${dk ? "text-white/35" : "text-gray-400"}`}>
              No games in this category yet.
            </p>
          </div>
        )}
      </div>

      {/* ── Player modal ── */}
      {playingGame && (
        <PlayerModal
          // Key by game.id so switching games forces a full unmount of the
          // previous <game.component /> — guarantees any audio, rAF loops,
          // intervals, or iframe audio contexts are torn down cleanly.
          key={playingGame.id}
          game={playingGame}
          onClose={() => { setPlayingGame(null); setAutoLaunched(false); }}
          showBrowseLink={autoLaunched}
        />
      )}
    </div>
  );
}
