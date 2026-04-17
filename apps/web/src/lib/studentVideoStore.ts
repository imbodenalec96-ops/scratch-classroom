/**
 * studentVideoStore — active YouTube broadcast state for this student,
 * driven by the BROADCAST_VIDEO / END_BROADCAST commands on the new
 * student_commands pipe.
 *
 * Same `useSyncExternalStore`-compatible pattern as the other per-student
 * stores (lock / message / freetime). VideoOverlay subscribes and treats
 * this as the authoritative signal — the existing class_video poll remains
 * as a fallback so a student who reloads mid-broadcast still sees the
 * overlay (class-wide DELETE is fired on broadcast-end for that path).
 */
type Listener = () => void;

export interface StudentVideoSnapshot {
  videoId: string | null;
  url: string | null;
}

let _state: StudentVideoSnapshot = { videoId: null, url: null };
const listeners = new Set<Listener>();
function emit() { for (const l of listeners) l(); }

export const studentVideoStore = {
  getSnapshot(): StudentVideoSnapshot { return _state; },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  /** BROADCAST_VIDEO handler — set the active video. */
  setBroadcast(videoId: string | null, url?: string | null) {
    if (_state.videoId === videoId && _state.url === (url ?? null)) return;
    _state = { videoId: videoId || null, url: url ?? null };
    emit();
  },
  /** END_BROADCAST handler — clear the active video. */
  clear() {
    if (_state.videoId === null && _state.url === null) return;
    _state = { videoId: null, url: null };
    emit();
  },
};
