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

// Verified bundled set. Two flavors:
//   YouTube tracks — long-form streams that have been live for years.
//   Synth tracks   — generated client-side via Web Audio. CANNOT 404
//                    since they're produced on the device. Loop forever,
//                    work offline, no copyright risk.
export const MUSIC_PRESETS: MusicPreset[] = [
  // YouTube tracks
  { id: "forest",     label: "Forest Spa",        videoId: "xNN7iTA57jM", emoji: "🌿", mood: "nature",       price: 15 },
  { id: "ocean",      label: "Ocean Waves",       videoId: "MIr3RsUWrdo", emoji: "🌊", mood: "nature",       price: 15 },
  { id: "rain",       label: "Gentle Rain",       videoId: "mPZkdNFkNps", emoji: "🌧", mood: "nature",       price: 15 },
  { id: "piano",      label: "Spa Piano",         videoId: "4xDzrJKXOOY", emoji: "🎹", mood: "instrumental", price: 15 },
  { id: "tibetan",    label: "Healing Bowls",     videoId: "UgHKb_7884o", emoji: "🔔", mood: "instrumental", price: 20 },
  { id: "lofi-study", label: "Lo-Fi Study Beats", videoId: "jfKfPfyJRdk", emoji: "📚", mood: "lofi",         price: 10 },

  // Synth — generated on device, guaranteed to work, no internet.
  // White-noise dropped — too harsh on classroom speakers. Pink and
  // brown stay (warmer + better for sensory regulation).
  { id: "synth-rain",      label: "Calm Rain",        synth: "rain",         emoji: "💧", mood: "synth", price: 5 },
  { id: "synth-waves",     label: "Slow Ocean Waves", synth: "waves",        emoji: "🌊", mood: "synth", price: 5 },
  { id: "synth-fan",       label: "Box Fan Hum",      synth: "fan",          emoji: "🌀", mood: "synth", price: 5 },
  { id: "synth-pink",      label: "Pink Noise",       synth: "pink-noise",   emoji: "🟣", mood: "synth", price: 5 },
  { id: "synth-brown",     label: "Deep Brown Noise", synth: "brown-noise",  emoji: "🟤", mood: "synth", price: 5 },
  { id: "synth-bowl",      label: "Singing Bowl",     synth: "bowl",         emoji: "🔔", mood: "synth", price: 8 },
  { id: "synth-heartbeat", label: "Resting Heartbeat", synth: "heartbeat",   emoji: "❤️", mood: "synth", price: 8 },
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
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(safe));
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
