type Listener = () => void;

let _message: string | null = null;
interface Snapshot { message: string | null }
const listeners = new Set<Listener>();

function emit() { for (const l of listeners) l(); }

export const studentMessageStore = {
  getSnapshot(): Snapshot {
    return _snap;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  setMessage(message: string | null) {
    if (_message === message) return;
    _message = message;
    _snap = { message: _message };
    emit();
  },
};

let _snap: Snapshot = { message: _message };
