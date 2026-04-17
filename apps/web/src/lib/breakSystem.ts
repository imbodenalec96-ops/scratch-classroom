/**
 * Break system — two-path choice after 10 min of continuous work.
 *
 * State is persisted to localStorage so it survives navigation. Expires at
 * the end of day (crossing midnight resets).
 *
 * Paths:
 *  - 'break'    → 10 min of limited-arcade + library-only YouTube, then auto-return
 *  - 'fullwork' → keep grinding; when isWorkUnlocked() → everything unlocks
 */

const KEY = "blockforge_break_state_v1";
const TODAY = () => new Date().toISOString().slice(0, 10);

export type BreakPath = "break" | "fullwork" | null;

export interface BreakState {
  date: string;
  workStartAt: number;       // ms epoch when the student started work today
  breakOffered: boolean;     // modal has been shown
  path: BreakPath;           // which path the student chose
  breakStartAt: number;      // ms epoch when break started
  breakEndAt: number;        // ms epoch when break ends (= start + 10min)
}

const DEFAULT_STATE: BreakState = {
  date: TODAY(),
  workStartAt: 0,
  breakOffered: false,
  path: null,
  breakStartAt: 0,
  breakEndAt: 0,
};

export const WORK_BEFORE_BREAK_MS = 10 * 60 * 1000; // 10 min
export const BREAK_DURATION_MS    = 10 * 60 * 1000; // 10 min

/** Games that are OK to play during a limited break */
export const BREAK_ALLOWED_GAME_IDS = new Set([
  "snake", "memory", "mathblitz", "colorcatcher", "coloringbook",
  "sudoku", "wordsearch", "tictactoe", "2048",
]);

export function getBreakState(): BreakState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as BreakState;
    // Reset on new day
    if (parsed.date !== TODAY()) return { ...DEFAULT_STATE };
    return parsed;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function setBreakState(patch: Partial<BreakState>) {
  const next = { ...getBreakState(), ...patch, date: TODAY() };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  // Broadcast a storage event so other tabs / hooks can react immediately
  try { window.dispatchEvent(new Event("breakstate-change")); } catch {}
  return next;
}

export function resetBreakState() {
  try { localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_STATE })); } catch {}
  try { window.dispatchEvent(new Event("breakstate-change")); } catch {}
}

export function isOnBreak(): boolean {
  const s = getBreakState();
  if (s.path !== "break") return false;
  if (!s.breakEndAt) return false;
  return Date.now() < s.breakEndAt;
}

export function breakSecondsRemaining(): number {
  const s = getBreakState();
  if (s.path !== "break") return 0;
  return Math.max(0, Math.floor((s.breakEndAt - Date.now()) / 1000));
}

export function markWorkStart() {
  const s = getBreakState();
  if (!s.workStartAt) setBreakState({ workStartAt: Date.now() });
}

export function shouldOfferBreak(): boolean {
  const s = getBreakState();
  if (s.breakOffered) return false;
  if (s.path) return false;
  if (!s.workStartAt) return false;
  return Date.now() - s.workStartAt >= WORK_BEFORE_BREAK_MS;
}

export function chooseBreak() {
  const now = Date.now();
  setBreakState({
    breakOffered: true,
    path: "break",
    breakStartAt: now,
    breakEndAt: now + BREAK_DURATION_MS,
  });
}

export function chooseFullWork() {
  setBreakState({ breakOffered: true, path: "fullwork" });
}
