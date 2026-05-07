// Web Audio sounds for the STAR scanner. No mp3s — synthesized via
// OscillatorNode + GainNode. Lazy-init the AudioContext on first
// sound so we don't trigger the autoplay-policy warning on cold load.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

function tone(opts: {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  peak?: number;
}) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type || "triangle";
  osc.frequency.value = opts.freq;
  const t0 = c.currentTime + opts.start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(opts.peak ?? 0.20, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + opts.duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.02);
}

// Sawtooth sweep — scan received
export function scanReceivedBeep() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sawtooth";
  const t0 = c.currentTime;
  osc.frequency.setValueAtTime(200, t0);
  osc.frequency.linearRampToValueAtTime(1800, t0 + 0.06);
  osc.frequency.linearRampToValueAtTime(900, t0 + 0.12);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 0.18);
}

// Rising triangle chord — recognized
export function successBeep() {
  tone({ freq: 440, start: 0,    duration: 0.18, type: "triangle", peak: 0.20 });
  tone({ freq: 660, start: 0.07, duration: 0.18, type: "triangle", peak: 0.22 });
  tone({ freq: 880, start: 0.14, duration: 0.20, type: "triangle", peak: 0.24 });
}

// 4-note sparkle — saved
export function loggedBeep() {
  // C5 E5 G5 C6
  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((f, i) => tone({ freq: f, start: i * 0.06, duration: 0.18, type: "triangle", peak: 0.18 }));
}

// Descending sawtooth — error
export function errorBeep() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sawtooth";
  const t0 = c.currentTime;
  osc.frequency.setValueAtTime(220, t0);
  osc.frequency.linearRampToValueAtTime(80, t0 + 0.30);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.20, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.30);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 0.32);
}

// Triple square pulse — alert
export function alertBeep() {
  for (let i = 0; i < 3; i++) tone({ freq: 440, start: i * 0.18, duration: 0.10, type: "square", peak: 0.18 });
}
