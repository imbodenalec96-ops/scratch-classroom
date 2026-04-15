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

/* ── Sprite runtime state ── */
export interface SpriteState {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  visible: boolean;
  sayText: string;
  sayTimer: number;
  thinkText: string;
  penDown: boolean;
  penColor: string;
  variables: Record<string, number | string>;
  lists: Record<string, (number | string)[]>;
  costumeIndex: number;
  volume: number;
  effects: Record<string, number>;
  layer: number;
  dragging: boolean;
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
  penLines: { x1: number; y1: number; x2: number; y2: number; color: string; width: number }[];
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
}

/* ── Create initial state for a sprite ── */
export function createSpriteState(sprite: Sprite): SpriteState {
  return {
    x: sprite.x,
    y: sprite.y,
    rotation: sprite.rotation,
    scale: sprite.scale,
    visible: sprite.visible,
    sayText: "",
    sayTimer: 0,
    thinkText: "",
    penDown: false,
    penColor: "#4C97FF",
    variables: {},
    lists: {},
    costumeIndex: sprite.costumeIndex,
    volume: 100,
    effects: {},
    layer: 0,
    dragging: false,
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
    penLines: [],
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

/* ── Start green flag threads ── */
export function startGreenFlag(engine: RuntimeEngine, sprites: Sprite[]) {
  engine.threads = [];
  engine.timer = 0;
  engine.penLines = [];
  engine.running = true;

  // Reset sprite states
  for (const sprite of sprites) {
    engine.sprites.set(sprite.id, createSpriteState(sprite));
  }

  for (const sprite of sprites) {
    const blockMap = new Map<string, Block>();
    for (const b of sprite.blocks) blockMap.set(b.id, b);
    const claimed = new Set<string>();

    // Find all green flag hat blocks
    const flagBlocks = sprite.blocks.filter(b => b.type === "event_whenflagclicked");
    for (const hat of flagBlocks) {
      const execList = buildExecList(hat.id, blockMap, claimed);
      engine.threads.push({
        spriteId: sprite.id,
        blocks: sprite.blocks,
        blockMap,
        pc: 1, // skip the hat block itself
        execList,
        waiting: 0,
        done: execList.length <= 1,
        loopStack: [],
      });
    }
  }
}

/* ── Start threads for a key press event ── */
export function triggerKeyPress(engine: RuntimeEngine, sprites: Sprite[], key: string) {
  for (const sprite of sprites) {
    const blockMap = new Map<string, Block>();
    for (const b of sprite.blocks) blockMap.set(b.id, b);
    const claimed = new Set<string>();

    const keyBlocks = sprite.blocks.filter(b =>
      b.type === "event_whenkeypressed" &&
      String(b.inputs.KEY?.value ?? "space").toLowerCase() === key.toLowerCase()
    );

    for (const hat of keyBlocks) {
      const execList = buildExecList(hat.id, blockMap, claimed);
      engine.threads.push({
        spriteId: sprite.id,
        blocks: sprite.blocks,
        blockMap,
        pc: 1,
        execList,
        waiting: 0,
        done: execList.length <= 1,
        loopStack: [],
      });
    }
  }
}

/* ── Start threads for sprite click ── */
export function triggerSpriteClick(engine: RuntimeEngine, sprites: Sprite[], spriteId: string) {
  const sprite = sprites.find(s => s.id === spriteId);
  if (!sprite) return;

  const blockMap = new Map<string, Block>();
  for (const b of sprite.blocks) blockMap.set(b.id, b);
  const claimed = new Set<string>();

  const clickBlocks = sprite.blocks.filter(b => b.type === "event_whenthisspriteclicked");
  for (const hat of clickBlocks) {
    const execList = buildExecList(hat.id, blockMap, claimed);
    engine.threads.push({
      spriteId: sprite.id,
      blocks: sprite.blocks,
      blockMap,
      pc: 1,
      execList,
      waiting: 0,
      done: execList.length <= 1,
      loopStack: [],
    });
  }
}

/* ── Broadcast ── */
export function triggerBroadcast(engine: RuntimeEngine, sprites: Sprite[], message: string) {
  engine.broadcasts.add(message);
  for (const sprite of sprites) {
    const blockMap = new Map<string, Block>();
    for (const b of sprite.blocks) blockMap.set(b.id, b);
    const claimed = new Set<string>();

    const recvBlocks = sprite.blocks.filter(b =>
      b.type === "event_whenbroadcastreceived" &&
      String(b.inputs.MESSAGE?.value ?? "") === message
    );

    for (const hat of recvBlocks) {
      const execList = buildExecList(hat.id, blockMap, claimed);
      engine.threads.push({
        spriteId: sprite.id,
        blocks: sprite.blocks,
        blockMap,
        pc: 1,
        execList,
        waiting: 0,
        done: execList.length <= 1,
        loopStack: [],
      });
    }
  }
}

/* ── Get block input value ── */
function getVal(block: Block, key: string, fallback: any = 0): any {
  return block.inputs[key]?.value ?? fallback;
}
function getNum(block: Block, key: string, fallback: number = 0): number {
  return Number(block.inputs[key]?.value ?? fallback);
}
function getStr(block: Block, key: string, fallback: string = ""): string {
  return String(block.inputs[key]?.value ?? fallback);
}

/* ── Step one frame of the runtime ── */
export function stepRuntime(engine: RuntimeEngine, sprites: Sprite[], dt: number) {
  if (!engine.running) return;

  engine.timer += dt;

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
      if (thread.waiting > 0) continue;
      thread.waiting = 0;
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

      blocksThisFrame++;

      switch (block.type) {
        /* ── Motion ── */
        case "motion_movesteps": {
          const steps = getNum(block, "STEPS", 10);
          const rad = ((state.rotation - 90) * Math.PI) / 180;
          state.x += Math.cos(rad) * steps;
          state.y += Math.sin(rad) * steps;
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
        case "motion_gotoxy":
          state.x = getNum(block, "X", 0);
          state.y = getNum(block, "Y", 0);
          thread.pc++;
          break;
        case "motion_glideto": {
          // Simplified: just teleport (full glide would need async)
          state.x = getNum(block, "X", 0);
          state.y = getNum(block, "Y", 0);
          thread.waiting = getNum(block, "SECS", 1);
          break;
        }
        case "motion_changex":
          state.x += getNum(block, "DX", 10);
          thread.pc++;
          break;
        case "motion_changey":
          state.y += getNum(block, "DY", 10);
          thread.pc++;
          break;
        case "motion_setx":
          state.x = getNum(block, "X", 0);
          thread.pc++;
          break;
        case "motion_sety":
          state.y = getNum(block, "Y", 0);
          thread.pc++;
          break;
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
        case "looks_nextcostume":
          state.costumeIndex++;
          thread.pc++;
          break;
        case "looks_setcostume":
          // Could map name to index
          thread.pc++;
          break;
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

        /* ── Sound ── */
        case "sound_play":
        case "sound_playuntildone":
          // Stub - would need Web Audio API
          thread.pc++;
          break;
        case "sound_stop":
          thread.pc++;
          break;
        case "sound_setvolume":
          state.volume = getNum(block, "VOLUME", 100);
          thread.pc++;
          break;
        case "sound_changevolume":
          state.volume = Math.max(0, Math.min(100, state.volume + getNum(block, "VOL", -10)));
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
          const cond = getVal(block, "CONDITION", true);
          if (!cond || cond === "false" || cond === 0) {
            // Skip children of this if block
            const children = [...thread.blockMap.values()].filter(b => b.parent === block.id);
            thread.pc += children.length + 1;
          } else {
            thread.pc++;
          }
          break;
        }
        case "control_ifelse": {
          const cond2 = getVal(block, "CONDITION", true);
          if (!cond2 || cond2 === "false" || cond2 === 0) {
            const children = [...thread.blockMap.values()].filter(b => b.parent === block.id);
            thread.pc += children.length + 1;
          } else {
            thread.pc++;
          }
          break;
        }
        case "control_waituntil":
          // Simplified: just proceed
          thread.pc++;
          break;
        case "control_repeatuntil":
          // Simplified: act like forever for now
          thread.loopStack.push({
            blockId: block.id,
            count: 0,
            max: -1,
            returnPc: thread.pc + 1,
          });
          thread.pc++;
          break;
        case "control_stop":
          thread.done = true;
          break;
        case "control_createclone":
        case "control_deleteclone":
        case "control_whencloned":
          thread.pc++;
          break;

        /* ── Operators (reporters - just advance) ── */
        case "operator_add":
        case "operator_subtract":
        case "operator_multiply":
        case "operator_divide":
        case "operator_mod":
        case "operator_round":
        case "operator_random":
        case "operator_gt":
        case "operator_lt":
        case "operator_equals":
        case "operator_and":
        case "operator_or":
        case "operator_not":
        case "operator_join":
        case "operator_length":
        case "operator_letterof":
        case "operator_contains":
        case "operator_mathop":
          thread.pc++;
          break;

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
        case "variable_hide":
          thread.pc++;
          break;

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
        case "list_length":
        case "list_contains":
          thread.pc++;
          break;

        /* ── Physics ── */
        case "physics_setgravity":
        case "physics_setvelocity":
        case "physics_applyforce":
        case "physics_bounce":
        case "physics_setfriction":
        case "physics_collision":
        case "physics_setmass":
        case "physics_setbouncy":
          thread.pc++;
          break;

        /* ── Sensing ── */
        case "sensing_touching":
        case "sensing_touchingcolor":
        case "sensing_distanceto":
          thread.pc++;
          break;
        case "sensing_keypressed": {
          // This is a reporter, just advance
          thread.pc++;
          break;
        }
        case "sensing_mousedown":
        case "sensing_mousex":
        case "sensing_mousey":
        case "sensing_answer":
        case "sensing_timer":
        case "sensing_loudness":
        case "sensing_dayssince2000":
        case "sensing_username":
          thread.pc++;
          break;
        case "sensing_resettimer":
          engine.timer = 0;
          thread.pc++;
          break;
        case "sensing_ask":
          state.sayText = "❓ " + getStr(block, "QUESTION", "What's your name?");
          thread.waiting = 2;
          break;

        /* ── Custom ── */
        case "custom_define":
        case "custom_call":
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
        case "ai_complete":
        case "ai_classify":
        case "ai_sentiment":
        case "ai_decide":
        case "ai_emotion":
          // Reporter/boolean blocks - advance
          thread.pc++;
          break;

        /* ── Hat blocks (skip in execution) ── */
        case "event_whenflagclicked":
        case "event_whenkeypressed":
        case "event_whenthisspriteclicked":
        case "event_whenbackdropswitches":
        case "event_whenbroadcastreceived":
          thread.pc++;
          break;

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

/* ── Check if any threads are active ── */
export function isRunning(engine: RuntimeEngine): boolean {
  return engine.running && engine.threads.length > 0;
}
