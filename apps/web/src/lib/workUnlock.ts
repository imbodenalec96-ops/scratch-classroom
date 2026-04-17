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

/**
 * Routes/features that are gated on "work done OR on break".
 * During a 10-min break the student gets temporary access to Arcade,
 * Projects, and the YouTube library; when the break ends they re-gate.
 */
export function isAccessAllowed(): boolean {
  return isWorkUnlocked() || isOnBreak() || studentFreetimeStore.getSnapshot().granted;
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
