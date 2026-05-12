// Web Audio ambient sound generators. These are SYNTHESIZED on the
// device — no YouTube, no internet, no chance of 404. Loop forever.
// Used by the board music player when a preset has `synth: ...`
// instead of `videoId: ...`.
//
// Each generator returns a stop() function. AudioContext lifecycle
// is managed by the caller (one ctx per active sound is fine).

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
  master.connect(ctx.destination);
  const targetVol = opts.volume ?? 0.40;

  // Track all nodes so stop() can clean them up.
  const cleanup: Array<() => void> = [];

  if (kind === "white-noise" || kind === "pink-noise" || kind === "brown-noise") {
    const noiseKind = kind === "white-noise" ? "white" : kind === "pink-noise" ? "pink" : "brown";
    const src = loopNoise(ctx, noiseKind, master);
    cleanup.push(() => { try { src.stop(); } catch {} });
  }
  else if (kind === "rain") {
    // Pink noise heavily low-passed, with a sprinkle of high-frequency
    // clicks for the patter on a roof.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, "pink");
    noise.loop = true;
    noise.connect(lp).connect(master);
    noise.start();
    // Click sprinkles via short envelopes on filtered white noise.
    const clickBuf = makeNoiseBuffer(ctx, "white");
    const dripTimer = window.setInterval(() => {
      const drip = ctx.createBufferSource();
      drip.buffer = clickBuf;
      const dripLP = ctx.createBiquadFilter();
      dripLP.type = "highpass"; dripLP.frequency.value = 2200;
      const dripGain = ctx.createGain();
      dripGain.gain.setValueAtTime(0.0, ctx.currentTime);
      dripGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.005);
      dripGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
      drip.connect(dripLP).connect(dripGain).connect(master);
      const start = ctx.currentTime + Math.random() * 0.05;
      drip.start(start);
      drip.stop(start + 0.08);
    }, 90);
    cleanup.push(() => { try { noise.stop(); } catch {}; window.clearInterval(dripTimer); });
  }
  else if (kind === "waves") {
    // Brown noise modulated by a slow LFO for the swell + retreat.
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, "brown");
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 800;
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    noise.connect(lp).connect(swell).connect(master);
    noise.start();
    // LFO oscillator → swell.gain so the waves rise and fall every 9 sec.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.11; // ~9 sec period
    lfoGain.gain.value = 0.45;
    lfo.connect(lfoGain).connect(swell.gain);
    lfo.start();
    cleanup.push(() => {
      try { noise.stop(); } catch {}
      try { lfo.stop(); } catch {}
    });
  }
  else if (kind === "fan") {
    // White noise low-passed to fan-blade hum.
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, "white");
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 600;
    noise.connect(lp).connect(master);
    noise.start();
    cleanup.push(() => { try { noise.stop(); } catch {} });
  }
  else if (kind === "heartbeat") {
    // Soft bass thump every ~1 sec, gentler thump 0.3s after.
    const beatTimer = window.setInterval(() => {
      const t = ctx.currentTime;
      const beat = (when: number, freq: number, amp: number, dur: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + when);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + when + dur);
        g.gain.setValueAtTime(0, t + when);
        g.gain.linearRampToValueAtTime(amp, t + when + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + when + dur);
        osc.connect(g).connect(master);
        osc.start(t + when);
        osc.stop(t + when + dur + 0.05);
      };
      beat(0, 60, 0.7, 0.18);
      beat(0.32, 55, 0.5, 0.14);
    }, 980);
    cleanup.push(() => window.clearInterval(beatTimer));
  }
  else if (kind === "bowl") {
    // Continuous singing-bowl drone — low fundamental + harmonic ring.
    const fundamentals = [110, 165, 220];
    const oscs: OscillatorNode[] = [];
    fundamentals.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      g.gain.value = i === 0 ? 0.30 : i === 1 ? 0.18 : 0.10;
      osc.connect(g).connect(master);
      osc.start();
      oscs.push(osc);
    });
    // Slow shimmer: an LFO modulates each oscillator's detune.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain);
    oscs.forEach((o) => lfoGain.connect((o as any).detune));
    lfo.start();
    cleanup.push(() => {
      oscs.forEach((o) => { try { o.stop(); } catch {} });
      try { lfo.stop(); } catch {}
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
