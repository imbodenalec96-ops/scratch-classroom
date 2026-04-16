import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import db from "../db.js";

const router = Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// AI chat (code assistant)
router.post("/chat", async (req: AuthRequest, res: Response) => {
  // Check if AI is enabled for this student
  if (req.user!.role === "student") {
    const ctrl = await db.prepare(
      "SELECT ai_enabled, ai_prompt_limit FROM teacher_controls WHERE student_id = ? LIMIT 1"
    ).get(req.user!.id) as any;
    if (ctrl && !ctrl.ai_enabled) {
      return res.status(403).json({ error: "AI is disabled for you by your teacher" });
    }
  }

  const { messages, context } = req.body;
  const systemPrompt = `You are a helpful coding assistant for a Scratch-like block coding platform.
You help students understand coding concepts, debug their block code, and suggest improvements.
${context ? `Current project context: ${context}` : ""}
Keep explanations simple and age-appropriate. Use block-coding terminology.`;

  if (!OPENAI_API_KEY || OPENAI_API_KEY === "sk-your-key-here") {
    // Fallback mock responses when no API key
    const lastMsg = messages[messages.length - 1]?.content || "";
    let reply = "I can help you with your code! ";
    if (lastMsg.toLowerCase().includes("loop")) {
      reply += "To create a loop, use the 'repeat' block from the Control category. Drag it into your workspace and put the blocks you want to repeat inside it.";
    } else if (lastMsg.toLowerCase().includes("move")) {
      reply += "Use the 'move steps' block from the Motion category. You can change the number to control how far the sprite moves.";
    } else if (lastMsg.toLowerCase().includes("debug") || lastMsg.toLowerCase().includes("error")) {
      reply += "Let me help debug! Check that: 1) All blocks are connected, 2) You have a 'when green flag clicked' event, 3) Variable names match exactly.";
    } else if (lastMsg.toLowerCase().includes("idea") || lastMsg.toLowerCase().includes("project")) {
      reply += "Here are some project ideas: 1) A maze game with arrow key movement, 2) An animation story with multiple sprites, 3) A quiz game using variables to track score.";
    } else {
      reply += "Try dragging blocks from the categories on the left into your workspace. Connect them together to create programs!";
    }
    return res.json({ role: "assistant", content: reply });
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });
    const data = await response.json();
    res.json({ role: "assistant", content: data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response." });
  } catch {
    res.status(500).json({ error: "AI service unavailable" });
  }
});

// AI project generator
router.post("/generate-project", async (req: AuthRequest, res: Response) => {
  const { prompt } = req.body;
  // Generate a starter project structure from a description
  const sprites = [
    {
      id: "sprite-1",
      name: "Player",
      x: 0, y: 0, rotation: 0, scale: 1, costumeIndex: 0,
      costumes: [], sounds: [], visible: true,
      blocks: [
        { id: "b1", type: "event_whenflagclicked", category: "events", inputs: {} },
        { id: "b2", type: "control_forever", category: "control", inputs: {}, parent: "b1" },
        { id: "b3", type: "motion_movesteps", category: "motion", inputs: { STEPS: { type: "value", value: 10 } }, parent: "b2" },
      ],
    },
  ];
  res.json({
    title: prompt?.slice(0, 50) || "AI Generated Project",
    mode: "2d",
    sprites,
    stage: { width: 480, height: 360, backgroundColor: "#ffffff" },
    assets: [],
  });
});

// AI block generator
router.post("/generate-blocks", async (req: AuthRequest, res: Response) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  // Keyword-based block generation with multi-intent matching
  const lower = prompt.toLowerCase();
  const blocks: any[] = [];
  const addBlock = (b: any) => {
    if (!blocks.some((x) => x.name === b.name)) blocks.push(b);
  };

  const hasAny = (...terms: string[]) => terms.some((t) => lower.includes(t));

  // Specific scenario: flashlight + enemies/chase/push-away
  if (hasAny("flashlight", "torch", "light") && hasAny("enemy", "enemies", "monster", "zombie", "chase", "running")) {
    addBlock({ name: "event_whenflagclicked", label: "when 🟢 flag clicked", category: "events", description: "Start the game loop", inputs: [] });
    addBlock({ name: "control_forever", label: "forever", category: "control", description: "Continuously run enemy AI", inputs: [] });
    addBlock({ name: "sensing_distanceto", label: "distance to (OBJECT)", category: "sensing", description: "Measure enemy distance to player/light", inputs: [{ name: "OBJECT", type: "string", default: "mouse" }] });
    addBlock({ name: "control_if", label: "if ◇ then", category: "control", description: "Branch behavior based on distance", inputs: [{ name: "CONDITION", type: "string", default: "distance < 80" }] });
    addBlock({ name: "motion_pointtowards", label: "point towards (TARGET)", category: "motion", description: "Enemy faces player", inputs: [{ name: "TARGET", type: "string", default: "mouse" }] });
    addBlock({ name: "motion_movesteps", label: "move (STEPS) steps", category: "motion", description: "Enemy moves toward or away", inputs: [{ name: "STEPS", type: "number", default: 3 }] });
    addBlock({ name: "looks_seteffect", label: "set (EFFECT) effect to (VALUE)", category: "looks", description: "Use brightness/color for flashlight feel", inputs: [{ name: "EFFECT", type: "string", default: "brightness" }, { name: "VALUE", type: "number", default: 30 }] });
    addBlock({ name: "sound_play", label: "play sound (SOUND)", category: "sound", description: "Add tension when enemies are near", inputs: [{ name: "SOUND", type: "string", default: "pop" }] });
  }

  if (hasAny("game", "move", "platformer", "jump", "enemy", "chase")) {
    addBlock({ name: "setstate", label: "set game state to (STATE)", category: "game", description: "Switch the game flow to menu, playing, paused, or combat", inputs: [{ name: "STATE", type: "string", default: "playing" }] });
    addBlock({ name: "setplayerstat", label: "set player (STAT) to (VALUE)", category: "game", description: "Track health, ammo, score, or mana", inputs: [{ name: "STAT", type: "string", default: "health" }, { name: "VALUE", type: "number", default: 100 }] });
    addBlock({ name: "spawnenemy", label: "spawn enemy (TYPE) at x: (X) y: (Y)", category: "game", description: "Spawn an enemy into the current encounter", inputs: [{ name: "TYPE", type: "string", default: "slime" }, { name: "X", type: "number", default: 120 }, { name: "Y", type: "number", default: -100 }] });
    addBlock({ name: "setworldgravity", label: "set world gravity to (GRAVITY)", category: "game", description: "Tune the feel of a platformer or physics section", inputs: [{ name: "GRAVITY", type: "number", default: 0.8 }] });
  }

  if (hasAny("inventory", "quest", "save", "checkpoint", "hud", "objective", "rpg")) {
    addBlock({ name: "additem", label: "add item (ITEM)", category: "game", description: "Give the player an inventory item", inputs: [{ name: "ITEM", type: "string", default: "key" }] });
    addBlock({ name: "setquest", label: "set quest (QUEST) to (STATUS)", category: "game", description: "Track quest progress", inputs: [{ name: "QUEST", type: "string", default: "Find the crystal" }, { name: "STATUS", type: "string", default: "active" }] });
    addBlock({ name: "save", label: "save game slot (SLOT)", category: "game", description: "Store local game progress", inputs: [{ name: "SLOT", type: "string", default: "slot1" }] });
    addBlock({ name: "showhud", label: "show HUD message (TEXT)", category: "game", description: "Display a quest or combat message", inputs: [{ name: "TEXT", type: "string", default: "Quest updated" }] });
  }

  if (hasAny("color", "rainbow", "effect", "flashlight", "light")) {
    addBlock({ name: "color_cycle", label: "cycle colors every (SECS) secs", category: "looks", description: "Gradually shift through rainbow colors", inputs: [{ name: "SECS", type: "number", default: 0.5 }] });
    addBlock({ name: "color_flash", label: "flash (COLOR)", category: "looks", description: "Quick color flash effect", inputs: [{ name: "COLOR", type: "string", default: "#ff0000" }] });
  }

  if (hasAny("chat", "bot", "respond", "ai", "npc")) {
    addBlock({ name: "chat_greet", label: "greet the user", category: "ai", description: "Say a friendly greeting", inputs: [] });
    addBlock({ name: "chat_respond", label: "respond to (INPUT)", category: "ai", description: "Generate a smart response", inputs: [{ name: "INPUT", type: "string", default: "hello" }] });
  }

  if (hasAny("music", "melody", "note", "sound")) {
    addBlock({ name: "music_note", label: "play note (NOTE) for (BEATS) beats", category: "sound", description: "Play a musical note", inputs: [{ name: "NOTE", type: "number", default: 60 }, { name: "BEATS", type: "number", default: 1 }] });
    addBlock({ name: "music_rest", label: "rest for (BEATS) beats", category: "sound", description: "Pause between notes", inputs: [{ name: "BEATS", type: "number", default: 1 }] });
  }

  if (hasAny("random", "spawn", "event")) {
    addBlock({ name: "random_spawn", label: "spawn at random position", category: "motion", description: "Move to a random spot", inputs: [] });
    addBlock({ name: "random_event", label: "if (CHANCE)% chance", category: "control", description: "Run blocks with a probability", inputs: [{ name: "CHANCE", type: "number", default: 30 }] });
  }

  if (blocks.length === 0) {
    addBlock({ name: "custom_action", label: "do (ACTION)", category: "control", description: "A custom action block", inputs: [{ name: "ACTION", type: "string", default: "something" }] });
    addBlock({ name: "custom_say", label: "say (TEXT) smartly", category: "ai", description: "Use AI to say something", inputs: [{ name: "TEXT", type: "string", default: "hello" }] });
  }

  res.json({ blocks: blocks.slice(0, 10) });
});

// AI quiz generator
router.post("/generate-quiz", async (req: AuthRequest, res: Response) => {
  const { topic, count } = req.body;
  const n = Math.min(count || 5, 20);
  // Generate sample quiz questions
  const templates = [
    { text: `What block category contains the "move" block?`, options: ["Motion", "Looks", "Control", "Events"], correctIndex: 0 },
    { text: `Which block makes code run when the green flag is clicked?`, options: ["when flag clicked", "forever", "if then", "repeat"], correctIndex: 0 },
    { text: `What does the "repeat 10" block do?`, options: ["Runs blocks inside 10 times", "Waits 10 seconds", "Moves 10 steps", "Creates 10 clones"], correctIndex: 0 },
    { text: `How do you store a value in Scratch?`, options: ["Use a variable", "Use a loop", "Use an event", "Use a costume"], correctIndex: 0 },
    { text: `What is a clone in Scratch?`, options: ["A copy of a sprite", "A type of block", "A sound effect", "A backdrop"], correctIndex: 0 },
    { text: `Which operator block joins two text strings?`, options: ["join", "add", "repeat", "length"], correctIndex: 0 },
    { text: `What does the "broadcast" block do?`, options: ["Sends a message to all sprites", "Plays a sound", "Moves a sprite", "Changes costume"], correctIndex: 0 },
    { text: `How do you detect if two sprites are touching?`, options: ["Sensing blocks", "Motion blocks", "Looks blocks", "Sound blocks"], correctIndex: 0 },
  ];
  const questions = templates.slice(0, n).map((t, i) => ({ id: `q${i + 1}`, ...t }));
  res.json({ title: `Quiz: ${topic || "Coding Basics"}`, questions });
});

export default router;
