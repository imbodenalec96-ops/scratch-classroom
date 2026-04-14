import type { BlockCategory } from "@scratch/shared";

export interface BlockDef {
  type: string;
  category: BlockCategory;
  label: string;
  color: string;
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
};

export const BLOCK_DEFS: BlockDef[] = [
  /* ─── Motion ─── */
  { type: "motion_movesteps", category: "motion", label: "move (STEPS) steps", color: CATEGORY_COLORS.motion, hint: "Move forward", inputs: [{ name: "STEPS", type: "number", default: 10 }] },
  { type: "motion_turnright", category: "motion", label: "turn right (DEGREES)°", color: CATEGORY_COLORS.motion, hint: "Rotate clockwise", inputs: [{ name: "DEGREES", type: "number", default: 15 }] },
  { type: "motion_turnleft", category: "motion", label: "turn left (DEGREES)°", color: CATEGORY_COLORS.motion, hint: "Rotate counter-clockwise", inputs: [{ name: "DEGREES", type: "number", default: 15 }] },
  { type: "motion_gotoxy", category: "motion", label: "go to x: (X) y: (Y)", color: CATEGORY_COLORS.motion, hint: "Jump to a spot", inputs: [{ name: "X", type: "number", default: 0 }, { name: "Y", type: "number", default: 0 }] },
  { type: "motion_glideto", category: "motion", label: "glide (SECS) secs to x: (X) y: (Y)", color: CATEGORY_COLORS.motion, hint: "Slide smoothly", inputs: [{ name: "SECS", type: "number", default: 1 }, { name: "X", type: "number", default: 0 }, { name: "Y", type: "number", default: 0 }] },
  { type: "motion_changex", category: "motion", label: "change x by (DX)", color: CATEGORY_COLORS.motion, hint: "Move left/right", inputs: [{ name: "DX", type: "number", default: 10 }] },
  { type: "motion_changey", category: "motion", label: "change y by (DY)", color: CATEGORY_COLORS.motion, hint: "Move up/down", inputs: [{ name: "DY", type: "number", default: 10 }] },
  { type: "motion_setx", category: "motion", label: "set x to (X)", color: CATEGORY_COLORS.motion, inputs: [{ name: "X", type: "number", default: 0 }] },
  { type: "motion_sety", category: "motion", label: "set y to (Y)", color: CATEGORY_COLORS.motion, inputs: [{ name: "Y", type: "number", default: 0 }] },
  { type: "motion_bounceonedge", category: "motion", label: "if on edge, bounce", color: CATEGORY_COLORS.motion, hint: "Bounce when hitting a wall" },
  { type: "motion_pointindirection", category: "motion", label: "point in direction (DIR)", color: CATEGORY_COLORS.motion, hint: "Face a direction (0=up)", inputs: [{ name: "DIR", type: "number", default: 90 }] },
  { type: "motion_pointtowards", category: "motion", label: "point towards (TARGET)", color: CATEGORY_COLORS.motion, hint: "Face towards mouse or sprite", inputs: [{ name: "TARGET", type: "string", default: "mouse" }] },
  { type: "motion_gotorandom", category: "motion", label: "go to random spot", color: CATEGORY_COLORS.motion, hint: "Jump somewhere random" },
  { type: "motion_xposition", category: "motion", label: "x position", color: CATEGORY_COLORS.motion, hint: "Where am I? (left-right)" },
  { type: "motion_yposition", category: "motion", label: "y position", color: CATEGORY_COLORS.motion, hint: "Where am I? (up-down)" },
  { type: "motion_direction", category: "motion", label: "direction", color: CATEGORY_COLORS.motion, hint: "Which way am I facing?" },

  /* ─── Looks ─── */
  { type: "looks_say", category: "looks", label: "say (MESSAGE)", color: CATEGORY_COLORS.looks, hint: "Show a speech bubble", inputs: [{ name: "MESSAGE", type: "string", default: "Hello!" }] },
  { type: "looks_sayforsecs", category: "looks", label: "say (MESSAGE) for (SECS) secs", color: CATEGORY_COLORS.looks, hint: "Say then hide bubble", inputs: [{ name: "MESSAGE", type: "string", default: "Hmm...", }, { name: "SECS", type: "number", default: 2 }] },
  { type: "looks_think", category: "looks", label: "think (MESSAGE)", color: CATEGORY_COLORS.looks, hint: "Show a thought bubble", inputs: [{ name: "MESSAGE", type: "string", default: "Hmm..." }] },
  { type: "looks_show", category: "looks", label: "show", color: CATEGORY_COLORS.looks, hint: "Make sprite visible" },
  { type: "looks_hide", category: "looks", label: "hide", color: CATEGORY_COLORS.looks, hint: "Make sprite invisible" },
  { type: "looks_setsize", category: "looks", label: "set size to (SIZE) %", color: CATEGORY_COLORS.looks, hint: "100% = normal size", inputs: [{ name: "SIZE", type: "number", default: 100 }] },
  { type: "looks_changesize", category: "looks", label: "change size by (CHANGE)", color: CATEGORY_COLORS.looks, hint: "Grow or shrink", inputs: [{ name: "CHANGE", type: "number", default: 10 }] },
  { type: "looks_seteffect", category: "looks", label: "set (EFFECT) effect to (VALUE)", color: CATEGORY_COLORS.looks, hint: "color, ghost, pixelate...", inputs: [{ name: "EFFECT", type: "string", default: "color" }, { name: "VALUE", type: "number", default: 25 }] },
  { type: "looks_cleareffects", category: "looks", label: "clear graphic effects", color: CATEGORY_COLORS.looks, hint: "Reset all effects" },
  { type: "looks_nextcostume", category: "looks", label: "next costume", color: CATEGORY_COLORS.looks, hint: "Switch to next look" },
  { type: "looks_setcostume", category: "looks", label: "switch costume to (NAME)", color: CATEGORY_COLORS.looks, hint: "Pick a specific look", inputs: [{ name: "NAME", type: "string", default: "costume1" }] },
  { type: "looks_goforward", category: "looks", label: "go to front layer", color: CATEGORY_COLORS.looks, hint: "Show in front of others" },
  { type: "looks_goback", category: "looks", label: "go back (N) layers", color: CATEGORY_COLORS.looks, hint: "Move behind others", inputs: [{ name: "N", type: "number", default: 1 }] },
  { type: "looks_setcolor", category: "looks", label: "set color to (COLOR)", color: CATEGORY_COLORS.looks, hint: "Change sprite color", inputs: [{ name: "COLOR", type: "string", default: "#ff6600" }] },

  /* ─── Sound ─── */
  { type: "sound_play", category: "sound", label: "play sound (SOUND)", color: CATEGORY_COLORS.sound, hint: "Play and keep going", inputs: [{ name: "SOUND", type: "string", default: "pop" }] },
  { type: "sound_playuntildone", category: "sound", label: "play sound (SOUND) until done", color: CATEGORY_COLORS.sound, hint: "Wait for sound to finish", inputs: [{ name: "SOUND", type: "string", default: "pop" }] },
  { type: "sound_stop", category: "sound", label: "stop all sounds", color: CATEGORY_COLORS.sound, hint: "Silence!" },
  { type: "sound_setvolume", category: "sound", label: "set volume to (VOLUME) %", color: CATEGORY_COLORS.sound, hint: "0 = mute, 100 = full", inputs: [{ name: "VOLUME", type: "number", default: 100 }] },
  { type: "sound_changevolume", category: "sound", label: "change volume by (VOL)", color: CATEGORY_COLORS.sound, hint: "Make louder or softer", inputs: [{ name: "VOL", type: "number", default: -10 }] },

  /* ─── Events ─── */
  { type: "event_whenflagclicked", category: "events", label: "when 🟢 flag clicked", color: CATEGORY_COLORS.events, hint: "Start here!" },
  { type: "event_whenkeypressed", category: "events", label: "when (KEY) key pressed", color: CATEGORY_COLORS.events, hint: "Do something on key press", inputs: [{ name: "KEY", type: "string", default: "space" }] },
  { type: "event_whenthisspriteclicked", category: "events", label: "when this sprite clicked", color: CATEGORY_COLORS.events, hint: "Click the sprite to start" },
  { type: "event_whenbackdropswitches", category: "events", label: "when backdrop switches to (NAME)", color: CATEGORY_COLORS.events, hint: "React to scene change", inputs: [{ name: "NAME", type: "string", default: "backdrop1" }] },
  { type: "event_whenbroadcastreceived", category: "events", label: "when I receive (MESSAGE)", color: CATEGORY_COLORS.events, hint: "Listen for a message", inputs: [{ name: "MESSAGE", type: "string", default: "go" }] },
  { type: "event_broadcast", category: "events", label: "broadcast (MESSAGE)", color: CATEGORY_COLORS.events, hint: "Send a message to everyone", inputs: [{ name: "MESSAGE", type: "string", default: "go" }] },
  { type: "event_broadcastandwait", category: "events", label: "broadcast (MESSAGE) and wait", color: CATEGORY_COLORS.events, hint: "Send & wait for reply", inputs: [{ name: "MESSAGE", type: "string", default: "go" }] },

  /* ─── Control ─── */
  { type: "control_wait", category: "control", label: "wait (DURATION) seconds", color: CATEGORY_COLORS.control, hint: "Pause for a bit", inputs: [{ name: "DURATION", type: "number", default: 1 }] },
  { type: "control_repeat", category: "control", label: "repeat (TIMES)", color: CATEGORY_COLORS.control, hint: "Do something X times", inputs: [{ name: "TIMES", type: "number", default: 10 }] },
  { type: "control_forever", category: "control", label: "forever", color: CATEGORY_COLORS.control, hint: "Loop forever (never stops!)" },
  { type: "control_if", category: "control", label: "if ◇ then", color: CATEGORY_COLORS.control, hint: "Do something only if true", inputs: [{ name: "CONDITION", type: "boolean", default: true }] },
  { type: "control_ifelse", category: "control", label: "if ◇ then … else", color: CATEGORY_COLORS.control, hint: "Choose path A or B", inputs: [{ name: "CONDITION", type: "boolean", default: true }] },
  { type: "control_waituntil", category: "control", label: "wait until ◇", color: CATEGORY_COLORS.control, hint: "Pause until something is true", inputs: [{ name: "CONDITION", type: "boolean", default: true }] },
  { type: "control_repeatuntil", category: "control", label: "repeat until ◇", color: CATEGORY_COLORS.control, hint: "Keep going until true", inputs: [{ name: "CONDITION", type: "boolean", default: false }] },
  { type: "control_stop", category: "control", label: "stop all", color: CATEGORY_COLORS.control, hint: "Stop everything" },
  { type: "control_createclone", category: "control", label: "create clone of (SPRITE)", color: CATEGORY_COLORS.control, hint: "Make a copy of a sprite", inputs: [{ name: "SPRITE", type: "string", default: "myself" }] },
  { type: "control_deleteclone", category: "control", label: "delete this clone", color: CATEGORY_COLORS.control, hint: "Remove this copy" },
  { type: "control_whencloned", category: "control", label: "when I start as a clone", color: CATEGORY_COLORS.control, hint: "What should my clone do?" },

  /* ─── Operators ─── */
  { type: "operator_add", category: "operators", label: "(A) + (B)", color: CATEGORY_COLORS.operators, hint: "Add two numbers", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 0 }] },
  { type: "operator_subtract", category: "operators", label: "(A) − (B)", color: CATEGORY_COLORS.operators, hint: "Subtract", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 0 }] },
  { type: "operator_multiply", category: "operators", label: "(A) × (B)", color: CATEGORY_COLORS.operators, hint: "Multiply", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 0 }] },
  { type: "operator_divide", category: "operators", label: "(A) ÷ (B)", color: CATEGORY_COLORS.operators, hint: "Divide", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 0 }] },
  { type: "operator_mod", category: "operators", label: "(A) mod (B)", color: CATEGORY_COLORS.operators, hint: "Remainder after dividing", inputs: [{ name: "A", type: "number", default: 10 }, { name: "B", type: "number", default: 3 }] },
  { type: "operator_round", category: "operators", label: "round (A)", color: CATEGORY_COLORS.operators, hint: "Round to nearest whole", inputs: [{ name: "A", type: "number", default: 3.7 }] },
  { type: "operator_random", category: "operators", label: "pick random (FROM) to (TO)", color: CATEGORY_COLORS.operators, hint: "Random number in range", inputs: [{ name: "FROM", type: "number", default: 1 }, { name: "TO", type: "number", default: 10 }] },
  { type: "operator_gt", category: "operators", label: "(A) > (B)", color: CATEGORY_COLORS.operators, hint: "Is A bigger?", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 50 }] },
  { type: "operator_lt", category: "operators", label: "(A) < (B)", color: CATEGORY_COLORS.operators, hint: "Is A smaller?", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 50 }] },
  { type: "operator_equals", category: "operators", label: "(A) = (B)", color: CATEGORY_COLORS.operators, hint: "Are they the same?", inputs: [{ name: "A", type: "number", default: 0 }, { name: "B", type: "number", default: 50 }] },
  { type: "operator_and", category: "operators", label: "◇ and ◇", color: CATEGORY_COLORS.operators, hint: "Both must be true", inputs: [{ name: "A", type: "boolean", default: true }, { name: "B", type: "boolean", default: true }] },
  { type: "operator_or", category: "operators", label: "◇ or ◇", color: CATEGORY_COLORS.operators, hint: "At least one is true", inputs: [{ name: "A", type: "boolean", default: false }, { name: "B", type: "boolean", default: false }] },
  { type: "operator_not", category: "operators", label: "not ◇", color: CATEGORY_COLORS.operators, hint: "Flip true/false", inputs: [{ name: "A", type: "boolean", default: false }] },
  { type: "operator_join", category: "operators", label: "join (A) (B)", color: CATEGORY_COLORS.operators, hint: "Combine two words", inputs: [{ name: "A", type: "string", default: "hello " }, { name: "B", type: "string", default: "world" }] },
  { type: "operator_length", category: "operators", label: "length of (TEXT)", color: CATEGORY_COLORS.operators, hint: "How many letters?", inputs: [{ name: "TEXT", type: "string", default: "hello" }] },
  { type: "operator_letterof", category: "operators", label: "letter (N) of (TEXT)", color: CATEGORY_COLORS.operators, hint: "Get one letter", inputs: [{ name: "N", type: "number", default: 1 }, { name: "TEXT", type: "string", default: "hello" }] },
  { type: "operator_contains", category: "operators", label: "(TEXT) contains (SEARCH)?", color: CATEGORY_COLORS.operators, hint: "Is the word inside?", inputs: [{ name: "TEXT", type: "string", default: "hello world" }, { name: "SEARCH", type: "string", default: "world" }] },
  { type: "operator_mathop", category: "operators", label: "(OP) of (A)", color: CATEGORY_COLORS.operators, hint: "abs, floor, ceil, sqrt, sin, cos", inputs: [{ name: "OP", type: "string", default: "abs" }, { name: "A", type: "number", default: -5 }] },

  /* ─── Variables ─── */
  { type: "variable_set", category: "variables", label: "set (VAR) to (VALUE)", color: CATEGORY_COLORS.variables, hint: "Store a value", inputs: [{ name: "VAR", type: "string", default: "score" }, { name: "VALUE", type: "number", default: 0 }] },
  { type: "variable_change", category: "variables", label: "change (VAR) by (VALUE)", color: CATEGORY_COLORS.variables, hint: "Add to a value", inputs: [{ name: "VAR", type: "string", default: "score" }, { name: "VALUE", type: "number", default: 1 }] },
  { type: "variable_show", category: "variables", label: "show variable (VAR)", color: CATEGORY_COLORS.variables, hint: "Display on screen", inputs: [{ name: "VAR", type: "string", default: "score" }] },
  { type: "variable_hide", category: "variables", label: "hide variable (VAR)", color: CATEGORY_COLORS.variables, hint: "Remove from screen", inputs: [{ name: "VAR", type: "string", default: "score" }] },

  /* ─── Lists ─── */
  { type: "list_add", category: "lists", label: "add (ITEM) to (LIST)", color: CATEGORY_COLORS.lists, hint: "Put something in the list", inputs: [{ name: "ITEM", type: "string", default: "apple" }, { name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_delete", category: "lists", label: "delete item (INDEX) of (LIST)", color: CATEGORY_COLORS.lists, hint: "Remove from list", inputs: [{ name: "INDEX", type: "number", default: 1 }, { name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_deleteall", category: "lists", label: "delete all of (LIST)", color: CATEGORY_COLORS.lists, hint: "Empty the whole list", inputs: [{ name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_insert", category: "lists", label: "insert (ITEM) at (INDEX) of (LIST)", color: CATEGORY_COLORS.lists, hint: "Add at a position", inputs: [{ name: "ITEM", type: "string", default: "banana" }, { name: "INDEX", type: "number", default: 1 }, { name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_replace", category: "lists", label: "replace item (INDEX) of (LIST) with (ITEM)", color: CATEGORY_COLORS.lists, hint: "Swap an item", inputs: [{ name: "INDEX", type: "number", default: 1 }, { name: "LIST", type: "string", default: "fruits" }, { name: "ITEM", type: "string", default: "grape" }] },
  { type: "list_item", category: "lists", label: "item (INDEX) of (LIST)", color: CATEGORY_COLORS.lists, hint: "Get an item", inputs: [{ name: "INDEX", type: "number", default: 1 }, { name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_length", category: "lists", label: "length of (LIST)", color: CATEGORY_COLORS.lists, hint: "How many items?", inputs: [{ name: "LIST", type: "string", default: "fruits" }] },
  { type: "list_contains", category: "lists", label: "(LIST) contains (ITEM)?", color: CATEGORY_COLORS.lists, hint: "Is it in there?", inputs: [{ name: "LIST", type: "string", default: "fruits" }, { name: "ITEM", type: "string", default: "apple" }] },

  /* ─── Physics ─── */
  { type: "physics_setgravity", category: "physics", label: "set gravity to (G)", color: CATEGORY_COLORS.physics, hint: "How fast things fall", inputs: [{ name: "G", type: "number", default: 10 }] },
  { type: "physics_setvelocity", category: "physics", label: "set speed x: (VX) y: (VY)", color: CATEGORY_COLORS.physics, hint: "How fast to move", inputs: [{ name: "VX", type: "number", default: 0 }, { name: "VY", type: "number", default: 5 }] },
  { type: "physics_applyforce", category: "physics", label: "push with x: (FX) y: (FY)", color: CATEGORY_COLORS.physics, hint: "Give a push", inputs: [{ name: "FX", type: "number", default: 0 }, { name: "FY", type: "number", default: -10 }] },
  { type: "physics_bounce", category: "physics", label: "bounce off edges", color: CATEGORY_COLORS.physics, hint: "Boing!" },
  { type: "physics_setfriction", category: "physics", label: "set friction to (F)", color: CATEGORY_COLORS.physics, hint: "How slippery (0=ice)", inputs: [{ name: "F", type: "number", default: 0.1 }] },
  { type: "physics_collision", category: "physics", label: "when bumping into (SPRITE)", color: CATEGORY_COLORS.physics, hint: "Detect a crash", inputs: [{ name: "SPRITE", type: "string", default: "any" }] },
  { type: "physics_setmass", category: "physics", label: "set weight to (M)", color: CATEGORY_COLORS.physics, hint: "Heavier = harder to push", inputs: [{ name: "M", type: "number", default: 1 }] },
  { type: "physics_setbouncy", category: "physics", label: "set bounciness to (B)", color: CATEGORY_COLORS.physics, hint: "0=thud 1=super bouncy", inputs: [{ name: "B", type: "number", default: 0.5 }] },

  /* ─── Sensing ─── */
  { type: "sensing_touching", category: "sensing", label: "touching (OBJECT)?", color: CATEGORY_COLORS.sensing, hint: "Am I touching it?", inputs: [{ name: "OBJECT", type: "string", default: "edge" }] },
  { type: "sensing_touchingcolor", category: "sensing", label: "touching color (COLOR)?", color: CATEGORY_COLORS.sensing, hint: "Am I on that color?", inputs: [{ name: "COLOR", type: "string", default: "#ff0000" }] },
  { type: "sensing_distanceto", category: "sensing", label: "distance to (OBJECT)", color: CATEGORY_COLORS.sensing, hint: "How far away?", inputs: [{ name: "OBJECT", type: "string", default: "mouse" }] },
  { type: "sensing_keypressed", category: "sensing", label: "key (KEY) pressed?", color: CATEGORY_COLORS.sensing, hint: "Check a key right now", inputs: [{ name: "KEY", type: "string", default: "space" }] },
  { type: "sensing_mousedown", category: "sensing", label: "mouse down?", color: CATEGORY_COLORS.sensing, hint: "Is the mouse clicked?" },
  { type: "sensing_mousex", category: "sensing", label: "mouse x", color: CATEGORY_COLORS.sensing, hint: "Mouse left-right position" },
  { type: "sensing_mousey", category: "sensing", label: "mouse y", color: CATEGORY_COLORS.sensing, hint: "Mouse up-down position" },
  { type: "sensing_ask", category: "sensing", label: "ask (QUESTION) and wait", color: CATEGORY_COLORS.sensing, hint: "Ask the user something", inputs: [{ name: "QUESTION", type: "string", default: "What's your name?" }] },
  { type: "sensing_answer", category: "sensing", label: "answer", color: CATEGORY_COLORS.sensing, hint: "What they typed" },
  { type: "sensing_timer", category: "sensing", label: "timer", color: CATEGORY_COLORS.sensing, hint: "Seconds since start" },
  { type: "sensing_resettimer", category: "sensing", label: "reset timer", color: CATEGORY_COLORS.sensing, hint: "Start counting from 0" },
  { type: "sensing_loudness", category: "sensing", label: "loudness", color: CATEGORY_COLORS.sensing, hint: "How loud is the mic?" },
  { type: "sensing_dayssince2000", category: "sensing", label: "days since 2000", color: CATEGORY_COLORS.sensing, hint: "For time-based projects" },
  { type: "sensing_username", category: "sensing", label: "username", color: CATEGORY_COLORS.sensing, hint: "Who's using this?" },

  /* ─── My Blocks ─── */
  { type: "custom_define", category: "custom", label: "define (NAME)", color: CATEGORY_COLORS.custom, hint: "Make your own block!", inputs: [{ name: "NAME", type: "string", default: "myBlock" }] },
  { type: "custom_call", category: "custom", label: "run (NAME)", color: CATEGORY_COLORS.custom, hint: "Use your custom block", inputs: [{ name: "NAME", type: "string", default: "myBlock" }] },
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
  { id: "operators", label: "Operators", color: CATEGORY_COLORS.operators, icon: "+" },
  { id: "variables", label: "Variables", color: CATEGORY_COLORS.variables, icon: "≡" },
  { id: "lists", label: "Lists", color: CATEGORY_COLORS.lists, icon: "☰" },
  { id: "physics", label: "Physics", color: CATEGORY_COLORS.physics, icon: "⊕" },
  { id: "sensing", label: "Sensing", color: CATEGORY_COLORS.sensing, icon: "◔" },
  { id: "custom", label: "My Blocks", color: CATEGORY_COLORS.custom, icon: "✦" },
];
