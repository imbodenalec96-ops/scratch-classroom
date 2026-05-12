// Web Audio ambient sound generators. These are SYNTHESIZED on the
// device — no YouTube, no internet, no chance of 404. Loop forever.
// Used by the board music player when a preset has `synth: ...`
// instead of `videoId: ...`.
//
// Each generator returns a stop() function. AudioContext lifecycle
// is managed by the caller (one ctx per active sound is fine).
//
// Tuning notes:
//  - All sounds are mastered through a -3dB shelf so high frequencies
//    don't sound harsh on tinny classroom speakers.
//  - Default master gain is 0.18 (down from 0.40) so they sit under
//    voice without being startling. The teacher's hardware volume is
//    the real volume control.
//  - "Noise" presets are pink/brown only — pure white noise was
//    rejected as too harsh and removed from the bundled list.

export type SynthKind =
  | "white-noise"
  | "pink-noise"
  | "brown-noise"
  | "rain"
  | "waves"
  | "fan"
  | "heartbeat"
  | "bowl";

export interface SynthHandle {
  stop: () => void;
  context: AudioContext;
  master: GainNode;
}

function makeContext(): AudioContext {
  const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  return new Ctx();
}

// 2 seconds of noise looped — long enough to mask the loop seam.
function makeNoiseBuffer(ctx: AudioContext, kind: "white" | "pink" | "brown"): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  if (kind === "white") {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  } else if (kind === "pink") {
    // Paul Kellet's pink-noise filter — well-known approximation.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    // Brownian (red): integrate white, with a tiny leak so it doesn't drift.
    let last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) * 0.998;
      data[i] = last * 3.5;
    }
  }
  return buf;
}

function loopNoise(ctx: AudioContext, kind: "white" | "pink" | "brown", master: GainNode): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, kind);
  src.loop = true;
  src.connect(master);
  src.start();
  return src;
}

function fadeIn(g: GainNode, target: number, ctx: AudioContext, seconds = 0.6) {
  const t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(target, t + seconds);
}

export function startSynth(kind: SynthKind, opts: { volume?: number } = {}): SynthHandle {
  const ctx = makeContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  // Global high-shelf cut so nothing sounds tinny on small speakers.
  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf"; highShelf.frequency.value = 4000; highShelf.gain.value = -6;
  master.connect(highShelf).connect(ctx.destination);
  const targetVol = opts.volume ?? 0.18;

  // Track all nodes so stop() can clean them up.
  const cleanup: Array<() => void> = [];

  if (kind === "white-noise" || kind === "pink-noise" || kind === "brown-noise") {
    const noiseKind = kind === "white-noise" ? "white" : kind === "pink-noise" ? "pink" : "brown";
    // Pre-filter for warmth — even the "raw" noise tracks get a gentle
    // rolloff so they don't shred eardrums on classroom speakers.
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, noiseKind);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = noiseKind === "white" ? 5500 : noiseKind === "pink" ? 4000 : 1500;
    src.connect(lp).connect(master);
    src.start();
    cleanup.push(() => { try { src.stop(); } catch {} });
  }
  else if (kind === "rain") {
    // Two layers of filtered noise for depth — low rumble + mid hiss.
    // No "drip" clicks; they sounded like rim shots on small speakers.
    const rumble = ctx.createBufferSource();
    rumble.buffer = makeNoiseBuffer(ctx, "brown");
    rumble.loop = true;
    const rumbleLP = ctx.createBiquadFilter();
    rumbleLP.type = "lowpass"; rumbleLP.frequency.value = 350;
    const rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0.55;
    rumble.connect(rumbleLP).connect(rumbleGain).connect(master);
    rumble.start();

    const hiss = ctx.createBufferSource();
    hiss.buffer = makeNoiseBuffer(ctx, "pink");
    hiss.loop = true;
    const hissLP = ctx.createBiquadFilter();
    hissLP.type = "lowpass"; hissLP.frequency.value = 2500;
    const hissHP = ctx.createBiquadFilter();
    hissHP.type = "highpass"; hissHP.frequency.value = 400;
    const hissGain = ctx.createGain(); hissGain.gain.value = 0.35;
    hiss.connect(hissHP).connect(hissLP).connect(hissGain).connect(master);
    hiss.start();

    cleanup.push(() => {
      try { rumble.stop(); } catch {}
      try { hiss.stop(); } catch {}
    });
  }
  else if (kind === "waves") {
    // Brown noise heavily low-passed + slow LFO swell. Adds a sub-LFO
    // on the filter cutoff so the "wash" follows the volume swell —
    // sounds way more like a real wave than a static-volume swell.
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, "brown");
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 500;
    const swell = ctx.createGain();
    swell.gain.value = 0.35;
    noise.connect(lp).connect(swell).connect(master);
    noise.start();
    // Volume LFO: slow, 11-second period.
    const volLfo = ctx.createOscillator();
    const volLfoGain = ctx.createGain();
    volLfo.frequency.value = 0.09;
    volLfoGain.gain.value = 0.30;
    volLfo.connect(volLfoGain).connect(swell.gain);
    volLfo.start();
    // Filter LFO: same period, opens up slightly during the swell.
    const filtLfo = ctx.createOscillator();
    const filtLfoGain = ctx.createGain();
    filtLfo.frequency.value = 0.09;
    filtLfoGain.gain.value = 200;
    filtLfo.connect(filtLfoGain).connect(lp.frequency);
    filtLfo.start();
    cleanup.push(() => {
      try { noise.stop(); } catch {}
      try { volLfo.stop(); } catch {}
      try { filtLfo.stop(); } catch {}
    });
  }
  else if (kind === "fan") {
    // Soft fan: brown noise heavily low-passed (no high-pitched whine).
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, "brown");
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 350;
    const g = ctx.createGain(); g.gain.value = 0.7;
    noise.connect(lp).connect(g).connect(master);
    noise.start();
    cleanup.push(() => { try { noise.stop(); } catch {} });
  }
  else if (kind === "heartbeat") {
    // Soft bass thump (lub-DUB) every ~1.1 sec at resting pulse.
    // Filtered through a low-pass so it doesn't click — sounds more
    // like a chest sound than a synth blip.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 250;
    lp.connect(master);
    const beatTimer = window.setInterval(() => {
      const t = ctx.currentTime;
      const beat = (when: number, freq: number, amp: number, dur: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + when);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + when + dur);
        g.gain.setValueAtTime(0, t + when);
        g.gain.linearRampToValueAtTime(amp, t + when + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + when + dur);
        osc.connect(g).connect(lp);
        osc.start(t + when);
        osc.stop(t + when + dur + 0.1);
      };
      beat(0, 75, 0.55, 0.22);    // lub
      beat(0.28, 65, 0.40, 0.20); // DUB
    }, 1100);
    cleanup.push(() => window.clearInterval(beatTimer));
  }
  else if (kind === "bowl") {
    // Singing bowl: triangle waves on near-harmonic ratios with a
    // soft attack on each oscillator + slow detune shimmer. Triangle
    // sounds more "metal-ringing" than pure sine.
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const partials = [
      { freq: 220, amp: 0.32 },   // fundamental
      { freq: 330, amp: 0.18 },   // perfect fifth
      { freq: 440, amp: 0.12 },   // octave
      { freq: 660, amp: 0.06 },   // 2nd fifth, sparkle
    ];
    partials.forEach(({ freq, amp }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      g.gain.value = 0;
      // Soft 1s attack so it doesn't pop in.
      g.gain.linearRampToValueAtTime(amp, ctx.currentTime + 1.0);
      osc.connect(g).connect(master);
      osc.start();
      oscs.push(osc);
      gains.push(g);
    });
    // Slow shimmer detune (cents). Different LFO speed per partial
    // so they breathe independently.
    const lfos: OscillatorNode[] = [];
    oscs.forEach((o, i) => {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.10 + i * 0.07;
      lfoGain.gain.value = 4 + i * 2;
      lfo.connect(lfoGain).connect((o as any).detune);
      lfo.start();
      lfos.push(lfo);
    });
    cleanup.push(() => {
      gains.forEach((g) => {
        try {
          const t = ctx.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.linearRampToValueAtTime(0, t + 0.4);
        } catch {}
      });
      window.setTimeout(() => {
        oscs.forEach((o) => { try { o.stop(); } catch {} });
        lfos.forEach((o) => { try { o.stop(); } catch {} });
      }, 450);
    });
  }

  fadeIn(master, targetVol, ctx, 0.8);

  return {
    stop: () => {
      // Gentle 0.4s fade-out then close.
      try {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0, t + 0.4);
      } catch {}
      window.setTimeout(() => {
        cleanup.forEach((fn) => fn());
        try { ctx.close(); } catch {}
      }, 500);
    },
    context: ctx,
    master,
  };
}
