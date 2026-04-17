// Work-unlock helpers
// Students get arcade + projects unlocked for the rest of the day once they submit all assignments.

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

export function isAccessAllowed(): boolean {
  return isWorkUnlocked();
}
