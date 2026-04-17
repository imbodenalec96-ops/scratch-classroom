// Work-unlock helpers
// Students get arcade + projects unlocked for the rest of the day once they submit all assignments.

import { isOnBreak } from "./breakSystem.ts";
import { studentFreetimeStore } from "./studentFreetimeStore.ts";

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
 * Unlock precedence for arcade/projects access:
 *   freetime granted → unlocked
 *   work done today → unlocked
 *   on break       → unlocked
 *   else           → locked
 */
export function isAccessAllowed(): boolean {
  if (studentFreetimeStore.getSnapshot().granted) return true;
  return isWorkUnlocked() || isOnBreak();
}
