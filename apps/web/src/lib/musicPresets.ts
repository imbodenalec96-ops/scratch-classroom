// Shared calming-music library — single source of truth.
// Imported by:
//   - components/ClassroomBoard.tsx (player + cash-out integration)
//   - components/TeacherBoardSettings.tsx (default-track picker)
//   - components/TeacherStore.tsx (Seed music in store)
//
// BUNDLED tracks below are the originals that have been verified to
// work. Custom tracks live in localStorage (per device) — teachers
// add them via /board → Settings → Music → "+ Add custom track" by
// pasting any YouTube URL. The picker UI shows bundled + custom
// merged; consumers should call getAllMusicPresets() to read the
// merged list, NOT MUSIC_PRESETS directly.

export type MusicMood = "nature" | "instrumental" | "lofi" | "focus" | "kids" | "custom" | "synth";
import type { SynthKind } from "./musicSynth.ts";

export interface MusicPreset {
  id: string;
  label: string;
  emoji: string;
  mood: MusicMood;
  /** Default cash-out price when seeded into the store. */
  price: number;
  /** YouTube video id — set when source is YouTube. */
  videoId?: string;
  /** Web Audio synth kind — set when source is local synthesis. */
  synth?: SynthKind;
  /** Set true on teacher-added entries from localStorage. */
  isCustom?: boolean;
}

// Verified bundled set — only YouTube tracks that have been
// confirmed to play. Synthesized presets removed in May 2026 because
// the teacher reported they sounded poor on classroom speakers.
//
// To add more music: open /board → Settings → Music chip "+ Add
// YouTube track". Paste any 24/7 ambient stream URL. The SUGGESTED
// SEARCHES below give the teacher a few good starting points.
export const MUSIC_PRESETS: MusicPreset[] = [
  { id: "forest",     label: "Forest Spa",        videoId: "xNN7iTA57jM", emoji: "🌿", mood: "nature",       price: 15 },
  { id: "ocean",      label: "Ocean Waves",       videoId: "MIr3RsUWrdo", emoji: "🌊", mood: "nature",       price: 15 },
  { id: "rain",       label: "Gentle Rain",       videoId: "mPZkdNFkNps", emoji: "🌧", mood: "nature",       price: 15 },
  { id: "piano",      label: "Spa Piano",         videoId: "4xDzrJKXOOY", emoji: "🎹", mood: "instrumental", price: 15 },
  { id: "tibetan",    label: "Healing Bowls",     videoId: "UgHKb_7884o", emoji: "🔔", mood: "instrumental", price: 20 },
  { id: "lofi-study", label: "Lo-Fi Study Beats", videoId: "jfKfPfyJRdk", emoji: "📚", mood: "lofi",         price: 10 },
];

// Suggested YouTube search queries shown to the teacher in the
// "+ Add YouTube track" picker. She picks one, the picker opens
// YouTube in a new tab pre-filled with the search.
export const SUGGESTED_SEARCHES: Array<{ label: string; query: string; emoji: string }> = [
  { emoji: "📚", label: "Lo-fi hip hop radio (24/7 stream)", query: "lofi hip hop radio beats to study to live" },
  { emoji: "☕", label: "Coffee shop ambience (8 hour)",      query: "coffee shop ambience 8 hour" },
  { emoji: "🌧", label: "Rain on a roof (10 hour)",            query: "rain on a roof 10 hour no thunder" },
  { emoji: "🌊", label: "Ocean waves (10 hour)",                query: "ocean waves 10 hour no music for sleep" },
  { emoji: "🌲", label: "Forest sounds with birds",            query: "forest sounds with birds 8 hour" },
  { emoji: "🔥", label: "Crackling fireplace (10 hour)",       query: "crackling fireplace 10 hour no music" },
  { emoji: "🎹", label: "Calm piano for studying",             query: "calm piano music for studying 3 hour" },
  { emoji: "🎼", label: "Classical for focus (3 hour)",        query: "classical music for focus and concentration 3 hour" },
  { emoji: "🎷", label: "Smooth jazz cafe",                    query: "smooth jazz cafe music 3 hour" },
  { emoji: "🧘", label: "Meditation music (no voice)",         query: "meditation music no voice 3 hour" },
  { emoji: "✨", label: "Studio Ghibli piano",                  query: "studio ghibli piano playlist relaxing" },
  { emoji: "🌌", label: "Synthwave for studying",              query: "chillsynth radio synthwave to chill to" },
];

export const MOOD_LABELS: Record<MusicMood, string> = {
  nature: "Nature",
  instrumental: "Instrumental",
  lofi: "Lo-Fi",
  focus: "Focus",
  kids: "Kids",
  custom: "Custom",
  synth: "Synth (offline)",
};

// Custom tracks stored in localStorage so they persist per device but
// don't require a backend change. Teachers add via the settings UI.
const CUSTOM_KEY = "star_custom_music";

export function getCustomMusicPresets(): MusicPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as MusicPreset[];
    if (!Array.isArray(arr)) return [];
    return arr.map((p) => ({ ...p, mood: "custom" as MusicMood, isCustom: true }));
  } catch {
    return [];
  }
}

export function setCustomMusicPresets(list: MusicPreset[]): void {
  try {
    const safe = list.map((p) => ({
      id: p.id, label: p.label, videoId: p.videoId,
      emoji: p.emoji || "🎵", mood: "custom" as MusicMood,
      price: typeof p.price === "number" ? p.price : 15,
      isCustom: true,
    }));
    // Compute the diff vs prior local list so we know which rows to
    // upsert and which were deleted — keeps Supabase in sync with
    // delete operations from the settings panel.
    let prior: MusicPreset[] = [];
    try { prior = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]") as MusicPreset[]; } catch {}
    const nextIds = new Set(safe.map((p) => p.id));
    const removedIds = prior.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(safe));
    if (typeof window !== "undefined") {
      import("./star/supabaseSync.ts").then((m) => {
        for (const p of safe) {
          if (!p.videoId) continue;
          m.pushCustomMusic({ id: p.id, label: p.label, videoId: p.videoId, emoji: p.emoji || "🎵", price: p.price || 15 });
        }
        for (const id of removedIds) m.deleteCustomMusicRemote(id);
      }).catch(() => {});
    }
  } catch {}
}

export function getAllMusicPresets(): MusicPreset[] {
  return [...MUSIC_PRESETS, ...getCustomMusicPresets()];
}

/** Extract the 11-char YouTube video id from any YouTube URL. */
export function parseYouTubeId(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  // If it's already an 11-char id, accept as-is.
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function getPresetById(id: string): MusicPreset | undefined {
  return getAllMusicPresets().find((p) => p.id === id);
}

export function getPresetByLabel(label: string): MusicPreset | undefined {
  const lower = label.trim().toLowerCase();
  return getAllMusicPresets().find((p) => p.label.toLowerCase() === lower);
}
