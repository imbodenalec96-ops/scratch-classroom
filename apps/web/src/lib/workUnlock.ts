// Work-unlock helpers
// Students get arcade + projects unlocked for the rest of the day once they submit all assignments.

import { studentFreetimeStore } from "./studentFreetimeStore.ts";
import { isOnBreak } from "./breakSystem.ts";

const KEY = "workDoneDate";
const SKIP_KEY = "skipWorkDate";

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

/** Set skip-work-day in localStorage so isAccessAllowed() picks it up. */
export function setSkipWorkDay(): void {
  try { localStorage.setItem(SKIP_KEY, todayStr()); } catch {}
}

/**
 * Canonical unlock check used by route guards and nav gating.
 * Precedence (highest priority first):
 *   1. revoked_until > now  → locked (60s grace after teacher revoke)
 *   2. skip_work today      → unlocked
 *   3. grant_until > now    → unlocked (teacher-granted freetime)
 *   4. work_done today      → unlocked (student finished assignments)
 *   5. on break             → unlocked (10-min break mode)
 *   else                    → locked
 */
export function isAccessAllowed(): boolean {
  const snap = studentFreetimeStore.getSnapshot();
  if (snap.revokedUntil && snap.revokedUntil > Date.now()) return false;
  try { if (localStorage.getItem(SKIP_KEY) === todayStr()) return true; } catch {}
  if (snap.granted && (snap.until === null || snap.until > Date.now())) return true;
  if (isWorkUnlocked()) return true;
  if (isOnBreak()) return true;
  return false;
}
