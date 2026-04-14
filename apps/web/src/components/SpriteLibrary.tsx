import React, { useState, useCallback } from "react";
import type { Asset } from "@scratch/shared";

interface Props {
  onSelect: (asset: Asset) => void;
  onClose: () => void;
  tab?: "sprites" | "sounds" | "backgrounds";
}

interface LibraryItem {
  name: string;
  category: string;
  emoji: string;
  color: string;
  svgPath?: string;
}

// Built-in sprite library with generated SVG sprites
const SPRITE_LIBRARY: LibraryItem[] = [
  // Animals
  { name: "Cat", category: "Animals", emoji: "🐱", color: "#FF8C1A" },
  { name: "Dog", category: "Animals", emoji: "🐶", color: "#993300" },
  { name: "Bird", category: "Animals", emoji: "🐦", color: "#59C059" },
  { name: "Fish", category: "Animals", emoji: "🐟", color: "#4C97FF" },
  { name: "Butterfly", category: "Animals", emoji: "🦋", color: "#9966FF" },
  { name: "Rabbit", category: "Animals", emoji: "🐰", color: "#FFcccc" },
  { name: "Bear", category: "Animals", emoji: "🐻", color: "#8B4513" },
  { name: "Penguin", category: "Animals", emoji: "🐧", color: "#333333" },
  { name: "Frog", category: "Animals", emoji: "🐸", color: "#33cc33" },
  { name: "Turtle", category: "Animals", emoji: "🐢", color: "#228B22" },
  // People
  { name: "Person", category: "People", emoji: "🧑", color: "#FFB347" },
  { name: "Robot", category: "People", emoji: "🤖", color: "#5CB1D6" },
  { name: "Wizard", category: "People", emoji: "🧙", color: "#6633ff" },
  { name: "Astronaut", category: "People", emoji: "🧑‍🚀", color: "#cccccc" },
  { name: "Ninja", category: "People", emoji: "🥷", color: "#222222" },
  { name: "Princess", category: "People", emoji: "👸", color: "#ff69b4" },
  // Objects
  { name: "Star", category: "Objects", emoji: "⭐", color: "#FFD700" },
  { name: "Heart", category: "Objects", emoji: "❤️", color: "#FF0000" },
  { name: "Ball", category: "Objects", emoji: "⚽", color: "#ffffff" },
  { name: "Rocket", category: "Objects", emoji: "🚀", color: "#FF6680" },
  { name: "Car", category: "Objects", emoji: "🚗", color: "#FF0000" },
  { name: "Tree", category: "Objects", emoji: "🌲", color: "#228B22" },
  { name: "House", category: "Objects", emoji: "🏠", color: "#8B4513" },
  { name: "Gem", category: "Objects", emoji: "💎", color: "#00BFFF" },
  { name: "Key", category: "Objects", emoji: "🔑", color: "#FFD700" },
  { name: "Sword", category: "Objects", emoji: "⚔️", color: "#C0C0C0" },
  { name: "Shield", category: "Objects", emoji: "🛡️", color: "#4169E1" },
  { name: "Coin", category: "Objects", emoji: "🪙", color: "#FFD700" },
  // Nature
  { name: "Sun", category: "Nature", emoji: "☀️", color: "#FFD700" },
  { name: "Moon", category: "Nature", emoji: "🌙", color: "#C0C0C0" },
  { name: "Cloud", category: "Nature", emoji: "☁️", color: "#E0E0E0" },
  { name: "Flower", category: "Nature", emoji: "🌸", color: "#FF69B4" },
  { name: "Mountain", category: "Nature", emoji: "⛰️", color: "#808080" },
  { name: "Fire", category: "Nature", emoji: "🔥", color: "#FF4500" },
  { name: "Water", category: "Nature", emoji: "💧", color: "#4C97FF" },
  { name: "Lightning", category: "Nature", emoji: "⚡", color: "#FFFF00" },
  // Food
  { name: "Apple", category: "Food", emoji: "🍎", color: "#FF0000" },
  { name: "Banana", category: "Food", emoji: "🍌", color: "#FFE135" },
  { name: "Pizza", category: "Food", emoji: "🍕", color: "#FF8C00" },
  { name: "Donut", category: "Food", emoji: "🍩", color: "#D2691E" },
  { name: "Ice Cream", category: "Food", emoji: "🍦", color: "#FFB6C1" },
  { name: "Cookie", category: "Food", emoji: "🍪", color: "#D2691E" },
];

const SOUND_LIBRARY: { name: string; category: string; emoji: string; description: string }[] = [
  // Effects
  { name: "Pop", category: "Effects", emoji: "🔵", description: "Quick pop sound" },
  { name: "Boing", category: "Effects", emoji: "🟢", description: "Bouncy spring" },
  { name: "Whoosh", category: "Effects", emoji: "💨", description: "Fast movement" },
  { name: "Ding", category: "Effects", emoji: "🔔", description: "Bell ding" },
  { name: "Buzz", category: "Effects", emoji: "🐝", description: "Buzzing sound" },
  { name: "Click", category: "Effects", emoji: "👆", description: "Button click" },
  { name: "Splash", category: "Effects", emoji: "💦", description: "Water splash" },
  { name: "Laser", category: "Effects", emoji: "🔴", description: "Pew pew!" },
  { name: "Explosion", category: "Effects", emoji: "💥", description: "Boom!" },
  { name: "Magic", category: "Effects", emoji: "✨", description: "Sparkle magic" },
  { name: "Coin", category: "Effects", emoji: "🪙", description: "Coin collect" },
  { name: "PowerUp", category: "Effects", emoji: "⬆️", description: "Power up!" },
  // Musical
  { name: "Piano C", category: "Musical", emoji: "🎹", description: "Piano note C" },
  { name: "Piano E", category: "Musical", emoji: "🎹", description: "Piano note E" },
  { name: "Piano G", category: "Musical", emoji: "🎹", description: "Piano note G" },
  { name: "Drum Kick", category: "Musical", emoji: "🥁", description: "Bass drum" },
  { name: "Drum Snare", category: "Musical", emoji: "🥁", description: "Snare hit" },
  { name: "Hi-Hat", category: "Musical", emoji: "🥁", description: "Hi-hat cymbal" },
  { name: "Guitar", category: "Musical", emoji: "🎸", description: "Guitar strum" },
  // Voice
  { name: "Meow", category: "Voice", emoji: "🐱", description: "Cat meow" },
  { name: "Bark", category: "Voice", emoji: "🐶", description: "Dog bark" },
  { name: "Chirp", category: "Voice", emoji: "🐦", description: "Bird chirp" },
  { name: "Ribbit", category: "Voice", emoji: "🐸", description: "Frog ribbit" },
  { name: "Roar", category: "Voice", emoji: "🦁", description: "Lion roar" },
  { name: "Laugh", category: "Voice", emoji: "😄", description: "Ha ha!" },
  { name: "Cheer", category: "Voice", emoji: "🎉", description: "Crowd cheer" },
];

const BG_LIBRARY: LibraryItem[] = [
  { name: "Blue Sky", category: "Outdoor", emoji: "🌤️", color: "#87CEEB" },
  { name: "Night Sky", category: "Outdoor", emoji: "🌌", color: "#0a0a2a" },
  { name: "Sunset", category: "Outdoor", emoji: "🌅", color: "#FF6347" },
  { name: "Ocean", category: "Outdoor", emoji: "🌊", color: "#006994" },
  { name: "Forest", category: "Outdoor", emoji: "🌲", color: "#228B22" },
  { name: "Desert", category: "Outdoor", emoji: "🏜️", color: "#EDC9AF" },
  { name: "Space", category: "Outdoor", emoji: "🚀", color: "#0c0c2a" },
  { name: "Underwater", category: "Outdoor", emoji: "🐠", color: "#006994" },
  { name: "Classroom", category: "Indoor", emoji: "🏫", color: "#F5F5DC" },
  { name: "Castle", category: "Indoor", emoji: "🏰", color: "#808080" },
  { name: "Cave", category: "Indoor", emoji: "🕳️", color: "#2F2F2F" },
  { name: "Grid", category: "Pattern", emoji: "📐", color: "#ffffff" },
  { name: "Neon", category: "Pattern", emoji: "💜", color: "#0a0a1a" },
  { name: "Rainbow", category: "Pattern", emoji: "🌈", color: "#ff6b6b" },
];

// Generate a sprite image from an emoji
function generateSpriteCanvas(item: LibraryItem, size: number = 96): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Background circle
  ctx.fillStyle = item.color + "30";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = item.color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Emoji
  ctx.font = `${size * 0.5}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(item.emoji, size / 2, size / 2);

  return canvas.toDataURL("image/png");
}

function generateBackgroundCanvas(item: LibraryItem): string {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 360;
  const ctx = canvas.getContext("2d")!;

  // Base color
  ctx.fillStyle = item.color;
  ctx.fillRect(0, 0, 480, 360);

  // Add some visual interest based on category
  if (item.name === "Night Sky" || item.name === "Space") {
    // Stars
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.8 + 0.2})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 480, Math.random() * 360, Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (item.name === "Sunset") {
    const grad = ctx.createLinearGradient(0, 0, 0, 360);
    grad.addColorStop(0, "#FF6347");
    grad.addColorStop(0.4, "#FF8C00");
    grad.addColorStop(0.7, "#FFD700");
    grad.addColorStop(1, "#87CEEB");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 480, 360);
  } else if (item.name === "Ocean" || item.name === "Underwater") {
    const grad = ctx.createLinearGradient(0, 0, 0, 360);
    grad.addColorStop(0, "#003366");
    grad.addColorStop(1, "#006994");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 480, 360);
    // Waves
    for (let w = 0; w < 5; w++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + w * 0.02})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= 480; x += 5) {
        ctx.lineTo(x, 100 + w * 50 + Math.sin(x * 0.02 + w) * 15);
      }
      ctx.stroke();
    }
  } else if (item.name === "Grid") {
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 480; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke(); }
    for (let y = 0; y <= 360; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(480, y); ctx.stroke(); }
  } else if (item.name === "Neon") {
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, 480, 360);
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 480; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke(); }
    for (let y = 0; y <= 360; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(480, y); ctx.stroke(); }
    // Glow at center
    const grad2 = ctx.createRadialGradient(240, 180, 10, 240, 180, 200);
    grad2.addColorStop(0, "rgba(139,92,246,0.15)");
    grad2.addColorStop(1, "transparent");
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, 480, 360);
  } else if (item.name === "Rainbow") {
    const rainbow = ["#ff6b6b", "#ffa06b", "#ffd93d", "#6bcb77", "#4d96ff", "#9966FF"];
    const h = 360 / rainbow.length;
    rainbow.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * h, 480, h); });
  } else if (item.name === "Forest") {
    const grad3 = ctx.createLinearGradient(0, 0, 0, 360);
    grad3.addColorStop(0, "#87CEEB");
    grad3.addColorStop(0.6, "#228B22");
    grad3.addColorStop(1, "#1a5c1a");
    ctx.fillStyle = grad3;
    ctx.fillRect(0, 0, 480, 360);
  }

  // Add emoji overlay
  ctx.font = "48px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(item.emoji, 240, 190);

  return canvas.toDataURL("image/png");
}

// Generate a simple sound as a data URL (Web Audio tone)
function generateSound(name: string): string {
  // We return a placeholder - actual sounds would be audio files
  // For now we'll generate tones in the runtime
  return `data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=`;
}

export default function SpriteLibrary({ onSelect, onClose, tab: initialTab }: Props) {
  const [tab, setTab] = useState<"sprites" | "sounds" | "backgrounds">(initialTab || "sprites");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = tab === "sprites"
    ? ["All", ...new Set(SPRITE_LIBRARY.map(s => s.category))]
    : tab === "sounds"
    ? ["All", ...new Set(SOUND_LIBRARY.map(s => s.category))]
    : ["All", ...new Set(BG_LIBRARY.map(s => s.category))];

  const filteredSprites = SPRITE_LIBRARY.filter(s =>
    (selectedCategory === "All" || s.category === selectedCategory) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSounds = SOUND_LIBRARY.filter(s =>
    (selectedCategory === "All" || s.category === selectedCategory) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredBgs = BG_LIBRARY.filter(s =>
    (selectedCategory === "All" || s.category === selectedCategory) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectSprite = useCallback((item: LibraryItem) => {
    const url = generateSpriteCanvas(item);
    onSelect({ id: "lib_" + Math.random().toString(36).slice(2, 8), name: item.name, url, type: "image" });
  }, [onSelect]);

  const handleSelectSound = useCallback((item: typeof SOUND_LIBRARY[0]) => {
    const url = generateSound(item.name);
    onSelect({ id: "snd_" + Math.random().toString(36).slice(2, 8), name: item.name, url, type: "sound" });
  }, [onSelect]);

  const handleSelectBg = useCallback((item: LibraryItem) => {
    const url = generateBackgroundCanvas(item);
    onSelect({ id: "bg_" + Math.random().toString(36).slice(2, 8), name: item.name, url, type: "image" });
  }, [onSelect]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#12122a] rounded-2xl border border-white/[0.08] shadow-2xl w-[600px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-white font-bold text-sm">📚 Library</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 text-lg">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 py-2 border-b border-white/[0.06]">
          {(["sprites", "sounds", "backgrounds"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelectedCategory("All"); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                tab === t ? "bg-violet-600 text-white" : "bg-white/[0.04] text-white/40 hover:text-white/70"
              }`}>
              {t === "sprites" ? "🎭 Sprites" : t === "sounds" ? "🔊 Sounds" : "🖼 Backgrounds"}
            </button>
          ))}
        </div>

        {/* Search & categories */}
        <div className="px-5 py-2 flex gap-2 items-center">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab}...`}
            className="flex-1 text-xs py-1.5 px-3 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white placeholder:text-white/20" />
          <div className="flex gap-1 overflow-x-auto">
            {categories.map(c => (
              <button key={c} onClick={() => setSelectedCategory(c)}
                className={`px-2 py-1 text-[10px] rounded-md whitespace-nowrap transition-all ${
                  selectedCategory === c ? "bg-violet-600 text-white" : "bg-white/[0.04] text-white/40 hover:text-white/60"
                }`}>{c}</button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {tab === "sprites" && (
            <div className="grid grid-cols-5 gap-2">
              {filteredSprites.map(item => (
                <button key={item.name} onClick={() => handleSelectSprite(item)}
                  className="group flex flex-col items-center gap-1 p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-violet-500/30 transition-all">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"
                    style={{ backgroundColor: item.color + "20" }}>
                    {item.emoji}
                  </div>
                  <span className="text-[10px] text-white/50 group-hover:text-white/80">{item.name}</span>
                </button>
              ))}
            </div>
          )}

          {tab === "sounds" && (
            <div className="grid grid-cols-3 gap-2">
              {filteredSounds.map(item => (
                <button key={item.name} onClick={() => handleSelectSound(item)}
                  className="group flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-violet-500/30 transition-all text-left">
                  <span className="text-xl w-8 text-center">{item.emoji}</span>
                  <div>
                    <div className="text-xs text-white/70 group-hover:text-white font-medium">{item.name}</div>
                    <div className="text-[10px] text-white/30">{item.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === "backgrounds" && (
            <div className="grid grid-cols-3 gap-2">
              {filteredBgs.map(item => (
                <button key={item.name} onClick={() => handleSelectBg(item)}
                  className="group flex flex-col items-center gap-1 p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-violet-500/30 transition-all">
                  <div className="w-full h-16 rounded-lg flex items-center justify-center text-2xl"
                    style={{ backgroundColor: item.color }}>
                    {item.emoji}
                  </div>
                  <span className="text-[10px] text-white/50 group-hover:text-white/80">{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
