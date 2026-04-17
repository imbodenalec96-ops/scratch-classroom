// Work-unlock helpers
// Students get arcade + projects unlocked for the rest of the day once they submit all assignments.

import { studentFreetimeStore } from "./studentFreetimeStore.ts";
import { isOnBreak } from "./breakSystem.ts";

const KEY = "workDoneDate";

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export function isWorkUnlocked(): boolean {
  try {
    return localStorage.getItem(KEY) === todayStr();
  } catch {
    return false;
  }
}

export function setWorkUnlocked(): void {
  try {
    localStorage.setItem(KEY, todayStr());
  } catch {}
}

export function clearWorkUnlock(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/**
 * Unlock precedence (highest to lowest):
 *  1. revokedUntil > now  → locked  (60s guard after teacher revokes freetime)
 *  2. skip_work today     → unlocked (teacher granted a free day)
 *  3. grant_until > now   → unlocked (teacher granted freetime via student_commands)
 *  4. work_done today     → unlocked (student completed assignments)
 *  5. on break            → unlocked
 *  6. else                → locked
 */
export function isAccessAllowed(): boolean {
  const ft = studentFreetimeStore.getSnapshot();
  if (ft.revokedUntil && ft.revokedUntil > Date.now()) return false;
  try {
    const skipDate = localStorage.getItem("skipWorkDayDate");
    if (skipDate === todayStr()) return true;
  } catch {}
  if (ft.granted) return true;
  if (isWorkUnlocked()) return true;
  if (isOnBreak()) return true;
  return false;
}
