// Shared calming-music library — single source of truth.
// Imported by:
//   - components/ClassroomBoard.tsx (player + cash-out integration)
//   - components/TeacherBoardSettings.tsx (default-track picker)
//   - components/TeacherStore.tsx (Seed music in store)
//
// Categories (mood) drive the picker grouping. Adding a track is one
// line in this file; every consumer picks it up automatically.

export type MusicMood = "nature" | "instrumental" | "lofi" | "focus" | "kids";

export interface MusicPreset {
  id: string;
  label: string;
  videoId: string;
  emoji: string;
  mood: MusicMood;
  /** Default cash-out price when seeded into the store. */
  price: number;
}

export const MUSIC_PRESETS: MusicPreset[] = [
  // Nature
  { id: "forest",     label: "Forest Spa",          videoId: "xNN7iTA57jM", emoji: "🌿", mood: "nature", price: 15 },
  { id: "ocean",      label: "Ocean Waves",         videoId: "MIr3RsUWrdo", emoji: "🌊", mood: "nature", price: 15 },
  { id: "rain",       label: "Gentle Rain",         videoId: "mPZkdNFkNps", emoji: "🌧", mood: "nature", price: 15 },
  { id: "rain-window",label: "Rain on a Window",    videoId: "q76bMs-NwRk", emoji: "💧", mood: "nature", price: 15 },
  { id: "thunder",    label: "Distant Thunder",     videoId: "nDqvhilTrI8", emoji: "⛈",  mood: "nature", price: 20 },
  { id: "creek",      label: "Forest Creek",        videoId: "ABO9aRtPbCY", emoji: "🍃", mood: "nature", price: 15 },
  { id: "fire",       label: "Crackling Fireplace", videoId: "L_LUpnjgPso", emoji: "🔥", mood: "nature", price: 15 },
  { id: "snow",       label: "Soft Snowfall",       videoId: "NF6L4FXBmbY", emoji: "❄️", mood: "nature", price: 15 },
  { id: "birds",      label: "Birds in the Garden", videoId: "DOgkM_p2EpE", emoji: "🐦", mood: "nature", price: 15 },

  // Instrumental
  { id: "piano",      label: "Spa Piano",           videoId: "4xDzrJKXOOY", emoji: "🎹", mood: "instrumental", price: 15 },
  { id: "tibetan",    label: "Healing Bowls",       videoId: "UgHKb_7884o", emoji: "🔔", mood: "instrumental", price: 20 },
  { id: "guitar",     label: "Soft Acoustic",       videoId: "EBlPlrxsZzs", emoji: "🎸", mood: "instrumental", price: 15 },
  { id: "harp",       label: "Floating Harp",       videoId: "fjfwQOLPnPE", emoji: "🪕", mood: "instrumental", price: 20 },
  { id: "celtic",     label: "Celtic Calm",         videoId: "9KGv9TmFqi0", emoji: "🍀", mood: "instrumental", price: 20 },
  { id: "classical",  label: "Classical for Focus", videoId: "VgRYPNX1uHM", emoji: "🎼", mood: "instrumental", price: 20 },

  // Lo-fi
  { id: "lofi-study", label: "Lo-Fi Study Beats",   videoId: "jfKfPfyJRdk", emoji: "📚", mood: "lofi", price: 10 },
  { id: "lofi-chill", label: "Chill Lo-Fi",         videoId: "rUxyKA_-grg", emoji: "🌙", mood: "lofi", price: 10 },
  { id: "lofi-jazz",  label: "Lo-Fi Jazz",          videoId: "Dx5qFachd3A", emoji: "🎷", mood: "lofi", price: 10 },

  // Focus
  { id: "alpha",      label: "Alpha Focus Waves",   videoId: "WPni755-Krg", emoji: "🧠", mood: "focus", price: 25 },
  { id: "study-deep", label: "Deep Focus",          videoId: "5qap5aO4i9A", emoji: "🎯", mood: "focus", price: 20 },

  // Kids
  { id: "lullaby",    label: "Storybook Lullabies", videoId: "GVZP-CtxgVM", emoji: "🧸", mood: "kids", price: 10 },
  { id: "music-box",  label: "Music Box",           videoId: "GS3i6OdrCpw", emoji: "🎵", mood: "kids", price: 10 },
];

export const MOOD_LABELS: Record<MusicMood, string> = {
  nature: "Nature",
  instrumental: "Instrumental",
  lofi: "Lo-Fi",
  focus: "Focus",
  kids: "Kids",
};

export function getPresetById(id: string): MusicPreset | undefined {
  return MUSIC_PRESETS.find((p) => p.id === id);
}

export function getPresetByLabel(label: string): MusicPreset | undefined {
  const lower = label.trim().toLowerCase();
  return MUSIC_PRESETS.find((p) => p.label.toLowerCase() === lower);
}
