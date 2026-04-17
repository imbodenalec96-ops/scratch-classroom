/**
 * studentFreetimeStore — module-level `granted` flag driven by the new
 * student_commands pipe (GRANT_FREETIME / REVOKE_FREETIME handlers in
 * useStudentCommands).
 *
 * Mirrors the studentLockStore / studentMessageStore pattern: a
 * `useSyncExternalStore`-compatible subscribable so any consumer (workUnlock
 * precedence, overlays, nav gating) can read the current grant without
 * threading props. Kept deliberately minimal — no zustand, no context — since
 * this is a one-shot boolean + expiry, same shape as the existing stores.
 *
 * Auto-expires at `until` so a 15-minute grant flips back to `false` on its own
 * if no REVOKE_FREETIME arrives — prevents a tab that misses the revoke from
 * staying unlocked forever.
 */
type Listener = () => void;

interface FreetimeSnapshot {
  granted: boolean;
  until: number | null; // ms epoch, or null when granted=false
}

let _state: FreetimeSnapshot = { granted: false, until: null };
let _expireTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit() { for (const l of listeners) l(); }
function clearTimer() {
  if (_expireTimer) { clearTimeout(_expireTimer); _expireTimer = null; }
}

export const studentFreetimeStore = {
  getSnapshot(): FreetimeSnapshot { return _state; },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  /** GRANT_FREETIME: set granted=true with auto-expire at `untilIso` */
  setGranted(untilIso: string | null) {
    const untilMs = untilIso ? Date.parse(untilIso) : NaN;
    const valid = Number.isFinite(untilMs) && untilMs > Date.now();
    clearTimer();
    _state = { granted: true, until: valid ? untilMs : null };
    if (valid) {
      _expireTimer = setTimeout(() => {
        _state = { granted: false, until: null };
        _expireTimer = null;
        emit();
      }, untilMs - Date.now());
    }
    emit();
  },
  /** REVOKE_FREETIME or local expiry: clear the flag */
  setRevoked() {
    if (!_state.granted && _state.until === null) return;
    clearTimer();
    _state = { granted: false, until: null };
    emit();
  },
};
