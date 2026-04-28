// Work-unlock helpers
// Students get arcade + projects unlocked for the rest of the day once they submit all assignments.

import { studentFreetimeStore } from "./studentFreetimeStore.ts";

const KEY = "workDoneDate";
const SKIP_WORK_KEY = "skipWorkDayDate";

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
 * isAccessAllowed — unified gate for arcade/projects nav visibility.
 *
 * Precedence (highest first):
 *   1. freetime_revoked_until > now  → locked (revoke beats everything)
 *   2. skip_work_day_date === today  → unlocked (teacher-set work-free day)
 *   3. freetime_grant_until > now   → unlocked (teacher granted freetime)
 *   4. all_work_done_today          → unlocked (student finished assignments)
 *   else                            → locked
 */
export function isAccessAllowed(): boolean {
  const snap = studentFreetimeStore.getSnapshot();
  // 1. Revoke lock — highest priority
  if (snap.revokedUntil !== null && snap.revokedUntil > Date.now()) return false;
  // 2. Work-free day set by teacher
  try {
    if (localStorage.getItem(SKIP_WORK_KEY) === todayStr()) return true;
  } catch {}
  // 3. Teacher-granted freetime
  if (snap.granted) return true;
  // 4. Student completed all work today
  if (isWorkUnlocked()) return true;
  return false;
}
