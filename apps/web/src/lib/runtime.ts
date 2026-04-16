/**
 * BlockForge Runtime Engine
 * 
 * Executes block programs like Scratch does:
 * - Event-driven: blocks only run when their hat block triggers
 * - Sequential: blocks in a stack run one after another
 * - Concurrent: multiple stacks can run at the same time
 * - Frame-based: "forever" and "repeat" yield each frame
 */

import type { Block, Sprite } from "@scratch/shared";

/* ── Web Audio context for sound blocks ── */
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioCtx;
}

/* ── Play a MIDI note via Web Audio ── */
function playNote(midiNote: number, durationSecs: number, volume: number = 0.5, type: OscillatorType = "square") {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    // MIDI note to frequency: A4 = 69 = 440Hz
    osc.frequency.value = 440 * Math.pow(2, (midiNote - 69) / 12);
    osc.type = type;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSecs);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationSecs + 0.1);
  } catch { /* audioCtx may not be available in some environments */ }
}

/* ── Play a "pop" sound ── */
function playPop(volume: number = 0.3) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch { /* ignore */ }
}

/* ── AI helper: calls the backend AI chat endpoint ── */
async function callAI(prompt: string): Promise<string> {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        context: "Block runtime execution",
      }),
    });
    if (!res.ok) return "Sorry, I couldn't think of anything right now.";
    const data = await res.json();
    return data.content || "Hmm, let me think about that...";
  } catch {
    return "I'm having trouble connecting right now.";
  }
}

function gameSaveKey(slot: string): string {
  return `thign-game-save:${slot}`;
}

function getPlayerStatKey(name: string): string {
  return `player:${name.toLowerCase()}`;
}

function getQuestKey(name: string): string {
  return `quest:${name.toLowerCase()}`;
}

function getGameList(state: SpriteState, name: string): (number | string)[] {
  if (!state.lists[name]) state.lists[name] = [];
  return state.lists[name];
}

function ensureCounterConfig(state: SpriteState, varName: string) {
  const stepKey = `__counter_step:${varName}`;
  const baseKey = `__counter_base:${varName}`;
  if (!(stepKey in state.variables)) state.variables[stepKey] = 1;
  if (!(baseKey in state.variables)) {
    const start = Number(state.variables[varName] ?? 0);
    state.variables[baseKey] = Number.isFinite(start) ? start : 0;
  }
}

function showVariableMonitor(state: SpriteState, varName: string) {
  state.hiddenVars.add(`show:${varName}`);
  state.hiddenVars.delete(`hide:${varName}`);
}

function hideVariableMonitor(state: SpriteState, varName: string) {
  state.hiddenVars.delete(`show:${varName}`);
  state.hiddenVars.add(`hide:${varName}`);
}

function enemyCostumeSvg(type: string): string {
  const t = type.toLowerCase();
  const style =
    t.includes("drone") ? { a: "#66d9ff", b: "#2563eb", eye: "#a5f3fc", mouth: "#0ea5e9" } :
    t.includes("zombie") ? { a: "#84cc16", b: "#365314", eye: "#fef08a", mouth: "#65a30d" } :
    t.includes("bot") ? { a: "#c084fc", b: "#6d28d9", eye: "#e9d5ff", mouth: "#a855f7" } :
    { a: "#fb7185", b: "#be123c", eye: "#fecdd3", mouth: "#f43f5e" };
  const safe = type.replace(/[^a-z0-9\s_-]/gi, "").slice(0, 14);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${style.a}"/>
          <stop offset="100%" stop-color="${style.b}"/>
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="34" fill="url(#g)"/>
      <circle cx="37" cy="42" r="8" fill="${style.eye}"/>
      <circle cx="59" cy="42" r="8" fill="${style.eye}"/>
      <circle cx="37" cy="42" r="3" fill="#0b1020"/>
      <circle cx="59" cy="42" r="3" fill="#0b1020"/>
      <rect x="34" y="58" width="28" height="6" rx="3" fill="${style.mouth}"/>
      <text x="50%" y="84" text-anchor="middle" font-size="10" font-family="Arial" fill="white">${safe}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function spawnEnemySprite(
  engine: RuntimeEngine,
  sprites: Sprite[],
  type: string,
  x: number,
  y: number,
  spawnMessage: string,
  targetName: string
) {
  const id = `enemy_${Math.random().toString(36).slice(2, 9)}`;
  const label = `${type}-${String(Number(engine.globalVariables["enemy_count"] ?? 1))}`;
  const hatId = `b_${Math.random().toString(36).slice(2, 11)}`;
  const loopId = `b_${Math.random().toString(36).slice(2, 11)}`;
  const glideId = `b_${Math.random().toString(36).slice(2, 11)}`;
  const enemy: Sprite = {
    id,
    name: label,
    x,
    y,
    rotation: 90,
    scale: 0.9,
    costumeIndex: 0,
    costumes: [{ id: `${id}_costume`, name: `${type}-costume`, url: enemyCostumeSvg(type), type: "image" }],
    sounds: [],
    visible: true,
    blocks: [
      {
        id: hatId,
        type: "event_whenbroadcastreceived",
        category: "events",
        inputs: { MESSAGE: { type: "value", value: spawnMessage } },
      },
      {
        id: loopId,
        type: "control_forever",
        category: "control",
        inputs: {},
        parent: hatId,
      },
      {
        id: glideId,
        type: "motion_glidetosprite",
        category: "motion",
        inputs: {
          SECS: { type: "value", value: 0.25 },
          TARGET: { type: "value", value: targetName },
        },
        parent: loopId,
      },
    ],
  };

  sprites.push(enemy);
  engine.sprites.set(enemy.id, createSpriteState(enemy));
}

/* ── Sprite runtime state ── */
export interface SpriteState {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  rotationStyle: "all around" | "left-right" | "don't rotate";
  visible: boolean;
  sayText: string;
  sayTimer: number;
  thinkText: string;
  penDown: boolean;
  penColor: string;
  penSize: number;
  opacity: number;
  variables: Record<string, number | string>;
  lists: Record<string, (number | string)[]>;
  costumeIndex: number;
  volume: number;
  tempo: number;
  instrument: number;
  pan: number;
  pitch: number;
  effects: Record<string, number>;
  layer: number;
  dragging: boolean;
  asking: boolean;
  hiddenVars: Set<string>;
  vx: number;
  vy: number;
  gravity: number;
  friction: number;
  drag: number;
  mass: number;
  bouncy: number;
  counter: number;
}

export interface RuntimeEngine {
  sprites: Map<string, SpriteState>;
  threads: Thread[];
  running: boolean;
  stageWidth: number;
  stageHeight: number;
  timer: number;
  globalVariables: Record<string, number | string>;
  broadcasts: Set<string>;
  keysPressed: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  answer: string;
  askingSprite: string | null;
  askQuestion: string;
  stampImages: { x: number; y: number; size: number; costumeUrl: string; color: string; rotation: number }[];
  penLines: { x1: number; y1: number; x2: number; y2: number; color: string; width: number }[];
  stageClicks: number;
  firedHats: Set<string>;
  backdropName: string;
}

interface Thread {
  spriteId: string;
  blocks: Block[];
  blockMap: Map<string, Block>;
  pc: number; // program counter - index in execution order
  execList: string[]; // ordered list of block ids to execute
  waiting: number; // seconds left to wait
  done: boolean;
  loopStack: { blockId: string; count: number; max: number; returnPc: number }[];
  glide: { startX: number; startY: number; targetX: number; targetY: number; totalTime: number; elapsed: number } | null;
}

/* ── Create initial state for a sprite ── */
export function createSpriteState(sprite: Sprite): SpriteState {
  const isEnvironmentLayer = sprite.id.startsWith("env_");
  return {
    x: sprite.x,
    y: sprite.y,
    rotation: sprite.rotation,
    scale: sprite.scale,
    rotationStyle: isEnvironmentLayer ? "don't rotate" : "all around",
    visible: sprite.visible,
    sayText: "",
    sayTimer: 0,
    thinkText: "",
    penDown: false,
    penColor: "#4C97FF",
    penSize: 2,
    opacity: 1,
    variables: {},
    lists: {},
    costumeIndex: sprite.costumeIndex,
    volume: 100,
    tempo: 120,
    instrument: 1,
    pan: 0,
    pitch: 0,
    effects: {},
    layer: 0,
    dragging: false,
    asking: false,
    hiddenVars: new Set(),
    vx: 0,
    vy: 0,
    gravity: 0,
    friction: 0,
    drag: 0,
    mass: 1,
    bouncy: 0.5,
    counter: 0,
  };
}
/* ── Create the runtime engine ── */
export function createRuntime(sprites: Sprite[], stageWidth: number, stageHeight: number): RuntimeEngine {
  const engine: RuntimeEngine = {
    sprites: new Map(),
    threads: [],
    running: false,
    stageWidth,
    stageHeight,
    timer: 0,
    globalVariables: {},
    broadcasts: new Set(),
    keysPressed: new Set(),
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    answer: "",
    askingSprite: null,
    askQuestion: "",
    stampImages: [],
    penLines: [],
    stageClicks: 0,
    firedHats: new Set(),
    backdropName: "backdrop1",
  };

  for (const sprite of sprites) {
    engine.sprites.set(sprite.id, createSpriteState(sprite));
  }

  return engine;
}

/* ── Build execution order from a root block ── */
function buildExecList(rootId: string, blockMap: Map<string, Block>, claimed: Set<string>): string[] {
  const list: string[] = [rootId];
  claimed.add(rootId);

  // 1. Follow explicit parent-child links
  const children = [...blockMap.values()].filter(
    b => b.parent === rootId && !claimed.has(b.id)
  );
  children.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

  if (children.length > 0) {
    for (const child of children) {
      list.push(...buildExecList(child.id, blockMap, claimed));
    }
  } else {
    // 2. Spatial proximity fallback: find the closest unlinked block below
    const root = blockMap.get(rootId);
    if (root) {
      const cx = root.x ?? 0;
      const cy = root.y ?? 0;
      const nearby = [...blockMap.values()]
        .filter(b => {
          if (claimed.has(b.id) || b.parent) return false;
          // Don't grab hat/event blocks into another chain
          if (b.type.startsWith("event_")) return false;
          const bx = b.x ?? 0;
          const by = b.y ?? 0;
          return Math.abs(bx - cx) < 100 && by > cy + 5 && by < cy + 80;
        })
        .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
      if (nearby.length > 0) {
        list.push(...buildExecList(nearby[0].id, blockMap, claimed));
      }
    }
  }

  return list;
}

function launchHatThread(engine: RuntimeEngine, sprite: Sprite, hat: Block) {
  const blockMap = new Map<string, Block>();
  for (const b of sprite.blocks) blockMap.set(b.id, b);
  const claimed = new Set<string>();
  const execList = buildExecList(hat.id, blockMap, claimed);
  engine.threads.push({
    spriteId: sprite.id,
    blocks: sprite.blocks,
    blockMap,
    pc: 1,
    execList,
    waiting: 0,
    done: execList.length <= 1,
    loopStack: [], glide: null,
  });
}

/* ── Start green flag threads ── */
export function startGreenFlag(engine: RuntimeEngine, sprites: Sprite[]) {
  engine.threads = [];
  engine.timer = 0;
  engine.penLines = [];
  engine.running = true;
  engine.stageClicks = 0;
  engine.firedHats.clear();
  engine.backdropName = String(engine.globalVariables["stage_backdrop_name"] ?? "backdrop1");

  // Reset sprite states
  for (const sprite of sprites) {
    engine.sprites.set(sprite.id, createSpriteState(sprite));
  }

  for (const sprite of sprites) {
    // Find all green flag hat blocks
    const initialHats = sprite.blocks.filter(b => b.type === "event_whenflagclicked" || b.type === "event_whenscenestart");
    for (const hat of initialHats) launchHatThread(engine, sprite, hat);
  }
}

/* ── Start threads for a key press event ── */
export function triggerKeyPress(engine: RuntimeEngine, sprites: Sprite[], key: string) {
  for (const sprite of sprites) {
    const keyBlocks = sprite.blocks.filter(b =>
      b.type === "event_whenkeypressed" &&
      String(b.inputs.KEY?.value ?? "space").toLowerCase() === key.toLowerCase()
    );

    for (const hat of keyBlocks) launchHatThread(engine, sprite, hat);
  }
}

/* ── Start threads for sprite click ── */
export function triggerSpriteClick(engine: RuntimeEngine, sprites: Sprite[], spriteId: string) {
  const sprite = sprites.find(s => s.id === spriteId);
  if (!sprite) return;

  const clickBlocks = sprite.blocks.filter(b => b.type === "event_whenthisspriteclicked");
  for (const hat of clickBlocks) launchHatThread(engine, sprite, hat);
}

/* ── Broadcast ── */
export function triggerBroadcast(engine: RuntimeEngine, sprites: Sprite[], message: string) {
  engine.broadcasts.add(message);
  for (const sprite of sprites) {
    const recvBlocks = sprite.blocks.filter(b =>
      b.type === "event_whenbroadcastreceived" &&
      String(b.inputs.MESSAGE?.value ?? "") === message
    );

    for (const hat of recvBlocks) launchHatThread(engine, sprite, hat);
  }
}

export function triggerStageClick(engine: RuntimeEngine, sprites: Sprite[]) {
  engine.stageClicks += 1;
  for (const sprite of sprites) {
    const hats = sprite.blocks.filter((b) => b.type === "event_whenstageclick");
    for (const hat of hats) launchHatThread(engine, sprite, hat);
  }
}

/* ── Resolve $variable references in inputs ──
   If a value starts with "$" it is treated as a variable reference.
   $__op → last operator/sensing result
   $score → state.variables["score"]
   $$highScore → engine.globalVariables["highScore"]
*/
let _resolveState: SpriteState | null = null;
let _resolveEngine: RuntimeEngine | null = null;
function setResolveCtx(s: SpriteState, e: RuntimeEngine) { _resolveState = s; _resolveEngine = e; }

function resolveValue(raw: any): any {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("$$") && _resolveEngine) {
    return _resolveEngine.globalVariables[raw.slice(2)] ?? raw;
  }
  if (raw.startsWith("$") && _resolveState) {
    return _resolveState.variables[raw.slice(1)] ?? raw;
  }
  return raw;
}

/* ── Get block input value ── */
function getVal(block: Block, key: string, fallback: any = 0): any {
  const raw = block.inputs[key]?.value ?? fallback;
  return resolveValue(raw);
}
function getNum(block: Block, key: string, fallback: number = 0): number {
  const raw = block.inputs[key]?.value ?? fallback;
  return Number(resolveValue(raw));
}
function getStr(block: Block, key: string, fallback: string = ""): string {
  const raw = block.inputs[key]?.value ?? fallback;
  return String(resolveValue(raw));
}
function getBool(block: Block, key: string, fallback: boolean = false): boolean {
  const raw = block.inputs[key]?.value ?? fallback;
  const v = resolveValue(raw);
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v !== "false" && v !== "0" && v !== "";
  return Boolean(v);
}

/* ── Unity bridge: send a command to the Unity WebGL stage ── */
function unityBridge(method: string, params: Record<string, unknown>): void {
  try {
    (window as any).__unityStage?.send("BlockController", method, JSON.stringify(params));
  } catch { /* Unity stage not loaded */ }
}

/* ── Evaluate a boolean condition from a block's CONDITION input ──
   The condition can be:
   - A static boolean value from block.inputs.CONDITION
   - A string like "key:space" meaning "is space pressed?"
   - A string like "touching:edge"
   - A variable name in state.variables
*/
function evalCondition(block: Block, state: SpriteState, engine: RuntimeEngine): boolean {
  const raw = block.inputs.CONDITION?.value;
  if (raw === undefined || raw === null) return false;
  if (raw === true || raw === 1 || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "false") return false;

  const str = String(raw).toLowerCase().trim();

  // Key condition: "key:space" or just "space"
  if (str.startsWith("key:")) {
    return engine.keysPressed.has(str.slice(4).trim());
  }
  // Touching condition
  if (str === "touching:edge" || str === "edge") {
    const hw = engine.stageWidth / 2;
    const hh = engine.stageHeight / 2;
    const pad = 20 * state.scale;
    return state.x > hw - pad || state.x < -hw + pad || state.y > hh - pad || state.y < -hh + pad;
  }
  if (str === "touching:mouse" || str === "mouse") {
    return Math.abs(engine.mouseX - state.x) < 20 * state.scale && Math.abs(engine.mouseY - state.y) < 20 * state.scale;
  }
  if (str === "mousedown" || str === "mouse down") {
    return engine.mouseDown;
  }
  // Variable reference
  if (str in state.variables) {
    const v = state.variables[str];
    return !!(v && v !== 0 && v !== "false" && v !== "");
  }
  // __sensing_keypressed etc
  if (str === "__sensing_key") return (state.variables["__sensing_key"] ?? 0) !== 0;
  if (str === "__sensing_touching") return (state.variables["__sensing_touching"] ?? 0) !== 0;
  if (str === "__sensing_mousedown") return (state.variables["__sensing_mousedown"] ?? 0) !== 0;

  // Numeric truthy
  const num = Number(raw);
  if (!isNaN(num)) return num !== 0;

  return !!raw;
}

function compareValues(a: number | string, op: string, b: number | string): boolean {
  const leftNum = Number(a);
  const rightNum = Number(b);
  const bothNumeric = !Number.isNaN(leftNum) && !Number.isNaN(rightNum);

  if (bothNumeric) {
    if (op === ">") return leftNum > rightNum;
    if (op === "<") return leftNum < rightNum;
    if (op === ">=") return leftNum >= rightNum;
    if (op === "<=") return leftNum <= rightNum;
    if (op === "!=") return leftNum !== rightNum;
    return leftNum === rightNum;
  }

  const leftStr = String(a);
  const rightStr = String(b);
  if (op === "!=") return leftStr !== rightStr;
  if (op === ">") return leftStr > rightStr;
  if (op === "<") return leftStr < rightStr;
  if (op === ">=") return leftStr >= rightStr;
  if (op === "<=") return leftStr <= rightStr;
  return leftStr === rightStr;
}

function isTouchingTarget(engine: RuntimeEngine, state: SpriteState, sprites: Sprite[], selfSpriteId: string, target: string): boolean {
  const normalized = target.toLowerCase();
  const hw = engine.stageWidth / 2;
  const hh = engine.stageHeight / 2;
  const pad = 20 * state.scale;

  if (normalized === "edge" || normalized === "wall") {
    return state.x > hw - pad || state.x < -hw + pad || state.y > hh - pad || state.y < -hh + pad;
  }

  if (normalized === "mouse") {
    return Math.abs(engine.mouseX - state.x) < pad && Math.abs(engine.mouseY - state.y) < pad;
  }

  return sprites.some((other) => {
    if (other.id === selfSpriteId) return false;
    if (normalized !== "any" && other.name.toLowerCase() !== normalized) return false;
    const otherState = engine.sprites.get(other.id);
    if (!otherState) return false;
    const otherPad = 20 * otherState.scale;
    return Math.abs(otherState.x - state.x) < (pad + otherPad) * 0.6 && Math.abs(otherState.y - state.y) < (pad + otherPad) * 0.6;
  });
}

/* ── Step one frame of the runtime ── */
export function stepRuntime(engine: RuntimeEngine, sprites: Sprite[], dt: number) {
  if (!engine.running) return;

  engine.timer += dt;

  for (const [, state] of engine.sprites) {
    state.counter += 1;
    if (state.gravity || state.vx || state.vy) {
      state.vy -= state.gravity * dt;
      state.vx *= Math.max(0, 1 - state.drag * dt);
      state.vy *= Math.max(0, 1 - state.drag * dt);
      state.x += state.vx;
      state.y += state.vy;
      state.vx *= Math.max(0, 1 - state.friction * dt);
      const halfW = engine.stageWidth / 2 - 20;
      const halfH = engine.stageHeight / 2 - 20;
      if (state.x > halfW || state.x < -halfW) state.vx *= -(state.bouncy || 0.5);
      if (state.y > halfH || state.y < -halfH) state.vy *= -(state.bouncy || 0.5);
    }
    const spin = Number(state.effects["__spin"] || 0);
    if (spin) state.rotation += spin * dt;

    // Wobble effect
    const wobble = Number(state.effects["__wobble"] || 0);
    if (wobble) {
      state.rotation += Math.sin(engine.timer * 8) * wobble * dt * 2;
    }

    // Orbit effect
    const orbitR = Number(state.effects["__orbit_r"] || 0);
    if (orbitR > 0) {
      const cx = Number(state.effects["__orbit_cx"] || 0);
      const cy = Number(state.effects["__orbit_cy"] || 0);
      const spd = Number(state.effects["__orbit_spd"] || 2);
      state.x = cx + Math.cos(engine.timer * spd) * orbitR;
      state.y = cy + Math.sin(engine.timer * spd) * orbitR;
    }

    // Bounce animation effect
    const bounceH = Number(state.effects["__bounce_height"] || 0);
    if (bounceH > 0) {
      const bounceStart = Number(state.effects["__bounce_start"] || 0);
      const elapsed = engine.timer - bounceStart;
      const totalBounces = Number(state.effects["__bounce_times"] || 3);
      const bounceDuration = totalBounces * 0.3;
      if (elapsed < bounceDuration) {
        const phase = (elapsed / 0.3) * Math.PI;
        state.y += Math.abs(Math.sin(phase)) * bounceH * dt * 4;
      } else {
        state.effects["__bounce_height"] = 0;
      }
    }

    // Trail effect - stamp location each frame
    if (state.effects["__trail"]) {
      const costumeDef = sprites.find(s => {
        const ss = engine.sprites.get(s.id);
        return ss === state;
      });
      const costumeUrl = costumeDef?.costumes?.[state.costumeIndex]?.url ?? "";
      if (costumeUrl) {
        engine.stampImages.push({ x: state.x, y: state.y, size: 40 * state.scale * 0.7, costumeUrl, color: state.penColor, rotation: state.rotation });
      }
    }

    // Rainbow pen auto-cycle
    const rainbowSpeed = Number(state.variables["__pen_rainbow_speed"] || 0);
    if (rainbowSpeed > 0) {
      const hue = (state.counter * rainbowSpeed) % 360;
      state.penColor = `hsl(${hue}, 100%, 50%)`;
    }
  }

  for (const sprite of sprites) {
    const state = engine.sprites.get(sprite.id);
    if (!state) continue;
    for (const block of sprite.blocks) {
      if (engine.firedHats.has(block.id)) continue;
      if (block.type === "event_whentimer" && engine.timer >= getNum(block, "SECS", 1)) {
        launchHatThread(engine, sprite, block);
        engine.firedHats.add(block.id);
      }
      if (block.type === "event_whenloudness" && 0 >= getNum(block, "VOL", 50)) {
        launchHatThread(engine, sprite, block);
        engine.firedHats.add(block.id);
      }
      if (block.type === "event_whenvariable") {
        const varName = getStr(block, "VAR", "score");
        const value = Number(state.variables[varName] ?? engine.globalVariables[varName] ?? 0);
        if (value > getNum(block, "VAL", 100)) {
          launchHatThread(engine, sprite, block);
          engine.firedHats.add(block.id);
        }
      }
      if (block.type === "physics_collision") {
        const target = getStr(block, "SPRITE", "any");
        const collided = sprites.some((other) => {
          if (other.id === sprite.id) return false;
          if (target !== "any" && other.name !== target) return false;
          const otherState = engine.sprites.get(other.id);
          if (!otherState) return false;
          return Math.abs(otherState.x - state.x) < 30 && Math.abs(otherState.y - state.y) < 30;
        });
        if (collided) {
          launchHatThread(engine, sprite, block);
          engine.firedHats.add(block.id);
        }
      }
    }
  }

  // Fire backdrop-switch hats when backdrop name changes.
  const currentBackdrop = String(engine.globalVariables["stage_backdrop_name"] ?? engine.backdropName ?? "backdrop1");
  if (currentBackdrop !== engine.backdropName) {
    engine.backdropName = currentBackdrop;
    for (const sprite of sprites) {
      const hats = sprite.blocks.filter((b) => b.type === "event_whenbackdropswitches");
      for (const hat of hats) {
        const wanted = String(
          hat.inputs.NAME?.value ?? hat.inputs.BACKDROP?.value ?? ""
        ).trim().toLowerCase();
        if (!wanted || wanted === "any" || wanted === currentBackdrop.toLowerCase()) {
          launchHatThread(engine, sprite, hat);
        }
      }
    }
  }

  // Tick down say timers
  for (const [_, state] of engine.sprites) {
    if (state.sayTimer > 0) {
      state.sayTimer -= dt;
      if (state.sayTimer <= 0) {
        state.sayText = "";
        state.sayTimer = 0;
      }
    }
  }

  // Execute each thread
  const pendingBroadcasts: string[] = [];

  for (const thread of engine.threads) {
    if (thread.done) continue;

    // Handle waiting
    if (thread.waiting > 0) {
      thread.waiting -= dt;
      // Handle smooth glide during wait
      if (thread.glide) {
        const g = thread.glide;
        const state2 = engine.sprites.get(thread.spriteId);
        if (state2) {
          const oldGx = state2.x, oldGy = state2.y;
          g.elapsed += dt;
          const progress = Math.min(1, g.elapsed / g.totalTime);
          state2.x = g.startX + (g.targetX - g.startX) * progress;
          state2.y = g.startY + (g.targetY - g.startY) * progress;
          if (state2.penDown) {
            engine.penLines.push({ x1: oldGx, y1: oldGy, x2: state2.x, y2: state2.y, color: state2.penColor, width: state2.penSize });
          }
          if (progress >= 1) thread.glide = null;
        }
      }
      if (thread.waiting > 0) continue;
      thread.waiting = 0;
      thread.glide = null;
      thread.pc++;
      if (thread.pc >= thread.execList.length) {
        // Check loop stack
        if (thread.loopStack.length > 0) {
          const loop = thread.loopStack[thread.loopStack.length - 1];
          loop.count++;
          if (loop.max === -1 || loop.count < loop.max) {
            thread.pc = loop.returnPc;
          } else {
            thread.loopStack.pop();
          }
        } else {
          thread.done = true;
        }
        continue;
      }
    }

    // Execute multiple blocks per frame (up to a limit to prevent infinite loops)
    let blocksThisFrame = 0;
    const MAX_BLOCKS_PER_FRAME = 200;

    while (!thread.done && thread.waiting <= 0 && blocksThisFrame < MAX_BLOCKS_PER_FRAME) {
      if (thread.pc >= thread.execList.length) {
        // Check loop stack
        if (thread.loopStack.length > 0) {
          const loop = thread.loopStack[thread.loopStack.length - 1];
          loop.count++;
          if (loop.max === -1 || loop.count < loop.max) {
            thread.pc = loop.returnPc;
            if (loop.max === -1) break; // forever loops yield each frame
            continue;
          } else {
            thread.loopStack.pop();
            if (thread.loopStack.length === 0 && thread.pc >= thread.execList.length) {
              thread.done = true;
            }
            continue;
          }
        } else {
          thread.done = true;
          break;
        }
      }

      const blockId = thread.execList[thread.pc];
      const block = thread.blockMap.get(blockId);
      if (!block) { thread.pc++; blocksThisFrame++; continue; }

      const state = engine.sprites.get(thread.spriteId);
      if (!state) { thread.done = true; break; }
      setResolveCtx(state, engine);
      const spriteDef = sprites.find((s) => s.id === thread.spriteId);

      blocksThisFrame++;

      /* helper: draw pen line if penDown after a move */
      const penMove = (oldX: number, oldY: number) => {
        if (state.penDown) {
          engine.penLines.push({ x1: oldX, y1: oldY, x2: state.x, y2: state.y, color: state.penColor, width: state.penSize });
        }
      };

      switch (block.type) {
        /* ── Motion ── */
        case "motion_movesteps": {
          const steps = getNum(block, "STEPS", 10);
          const rad = ((state.rotation - 90) * Math.PI) / 180;
          const oldX = state.x, oldY = state.y;
          state.x += Math.cos(rad) * steps;
          state.y += Math.sin(rad) * steps;
          penMove(oldX, oldY);
          thread.pc++;
          break;
        }
        case "motion_turnright":
          state.rotation += getNum(block, "DEGREES", 15);
          thread.pc++;
          break;
        case "motion_turnleft":
          state.rotation -= getNum(block, "DEGREES", 15);
          thread.pc++;
          break;
        case "motion_gotoxy": {
          const oldX2 = state.x, oldY2 = state.y;
          state.x = getNum(block, "X", 0);
          state.y = getNum(block, "Y", 0);
          penMove(oldX2, oldY2);
          thread.pc++;
          break;
        }
        case "motion_glideto": {
          const secs = getNum(block, "SECS", 1);
          thread.glide = {
            startX: state.x, startY: state.y,
            targetX: getNum(block, "X", 0),
            targetY: getNum(block, "Y", 0),
            totalTime: secs,
            elapsed: 0,
          };
          thread.waiting = secs;
          break;
        }
        case "motion_changex": {
          const oldXc = state.x;
          state.x += getNum(block, "DX", 10);
          penMove(oldXc, state.y);
          thread.pc++;
          break;
        }
        case "motion_changey": {
          const oldYc = state.y;
          state.y += getNum(block, "DY", 10);
          penMove(state.x, oldYc);
          thread.pc++;
          break;
        }
        case "motion_setx": {
          const oldXs = state.x;
          state.x = getNum(block, "X", 0);
          penMove(oldXs, state.y);
          thread.pc++;
          break;
        }
        case "motion_sety": {
          const oldYs = state.y;
          state.y = getNum(block, "Y", 0);
          penMove(state.x, oldYs);
          thread.pc++;
          break;
        }
        case "motion_pointindirection":
          state.rotation = getNum(block, "DIR", 90);
          thread.pc++;
          break;
        case "motion_pointtowards": {
          const target = getStr(block, "TARGET", "mouse");
          if (target === "mouse") {
            const dx = engine.mouseX - state.x;
            const dy = engine.mouseY - state.y;
            state.rotation = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
          }
          thread.pc++;
          break;
        }
        case "motion_gotorandom":
          state.x = (Math.random() - 0.5) * engine.stageWidth;
          state.y = (Math.random() - 0.5) * engine.stageHeight;
          thread.pc++;
          break;
        case "motion_setrotationstyle":
          state.rotationStyle = getStr(block, "STYLE", "all around") as SpriteState["rotationStyle"];
          thread.pc++;
          break;
        case "motion_glidetosprite": {
          const target = getStr(block, "TARGET", "mouse");
          const secs = getNum(block, "SECS", 1);
          let targetX = engine.mouseX;
          let targetY = engine.mouseY;
          const targetSprite = sprites.find((s) => s.name === target || s.id === target);
          const targetState = targetSprite ? engine.sprites.get(targetSprite.id) : null;
          if (targetState) {
            targetX = targetState.x;
            targetY = targetState.y;
          }
          thread.glide = { startX: state.x, startY: state.y, targetX, targetY, totalTime: secs, elapsed: 0 };
          thread.waiting = secs;
          break;
        }
        case "motion_gotosprite": {
          const target = getStr(block, "TARGET", "mouse");
          const targetSprite = sprites.find((s) => s.name === target || s.id === target);
          const targetState = targetSprite ? engine.sprites.get(targetSprite.id) : null;
          const oldX = state.x;
          const oldY = state.y;
          state.x = targetState?.x ?? engine.mouseX;
          state.y = targetState?.y ?? engine.mouseY;
          penMove(oldX, oldY);
          thread.pc++;
          break;
        }
        case "motion_bounceonedge": {
          const halfW = engine.stageWidth / 2 - 20;
          const halfH = engine.stageHeight / 2 - 20;
          if (state.x > halfW) { state.x = halfW; state.rotation = 180 - state.rotation; }
          if (state.x < -halfW) { state.x = -halfW; state.rotation = 180 - state.rotation; }
          if (state.y > halfH) { state.y = halfH; state.rotation = -state.rotation; }
          if (state.y < -halfH) { state.y = -halfH; state.rotation = -state.rotation; }
          thread.pc++;
          break;
        }
        case "motion_xposition":
          state.variables["__op"] = state.x;
          thread.pc++;
          break;
        case "motion_yposition":
          state.variables["__op"] = state.y;
          thread.pc++;
          break;
        case "motion_direction":
          state.variables["__op"] = state.rotation;
          thread.pc++;
          break;
        case "motion_speed":
          state.variables["__op"] = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
          thread.pc++;
          break;

        /* ── Block / Grid movement ── */
        case "motion_setgridsize":
          engine.globalVariables["__grid_size"] = getNum(block, "SIZE", 40);
          thread.pc++;
          break;
        case "motion_snapgrid": {
          const gs = Number(engine.globalVariables["__grid_size"] || 40);
          state.x = Math.round(state.x / gs) * gs;
          state.y = Math.round(state.y / gs) * gs;
          thread.pc++;
          break;
        }
        case "motion_movegrid": {
          const gs2 = Number(engine.globalVariables["__grid_size"] || 40);
          const steps = getNum(block, "STEPS", 1);
          const rad = ((state.rotation - 90) * Math.PI) / 180;
          state.x = Math.round((state.x + Math.cos(rad) * gs2 * steps) / gs2) * gs2;
          state.y = Math.round((state.y + Math.sin(rad) * gs2 * steps) / gs2) * gs2;
          thread.pc++;
          break;
        }
        case "motion_movegridup": {
          const gs3 = Number(engine.globalVariables["__grid_size"] || 40);
          state.y = Math.round((state.y + gs3 * getNum(block, "STEPS", 1)) / gs3) * gs3;
          thread.pc++;
          break;
        }
        case "motion_movegriddown": {
          const gs4 = Number(engine.globalVariables["__grid_size"] || 40);
          state.y = Math.round((state.y - gs4 * getNum(block, "STEPS", 1)) / gs4) * gs4;
          thread.pc++;
          break;
        }
        case "motion_movegridleft": {
          const gs5 = Number(engine.globalVariables["__grid_size"] || 40);
          state.x = Math.round((state.x - gs5 * getNum(block, "STEPS", 1)) / gs5) * gs5;
          thread.pc++;
          break;
        }
        case "motion_movegridright": {
          const gs6 = Number(engine.globalVariables["__grid_size"] || 40);
          state.x = Math.round((state.x + gs6 * getNum(block, "STEPS", 1)) / gs6) * gs6;
          thread.pc++;
          break;
        }
        case "motion_firstperson":
          engine.globalVariables["__firstperson_sprite"] = getBool(block, "ON", true) ? thread.spriteId : "";
          thread.pc++;
          break;
        case "motion_setfov":
          engine.globalVariables["__firstperson_fov"] = getNum(block, "FOV", 90);
          thread.pc++;
          break;

        /* ── Looks named effect shortcuts ── */
        case "effect_setcolor":
          state.effects["color"] = getNum(block, "VALUE", 25);
          thread.pc++;
          break;
        case "effect_setfisheye":
          state.effects["fisheye"] = getNum(block, "VALUE", 50);
          thread.pc++;
          break;
        case "effect_setwhirl":
          state.effects["whirl"] = getNum(block, "VALUE", 60);
          thread.pc++;
          break;
        case "effect_setmosaic":
          state.effects["mosaic"] = getNum(block, "VALUE", 50);
          thread.pc++;
          break;
        case "effect_setpixelate":
          state.effects["pixelate"] = getNum(block, "VALUE", 10);
          thread.pc++;
          break;
        case "effect_setghost":
          state.effects["ghost"] = getNum(block, "VALUE", 50);
          thread.pc++;
          break;
        case "effect_setbrightness":
          state.effects["brightness"] = getNum(block, "VALUE", 30);
          thread.pc++;
          break;

        /* ── Looks ── */
        case "looks_say":
          state.sayText = getStr(block, "MESSAGE", "Hello!");
          state.sayTimer = 0; // stays until cleared
          thread.pc++;
          break;
        case "looks_sayforsecs":
          state.sayText = getStr(block, "MESSAGE", "Hmm...");
          state.sayTimer = getNum(block, "SECS", 2);
          thread.waiting = getNum(block, "SECS", 2);
          break;
        case "looks_think":
          state.thinkText = getStr(block, "MESSAGE", "Hmm...");
          state.sayText = "💭 " + getStr(block, "MESSAGE", "Hmm...");
          thread.pc++;
          break;
        case "looks_show":
          state.visible = true;
          thread.pc++;
          break;
        case "looks_hide":
          state.visible = false;
          thread.pc++;
          break;
        case "looks_setsize":
          state.scale = getNum(block, "SIZE", 100) / 100;
          thread.pc++;
          break;
        case "looks_changesize":
          state.scale += getNum(block, "CHANGE", 10) / 100;
          thread.pc++;
          break;
        case "looks_cleareffects":
          state.effects = {};
          thread.pc++;
          break;
        case "looks_seteffect":
          state.effects[getStr(block, "EFFECT", "color")] = getNum(block, "VALUE", 25);
          thread.pc++;
          break;
        case "looks_nextcostume": {
          const count = Math.max(1, spriteDef?.costumes?.length ?? 1);
          state.costumeIndex = (state.costumeIndex + 1) % count;
          thread.pc++;
          break;
        }
        case "looks_prevcostume": {
          const count = Math.max(1, spriteDef?.costumes?.length ?? 1);
          state.costumeIndex = (state.costumeIndex - 1 + count) % count;
          thread.pc++;
          break;
        }
        case "looks_setcostume": {
          const costumeName = getStr(block, "NAME", "");
          const costumes = spriteDef?.costumes ?? [];
          const byName = costumes.findIndex((c) => c.name.toLowerCase() === costumeName.toLowerCase());
          if (byName >= 0) state.costumeIndex = byName;
          else {
            const n = Number(costumeName);
            if (Number.isFinite(n) && n >= 1) {
              state.costumeIndex = Math.max(0, Math.min(costumes.length - 1, Math.floor(n) - 1));
            }
          }
          thread.pc++;
          break;
        }
        case "looks_goforward":
          state.layer = 9999;
          thread.pc++;
          break;
        case "looks_goback":
          state.layer = Math.max(0, state.layer - getNum(block, "N", 1));
          thread.pc++;
          break;
        case "looks_setcolor":
          state.penColor = getStr(block, "COLOR", "#ff6600");
          thread.pc++;
          break;
        case "looks_setopacity":
          state.opacity = Math.max(0, Math.min(100, getNum(block, "PCT", 100))) / 100;
          thread.pc++;
          break;
        case "looks_changeopacity":
          state.opacity = Math.max(0, Math.min(1, state.opacity + getNum(block, "PCT", -10) / 100));
          thread.pc++;
          break;
        case "looks_setbackdrop": {
          const rawBackdrop = String(getVal(block, "BACKDROP", getVal(block, "NAME", "backdrop1"))).trim();
          const value = rawBackdrop || "backdrop1";
          engine.globalVariables["stage_backdrop_name"] = value;
          if (value.startsWith("#")) {
            engine.globalVariables["stage_backdrop_color"] = value;
            delete engine.globalVariables["stage_backdrop_image"];
          } else if (/^(data:image\/|https?:\/\/|\/)/i.test(value)) {
            engine.globalVariables["stage_backdrop_image"] = value;
          } else {
            delete engine.globalVariables["stage_backdrop_image"];
          }
          thread.pc++;
          break;
        }
        case "looks_setbackdropcolor": {
          const color = getStr(block, "COLOR", "#0a0a1a");
          engine.globalVariables["stage_backdrop_color"] = color;
          thread.pc++;
          break;
        }
        case "looks_setbackdropimage": {
          const url = getStr(block, "URL", "").trim();
          if (url) {
            engine.globalVariables["stage_backdrop_image"] = url;
          }
          thread.pc++;
          break;
        }
        case "looks_clearbackdrop": {
          delete engine.globalVariables["stage_backdrop_image"];
          thread.pc++;
          break;
        }
        case "looks_thinkforsecs":
          state.thinkText = getStr(block, "MESSAGE", "Hmm...");
          state.sayText = "💭 " + getStr(block, "MESSAGE", "Hmm...");
          state.sayTimer = getNum(block, "SECS", 2);
          thread.waiting = getNum(block, "SECS", 2);
          break;
        case "looks_changeeffect":
          state.effects[getStr(block, "EFFECT", "color")] =
            (state.effects[getStr(block, "EFFECT", "color")] || 0) + getNum(block, "VALUE", 25);
          thread.pc++;
          break;
        case "looks_costumename":
          state.variables["__op"] = spriteDef?.costumes?.[state.costumeIndex]?.name ?? "costume";
          thread.pc++;
          break;
        case "looks_costumenumber":
          state.variables["__op"] = state.costumeIndex + 1;
          thread.pc++;
          break;
        case "looks_size":
          state.variables["__op"] = Math.round(state.scale * 100);
          thread.pc++;
          break;

        /* ── Sound ── */
        case "sound_play":
        case "sound_playuntildone":
          playPop(state.volume / 200);
          if (block.type === "sound_playuntildone") thread.waiting = 0.08;
          else thread.pc++;
          break;
        case "sound_stop":
          thread.pc++;
          break;
        case "sound_setvolume":
          state.volume = Math.max(0, Math.min(100, getNum(block, "VOLUME", 100)));
          thread.pc++;
          break;
        case "sound_changevolume":
          state.volume = Math.max(0, Math.min(100, state.volume + getNum(block, "VOL", -10)));
          thread.pc++;
          break;
        case "sound_playnote": {
          const note = getNum(block, "NOTE", 60);
          const beats = getNum(block, "BEATS", 0.5);
          const secPerBeat = 60 / (state.tempo || 120);
          const dur = beats * secPerBeat;
          playNote(note, dur, state.volume / 200);
          thread.waiting = dur;
          break;
        }
        case "sound_playdrum": {
          const beats2 = getNum(block, "BEATS", 0.25);
          const secPerBeat2 = 60 / (state.tempo || 120);
          playNote(36, beats2 * secPerBeat2, state.volume / 200, "sawtooth");
          thread.waiting = beats2 * secPerBeat2;
          break;
        }
        case "sound_rest": {
          const beats3 = getNum(block, "BEATS", 0.25);
          thread.waiting = beats3 * (60 / (state.tempo || 120));
          break;
        }
        case "sound_settempo":
          state.tempo = Math.max(20, Math.min(500, getNum(block, "BPM", 120)));
          thread.pc++;
          break;
        case "sound_changetempo":
          state.tempo = Math.max(20, Math.min(500, (state.tempo || 120) + getNum(block, "BPM", 20)));
          thread.pc++;
          break;
        case "sound_setinstrument":
          state.instrument = Math.max(1, Math.min(21, getNum(block, "INST", 1)));
          thread.pc++;
          break;
        case "sound_setpitch":
          state.pitch = getNum(block, "PITCH", 0);
          thread.pc++;
          break;
        case "sound_changepitch":
          state.pitch += getNum(block, "PITCH", 10);
          thread.pc++;
          break;
        case "sound_setpan":
          state.pan = Math.max(-100, Math.min(100, getNum(block, "PAN", 0)));
          thread.pc++;
          break;
        case "sound_volume":
          state.variables["__op"] = state.volume;
          thread.pc++;
          break;
        case "sound_tempo":
          state.variables["__op"] = state.tempo;
          thread.pc++;
          break;
        /* ── Sound choices ── */
        case "sound_playnamed": {
          const snd = getStr(block, "NAME", "laser").toLowerCase();
          const vol = state.volume / 100;
          const sndDefs: Record<string, () => void> = {
            pop: () => playPop(vol),
            laser: () => { playNote(90, 0.1, vol, "sawtooth"); setTimeout(() => playNote(60, 0.15, vol * 0.7, "sawtooth"), 50); },
            bell: () => { playNote(72, 0.8, vol, "sine"); playNote(79, 0.6, vol * 0.5, "sine"); },
            coin: () => { playNote(80, 0.08, vol, "square"); setTimeout(() => playNote(84, 0.12, vol, "square"), 60); },
            jump: () => { const ctx = getAudioCtx(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.setValueAtTime(200, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15); o.type = "square"; g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); o.start(); o.stop(ctx.currentTime + 0.25); },
            explosion: () => { const ctx = getAudioCtx(); const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); const s = ctx.createBufferSource(); const g = ctx.createGain(); s.buffer = buf; s.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(vol, ctx.currentTime); s.start(); },
            click: () => playNote(100, 0.02, vol * 0.4, "square"),
            powerup: () => { [72, 76, 79, 84].forEach((n, i) => setTimeout(() => playNote(n, 0.15, vol * 0.6, "square"), i * 60)); },
            hit: () => { playNote(40, 0.15, vol, "sawtooth"); const ctx = getAudioCtx(); const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3; const s = ctx.createBufferSource(); const g = ctx.createGain(); s.buffer = buf; s.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(vol * 0.5, ctx.currentTime); s.start(); },
            whoosh: () => { const ctx = getAudioCtx(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.setValueAtTime(800, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3); o.type = "sine"; g.gain.setValueAtTime(vol * 0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); o.start(); o.stop(ctx.currentTime + 0.35); },
            // — Additional sound assets —
            collect: () => { [76, 79, 84].forEach((n, i) => setTimeout(() => playNote(n, 0.1, vol * 0.7, "sine"), i * 40)); },
            door: () => { const ctx = getAudioCtx(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.setValueAtTime(220, ctx.currentTime); o.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.3); o.type = "triangle"; g.gain.setValueAtTime(vol * 0.5, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); o.start(); o.stop(ctx.currentTime + 0.55); },
            teleport: () => { [96, 100, 104, 108].forEach((n, i) => setTimeout(() => playNote(n, 0.06, vol * 0.5, "sine"), i * 25)); setTimeout(() => { const ctx2 = getAudioCtx(); const o2 = ctx2.createOscillator(); const g2 = ctx2.createGain(); o2.connect(g2); g2.connect(ctx2.destination); o2.frequency.setValueAtTime(4000, ctx2.currentTime); o2.frequency.exponentialRampToValueAtTime(100, ctx2.currentTime + 0.4); o2.type = "sine"; g2.gain.setValueAtTime(vol * 0.2, ctx2.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.4); o2.start(); o2.stop(ctx2.currentTime + 0.45); }, 80); },
            victory: () => { [[72,76,79],[76,79,84],[79,84,88]].forEach((chord, ci) => setTimeout(() => chord.forEach(n => playNote(n, 0.4, vol * 0.4, "sine")), ci * 220)); },
            fail: () => { [52, 48, 44, 40].forEach((n, i) => setTimeout(() => playNote(n, 0.2, vol * 0.5, "sawtooth"), i * 120)); },
            bounce: () => { const ctx = getAudioCtx(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.setValueAtTime(300, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15); o.type = "sine"; g.gain.setValueAtTime(vol * 0.6, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); o.start(); o.stop(ctx.currentTime + 0.25); },
            error: () => { [44, 40].forEach((n, i) => setTimeout(() => playNote(n, 0.18, vol * 0.6, "sawtooth"), i * 100)); },
            chime: () => { [84, 88, 91, 96].forEach((n, i) => setTimeout(() => playNote(n, 0.5, vol * 0.35, "sine"), i * 100)); },
            heartbeat: () => { [0, 200].forEach(delay => setTimeout(() => { playNote(36, 0.08, vol * 0.7, "sine"); }, delay)); },
            footstep: () => { const ctx = getAudioCtx(); const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 0.5) * 0.4; const s = ctx.createBufferSource(); const gn = ctx.createGain(); s.buffer = buf; s.connect(gn); gn.connect(ctx.destination); gn.gain.setValueAtTime(vol * 0.8, ctx.currentTime); s.start(); },
          };
          (sndDefs[snd] || sndDefs.pop)();
          thread.pc++;
          break;
        }
        case "sound_playchord": {
          const notes = getStr(block, "NOTES", "60,64,67").split(",").map(Number);
          const beats = getNum(block, "BEATS", 1);
          const dur = (60 / state.tempo) * beats;
          const vol = (state.volume / 100) * 0.4;
          const waveType = (state.variables["__waveform"] as OscillatorType) || "square";
          notes.forEach((n) => { if (!isNaN(n)) playNote(n, dur, vol, waveType); });
          thread.pc++;
          break;
        }
        case "sound_setwaveform":
          state.variables["__waveform"] = getStr(block, "WAVE", "sine");
          thread.pc++;
          break;
        /* ── Music maker ── */
        case "music_playsequence": {
          const ns = getStr(block, "NOTES", "60,62,64,65,67").split(",").map(Number);
          const beatDur = 60 / state.tempo;
          const vol2 = (state.volume / 100) * 0.5;
          const wv = (state.variables["__waveform"] as OscillatorType) || "square";
          ns.forEach((n, i) => { if (!isNaN(n)) setTimeout(() => playNote(n, beatDur * 0.8, vol2, wv), i * beatDur * 1000); });
          thread.pc++;
          break;
        }
        case "music_setscale": {
          const scale = getStr(block, "SCALE", "major").toLowerCase();
          const scales: Record<string, number[]> = {
            major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10],
            pentatonic: [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10],
            chromatic: [0,1,2,3,4,5,6,7,8,9,10,11],
          };
          state.variables["__music_scale"] = JSON.stringify(scales[scale] || scales.major);
          thread.pc++;
          break;
        }
        case "music_randommelody": {
          const len = getNum(block, "LENGTH", 8);
          const scaleStr = state.variables["__music_scale"] as string;
          const sc = scaleStr ? JSON.parse(scaleStr) : [0, 2, 4, 5, 7, 9, 11];
          const beatDur2 = 60 / state.tempo;
          const vol3 = (state.volume / 100) * 0.5;
          const wv2 = (state.variables["__waveform"] as OscillatorType) || "square";
          for (let i = 0; i < len; i++) {
            const note = 60 + sc[Math.floor(Math.random() * sc.length)] + (Math.random() < 0.3 ? 12 : 0);
            setTimeout(() => playNote(note, beatDur2 * 0.7, vol3, wv2), i * beatDur2 * 1000);
          }
          thread.pc++;
          break;
        }
        case "music_setbpm":
          state.tempo = Math.max(20, Math.min(300, getNum(block, "BPM", 120)));
          thread.pc++;
          break;

        /* ── Events (non-hat) ── */
        case "event_broadcast":
          pendingBroadcasts.push(getStr(block, "MESSAGE", "go"));
          thread.pc++;
          break;
        case "event_broadcastandwait":
          pendingBroadcasts.push(getStr(block, "MESSAGE", "go"));
          thread.waiting = 0.01; // tiny wait
          break;

        /* ── Control ── */
        case "control_wait":
          thread.waiting = getNum(block, "DURATION", 1);
          break;
        case "control_repeat": {
          const times = getNum(block, "TIMES", 10);
          thread.loopStack.push({
            blockId: block.id,
            count: 0,
            max: times,
            returnPc: thread.pc + 1,
          });
          thread.pc++;
          break;
        }
        case "control_forever": {
          thread.loopStack.push({
            blockId: block.id,
            count: 0,
            max: -1, // infinite
            returnPc: thread.pc + 1,
          });
          thread.pc++;
          break;
        }
        case "control_if": {
          const cond = evalCondition(block, state, engine);
          if (!cond) {
            const children = [...thread.blockMap.values()].filter(b => b.parent === block.id);
            thread.pc += children.length + 1;
          } else {
            thread.pc++;
          }
          break;
        }
        case "control_ifelse": {
          const cond2 = evalCondition(block, state, engine);
          if (!cond2) {
            const children = [...thread.blockMap.values()].filter(b => b.parent === block.id);
            thread.pc += children.length + 1;
          } else {
            thread.pc++;
          }
          break;
        }
        case "control_ifcompare": {
          const a = getVal(block, "A", 0);
          const op = getStr(block, "OP", ">").trim();
          const b = getVal(block, "B", 0);
          const pass = compareValues(a, op, b);
          if (!pass) {
            const children = [...thread.blockMap.values()].filter((child) => child.parent === block.id);
            thread.pc += children.length + 1;
          } else {
            thread.pc++;
          }
          break;
        }
        case "control_ifkeypressed": {
          const key = getStr(block, "KEY", "space").toLowerCase();
          const pass = engine.keysPressed.has(key) || (key === "space" && engine.keysPressed.has(" "));
          if (!pass) {
            const children = [...thread.blockMap.values()].filter((child) => child.parent === block.id);
            thread.pc += children.length + 1;
          } else {
            thread.pc++;
          }
          break;
        }
        case "control_iftouching": {
          const target = getStr(block, "OBJECT", "edge");
          const pass = isTouchingTarget(engine, state, sprites, thread.spriteId, target);
          if (!pass) {
            const children = [...thread.blockMap.values()].filter((child) => child.parent === block.id);
            thread.pc += children.length + 1;
          } else {
            thread.pc++;
          }
          break;
        }
        case "control_waituntil": {
          const cond3 = evalCondition(block, state, engine);
          if (!cond3) {
            thread.waiting = 0.016; // wait one frame and retry
          } else {
            thread.pc++;
          }
          break;
        }
        case "control_repeatuntil": {
          const cond4 = evalCondition(block, state, engine);
          if (cond4) {
            // Condition met, skip body
            const children4 = [...thread.blockMap.values()].filter(b => b.parent === block.id);
            thread.pc += children4.length + 1;
            if (thread.loopStack.length > 0 && thread.loopStack[thread.loopStack.length - 1].blockId === block.id) {
              thread.loopStack.pop();
            }
          } else {
            thread.loopStack.push({
              blockId: block.id,
              count: 0,
              max: -1,
              returnPc: thread.pc,
            });
            thread.pc++;
          }
          break;
        }
        case "control_stop":
          thread.done = true;
          break;
        case "control_stopthisscript":
          thread.done = true;
          break;
        case "control_stopothers":
          engine.threads = engine.threads.filter((t) => t === thread || t.spriteId !== thread.spriteId);
          thread.pc++;
          break;
        case "control_createclone":
        case "control_deleteclone":
        case "control_whencloned":
          thread.pc++;
          break;
        case "control_foreach": {
          const listName = getStr(block, "LIST", "fruits");
          const varName = getStr(block, "VAR", "item");
          const items = state.lists[listName] || [];
          const index = Number(state.variables[`${block.id}__index`] ?? 0);
          if (index >= items.length) {
            state.variables[`${block.id}__index`] = 0;
            thread.pc++;
          } else {
            state.variables[varName] = items[index] as any;
            state.variables[`${block.id}__index`] = index + 1;
            thread.waiting = 0.016;
          }
          break;
        }
        case "control_while": {
          const cond = evalCondition(block, state, engine);
          if (!cond) {
            const children = [...thread.blockMap.values()].filter((b) => b.parent === block.id);
            thread.pc += children.length + 1;
          } else {
            if (thread.loopStack[thread.loopStack.length - 1]?.blockId !== block.id) {
              thread.loopStack.push({ blockId: block.id, count: 0, max: -1, returnPc: thread.pc });
            }
            thread.pc++;
          }
          break;
        }
        case "control_trycatch":
          thread.pc++;
          break;
        case "control_waitframes":
          thread.waiting = Math.max(1, getNum(block, "N", 1)) / 60;
          break;
        case "control_counter":
          state.variables["__op"] = state.counter;
          thread.pc++;
          break;

        /* ── Operators (evaluate and store in a temp variable for use in conditions) ── */
        case "operator_add": state.variables["__op"] = getNum(block, "A", 0) + getNum(block, "B", 0); thread.pc++; break;
        case "operator_subtract": state.variables["__op"] = getNum(block, "A", 0) - getNum(block, "B", 0); thread.pc++; break;
        case "operator_multiply": state.variables["__op"] = getNum(block, "A", 0) * getNum(block, "B", 0); thread.pc++; break;
        case "operator_divide": { const dv = getNum(block, "B", 1); state.variables["__op"] = dv !== 0 ? getNum(block, "A", 0) / dv : 0; thread.pc++; break; }
        case "operator_mod": { const md = getNum(block, "B", 1); state.variables["__op"] = md !== 0 ? getNum(block, "A", 0) % md : 0; thread.pc++; break; }
        case "operator_round": state.variables["__op"] = Math.round(getNum(block, "A", 0)); thread.pc++; break;
        case "operator_random": state.variables["__op"] = Math.floor(Math.random() * (getNum(block, "TO", 10) - getNum(block, "FROM", 1) + 1)) + getNum(block, "FROM", 1); thread.pc++; break;
        case "operator_gt": state.variables["__op"] = getNum(block, "A", 0) > getNum(block, "B", 50) ? 1 : 0; thread.pc++; break;
        case "operator_lt": state.variables["__op"] = getNum(block, "A", 0) < getNum(block, "B", 50) ? 1 : 0; thread.pc++; break;
        case "operator_equals": state.variables["__op"] = String(getVal(block, "A", 0)) === String(getVal(block, "B", 50)) ? 1 : 0; thread.pc++; break;
        case "operator_and": state.variables["__op"] = (getVal(block, "A", true) && getVal(block, "B", true)) ? 1 : 0; thread.pc++; break;
        case "operator_or": state.variables["__op"] = (getVal(block, "A", false) || getVal(block, "B", false)) ? 1 : 0; thread.pc++; break;
        case "operator_not": state.variables["__op"] = !getVal(block, "A", false) ? 1 : 0; thread.pc++; break;
        case "operator_join": state.variables["__op"] = String(getVal(block, "A", "")) + String(getVal(block, "B", "")); thread.pc++; break;
        case "operator_length": state.variables["__op"] = String(getVal(block, "TEXT", "")).length; thread.pc++; break;
        case "operator_letterof": state.variables["__op"] = String(getVal(block, "TEXT", "")).charAt(getNum(block, "N", 1) - 1) || ""; thread.pc++; break;
        case "operator_contains": state.variables["__op"] = String(getVal(block, "TEXT", "")).toLowerCase().includes(String(getVal(block, "SEARCH", "")).toLowerCase()) ? 1 : 0; thread.pc++; break;
        case "operator_mathop": {
          const op = getStr(block, "OP", "abs");
          const a = getNum(block, "A", 0);
          const mathMap: Record<string, number> = { abs: Math.abs(a), sqrt: Math.sqrt(a), sin: Math.sin(a * Math.PI / 180), cos: Math.cos(a * Math.PI / 180), tan: Math.tan(a * Math.PI / 180), asin: Math.asin(a) * 180 / Math.PI, acos: Math.acos(a) * 180 / Math.PI, atan: Math.atan(a) * 180 / Math.PI, ln: Math.log(a), log: Math.log10(a), "e ^": Math.pow(Math.E, a), "10 ^": Math.pow(10, a) };
          state.variables["__op"] = mathMap[op] ?? 0;
          thread.pc++;
          break;
        }
        case "operator_power": state.variables["__op"] = Math.pow(getNum(block, "A", 2), getNum(block, "B", 3)); thread.pc++; break;
        case "operator_floor": state.variables["__op"] = Math.floor(getNum(block, "A", 0)); thread.pc++; break;
        case "operator_ceil": state.variables["__op"] = Math.ceil(getNum(block, "A", 0)); thread.pc++; break;
        case "operator_min": state.variables["__op"] = Math.min(getNum(block, "A", 0), getNum(block, "B", 0)); thread.pc++; break;
        case "operator_max": state.variables["__op"] = Math.max(getNum(block, "A", 0), getNum(block, "B", 0)); thread.pc++; break;
        case "operator_clamp": state.variables["__op"] = Math.max(getNum(block, "LO", 0), Math.min(getNum(block, "HI", 100), getNum(block, "A", 50))); thread.pc++; break;

        /* ── Variables ── */
        case "variable_set":
          state.variables[getStr(block, "VAR", "score")] = getVal(block, "VALUE", 0);
          thread.pc++;
          break;
        case "variable_change": {
          const varName = getStr(block, "VAR", "score");
          const current = Number(state.variables[varName] ?? 0);
          state.variables[varName] = current + getNum(block, "VALUE", 1);
          thread.pc++;
          break;
        }
        case "variable_show":
          showVariableMonitor(state, getStr(block, "VAR", "score"));
          thread.pc++;
          break;
        case "variable_hide":
          hideVariableMonitor(state, getStr(block, "VAR", "score"));
          thread.pc++;
          break;
        case "variable_get":
          state.variables["__op"] = state.variables[getStr(block, "VAR", "score")] ?? 0;
          thread.pc++;
          break;
        case "variable_setglobal":
          engine.globalVariables[getStr(block, "VAR", "highScore")] = getVal(block, "VALUE", 0);
          thread.pc++;
          break;
        case "variable_changeglobal": {
          const varName = getStr(block, "VAR", "highScore");
          const current = Number(engine.globalVariables[varName] ?? 0);
          engine.globalVariables[varName] = current + getNum(block, "VALUE", 1);
          thread.pc++;
          break;
        }
        case "variable_getglobal":
          state.variables["__op"] = engine.globalVariables[getStr(block, "VAR", "highScore")] ?? 0;
          thread.pc++;
          break;
        case "variable_countersetup": {
          const varName = getStr(block, "VAR", "score");
          const start = getNum(block, "START", 0);
          const step = getNum(block, "STEP", 1);
          state.variables[varName] = start;
          state.variables[`__counter_step:${varName}`] = step;
          state.variables[`__counter_base:${varName}`] = start;
          showVariableMonitor(state, varName);
          thread.pc++;
          break;
        }
        case "variable_countertick": {
          const varName = getStr(block, "VAR", "score");
          ensureCounterConfig(state, varName);
          const current = Number(state.variables[varName] ?? 0);
          const step = Number(state.variables[`__counter_step:${varName}`] ?? 1);
          state.variables[varName] = current + step;
          thread.pc++;
          break;
        }
        case "variable_counterinc": {
          const varName = getStr(block, "VAR", "score");
          ensureCounterConfig(state, varName);
          const current = Number(state.variables[varName] ?? 0);
          const step = Math.abs(Number(state.variables[`__counter_step:${varName}`] ?? 1));
          state.variables[varName] = current + step;
          thread.pc++;
          break;
        }
        case "variable_counterdec": {
          const varName = getStr(block, "VAR", "score");
          ensureCounterConfig(state, varName);
          const current = Number(state.variables[varName] ?? 0);
          const step = Math.abs(Number(state.variables[`__counter_step:${varName}`] ?? 1));
          state.variables[varName] = current - step;
          thread.pc++;
          break;
        }
        case "variable_counterreset": {
          const varName = getStr(block, "VAR", "score");
          ensureCounterConfig(state, varName);
          const base = Number(state.variables[`__counter_base:${varName}`] ?? 0);
          state.variables[varName] = base;
          thread.pc++;
          break;
        }
        case "variable_countershow": {
          const varName = getStr(block, "VAR", "score");
          showVariableMonitor(state, varName);
          thread.pc++;
          break;
        }
        case "variable_counterhide": {
          const varName = getStr(block, "VAR", "score");
          hideVariableMonitor(state, varName);
          thread.pc++;
          break;
        }
        case "variable_countervalue": {
          const varName = getStr(block, "VAR", "score");
          state.variables["__op"] = Number(state.variables[varName] ?? 0);
          thread.pc++;
          break;
        }

        /* ── Game Systems ── */
        case "game_startlevel":
          engine.globalVariables["game_level"] = Math.max(1, Math.floor(getNum(block, "LEVEL", 1)));
          engine.globalVariables["game_state"] = "playing";
          pendingBroadcasts.push(`level_${engine.globalVariables["game_level"]}_start`);
          thread.pc++;
          break;
        case "game_setstate":
          engine.globalVariables["game_state"] = getStr(block, "STATE", "playing");
          thread.pc++;
          break;
        case "game_getstate":
          state.variables["__op"] = engine.globalVariables["game_state"] ?? "menu";
          thread.pc++;
          break;
        case "game_setcheckpoint":
          engine.globalVariables["checkpoint_x"] = getNum(block, "X", 0);
          engine.globalVariables["checkpoint_y"] = getNum(block, "Y", -120);
          thread.pc++;
          break;
        case "game_respawn": {
          const oldX = state.x;
          const oldY = state.y;
          state.x = Number(engine.globalVariables["checkpoint_x"] ?? 0);
          state.y = Number(engine.globalVariables["checkpoint_y"] ?? -120);
          state.vx = 0;
          state.vy = 0;
          penMove(oldX, oldY);
          thread.pc++;
          break;
        }
        case "game_setplayerstat":
          engine.globalVariables[getPlayerStatKey(getStr(block, "STAT", "health"))] = getVal(block, "VALUE", 100);
          thread.pc++;
          break;
        case "game_changeplayerstat": {
          const statKey = getPlayerStatKey(getStr(block, "STAT", "health"));
          const current = Number(engine.globalVariables[statKey] ?? 0);
          engine.globalVariables[statKey] = current + getNum(block, "VALUE", -10);
          thread.pc++;
          break;
        }
        case "game_playerstat":
          state.variables["__op"] = engine.globalVariables[getPlayerStatKey(getStr(block, "STAT", "health"))] ?? 0;
          thread.pc++;
          break;
        case "game_spawnenemy": {
          const enemyType = getStr(block, "TYPE", "slime");
          const enemyCount = Number(engine.globalVariables["enemy_count"] ?? 0) + 1;
          const enemyX = getNum(block, "X", 140);
          const enemyY = getNum(block, "Y", -100);
          const spawnMessage = `spawn_enemy_${enemyType}`;
          const ownerName = sprites.find((s) => s.id === thread.spriteId)?.name || "Player";
          engine.globalVariables["enemy_count"] = enemyCount;
          engine.globalVariables["last_enemy_type"] = enemyType;
          engine.globalVariables["last_enemy_x"] = enemyX;
          engine.globalVariables["last_enemy_y"] = enemyY;
          spawnEnemySprite(engine, sprites, enemyType, enemyX, enemyY, spawnMessage, ownerName);
          pendingBroadcasts.push(spawnMessage);
          thread.pc++;
          break;
        }
        case "game_setenemyai":
          engine.globalVariables["enemy_ai_style"] = getStr(block, "STYLE", "chase");
          thread.pc++;
          break;
        case "game_damage": {
          const healthKey = getPlayerStatKey("health");
          const current = Number(engine.globalVariables[healthKey] ?? 100);
          engine.globalVariables[healthKey] = Math.max(0, current - getNum(block, "AMOUNT", 10));
          thread.pc++;
          break;
        }
        case "game_heal": {
          const healthKey = getPlayerStatKey("health");
          const current = Number(engine.globalVariables[healthKey] ?? 100);
          engine.globalVariables[healthKey] = current + getNum(block, "AMOUNT", 10);
          thread.pc++;
          break;
        }
        case "game_haspowerup": {
          const powerups = getGameList(state, "powerups");
          const wanted = getStr(block, "NAME", "shield").toLowerCase();
          state.variables["__op"] = powerups.some((item) => String(item).toLowerCase() === wanted) ? 1 : 0;
          thread.pc++;
          break;
        }
        case "game_additem":
          getGameList(state, "inventory").push(getStr(block, "ITEM", "coin"));
          thread.pc++;
          break;
        case "game_removeitem": {
          const inventory = getGameList(state, "inventory");
          const wanted = getStr(block, "ITEM", "coin").toLowerCase();
          const index = inventory.findIndex((item) => String(item).toLowerCase() === wanted);
          if (index >= 0) inventory.splice(index, 1);
          thread.pc++;
          break;
        }
        case "game_hasitem": {
          const inventory = getGameList(state, "inventory");
          const wanted = getStr(block, "ITEM", "key").toLowerCase();
          state.variables["__op"] = inventory.some((item) => String(item).toLowerCase() === wanted) ? 1 : 0;
          thread.pc++;
          break;
        }
        case "game_setquest":
          engine.globalVariables[getQuestKey(getStr(block, "QUEST", "Find the gem"))] = getStr(block, "STATUS", "active");
          thread.pc++;
          break;
        case "game_completequest":
          engine.globalVariables[getQuestKey(getStr(block, "QUEST", "Find the gem"))] = "complete";
          thread.pc++;
          break;
        case "game_queststatus":
          state.variables["__op"] = engine.globalVariables[getQuestKey(getStr(block, "QUEST", "Find the gem"))] ?? "inactive";
          thread.pc++;
          break;
        case "game_setworldgravity":
          state.gravity = getNum(block, "GRAVITY", 0.7);
          engine.globalVariables["world_gravity"] = state.gravity;
          thread.pc++;
          break;
        case "game_shakecamera":
          engine.globalVariables["camera_shake_power"] = getNum(block, "POWER", 8);
          engine.globalVariables["camera_shake_until"] = engine.timer + getNum(block, "SECS", 0.4);
          thread.pc++;
          break;
        case "game_showhud":
          engine.globalVariables["hud_message"] = getStr(block, "TEXT", "Level up!");
          state.sayText = String(engine.globalVariables["hud_message"]);
          state.sayTimer = 2;
          thread.pc++;
          break;
        case "game_setobjective":
          engine.globalVariables["objective"] = getStr(block, "TEXT", "Reach the exit");
          thread.pc++;
          break;
        case "game_save": {
          const slot = getStr(block, "SLOT", "slot1");
          try {
            localStorage.setItem(
              gameSaveKey(slot),
              JSON.stringify({
                x: state.x,
                y: state.y,
                vx: state.vx,
                vy: state.vy,
                variables: engine.globalVariables,
                inventory: getGameList(state, "inventory"),
              })
            );
          } catch {
            // Ignore storage failures in constrained environments.
          }
          thread.pc++;
          break;
        }
        case "game_load": {
          const slot = getStr(block, "SLOT", "slot1");
          try {
            const raw = localStorage.getItem(gameSaveKey(slot));
            if (raw) {
              const save = JSON.parse(raw);
              state.x = Number(save.x ?? state.x);
              state.y = Number(save.y ?? state.y);
              state.vx = Number(save.vx ?? state.vx);
              state.vy = Number(save.vy ?? state.vy);
              if (save.variables && typeof save.variables === "object") {
                engine.globalVariables = { ...engine.globalVariables, ...save.variables };
              }
              if (Array.isArray(save.inventory)) {
                state.lists.inventory = save.inventory;
              }
            }
          } catch {
            // Ignore invalid save data.
          }
          thread.pc++;
          break;
        }
        case "game_sendnetwork":
          engine.globalVariables["last_network_event"] = getStr(block, "EVENT", "player_joined");
          pendingBroadcasts.push(String(engine.globalVariables["last_network_event"]));
          thread.pc++;
          break;
        case "game_networkmessage":
          state.variables["__op"] = engine.globalVariables["last_network_event"] ?? "";
          thread.pc++;
          break;
        case "game_playanimation":
          engine.globalVariables["animation_name"] = getStr(block, "NAME", "run");
          state.sayText = `anim: ${engine.globalVariables["animation_name"]}`;
          state.sayTimer = 1;
          thread.pc++;
          break;
        case "game_setanimspeed":
          engine.globalVariables["animation_speed"] = getNum(block, "SPEED", 1.2);
          thread.pc++;
          break;
        case "game_musicmode":
          engine.globalVariables["music_mode"] = getStr(block, "MODE", "battle");
          thread.pc++;
          break;
        case "game_playsfx":
          engine.globalVariables["last_sfx"] = getStr(block, "NAME", "coin");
          playPop(state.volume / 180);
          thread.pc++;
          break;
        case "game_comparestat":
          state.variables["__op"] = Number(engine.globalVariables[getPlayerStatKey(getStr(block, "STAT", "score"))] ?? 0) > getNum(block, "VALUE", 100) ? 1 : 0;
          thread.pc++;
          break;
        case "game_cooldownready": {
          const cooldownName = getStr(block, "NAME", "dash").toLowerCase();
          const readyAt = Number(engine.globalVariables[`cooldown:${cooldownName}`] ?? 0);
          state.variables["__op"] = engine.timer >= readyAt ? 1 : 0;
          if (engine.timer >= readyAt) {
            engine.globalVariables[`cooldown:${cooldownName}`] = engine.timer + 1;
          }
          thread.pc++;
          break;
        }

        /* ── Lists ── */
        case "list_add": {
          const listName = getStr(block, "LIST", "fruits");
          if (!state.lists[listName]) state.lists[listName] = [];
          state.lists[listName].push(getVal(block, "ITEM", "apple"));
          thread.pc++;
          break;
        }
        case "list_delete": {
          const ln = getStr(block, "LIST", "fruits");
          const idx = getNum(block, "INDEX", 1) - 1;
          if (state.lists[ln]) state.lists[ln].splice(idx, 1);
          thread.pc++;
          break;
        }
        case "list_deleteall": {
          const ln2 = getStr(block, "LIST", "fruits");
          state.lists[ln2] = [];
          thread.pc++;
          break;
        }
        case "list_insert": {
          const ln3 = getStr(block, "LIST", "fruits");
          if (!state.lists[ln3]) state.lists[ln3] = [];
          const idx3 = getNum(block, "INDEX", 1) - 1;
          state.lists[ln3].splice(idx3, 0, getVal(block, "ITEM", "banana"));
          thread.pc++;
          break;
        }
        case "list_replace": {
          const ln4 = getStr(block, "LIST", "fruits");
          const idx4 = getNum(block, "INDEX", 1) - 1;
          if (state.lists[ln4] && idx4 >= 0 && idx4 < state.lists[ln4].length) {
            state.lists[ln4][idx4] = getVal(block, "ITEM", "grape");
          }
          thread.pc++;
          break;
        }
        case "list_item":
          state.variables["__op"] = (() => {
            const ln = getStr(block, "LIST", "fruits");
            const idx = Math.max(0, getNum(block, "INDEX", 1) - 1);
            return state.lists[ln]?.[idx] ?? "";
          })();
          thread.pc++;
          break;
        case "list_length":
          state.variables["__op"] = (() => {
            const ln = getStr(block, "LIST", "fruits");
            return state.lists[ln]?.length ?? 0;
          })();
          thread.pc++;
          break;
        case "list_contains":
          state.variables["__op"] = (() => {
            const ln = getStr(block, "LIST", "fruits");
            const item = String(getVal(block, "ITEM", "apple")).toLowerCase();
            return (state.lists[ln] || []).some((v) => String(v).toLowerCase() === item) ? 1 : 0;
          })();
          thread.pc++;
          break;
        case "list_indexof": {
          const ln = getStr(block, "LIST", "fruits");
          const item = String(getVal(block, "ITEM", "apple")).toLowerCase();
          state.variables["__op"] = Math.max(0, (state.lists[ln] || []).findIndex((v) => String(v).toLowerCase() === item) + 1);
          thread.pc++;
          break;
        }
        case "list_show":
          state.hiddenVars.delete(`list:${getStr(block, "LIST", "fruits")}`);
          thread.pc++;
          break;
        case "list_hide":
          state.hiddenVars.add(`list:${getStr(block, "LIST", "fruits")}`);
          thread.pc++;
          break;
        case "list_randomitem": {
          const ln = getStr(block, "LIST", "fruits");
          const list = state.lists[ln] || [];
          state.variables["__op"] = list.length ? list[Math.floor(Math.random() * list.length)] : "";
          thread.pc++;
          break;
        }
        case "list_lastitem": {
          const ln = getStr(block, "LIST", "fruits");
          const list = state.lists[ln] || [];
          state.variables["__op"] = list.length ? list[list.length - 1] : "";
          thread.pc++;
          break;
        }
        case "list_reverse": {
          const ln = getStr(block, "LIST", "fruits");
          state.lists[ln] = [...(state.lists[ln] || [])].reverse();
          thread.pc++;
          break;
        }

        /* ── Physics ── */
        case "physics_setgravity":
          state.gravity = getNum(block, "G", 10);
          thread.pc++;
          break;
        case "physics_setvelocity":
          state.vx = getNum(block, "VX", 0);
          state.vy = getNum(block, "VY", 5);
          thread.pc++;
          break;
        case "physics_applyforce":
          state.vx += getNum(block, "FX", 0) / Math.max(0.1, state.mass);
          state.vy += getNum(block, "FY", -10) / Math.max(0.1, state.mass);
          thread.pc++;
          break;
        case "physics_bounce": {
          const halfW = engine.stageWidth / 2 - 20;
          const halfH = engine.stageHeight / 2 - 20;
          if (state.x > halfW || state.x < -halfW) state.vx *= -(state.bouncy || 0.5);
          if (state.y > halfH || state.y < -halfH) state.vy *= -(state.bouncy || 0.5);
          thread.pc++;
          break;
        }
        case "physics_setfriction":
          state.friction = Math.max(0, getNum(block, "F", 0.1));
          thread.pc++;
          break;
        case "physics_collision":
          thread.pc++;
          break;
        case "physics_setmass":
          state.mass = Math.max(0.1, getNum(block, "M", 1));
          thread.pc++;
          break;
        case "physics_setbouncy":
          state.bouncy = Math.max(0, Math.min(1, getNum(block, "B", 0.5)));
          thread.pc++;
          break;
        case "physics_spin":
          state.effects["__spin"] = getNum(block, "SPEED", 90);
          thread.pc++;
          break;
        case "physics_attract": {
          const dx = getNum(block, "X", 0) - state.x;
          const dy = getNum(block, "Y", 0) - state.y;
          const force = getNum(block, "F", 5);
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          state.vx += (dx / dist) * force * 0.02;
          state.vy += (dy / dist) * force * 0.02;
          thread.pc++;
          break;
        }
        case "physics_setdrag":
          state.drag = Math.max(0, getNum(block, "D", 0.05));
          thread.pc++;
          break;
        case "physics_isonground":
          state.variables["__op"] = state.y <= -engine.stageHeight / 2 + 20 ? 1 : 0;
          thread.pc++;
          break;
        case "physics_velocity_x":
          state.variables["__op"] = state.vx;
          thread.pc++;
          break;
        case "physics_velocity_y":
          state.variables["__op"] = state.vy;
          thread.pc++;
          break;
        case "physics_jump": {
          const onGround = state.y <= -engine.stageHeight / 2 + 20;
          if (onGround) {
            state.vy = getNum(block, "POWER", 12);
          }
          thread.pc++;
          break;
        }
        case "physics_walljump": {
          const hw2 = engine.stageWidth / 2;
          const pad2 = 20 * state.scale;
          const touchLeft = state.x < -hw2 + pad2;
          const touchRight = state.x > hw2 - pad2;
          if (touchLeft || touchRight) {
            const power = getNum(block, "POWER", 10);
            state.vy = power;
            state.vx = touchLeft ? power * 0.7 : -power * 0.7;
          }
          thread.pc++;
          break;
        }

        /* ── Sensing ── */
        case "sensing_touching": {
          // Check edge collision
          const target = getStr(block, "OBJECT", "edge");
          const hw = engine.stageWidth / 2;
          const hh = engine.stageHeight / 2;
          let hit = false;
          if (target === "edge" || target === "wall") {
            const pad = 20 * state.scale;
            hit = state.x > hw - pad || state.x < -hw + pad || state.y > hh - pad || state.y < -hh + pad;
          } else if (target === "mouse") {
            hit = Math.abs(engine.mouseX - state.x) < 20 * state.scale && Math.abs(engine.mouseY - state.y) < 20 * state.scale;
          }
          // Store result so control_if can check it
          state.variables["__sensing_touching"] = hit ? 1 : 0;
          thread.pc++;
          break;
        }
        case "sensing_touchingcolor":
          state.variables["__op"] = stageColorAt(engine, state.x, state.y).toLowerCase() === getStr(block, "COLOR", "#ff0000").toLowerCase() ? 1 : 0;
          thread.pc++;
          break;
        case "sensing_distanceto": {
          const target2 = getStr(block, "OBJECT", "mouse");
          let dx = 0, dy = 0;
          if (target2 === "mouse") { dx = engine.mouseX - state.x; dy = engine.mouseY - state.y; }
          state.variables["__sensing_distance"] = Math.sqrt(dx * dx + dy * dy);
          thread.pc++;
          break;
        }
        case "sensing_keypressed":
          state.variables["__sensing_key"] = engine.keysPressed.has(getStr(block, "KEY", "space").toLowerCase()) ? 1 : 0;
          thread.pc++;
          break;
        case "sensing_mousedown":
          state.variables["__sensing_mousedown"] = engine.mouseDown ? 1 : 0;
          thread.pc++;
          break;
        case "sensing_mousex":
          state.variables["__sensing_mousex"] = engine.mouseX;
          thread.pc++;
          break;
        case "sensing_mousey":
          state.variables["__sensing_mousey"] = engine.mouseY;
          thread.pc++;
          break;
        case "sensing_answer":
          state.variables["__answer"] = engine.answer;
          thread.pc++;
          break;
        case "sensing_timer":
          state.variables["__timer"] = engine.timer;
          thread.pc++;
          break;
        case "sensing_loudness":
          state.variables["__loudness"] = 0;
          thread.pc++;
          break;
        case "sensing_dayssince2000": {
          const msPerDay = 86400000;
          const y2k = new Date(2000, 0, 1).getTime();
          state.variables["__days2000"] = (Date.now() - y2k) / msPerDay;
          thread.pc++;
          break;
        }
        case "sensing_username":
          state.variables["__username"] = localStorage.getItem("userName") || "student";
          thread.pc++;
          break;
        case "sensing_year":
          state.variables["__year"] = new Date().getFullYear();
          thread.pc++;
          break;
        case "sensing_month":
          state.variables["__month"] = new Date().getMonth() + 1;
          thread.pc++;
          break;
        case "sensing_day":
          state.variables["__day"] = new Date().getDate();
          thread.pc++;
          break;
        case "sensing_hour":
          state.variables["__hour"] = new Date().getHours();
          thread.pc++;
          break;
        case "sensing_minute":
          state.variables["__minute"] = new Date().getMinutes();
          thread.pc++;
          break;
        case "sensing_second":
          state.variables["__second"] = new Date().getSeconds();
          thread.pc++;
          break;
        case "sensing_resettimer":
          engine.timer = 0;
          thread.pc++;
          break;
        case "sensing_ask": {
          const question = getStr(block, "QUESTION", "What's your name?");
          state.sayText = "❓ " + question;
          state.sayTimer = 0;
          state.asking = true;
          engine.askingSprite = thread.spriteId;
          engine.askQuestion = question;
          thread.waiting = 999; // wait until answered
          break;
        }
        case "sensing_colorat":
          state.variables["__op"] = stageColorAt(engine, getNum(block, "X", 0), getNum(block, "Y", 0));
          thread.pc++;
          break;
        case "sensing_draggable":
          state.dragging = getStr(block, "MODE", "draggable").toLowerCase() === "draggable";
          thread.pc++;
          break;

        /* ── Pen ── */
        case "pen_pendown":
          state.penDown = true;
          thread.pc++;
          break;
        case "pen_penup":
          state.penDown = false;
          thread.pc++;
          break;
        case "pen_clear":
          engine.penLines = [];
          engine.stampImages = [];
          thread.pc++;
          break;
        case "pen_stamp":
          engine.stampImages.push({ x: state.x, y: state.y, size: 40 * state.scale, costumeUrl: "", color: state.penColor, rotation: state.rotation });
          thread.pc++;
          break;
        case "pen_setpencolor":
          state.penColor = getStr(block, "COLOR", "#4C97FF");
          thread.pc++;
          break;
        case "pen_changepencolor": {
          // Shift hue
          const [h, s, l] = hexToHsl(state.penColor);
          state.penColor = hslToHex((h + getNum(block, "CHANGE", 10)) % 360, s, l);
          thread.pc++;
          break;
        }
        case "pen_setpensize":
          state.penSize = Math.max(1, Math.min(60, getNum(block, "SIZE", 2)));
          thread.pc++;
          break;
        case "pen_changepensize":
          state.penSize = Math.max(1, Math.min(60, state.penSize + getNum(block, "CHANGE", 1)));
          thread.pc++;
          break;
        case "pen_setpenshade": {
          const shade = getNum(block, "SHADE", 50);
          const [h2, s2] = hexToHsl(state.penColor);
          state.penColor = hslToHex(h2, s2, shade / 100);
          thread.pc++;
          break;
        }
        case "pen_setpentransparency":
          state.opacity = 1 - Math.max(0, Math.min(100, getNum(block, "PCT", 0))) / 100;
          thread.pc++;
          break;
        case "pen_drawdot": {
          const dx = getNum(block, "X", 0);
          const dy = getNum(block, "Y", 0);
          engine.penLines.push({ x1: dx, y1: dy, x2: dx, y2: dy, color: state.penColor, width: state.penSize });
          thread.pc++;
          break;
        }
        case "pen_drawline": {
          const tx = getNum(block, "X", 100);
          const ty = getNum(block, "Y", 0);
          engine.penLines.push({ x1: state.x, y1: state.y, x2: tx, y2: ty, color: state.penColor, width: state.penSize });
          thread.pc++;
          break;
        }
        /* ── Pen+ enhanced blocks ── */
        case "pen_drawcircle": {
          const radius = getNum(block, "R", 40);
          const segments = 36;
          for (let i = 0; i < segments; i++) {
            const a1 = (i / segments) * Math.PI * 2;
            const a2 = ((i + 1) / segments) * Math.PI * 2;
            engine.penLines.push({
              x1: state.x + Math.cos(a1) * radius, y1: state.y + Math.sin(a1) * radius,
              x2: state.x + Math.cos(a2) * radius, y2: state.y + Math.sin(a2) * radius,
              color: state.penColor, width: state.penSize,
            });
          }
          thread.pc++;
          break;
        }
        case "pen_drawrect": {
          const w2 = getNum(block, "W", 80) / 2;
          const h2 = getNum(block, "H", 50) / 2;
          const cx = state.x, cy = state.y;
          engine.penLines.push({ x1: cx - w2, y1: cy - h2, x2: cx + w2, y2: cy - h2, color: state.penColor, width: state.penSize });
          engine.penLines.push({ x1: cx + w2, y1: cy - h2, x2: cx + w2, y2: cy + h2, color: state.penColor, width: state.penSize });
          engine.penLines.push({ x1: cx + w2, y1: cy + h2, x2: cx - w2, y2: cy + h2, color: state.penColor, width: state.penSize });
          engine.penLines.push({ x1: cx - w2, y1: cy + h2, x2: cx - w2, y2: cy - h2, color: state.penColor, width: state.penSize });
          thread.pc++;
          break;
        }
        case "pen_fill": {
          const fr = getNum(block, "R", 30);
          const fillSegments = 18;
          for (let ring = 1; ring <= fillSegments; ring++) {
            const r = (ring / fillSegments) * fr;
            for (let i = 0; i < 36; i++) {
              const a1 = (i / 36) * Math.PI * 2;
              const a2 = ((i + 1) / 36) * Math.PI * 2;
              engine.penLines.push({
                x1: state.x + Math.cos(a1) * r, y1: state.y + Math.sin(a1) * r,
                x2: state.x + Math.cos(a2) * r, y2: state.y + Math.sin(a2) * r,
                color: state.penColor, width: Math.max(state.penSize, fr / fillSegments + 1),
              });
            }
          }
          thread.pc++;
          break;
        }
        case "pen_writetext": {
          const text = getStr(block, "TEXT", "Hello");
          const fontSize = getNum(block, "SIZE", 20);
          // Approximate text by storing as pen "text" marker
          engine.penLines.push({ x1: state.x, y1: state.y, x2: state.x + fontSize * text.length * 0.6, y2: state.y, color: state.penColor, width: fontSize, text } as any);
          thread.pc++;
          break;
        }
        case "pen_rainbow": {
          const speed = getNum(block, "SPEED", 5);
          state.variables["__pen_rainbow_speed"] = speed;
          // Apply rainbow - cycle hue based on counter
          const hue = (state.counter * speed) % 360;
          state.penColor = `hsl(${hue}, 100%, 50%)`;
          thread.pc++;
          break;
        }
        case "pen_setstyle":
          state.variables["__pen_style"] = getStr(block, "STYLE", "solid");
          thread.pc++;
          break;

        /* ── Custom ── */
        case "custom_define":
        case "custom_definewithparam":
          thread.pc++;
          break;
        case "custom_call": {
          const name = getStr(block, "NAME", "myBlock");
          const target = spriteDef?.blocks.find((b) => (b.type === "custom_define" || b.type === "custom_definewithparam") && getStr(b, "NAME", "myBlock") === name);
          if (spriteDef && target) launchHatThread(engine, spriteDef, target);
          thread.pc++;
          break;
        }
        case "custom_callwitharg": {
          const name = getStr(block, "NAME", "myFunc");
          const arg = getVal(block, "ARG", 0);
          const target = spriteDef?.blocks.find((b) => b.type === "custom_definewithparam" && getStr(b, "NAME", "myFunc") === name);
          if (target) {
            const paramName = getStr(target, "PARAM", "n");
            state.variables[`__param_${paramName}`] = arg as any;
            if (spriteDef) launchHatThread(engine, spriteDef, target);
          }
          thread.pc++;
          break;
        }
        case "custom_return":
          state.variables["__op"] = getVal(block, "VALUE", 0) as any;
          thread.done = true;
          break;
        case "custom_param":
          state.variables["__op"] = state.variables[`__param_${getStr(block, "NAME", "n")}`] ?? 0;
          thread.pc++;
          break;

        /* ── AI Blocks ── */
        case "ai_whenresponse":
          // Hat block - skip in execution
          thread.pc++;
          break;
        case "ai_ask": {
          const prompt = getStr(block, "PROMPT", "Tell me something");
          state.sayText = "🤖 Thinking...";
          state.sayTimer = 0;
          thread.waiting = 999; // pause until API returns
          callAI(prompt).then((reply) => {
            state.sayText = "🤖 " + reply;
            state.sayTimer = 6;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_say_smart": {
          const topic = getStr(block, "TOPIC", "something interesting");
          state.sayText = "🤖 Thinking...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI("Tell me a fun fact about: " + topic).then((reply) => {
            state.sayText = "🤖 " + reply;
            state.sayTimer = 5;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_image_describe": {
          const desc = getStr(block, "DESCRIPTION", "something cool");
          state.sayText = "🎨 Imagining...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI("Describe this scene vividly in 2 sentences: " + desc).then((reply) => {
            state.sayText = "🎨 " + reply;
            state.sayTimer = 5;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_code_explain": {
          state.sayText = "📝 Thinking...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI("Explain what this sprite's code does in 1-2 simple sentences for a student.").then((reply) => {
            state.sayText = "📝 " + reply;
            state.sayTimer = 5;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_suggest_next": {
          state.sayText = "💡 Thinking...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI("Suggest one simple next block a student should add to their Scratch program. Keep it to 1 sentence.").then((reply) => {
            state.sayText = "💡 " + reply;
            state.sayTimer = 4;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_translate": {
          const text = getStr(block, "TEXT", "Hello");
          const lang = getStr(block, "LANG", "Spanish");
          state.sayText = "🌍 Translating...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI(`Translate "${text}" to ${lang}. Reply with ONLY the translation.`).then((reply) => {
            state.sayText = "🌍 " + reply;
            state.sayTimer = 4;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_generate_story": {
          const storyTopic = getStr(block, "TOPIC", "adventure");
          state.sayText = "📖 Writing...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI("Write a 2-sentence short story about: " + storyTopic).then((reply) => {
            state.sayText = "📖 " + reply;
            state.sayTimer = 6;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_poem": {
          const topic = getStr(block, "TOPIC", "the ocean");
          state.sayText = "✍️ Writing...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI("Write a short two-line poem about: " + topic).then((reply) => {
            state.sayText = "✍️ " + reply;
            state.sayTimer = 6;
            state.variables["__op"] = reply;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_summarize": {
          const text = getStr(block, "TEXT", "A long story...");
          state.sayText = "🧠 Summarizing...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI("Summarize this in one short sentence: " + text).then((reply) => {
            state.sayText = "🧠 " + reply;
            state.sayTimer = 5;
            state.variables["__op"] = reply;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_generate_image": {
          const prompt = getStr(block, "PROMPT", "a cute robot waving");
          state.variables["__op"] = generatePromptSvg(prompt, 128, 128, "#ff6b9d", "#6d5efc");
          state.sayText = "🖼️ Image ready";
          state.sayTimer = 3;
          thread.pc++;
          break;
        }
        case "ai_generate_3dmodel":
          state.variables["__op"] = JSON.stringify({ prompt: getStr(block, "PROMPT", "a small house"), primitive: "box" });
          state.sayText = "🧊 3D model plan ready";
          state.sayTimer = 3;
          thread.pc++;
          break;
        case "ai_set_photo": {
          const prompt = getStr(block, "PROMPT", "a cartoon cat");
          const img = generatePromptSvg(prompt, 128, 128, "#ffb347", "#ff6b9d");
          if (spriteDef) {
            const newCostume = { id: `ai_${Date.now()}`, name: prompt.slice(0, 24), url: img, type: "image" as const };
            spriteDef.costumes = [...spriteDef.costumes, newCostume];
            state.costumeIndex = spriteDef.costumes.length - 1;
          }
          state.sayText = "📷 Costume updated";
          state.sayTimer = 3;
          thread.pc++;
          break;
        }
        case "ai_drawing":
          engine.stampImages.push({ x: state.x, y: state.y, size: 80, costumeUrl: generatePromptSvg(getStr(block, "PROMPT", "a sunset landscape"), 96, 96, "#5cc8ff", "#ff9a3c"), color: "#fff", rotation: 0 });
          state.sayText = "🎨 Drew on stage";
          state.sayTimer = 3;
          thread.pc++;
          break;
        case "ai_generate_sound":
          playPop(state.volume / 200);
          state.variables["__op"] = `sound:${getStr(block, "PROMPT", "laser zap")}`;
          state.sayText = "🔊 Sound ready";
          state.sayTimer = 3;
          thread.pc++;
          break;
        case "ai_name_generator":
          state.variables["__op"] = `${getStr(block, "TYPE", "character")}-${Math.random().toString(36).slice(2, 6)}`;
          thread.pc++;
          break;
        case "ai_color_palette":
          state.variables["__op"] = "#ff6b6b, #ffd166, #06d6a0, #118ab2";
          thread.pc++;
          break;
        case "ai_npc_dialog":
        case "ai_hint":
        case "ai_quiz_question":
        case "ai_trivia": {
          const topic = getStr(block, "TOPIC", getStr(block, "TASK", "the quest"));
          state.sayText = "🤖 Thinking...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI(`${block.type.replace("ai_", "").replaceAll("_", " ")}: ${topic}`).then((reply) => {
            state.sayText = "🤖 " + reply;
            state.sayTimer = 5;
            state.variables["__op"] = reply;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_rhyme": {
          const word = getStr(block, "WORD", "cat");
          state.sayText = "🎵 Thinking...";
          state.sayTimer = 0;
          thread.waiting = 999;
          callAI(`Give me 3 words that rhyme with "${word}". Reply with ONLY the words separated by commas.`).then((reply) => {
            state.sayText = "🎵 " + reply;
            state.sayTimer = 4;
            thread.waiting = 0;
            thread.pc++;
          });
          break;
        }
        case "ai_response":
          state.variables["__ai_response"] = state.sayText.replace(/^🤖\s*/, "");
          state.variables["__op"] = state.variables["__ai_response"];
          thread.pc++;
          break;
        case "ai_complete":
          state.variables["__op"] = `${getStr(block, "TEXT", "")}${getStr(block, "TEXT", "").endsWith(".") ? "" : "..."}`;
          thread.pc++;
          break;
        case "ai_classify":
          state.variables["__op"] = getStr(block, "CATEGORIES", "neutral").split(",")[0]?.trim() || "neutral";
          thread.pc++;
          break;
        case "ai_sentiment":
          state.variables["__op"] = scoreSentiment(getStr(block, "TEXT", "This is amazing!"));
          thread.pc++;
          break;
        case "ai_decide":
          state.variables["__op"] = /\b(should|can|go|jump|fight|yes)\b/i.test(getStr(block, "QUESTION", "jump now")) ? 1 : 0;
          thread.pc++;
          break;
        case "ai_emotion":
          state.variables["__op"] = detectEmotion(getStr(block, "TEXT", "I'm so excited!"));
          thread.pc++;
          break;

        /* ── 3D Environment blocks ── */
        case "env_setscene": {
          const scene = getStr(block, "SCENE", "forest");
          engine.globalVariables["env_scene"] = scene;
          engine.globalVariables["stage_backdrop_name"] = scene;
          // Also set the stage background image marker for Stage3D to pick up
          engine.globalVariables["stage_backdrop_color"] = "";
          pendingBroadcasts.push(`scene_changed_${scene}`);
          thread.pc++;
          break;
        }
        case "env_setsky":
          engine.globalVariables["env_sky_color"] = getStr(block, "COLOR", "#87CEEB");
          thread.pc++;
          break;
        case "env_setground":
          engine.globalVariables["env_ground_color"] = getStr(block, "COLOR", "#2d5a3a");
          thread.pc++;
          break;
        case "env_setfog":
          engine.globalVariables["env_fog_density"] = Math.max(0, Math.min(100, getNum(block, "DENSITY", 30)));
          thread.pc++;
          break;
        case "env_settime": {
          const time = getStr(block, "TIME", "day").toLowerCase();
          engine.globalVariables["env_time_of_day"] = time;
          // Update backdrop color based on time
          const timeColors: Record<string, string> = {
            sunrise: "#ff7b54", dawn: "#ff7b54", morning: "#87CEEB",
            day: "#87CEEB", noon: "#4da6ff", afternoon: "#87CEEB",
            sunset: "#ff6b35", dusk: "#4a3080", evening: "#1a1a50",
            night: "#0a0a2e", midnight: "#050510",
          };
          if (timeColors[time]) engine.globalVariables["env_sky_color"] = timeColors[time];
          thread.pc++;
          break;
        }
        case "env_movecamera":
          engine.globalVariables["env_cam_x"] = getNum(block, "X", 0);
          engine.globalVariables["env_cam_y"] = getNum(block, "Y", 5);
          engine.globalVariables["env_cam_z"] = getNum(block, "Z", 10);
          thread.pc++;
          break;
        case "env_rotatecamera":
          engine.globalVariables["env_cam_rot"] = (Number(engine.globalVariables["env_cam_rot"] ?? 0)) + getNum(block, "DEGREES", 15);
          thread.pc++;
          break;
        case "env_zoomcamera":
          engine.globalVariables["env_cam_fov"] = Math.max(20, Math.min(120, getNum(block, "ZOOM", 60)));
          thread.pc++;
          break;
        case "env_followsprite":
          engine.globalVariables["env_cam_follow"] = getStr(block, "SPRITE", "myself") === "myself" ? thread.spriteId : getStr(block, "SPRITE", "");
          thread.pc++;
          break;
        case "env_shakecamera3d":
          engine.globalVariables["camera_shake_power"] = getNum(block, "POWER", 5);
          engine.globalVariables["camera_shake_until"] = engine.timer + 0.4;
          thread.pc++;
          break;
        case "env_setambient":
          engine.globalVariables["env_ambient"] = Math.max(0, Math.min(100, getNum(block, "BRIGHTNESS", 50))) / 100;
          thread.pc++;
          break;
        case "env_setlightcolor":
          engine.globalVariables["env_light_color"] = getStr(block, "COLOR", "#ffffff");
          thread.pc++;
          break;
        case "env_addsunlight":
          engine.globalVariables["env_sun_angle"] = getNum(block, "ANGLE", 45);
          thread.pc++;
          break;
        case "env_addspotlight": {
          const spotCount = Number(engine.globalVariables["env_spotlight_count"] ?? 0) + 1;
          engine.globalVariables["env_spotlight_count"] = spotCount;
          engine.globalVariables[`env_spot_${spotCount}_x`] = getNum(block, "X", 0);
          engine.globalVariables[`env_spot_${spotCount}_y`] = getNum(block, "Y", 10);
          engine.globalVariables[`env_spot_${spotCount}_z`] = getNum(block, "Z", 0);
          thread.pc++;
          break;
        }
        case "env_spawn3d": {
          const shapeType = getStr(block, "SHAPE", "box");
          const spawnMsg = `spawn_3d_${shapeType}_${Date.now()}`;
          engine.globalVariables["env_last_spawn"] = shapeType;
          engine.globalVariables["env_last_spawn_x"] = getNum(block, "X", 0);
          engine.globalVariables["env_last_spawn_y"] = getNum(block, "Y", 0);
          engine.globalVariables["env_last_spawn_z"] = getNum(block, "Z", 0);
          pendingBroadcasts.push(spawnMsg);
          thread.pc++;
          break;
        }
        case "env_set3dcolor":
          state.penColor = getStr(block, "COLOR", "#4C97FF");
          engine.globalVariables["env_3d_color"] = state.penColor;
          thread.pc++;
          break;
        case "env_set3dscale":
          engine.globalVariables["env_3d_scale"] = Math.max(0.1, getNum(block, "SCALE", 1));
          thread.pc++;
          break;
        case "env_rotate3d":
          engine.globalVariables["env_3d_rx"] = getNum(block, "RX", 0);
          engine.globalVariables["env_3d_ry"] = getNum(block, "RY", 45);
          engine.globalVariables["env_3d_rz"] = getNum(block, "RZ", 0);
          thread.pc++;
          break;
        case "env_setweather": {
          const weather = getStr(block, "WEATHER", "clear").toLowerCase();
          engine.globalVariables["env_weather"] = weather;
          pendingBroadcasts.push(`weather_${weather}`);
          thread.pc++;
          break;
        }
        case "env_addparticles": {
          const particleCount = getNum(block, "COUNT", 20);
          const particleType = getStr(block, "TYPE", "sparkle");
          engine.globalVariables["env_particles_type"] = particleType;
          engine.globalVariables["env_particles_count"] = particleCount;
          engine.globalVariables["env_particles_active"] = 1;
          // Visual feedback - leave sparkle stamps on stage
          const emojis: Record<string, string> = { fire: "🔥", sparkle: "✨", smoke: "💨", confetti: "🎊", hearts: "💖", stars: "⭐" };
          const emoji = emojis[particleType] || "✨";
          state.sayText = `${emoji} ${particleType} x${particleCount}`;
          state.sayTimer = 1.5;
          thread.pc++;
          break;
        }
        case "env_clearparticles":
          engine.globalVariables["env_particles_active"] = 0;
          engine.globalVariables["env_particles_count"] = 0;
          thread.pc++;
          break;
        case "env_scenename":
          state.variables["__op"] = engine.globalVariables["env_scene"] ?? "default";
          thread.pc++;
          break;

        /* ── Extended Looks effects ── */
        case "looks_screenflash":
          engine.globalVariables["screen_flash_color"] = getStr(block, "COLOR", "#ffffff");
          engine.globalVariables["screen_flash_until"] = engine.timer + getNum(block, "SECS", 0.3);
          thread.pc++;
          break;
        case "looks_screenshake":
          engine.globalVariables["camera_shake_power"] = getNum(block, "POWER", 8);
          engine.globalVariables["camera_shake_until"] = engine.timer + getNum(block, "SECS", 0.4);
          thread.pc++;
          break;
        case "looks_trail": {
          const on = getStr(block, "ON_OFF", "on").toLowerCase();
          state.effects["__trail"] = on === "on" || on === "yes" || on === "true" ? 1 : 0;
          thread.pc++;
          break;
        }
        case "looks_glow":
          state.effects["__glow_color"] = 1; // marker
          state.effects["__glow_size"] = getNum(block, "SIZE", 15);
          state.penColor = getStr(block, "COLOR", "#ffcc00");
          thread.pc++;
          break;
        case "looks_pixelate":
          state.effects["pixelate"] = getNum(block, "AMOUNT", 0);
          thread.pc++;
          break;
        case "looks_mosaic":
          state.effects["mosaic"] = getNum(block, "COUNT", 1);
          thread.pc++;
          break;
        case "looks_fisheye":
          state.effects["fisheye"] = getNum(block, "AMOUNT", 0);
          thread.pc++;
          break;
        case "looks_whirl":
          state.effects["whirl"] = getNum(block, "DEGREES", 0);
          thread.pc++;
          break;
        case "looks_brightness":
          state.effects["brightness"] = getNum(block, "VALUE", 0);
          thread.pc++;
          break;
        case "looks_ghost":
          state.opacity = 1 - Math.max(0, Math.min(100, getNum(block, "VALUE", 0))) / 100;
          thread.pc++;
          break;
        case "looks_emote": {
          const emote = getStr(block, "EMOTE", "happy").toLowerCase();
          const emoteMap: Record<string, string> = {
            happy: "😊", sad: "😢", angry: "😡", surprised: "😲", love: "😍",
            dizzy: "😵", sleep: "😴", cool: "😎", scared: "😱", silly: "🤪",
            thinking: "🤔", wink: "😉", laugh: "😂", cry: "😭", blush: "☺️",
          };
          state.sayText = emoteMap[emote] || emote;
          state.sayTimer = 2;
          thread.pc++;
          break;
        }
        case "looks_setnamebubble": {
          const showName = getStr(block, "ON_OFF", "on").toLowerCase();
          state.effects["__nametag"] = showName === "on" || showName === "yes" ? 1 : 0;
          thread.pc++;
          break;
        }

        /* ── Fancy motion animations ── */
        case "motion_bounce_anim": {
          const bounceH = getNum(block, "HEIGHT", 30);
          const times = getNum(block, "TIMES", 3);
          const total = times * 0.3;
          state.effects["__bounce_height"] = bounceH;
          state.effects["__bounce_times"] = times;
          state.effects["__bounce_start"] = engine.timer;
          thread.waiting = total;
          break;
        }
        case "motion_spin_anim": {
          const degrees = getNum(block, "DEGREES", 360);
          const secs = getNum(block, "SECS", 0.5);
          state.effects["__spin"] = degrees / Math.max(0.01, secs);
          thread.waiting = secs;
          break;
        }
        case "motion_wobble":
          state.effects["__wobble"] = getNum(block, "AMOUNT", 15);
          thread.pc++;
          break;
        case "motion_orbit": {
          const cx = getNum(block, "CX", 0);
          const cy = getNum(block, "CY", 0);
          const radius = getNum(block, "R", 80);
          const speed = getNum(block, "SPD", 2);
          state.effects["__orbit_cx"] = cx;
          state.effects["__orbit_cy"] = cy;
          state.effects["__orbit_r"] = radius;
          state.effects["__orbit_spd"] = speed;
          thread.pc++;
          break;
        }
        case "motion_followmouse": {
          const followSpeed = getNum(block, "SPEED", 5);
          const dx = engine.mouseX - state.x;
          const dy = engine.mouseY - state.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 2) {
            state.x += (dx / dist) * followSpeed;
            state.y += (dy / dist) * followSpeed;
          }
          thread.pc++;
          break;
        }
        case "motion_patrol": {
          const x1 = getNum(block, "X1", -100);
          const x2 = getNum(block, "X2", 100);
          const patrolSpeed = getNum(block, "SPEED", 3);
          const dir = (state.effects["__patrol_dir"] ?? 1);
          state.x += patrolSpeed * dir;
          if (state.x >= x2) state.effects["__patrol_dir"] = -1;
          if (state.x <= x1) state.effects["__patrol_dir"] = 1;
          thread.pc++;
          break;
        }

        /* ── Hat blocks (skip in execution) ── */
        case "event_whenflagclicked":
        case "event_whenkeypressed":
        case "event_whenthisspriteclicked":
        case "event_whenbackdropswitches":
        case "event_whenbroadcastreceived":
        case "event_whentimer":
        case "event_whenloudness":
        case "event_whenstageclick":
        case "event_whenscenestart":
        case "event_whenvariable":
          thread.pc++;
          break;

        /* ── Unity 3D blocks ── */
        case "unity_move": {
          const x = getNum(block, "X"); const y = getNum(block, "Y"); const z = getNum(block, "Z");
          unityBridge("Move", { x, y, z });
          thread.pc++; break;
        }
        case "unity_setposition": {
          const x = getNum(block, "X"); const y = getNum(block, "Y"); const z = getNum(block, "Z");
          unityBridge("SetPosition", { x, y, z });
          thread.pc++; break;
        }
        case "unity_rotate": {
          const axis = getStr(block, "AXIS", "y"); const degrees = getNum(block, "DEGREES");
          unityBridge("Rotate", { axis, degrees });
          thread.pc++; break;
        }
        case "unity_setrotation": {
          const x = getNum(block, "X"); const y = getNum(block, "Y"); const z = getNum(block, "Z");
          unityBridge("SetRotation", { x, y, z });
          thread.pc++; break;
        }
        case "unity_setscale": {
          unityBridge("SetScale", { scale: getNum(block, "SCALE", 1) });
          thread.pc++; break;
        }
        case "unity_setcolor": {
          const r = getNum(block, "R"); const g = getNum(block, "G"); const b = getNum(block, "B");
          unityBridge("SetColor", { r, g, b, a: 1 });
          thread.pc++; break;
        }
        case "unity_spawn": {
          const prefab = getStr(block, "PREFAB", "enemy");
          const x = getNum(block, "X"); const y = getNum(block, "Y"); const z = getNum(block, "Z");
          unityBridge("Spawn", { prefab, x, y, z });
          thread.pc++; break;
        }
        case "unity_playanimation": {
          unityBridge("PlayAnimation", { name: getStr(block, "NAME", "run") });
          thread.pc++; break;
        }
        case "unity_applyforce": {
          const x = getNum(block, "X"); const y = getNum(block, "Y"); const z = getNum(block, "Z");
          unityBridge("ApplyForce", { x, y, z });
          thread.pc++; break;
        }
        case "unity_setgravity": {
          unityBridge("SetGravity", { value: getNum(block, "VALUE", 9.8) });
          thread.pc++; break;
        }
        case "unity_say": {
          unityBridge("Say", { text: getStr(block, "TEXT", "") });
          thread.pc++; break;
        }
        case "unity_reset": {
          unityBridge("Reset", {});
          thread.pc++; break;
        }

        default:
          thread.pc++;
          break;
      }
    }
  }

  // Handle pending broadcasts
  for (const msg of pendingBroadcasts) {
    triggerBroadcast(engine, sprites, msg);
  }

  // Clean up done threads
  engine.threads = engine.threads.filter(t => !t.done);
}

/* ── Stop everything ── */
export function stopRuntime(engine: RuntimeEngine) {
  engine.running = false;
  engine.threads = [];
}

/* ── Answer the "ask" dialog ── */
export function answerAsk(engine: RuntimeEngine, answer: string) {
  engine.answer = answer;
  engine.askingSprite = null;
  engine.askQuestion = "";
  // Resume any waiting thread that was asking
  for (const thread of engine.threads) {
    const state = engine.sprites.get(thread.spriteId);
    if (state?.asking) {
      state.asking = false;
      state.sayText = "";
      thread.waiting = 0;
      thread.pc++;
    }
  }
}

/* ── HSL <-> HEX helpers for pen ── */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function stageColorAt(_engine: RuntimeEngine, x: number, y: number): string {
  const r = Math.max(0, Math.min(255, 128 + Math.round(x) % 127));
  const g = Math.max(0, Math.min(255, 128 + Math.round(y) % 127));
  const b = 26;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function generatePromptSvg(prompt: string, width: number, height: number, colorA: string, colorB: string): string {
  const safe = prompt.replace(/[<>&"']/g, "").slice(0, 36);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colorA}"/>
          <stop offset="100%" stop-color="${colorB}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="18" fill="url(#g)"/>
      <circle cx="${width / 2}" cy="${height / 2 - 10}" r="22" fill="rgba(255,255,255,0.25)"/>
      <text x="50%" y="${height - 18}" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="12" fill="white">${safe}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function scoreSentiment(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  if (/(great|amazing|love|good|awesome|happy|win)/.test(lower)) score += 1;
  if (/(bad|hate|awful|sad|angry|lose|broken)/.test(lower)) score -= 1;
  return score;
}

function detectEmotion(text: string): string {
  const lower = text.toLowerCase();
  if (/(excited|happy|joy|love|great)/.test(lower)) return "happy";
  if (/(angry|mad|furious)/.test(lower)) return "angry";
  if (/(sad|upset|cry)/.test(lower)) return "sad";
  if (/(scared|afraid|nervous)/.test(lower)) return "fear";
  return "neutral";
}

/* ── Check if any threads are active ── */
export function isRunning(engine: RuntimeEngine): boolean {
  return engine.running && engine.threads.length > 0;
}
