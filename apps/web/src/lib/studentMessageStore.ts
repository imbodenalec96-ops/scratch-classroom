/**
 * studentMessageStore — module-level pendingMessage state driven by the
 * new student_commands pipe (MESSAGE handler in useStudentCommands).
 *
 * Mirrors the studentLockStore pattern: a `useSyncExternalStore`-compatible
 * subscribable so Layout + PublicLayout can read + react without threading
 * props. OR'd with the legacy `classCommands.pendingMessage` in the overlay;
 * either pipe delivering clears the student's worry — both firing shows the
 * same message string once (setMessage is idempotent on identical payloads).
 *
 * Auto-expires after 15s (matches useClassCommands MESSAGE behaviour) so a
 * message doesn't linger if the student never dismisses it.
 */
type Listener = () => void;

let _message: string | null = null;
let _expireTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit() { for (const l of listeners) l(); }

const AUTO_DISMISS_MS = 15_000;

export const studentMessageStore = {
  getSnapshot(): string | null {
    return _message;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  setMessage(message: string | null) {
    if (_message === message) return;
    _message = message;
    if (_expireTimer) { clearTimeout(_expireTimer); _expireTimer = null; }
    if (message) {
      _expireTimer = setTimeout(() => {
        _message = null;
        emit();
        _expireTimer = null;
      }, AUTO_DISMISS_MS);
    }
    emit();
  },
  dismiss() {
    if (_message === null) return;
    _message = null;
    if (_expireTimer) { clearTimeout(_expireTimer); _expireTimer = null; }
    emit();
  },
};
