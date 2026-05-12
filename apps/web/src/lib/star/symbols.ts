// Bundled symbol library used by PECS card builder + AAC quick board.
// Emoji-based so no asset files / hosting is needed and the same
// glyphs render on every device. Curated from standard early-AAC
// vocabulary categories (PECS Phase III / AAC core word lists).
//
// Add a symbol by pushing to SYMBOLS — the picker renders all
// categories automatically. The `aliases` array lets the search box
// match common synonyms (e.g. "potty" → "bathroom").

export type SymbolCategory =
  | "actions"
  | "core"
  | "food"
  | "drink"
  | "places"
  | "people"
  | "feelings"
  | "time"
  | "school"
  | "yes-no";

export interface Symbol {
  id: string;
  label: string;
  emoji: string;
  category: SymbolCategory;
  aliases?: string[];
}

export const SYMBOLS: Symbol[] = [
  // ── Actions ────────────────────────────────────────────────
  { id: "eat",       label: "eat",       emoji: "🍽",  category: "actions" },
  { id: "drink",     label: "drink",     emoji: "🥤",  category: "actions" },
  { id: "sleep",     label: "sleep",     emoji: "😴",  category: "actions", aliases: ["nap", "rest"] },
  { id: "play",      label: "play",      emoji: "🎮",  category: "actions" },
  { id: "go",        label: "go",        emoji: "➡️",  category: "actions" },
  { id: "stop",      label: "stop",      emoji: "🛑",  category: "actions", aliases: ["wait"] },
  { id: "help",      label: "help",      emoji: "🆘",  category: "actions" },
  { id: "read",      label: "read",      emoji: "📖",  category: "actions" },
  { id: "write",     label: "write",     emoji: "✏️",  category: "actions" },
  { id: "look",      label: "look",      emoji: "👀",  category: "actions", aliases: ["see"] },
  { id: "listen",    label: "listen",    emoji: "👂",  category: "actions", aliases: ["hear"] },
  { id: "give",      label: "give",      emoji: "🤝",  category: "actions" },
  { id: "share",     label: "share",     emoji: "🫱",  category: "actions" },
  { id: "walk",      label: "walk",      emoji: "🚶",  category: "actions" },
  { id: "run",       label: "run",       emoji: "🏃",  category: "actions" },
  { id: "sit",       label: "sit",       emoji: "🪑",  category: "actions" },
  { id: "dance",     label: "dance",     emoji: "💃",  category: "actions" },
  { id: "sing",      label: "sing",      emoji: "🎤",  category: "actions" },
  { id: "draw",      label: "draw",      emoji: "🎨",  category: "actions", aliases: ["paint", "color"] },
  { id: "wash",      label: "wash hands",emoji: "🧼",  category: "actions" },

  // ── Core words ────────────────────────────────────────────
  { id: "want",      label: "I want",    emoji: "🙋",  category: "core" },
  { id: "more",      label: "more",      emoji: "➕",  category: "core" },
  { id: "all-done",  label: "all done",  emoji: "✅",  category: "core", aliases: ["finished"] },
  { id: "again",     label: "again",     emoji: "🔁",  category: "core" },
  { id: "my-turn",   label: "my turn",   emoji: "👆",  category: "core" },
  { id: "your-turn", label: "your turn", emoji: "👉",  category: "core" },
  { id: "i-need",    label: "I need",    emoji: "🤲",  category: "core" },
  { id: "i-feel",    label: "I feel…",   emoji: "💭",  category: "core" },

  // ── Food ──────────────────────────────────────────────────
  { id: "snack",     label: "snack",     emoji: "🍪",  category: "food" },
  { id: "sandwich",  label: "sandwich",  emoji: "🥪",  category: "food" },
  { id: "apple",     label: "apple",     emoji: "🍎",  category: "food" },
  { id: "banana",    label: "banana",    emoji: "🍌",  category: "food" },
  { id: "pizza",     label: "pizza",     emoji: "🍕",  category: "food" },
  { id: "lunch",     label: "lunch",     emoji: "🥗",  category: "food" },

  // ── Drink ─────────────────────────────────────────────────
  { id: "water",     label: "water",     emoji: "💧",  category: "drink" },
  { id: "juice",     label: "juice",     emoji: "🧃",  category: "drink" },
  { id: "milk",      label: "milk",      emoji: "🥛",  category: "drink" },

  // ── Places ────────────────────────────────────────────────
  { id: "home",      label: "home",      emoji: "🏠",  category: "places" },
  { id: "school",    label: "school",    emoji: "🏫",  category: "places" },
  { id: "bathroom",  label: "bathroom",  emoji: "🚻",  category: "places", aliases: ["potty", "toilet", "restroom"] },
  { id: "library",   label: "library",   emoji: "📚",  category: "places" },
  { id: "gym",       label: "gym",       emoji: "🏀",  category: "places" },
  { id: "playground",label: "playground",emoji: "🛝",  category: "places" },
  { id: "outside",   label: "outside",   emoji: "🌳",  category: "places" },
  { id: "bus",       label: "bus",       emoji: "🚌",  category: "places" },
  { id: "car",       label: "car",       emoji: "🚗",  category: "places" },

  // ── People ────────────────────────────────────────────────
  { id: "mom",       label: "mom",       emoji: "👩",  category: "people" },
  { id: "dad",       label: "dad",       emoji: "👨",  category: "people" },
  { id: "teacher",   label: "teacher",   emoji: "👩‍🏫", category: "people" },
  { id: "friend",    label: "friend",    emoji: "🧑‍🤝‍🧑", category: "people" },
  { id: "nurse",     label: "nurse",     emoji: "👩‍⚕️", category: "people" },
  { id: "me",        label: "me",        emoji: "🙂",  category: "people", aliases: ["I"] },

  // ── Feelings ──────────────────────────────────────────────
  { id: "happy",     label: "happy",     emoji: "😊",  category: "feelings" },
  { id: "sad",       label: "sad",       emoji: "😢",  category: "feelings" },
  { id: "angry",     label: "angry",     emoji: "😠",  category: "feelings", aliases: ["mad"] },
  { id: "scared",    label: "scared",    emoji: "😨",  category: "feelings", aliases: ["afraid"] },
  { id: "tired",     label: "tired",     emoji: "🥱",  category: "feelings" },
  { id: "sick",      label: "sick",      emoji: "🤒",  category: "feelings" },
  { id: "hungry",    label: "hungry",    emoji: "😋",  category: "feelings" },
  { id: "thirsty",   label: "thirsty",   emoji: "🥤",  category: "feelings" },
  { id: "calm",      label: "calm",      emoji: "😌",  category: "feelings" },
  { id: "excited",   label: "excited",   emoji: "🤩",  category: "feelings" },
  { id: "frustrated",label: "frustrated",emoji: "😤",  category: "feelings" },
  { id: "proud",     label: "proud",     emoji: "🥳",  category: "feelings" },

  // ── Time ──────────────────────────────────────────────────
  { id: "now",       label: "now",       emoji: "⏰",  category: "time" },
  { id: "later",     label: "later",     emoji: "🕒",  category: "time" },
  { id: "first",     label: "first",     emoji: "1️⃣",  category: "time" },
  { id: "then",      label: "then",      emoji: "2️⃣",  category: "time" },
  { id: "today",     label: "today",     emoji: "📅",  category: "time" },
  { id: "tomorrow",  label: "tomorrow",  emoji: "📆",  category: "time" },

  // ── School ────────────────────────────────────────────────
  { id: "book",      label: "book",      emoji: "📕",  category: "school" },
  { id: "pencil",    label: "pencil",    emoji: "✏️",  category: "school" },
  { id: "paper",     label: "paper",     emoji: "📄",  category: "school" },
  { id: "tablet",    label: "tablet",    emoji: "📱",  category: "school" },
  { id: "computer",  label: "computer",  emoji: "💻",  category: "school" },
  { id: "headphones",label: "headphones",emoji: "🎧",  category: "school" },
  { id: "math",      label: "math",      emoji: "➗",  category: "school" },
  { id: "reading",   label: "reading",   emoji: "📖",  category: "school" },
  { id: "art",       label: "art",       emoji: "🎨",  category: "school" },
  { id: "music",     label: "music",     emoji: "🎵",  category: "school" },

  // ── Yes / No / manners ───────────────────────────────────
  { id: "yes",       label: "yes",       emoji: "👍",  category: "yes-no" },
  { id: "no",        label: "no",        emoji: "👎",  category: "yes-no" },
  { id: "please",    label: "please",    emoji: "🙏",  category: "yes-no" },
  { id: "thank-you", label: "thank you", emoji: "🤗",  category: "yes-no" },
  { id: "sorry",     label: "sorry",     emoji: "💔",  category: "yes-no" },
];

export const CATEGORY_LABELS: Record<SymbolCategory, string> = {
  actions:  "Actions",
  core:     "Core words",
  food:     "Food",
  drink:    "Drinks",
  places:   "Places",
  people:   "People",
  feelings: "Feelings",
  time:     "Time",
  school:   "School",
  "yes-no": "Yes / No",
};

export function searchSymbols(query: string): Symbol[] {
  const q = (query || "").trim().toLowerCase();
  if (!q) return SYMBOLS;
  return SYMBOLS.filter((s) => {
    if (s.label.toLowerCase().includes(q)) return true;
    if (s.id.toLowerCase().includes(q)) return true;
    if (s.aliases && s.aliases.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  });
}

export function findSymbolById(id: string): Symbol | undefined {
  return SYMBOLS.find((s) => s.id === id);
}
