import type { BlockCategory } from "@scratch/shared";

export type BlockShape = "hat" | "stack" | "c" | "cap" | "reporter" | "boolean";

export interface BlockDef {
  type: string;
  category: BlockCategory;
  label: string;
  color: string;
  shape: BlockShape;
  hint?: string;
  inputs?: { name: string; type: "number" | "string" | "boolean"; default: any }[];
}

const CATEGORY_COLORS: Record<BlockCategory, string> = {
  motion: "#4C97FF",
  looks: "#9966FF",
  sound: "#CF63CF",
  events: "#FFBF00",
  control: "#FFAB19",
  operators: "#59C059",
  variables: "#FF8C1A",
  lists: "#FF661A",
  custom: "#FF6680",
  physics: "#5CB1D6",
  sensing: "#5CB1D6",
  ai: "#FF6B9D",
};

export const BLOCK_DEFS: BlockDef[] = [
  /* ─── Motion ─── */
  { type: "motion_movesteps", category: "motion", label: "move (STEPS) steps", color: CATEGORY_COLORS.motion, shape: "stack", hint: "Move forward", inputs: [{ name: "STEPS", type: "number", default: 10 }] },
  { type: "motion_turnright", category: "motion", label: "turn ↻ (DEGREES) degrees", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "DEGREES", type: "number", default: 15 }] },
  { type: "motion_turnleft", category: "motion", label: "turn ↺ (DEGREES) degrees", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "DEGREES", type: "number", default: 15 }] },
  { type: "motion_gotoxy", category: "motion", label: "go to x: (X) y: (Y)", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "X", type: "number", default: 0 }, { name: "Y", type: "number", default: 0 }] },
  { type: "motion_glideto", category: "motion", label: "glide (SECS) secs to x: (X) y: (Y)", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "SECS", type: "number", default: 1 }, { name: "X", type: "number", default: 0 }, { name: "Y", type: "number", default: 0 }] },
  { type: "motion_changex", category: "motion", label: "change x by (DX)", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "DX", type: "number", default: 10 }] },
  { type: "motion_changey", category: "motion", label: "change y by (DY)", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "DY", type: "number", default: 10 }] },
  { type: "motion_setx", category: "motion", label: "set x to (X)", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "X", type: "number", default: 0 }] },
  { type: "motion_sety", category: "motion", label: "set y to (Y)", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "Y", type: "number", default: 0 }] },
  { type: "motion_bounceonedge", category: "motion", label: "if on edge, bounce", color: CATEGORY_COLORS.motion, shape: "stack" },
  { type: "motion_pointindirection", category: "motion", label: "point in direction (DIR)", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "DIR", type: "number", default: 90 }] },
  { type: "motion_pointtowards", category: "motion", label: "point towards (TARGET)", color: CATEGORY_COLORS.motion, shape: "stack", inputs: [{ name: "TARGET", type: "string", default: "mouse" }] },
  { type: "motion_gotorandom", category: "motion", label: "go to random position", color: CATEGORY_COLORS.motion, shape: "stack" },
  { type: "motion_xposition", category: "motion", label: "x position", color: CATEGORY_COLORS.motion, shape: "reporter" },
  { type: "motion_yposition", category: "motion", label: "y position", color: CATEGORY_COLORS.motion, shape: "reporter" },
  { type: "motion_direction", category: "motion", label: "direction", color: CATEGORY_COLORS.motion, shape: "reporter" },

  /* ─── Looks ─── */
  { type: "looks_say", category: "looks", label: "say (MESSAGE)", color: CATEGORY_COLORS.looks, shape: "stack", inputs: [{ name: "MESSAGE", type: "string", default: "Hello!" }] },
  { type: "looks_sayforsecs", category: "looks", label: "say (MESSAGE) for (SECS) secs", color: CATEGORY_COLORS.looks, shape: "stack", inputs: [{ name: "MESSAGE", type: "string", default: "Hmm..." }, { name: "SECS", type: "number", default: 2 }] },
  { type: "looks_think", category: "looks", label: "think (MESSAGE)", color: CATEGORY_COLORS.looks, shape: "stack", inputs: [{ name: "MESSAGE", type: "string", default: "Hmm..." }] },
  { type: "looks_show", category: "looks", label: "show", color: CATEGORY_COLORS.looks, shape: "stack" },
  { type: "looks_hide", category: "looks", label: "hide", color: CATEGORY_COLORS.looks, shape: "stack" },
  { type: "looks_setsize", category: "looks", label: "set size to (SIZE) %", color: CATEGORY_COLORS.looks, shape: "stack", inputs: [{ name: "SIZE", type: "number", default: 100 }] },
  { type: "looks_changesize", category: "looks", label: "change size by (CHANGE)", color: CATEGORY_COLORS.looks, shape: "stack", inputs: [{ name: "CHANGE", type: "number", default: 10 }] },
  { type: "looks_seteffect", category: "looks", label: "set (EFFECT) effect to (VALUE)", color: CATEGORY_COLORS.looks, shape: "stack", inputs: [{ name: "EFFECT", type: "string", default: "color" }, { name: "VALUE", type: "number", default: 25 }] },
  { type: "looks_cleareffects", category: "looks", label: "clear graphic effects", color: CATEGORY_COLORS.looks, shape: "stack" },
  { type: "looks_nextcostume", category: "looks", label: "next costume", color: CATEGORY_COLORS.looks, shape: "stack" },
  { type: "looks_setcostume", category: "looks", label: "switch costume to (NAME)", color: CATEGORY_COLORS.looks, shape: "stack", inputs: [{ name: "NAME", type: "string", default: "costume1" }] },
  { type: "looks_goforward", category: "looks", label: "go to front layer", color: CATEGORY_COLORS.looks, shape: "stack" },
  { type: "looks_goback", category: "looks", label: "go back (N) layers", color: CATEGORY_COLORS.looks, shape: "stack", inputs: [{ name: "N", type: "number", default: 1 }] },
  { type: "looks_setcolor", category: "looks", label: "set color to (COLOR)", color: CATEGORY_COLORS.looks, shape: "stack", inputs: [{ name: "COLOR", type: "string", default: "#ff6600" }] },

  /* ─── Sound ─── */
  { type: "sound_play", category: "sound", label: "play sound (SOUND)", color: CATEGORY_COLORS.sound, shape: "stack", inputs: [{ name: "SOUND", type: "string", default: "pop" }] },
  { type: "sound_playuntildone", category: "sound", label: "play sound (SOUND) until done", color: CATEGORY_COLORS.sound, shape: "stack", inputs: [{ name: "SOUND", type: "string", default: "pop" }] },
  { type: "sound_stop", category: "sound", label: "stop all sounds", color: CATEGORY_COLORS.sound, shape: "stack" },
  { type: "sound_setvolume", category: "sound", label: "set volume to (VOLUME) %", color: CATEGORY_COLORS.sound, shape: "stack", inputs: [{ name: "VOLUME", type: "number", default: 100 }] },
  { type: "sound_changevolume", category: "sound", label: "change volume by (VOL)", color: CATEGORY_COLORS.sound, shape: "stack", inputs: [{ name: "VOL", type: "number", default: -10 }] },

  /* ─── Events ─── */
  { type: "event_whenflagclicked", category: "events", label: "when 🟢 flag clicked", color: CATEGORY_COLORS.events, shape: "hat" },
  { type: "event_whenkeypressed", category: "events", label: "when (KEY) key pressed", color: CATEGORY_COLORS.events, shape: "hat", inputs: [{ name: "KEY", type: "string", default: "space" }] },
  { type: "event_whenthisspriteclicked", category: "events", label: "when this sprite clicked", color: CATEGORY_COLORS.events, shape: "hat" },
  { type: "event_whenbackdropswitches", category: "events", label: "when backdrop switches to (NAME)", color: CATEGORY_COLORS.events, shape: "hat", inputs: [{ name: "NAME", type: "string", default: "backdrop1" }] },
  { type: "event_whenbroadcastreceived", category: "events", label: "when I receive (MESSAGE)", color: CATEGORY_COLORS.events, shape: "hat", inputs: [{ name: "MESSAGE", type: "string", default: "go" }] },
  { type: "event_broadcast", category: "events", label: "broadcast (MESSAGE)", color: CATEGORY_COLORS.events, shape: "stack", inputs: [{ name: "MESSAGE", type: "string", default: "go" }] },
  { type: "event_broadcastandwait", category: "events", label: "broadcast (MESSAGE) and wait", color: CATEGORY_COLORS.events, shape: "stack", inputs: [{ name: "MESSAGE", type: "string", default: "go" }] },

  /* ─── Control ─── */
  { type: "control_wait", category: "control", label: "wait (DURATION) seconds", color: CATEGORY_COLORS.control, shape: "stack", inputs: [{ name: "DURATION", type: "number", default: 1 }] },
  { type: "control_repeat", category: "control", label: "repeat (TIMES)", color: CATEGORY_COLORS.control, shape: "c", inputs: [{ name: "TIMES", type: "number", default: 10 }] },
  { type: "control_forever", category: "control", label: "forever", color: CATEGORY_COLORS.control, shape: "c" },
  { type: "control_if", category: "control", label: "if ◇ then", color: CATEGORY_COLORS.control, shape: "c", inputs: [{ name: "CONDITION", type: "boolean", default: true }] },
  { type: "control_ifelse", category: "control", label: "if ◇ then … else", color: CATEGORY_COLORS.control, shape: "c", inputs: [{ name: "CONDITION", type: "boolean", default: true }] },
  { type: "control_waituntil", category: "control", label: "wait until ◇", color: CATEGORY_COLORS.control, shape: "stack", inputs: [{ name: "CONDITION", type: "boolean", default: true }] },
  { type: "control_repeatuntil", category: "control", label: "repeat until ◇", color: CATEGORY_COLORS.control, shape: "c", inputs: [{ name: "CONDITION", type: "boolean", default: false }] },
  { type: "control_stop", category: "control", label: "stop all", color: CATEGORY_COLORS.control, shape: "cap" },
  { type: "control_createclone", category: "control", label: "create clone of (SPRITE)", color: CATEGORY_COLORS.control, shape: "stack", inputs: [{ name: "SPRITE", type: "string", default: "myself" }] },
  { type: "control_deleteclone", category: "control", label: "delete this clone", color: CATEGORY_COLORS.control, shape: "cap" },
  { type: "control_whencloned", category: "control", label: "when I start as a clone", color: CATEGORY_COLORS.control, shape: "hat" },

  /* ─── Operators ─── */
  { type: "operator_add", category: "operators", label: "(A) + (B)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 0 }] },
  { type: "operator_subtract", category: "operators", label: "(A) − (B)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 0 }] },
  { type: "operator_multiply", category: "operators", label: "(A) × (B)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 0 }] },
  { type: "operator_divide", category: "operators", label: "(A) ÷ (B)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 0 }] },
  { type: "operator_mod", category: "operators", label: "(A) mod (B)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "A", type: "number", default: 10 }, { name: "B", type: "number", default: 3 }] },
  { type: "operator_round", category: "operators", label: "round (A)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "A", type: "number", default: 3.7 }] },
  { type: "operator_random", category: "operators", label: "pick random (FROM) to (TO)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "FROM", type: "number", default: 1 }, { name: "TO", type: "number", default: 10 }] },
  { type: "operator_gt", category: "operators", label: "(A) > (B)", color: CATEGORY_COLORS.operators, shape: "boolean", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 50 }] },
  { type: "operator_lt", category: "operators", label: "(A) < (B)", color: CATEGORY_COLORS.operators, shape: "boolean", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 50 }] },
  { type: "operator_equals", category: "operators", label: "(A) = (B)", color: CATEGORY_COLORS.operators, shape: "boolean", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 50 }] },
  { type: "operator_and", category: "operators", label: "◇ and ◇", color: CATEGORY_COLORS.operators, shape: "boolean", inputs: [{ name: "A", type: "boolean", default: true }, { name: "B", type: "boolean", default: true }] },
  { type: "operator_or", category: "operators", label: "◇ or ◇", color: CATEGORY_COLORS.operators, shape: "boolean", inputs: [{ name: "A", type: "boolean", default: false }, { name: "B", type: "boolean", default: false }] },
  { type: "operator_not", category: "operators", label: "not ◇", color: CATEGORY_COLORS.operators, shape: "boolean", inputs: [{ name: "A", type: "boolean", default: false }] },
  { type: "operator_join", category: "operators", label: "join (A) (B)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "A", type: "string", default: "hello " }, { name: "B", type: "string", default: "world" }] },
  { type: "operator_length", category: "operators", label: "length of (TEXT)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "TEXT", type: "string", default: "hello" }] },
  { type: "operator_letterof", category: "operators", label: "letter (N) of (TEXT)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "N", type: "number", default: 1 }, { name: "TEXT", type: "string", default: "hello" }] },
  { type: "operator_contains", category: "operators", label: "(TEXT) contains (SEARCH)?", color: CATEGORY_COLORS.operators, shape: "boolean", inputs: [{ name: "TEXT", type: "string", default: "hello world" }, { name: "SEARCH", type: "string", default: "world" }] },
  { type: "operator_mathop", category: "operators", label: "(OP) of (A)", color: CATEGORY_COLORS.operators, shape: "reporter", inputs: [{ name: "OP", type: "string", default: "abs" }, { name: "A", type: "number", default: -5 }] },

  /* ─── Variables ─── */
  { type: "variable_set", category: "variables", label: "set (VAR) to (VALUE)", color: CATEGORY_COLORS.variables, shape: "stack", inputs: [{ name: "VAR", type: "string", default: "score" }, { name: "VALUE", type: "number", default: 0 }] },
  { type: "variable_change", category: "variables", label: "change (VAR) by (VALUE)", color: CATEGORY_COLORS.variables, shape: "stack", inputs: [{ name: "VAR", type: "string", default: "score" }, { name: "VALUE", type: "number", default: 1 }] },
  { type: "variable_show", category: "variables", label: "show variable (VAR)", color: CATEGORY_COLORS.variables, shape: "stack", inputs: [{ name: "VAR", type: "string", default: "score" }] },
  { type: "variable_hide", category: "variables", label: "hide variable (VAR)", color: CATEGORY_COLORS.variables, shape: "stack", inputs: [{ name: "VAR", type: "string", default: "score" }] },

  /* ─── Lists ─── */
  { type: "list_add", category: "lists", label: "add (ITEM) to (LIST)", color: CATEGORY_COLORS.lists, shape: "stack", inputs: [{ name: "ITEM", type: "string", default: "apple" }, { name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_delete", category: "lists", label: "delete item (INDEX) of (LIST)", color: CATEGORY_COLORS.lists, shape: "stack", inputs: [{ name: "INDEX", type: "number", default: 1 }, { name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_deleteall", category: "lists", label: "delete all of (LIST)", color: CATEGORY_COLORS.lists, shape: "stack", inputs: [{ name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_insert", category: "lists", label: "insert (ITEM) at (INDEX) of (LIST)", color: CATEGORY_COLORS.lists, shape: "stack", inputs: [{ name: "ITEM", type: "string", default: "banana" }, { name: "INDEX", type: "number", default: 1 }, { name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_replace", category: "lists", label: "replace item (INDEX) of (LIST) with (ITEM)", color: CATEGORY_COLORS.lists, shape: "stack", inputs: [{ name: "INDEX", type: "number", default: 1 }, { name: "LIST", type: "string", default: "fruits" }, { name: "ITEM", type: "string", default: "grape" }] },
  { type: "list_item", category: "lists", label: "item (INDEX) of (LIST)", color: CATEGORY_COLORS.lists, shape: "reporter", inputs: [{ name: "INDEX", type: "number", default: 1 }, { name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_length", category: "lists", label: "length of (LIST)", color: CATEGORY_COLORS.lists, shape: "reporter", inputs: [{ name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_contains", category: "lists", label: "(LIST) contains (ITEM)?", color: CATEGORY_COLORS.lists, shape: "boolean", inputs: [{ name: "LIST", type: "string", default: "fruits" }, { name: "ITEM", type: "string", default: "apple" }] },

  /* ─── Physics ─── */
  { type: "physics_setgravity", category: "physics", label: "set gravity to (G)", color: CATEGORY_COLORS.physics, shape: "stack", inputs: [{ name: "G", type: "number", default: 10 }] },
  { type: "physics_setvelocity", category: "physics", label: "set speed x: (VX) y: (VY)", color: CATEGORY_COLORS.physics, shape: "stack", inputs: [{ name: "VX", type: "number", default: 0 }, { name: "VY", type: "number", default: 5 }] },
  { type: "physics_applyforce", category: "physics", label: "push with x: (FX) y: (FY)", color: CATEGORY_COLORS.physics, shape: "stack", inputs: [{ name: "FX", type: "number", default: 0 }, { name: "FY", type: "number", default: -10 }] },
  { type: "physics_bounce", category: "physics", label: "bounce off edges", color: CATEGORY_COLORS.physics, shape: "stack" },
  { type: "physics_setfriction", category: "physics", label: "set friction to (F)", color: CATEGORY_COLORS.physics, shape: "stack", inputs: [{ name: "F", type: "number", default: 0.1 }] },
  { type: "physics_collision", category: "physics", label: "when bumping into (SPRITE)", color: CATEGORY_COLORS.physics, shape: "hat", inputs: [{ name: "SPRITE", type: "string", default: "any" }] },
  { type: "physics_setmass", category: "physics", label: "set weight to (M)", color: CATEGORY_COLORS.physics, shape: "stack", inputs: [{ name: "M", type: "number", default: 1 }] },
  { type: "physics_setbouncy", category: "physics", label: "set bounciness to (B)", color: CATEGORY_COLORS.physics, shape: "stack", inputs: [{ name: "B", type: "number", default: 0.5 }] },

  /* ─── Sensing ─── */
  { type: "sensing_touching", category: "sensing", label: "touching (OBJECT)?", color: CATEGORY_COLORS.sensing, shape: "boolean", inputs: [{ name: "OBJECT", type: "string", default: "edge" }] },
  { type: "sensing_touchingcolor", category: "sensing", label: "touching color (COLOR)?", color: CATEGORY_COLORS.sensing, shape: "boolean", inputs: [{ name: "COLOR", type: "string", default: "#ff0000" }] },
  { type: "sensing_distanceto", category: "sensing", label: "distance to (OBJECT)", color: CATEGORY_COLORS.sensing, shape: "reporter", inputs: [{ name: "OBJECT", type: "string", default: "mouse" }] },
  { type: "sensing_keypressed", category: "sensing", label: "key (KEY) pressed?", color: CATEGORY_COLORS.sensing, shape: "boolean", inputs: [{ name: "KEY", type: "string", default: "space" }] },
  { type: "sensing_mousedown", category: "sensing", label: "mouse down?", color: CATEGORY_COLORS.sensing, shape: "boolean" },
  { type: "sensing_mousex", category: "sensing", label: "mouse x", color: CATEGORY_COLORS.sensing, shape: "reporter" },
  { type: "sensing_mousey", category: "sensing", label: "mouse y", color: CATEGORY_COLORS.sensing, shape: "reporter" },
  { type: "sensing_ask", category: "sensing", label: "ask (QUESTION) and wait", color: CATEGORY_COLORS.sensing, shape: "stack", inputs: [{ name: "QUESTION", type: "string", default: "What's your name?" }] },
  { type: "sensing_answer", category: "sensing", label: "answer", color: CATEGORY_COLORS.sensing, shape: "reporter" },
  { type: "sensing_timer", category: "sensing", label: "timer", color: CATEGORY_COLORS.sensing, shape: "reporter" },
  { type: "sensing_resettimer", category: "sensing", label: "reset timer", color: CATEGORY_COLORS.sensing, shape: "stack" },
  { type: "sensing_loudness", category: "sensing", label: "loudness", color: CATEGORY_COLORS.sensing, shape: "reporter" },
  { type: "sensing_dayssince2000", category: "sensing", label: "days since 2000", color: CATEGORY_COLORS.sensing, shape: "reporter" },
  { type: "sensing_username", category: "sensing", label: "username", color: CATEGORY_COLORS.sensing, shape: "reporter" },

  /* ─── My Blocks ─── */
  { type: "custom_define", category: "custom", label: "define (NAME)", color: CATEGORY_COLORS.custom, shape: "hat", inputs: [{ name: "NAME", type: "string", default: "myBlock" }] },
  { type: "custom_call", category: "custom", label: "run (NAME)", color: CATEGORY_COLORS.custom, shape: "stack", inputs: [{ name: "NAME", type: "string", default: "myBlock" }] },

  /* ─── AI ─── */
  { type: "ai_whenresponse", category: "ai", label: "when AI responds", color: CATEGORY_COLORS.ai, shape: "hat" },
  { type: "ai_ask", category: "ai", label: "ask AI (PROMPT)", color: CATEGORY_COLORS.ai, shape: "stack", inputs: [{ name: "PROMPT", type: "string", default: "Tell me a joke" }] },
  { type: "ai_response", category: "ai", label: "AI response", color: CATEGORY_COLORS.ai, shape: "reporter" },
  { type: "ai_complete", category: "ai", label: "AI complete (TEXT)", color: CATEGORY_COLORS.ai, shape: "reporter", inputs: [{ name: "TEXT", type: "string", default: "Once upon a time" }] },
  { type: "ai_classify", category: "ai", label: "classify (TEXT) as (CATEGORIES)", color: CATEGORY_COLORS.ai, shape: "reporter", inputs: [{ name: "TEXT", type: "string", default: "I love cats" }, { name: "CATEGORIES", type: "string", default: "happy,sad,neutral" }] },
  { type: "ai_sentiment", category: "ai", label: "sentiment of (TEXT)", color: CATEGORY_COLORS.ai, shape: "reporter", inputs: [{ name: "TEXT", type: "string", default: "This is amazing!" }] },
  { type: "ai_translate", category: "ai", label: "translate (TEXT) to (LANG)", color: CATEGORY_COLORS.ai, shape: "reporter", inputs: [{ name: "TEXT", type: "string", default: "Hello" }, { name: "LANG", type: "string", default: "Spanish" }] },
  { type: "ai_generate_story", category: "ai", label: "AI story about (TOPIC)", color: CATEGORY_COLORS.ai, shape: "reporter", inputs: [{ name: "TOPIC", type: "string", default: "a brave cat" }] },
  { type: "ai_image_describe", category: "ai", label: "describe image (DESCRIPTION)", color: CATEGORY_COLORS.ai, shape: "stack", inputs: [{ name: "DESCRIPTION", type: "string", default: "a red spaceship" }] },
  { type: "ai_decide", category: "ai", label: "AI should I (QUESTION)?", color: CATEGORY_COLORS.ai, shape: "boolean", inputs: [{ name: "QUESTION", type: "string", default: "jump now" }] },
  { type: "ai_emotion", category: "ai", label: "AI emotion of (TEXT)", color: CATEGORY_COLORS.ai, shape: "reporter", inputs: [{ name: "TEXT", type: "string", default: "I'm so excited!" }] },
  { type: "ai_rhyme", category: "ai", label: "AI rhyme with (WORD)", color: CATEGORY_COLORS.ai, shape: "reporter", inputs: [{ name: "WORD", type: "string", default: "cat" }] },
  { type: "ai_say_smart", category: "ai", label: "AI say something about (TOPIC)", color: CATEGORY_COLORS.ai, shape: "stack", inputs: [{ name: "TOPIC", type: "string", default: "space" }] },
  { type: "ai_code_explain", category: "ai", label: "explain my code", color: CATEGORY_COLORS.ai, shape: "stack" },
  { type: "ai_suggest_next", category: "ai", label: "AI suggest next block", color: CATEGORY_COLORS.ai, shape: "stack" },
];

export function getBlockDef(type: string): BlockDef | undefined {
  return BLOCK_DEFS.find((b) => b.type === type);
}

export function getCategoryColor(cat: BlockCategory): string {
  return CATEGORY_COLORS[cat] || "#888";
}

export const CATEGORIES: { id: BlockCategory; label: string; color: string; icon: string }[] = [
  { id: "motion", label: "Motion", color: CATEGORY_COLORS.motion, icon: "➤" },
  { id: "looks", label: "Looks", color: CATEGORY_COLORS.looks, icon: "◉" },
  { id: "sound", label: "Sound", color: CATEGORY_COLORS.sound, icon: "♫" },
  { id: "events", label: "Events", color: CATEGORY_COLORS.events, icon: "⚑" },
  { id: "control", label: "Control", color: CATEGORY_COLORS.control, icon: "↻" },
  { id: "sensing", label: "Sensing", color: CATEGORY_COLORS.sensing, icon: "◔" },
  { id: "operators", label: "Operators", color: CATEGORY_COLORS.operators, icon: "+" },
  { id: "variables", label: "Variables", color: CATEGORY_COLORS.variables, icon: "≡" },
  { id: "lists", label: "Lists", color: CATEGORY_COLORS.lists, icon: "☰" },
  { id: "physics", label: "Physics", color: CATEGORY_COLORS.physics, icon: "⊕" },
  { id: "custom", label: "My Blocks", color: CATEGORY_COLORS.custom, icon: "✦" },
  { id: "ai", label: "AI", color: CATEGORY_COLORS.ai, icon: "✧" },
];
