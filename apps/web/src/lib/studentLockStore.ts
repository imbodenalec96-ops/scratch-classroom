/**
 * studentLockStore — lightweight module-level lock state driven by the
 * new student_commands pipe (LOCK / UNLOCK handlers in useStudentCommands).
 *
 * Kept as a module-level `useSyncExternalStore`-compatible subscribable so
 * any component (Layout, future route guards, etc.) can read + react without
 * threading props or pulling in a state-management library. Intentionally
 * tiny — the existing class_commands lock flow in useClassCommands stays
 * authoritative until the legacy pipe is retired; this state is OR'd in.
 */
type Listener = () => void;

let _locked: boolean = false;
let _message: string | null = null;
interface Snapshot { locked: boolean; message: string | null }
const listeners = new Set<Listener>();

function emit() { for (const l of listeners) l(); }

export const studentLockStore = {
  getSnapshot(): Snapshot {
    // Return stable tuple for useSyncExternalStore — ref-equal unless changed.
    return _snap;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  setLocked(locked: boolean, message: string | null = null) {
    if (_locked === locked && _message === message) return;
    _locked = locked;
    _message = message;
    _snap = { locked: _locked, message: _message };
    emit();
  },
};

let _snap: Snapshot = { locked: _locked, message: _message };
