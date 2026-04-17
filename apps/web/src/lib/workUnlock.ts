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
 * Precedence (highest → lowest):
 *   revoked_until > now  → locked  (teacher revoke is authoritative for 60s)
 *   grant_until > now    → unlocked (GRANT_FREETIME command)
 *   work_done            → unlocked (submitted all assignments today)
 *   on_break             → unlocked (break timer active)
 *   else                 → locked
 */
export function isAccessAllowed(): boolean {
  const ft = studentFreetimeStore.getSnapshot();
  if (ft.revokedUntil !== null && ft.revokedUntil > Date.now()) return false;
  if (ft.granted) return true;
  if (isWorkUnlocked()) return true;
  if (isOnBreak()) return true;
  return false;
}
