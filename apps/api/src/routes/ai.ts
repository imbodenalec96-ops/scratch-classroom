import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import db from "../db.js";
import Anthropic from "@anthropic-ai/sdk";

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
  const { topic, count, subject, grade } = req.body;
  const n = Math.min(Number(count) || 5, 20);
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_KEY) {
    // Dev fallback — still topic-relevant
    return res.json({
      title: `Quiz: ${topic || "General Knowledge"}`,
      questions: Array.from({ length: Math.min(n, 5) }, (_, i) => ({
        id: `q${i + 1}`,
        text: `Sample question ${i + 1} about ${topic || "this topic"}`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctIndex: 0,
      })),
    });
  }

  try {
    const subjectGuide =
      (subject === "Math" || (!subject && /math|number|addition|subtract|multiply|divide|fraction|geometry|algebra/i.test(topic || "")))
        ? `This is a MATH quiz. Include actual math problems, word problems, and number sense questions. Use specific numbers and operations. Questions should require students to calculate or solve, not just define terms. Example formats: "What is 247 + 389?", "If Sarah has 5 groups of 6 apples, how many apples does she have?", "Which fraction is equivalent to 1/2?"`
      : (subject === "Reading" || (!subject && /read|comprehens|vocabulary|inferenc|main idea|passage/i.test(topic || "")))
        ? `This is a READING quiz. Include vocabulary questions, reading comprehension concepts, literary elements, and inference questions. Where appropriate, include a short 3-4 sentence reading passage followed by questions about it.`
      : (subject === "Writing" || (!subject && /writ|grammar|punctuat|sentence|paragraph|essay/i.test(topic || "")))
        ? `This is a WRITING quiz. Include grammar rules, punctuation, sentence structure, paragraph organization, parts of speech, and writing process questions. Example: "Which sentence uses a comma correctly?", "What is the purpose of a topic sentence?"`
      : `This is a ${subject || "General Knowledge"} quiz. Create questions that are educational and appropriate for the subject.`;

    const prompt = `You are an experienced ${grade || "elementary"} teacher creating a ${subject || "general"} quiz.
Grade Level: ${grade || "Elementary"}
Subject: ${subject || "General"}
Specific Topic: ${topic || subject || "General Knowledge"}

${subjectGuide}

Create exactly ${n} multiple-choice questions. Each question MUST have exactly 4 answer choices.
The questions must be varied — mix easy, medium, and challenging questions appropriate for ${grade || "elementary"} level.
Do NOT create coding or Scratch programming questions unless the topic specifically asks for it.

IMPORTANT: Return ONLY valid JSON, no markdown, no code fences, no explanation — just the JSON object:

{
  "title": "string — descriptive quiz title including subject and topic",
  "questions": [
    {
      "id": "q1",
      "text": "Question text here?",
      "options": ["First option", "Second option", "Third option", "Fourth option"],
      "correctIndex": 0
    }
  ]
}`;

    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as any).text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const quiz = JSON.parse(jsonMatch[0]);
    res.json(quiz);
  } catch (err) {
    // Fallback if Claude fails
    res.json({
      title: `Quiz: ${topic}`,
      questions: Array.from({ length: Math.min(n, 5) }, (_, i) => ({
        id: `q${i + 1}`,
        text: `Question ${i + 1}: About ${topic}`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctIndex: 0,
      })),
    });
  }
});

// AI Assignment Generator (uses OpenAI GPT-4o)
router.post("/generate-assignment", async (req: AuthRequest, res: Response) => {
  if (req.user!.role === "student") return res.status(403).json({ error: "Forbidden" });

  const { title, subject, grade, instructions, passage } = req.body;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!OPENAI_KEY && !ANTHROPIC_KEY) {
    const isReading = !subject || subject === "Reading";
    const samplePassage = "Every morning, Maria walked to school past the old oak tree at the corner of Maple Street. The tree had thick, knobbly roots that pushed up through the sidewalk, and in autumn its leaves turned a brilliant orange. Local kids called it the Wishing Tree because of an old story — if you touched its bark before a big test, you would do well. Maria had never believed the story until the day she forgot to study for her math quiz, reached out on instinct, and got every single answer right.";
    return res.json({
      title: title || "Sample Assignment",
      subject: subject || "Reading",
      grade: grade || "3rd Grade",
      instructions: instructions || "Answer all questions carefully.",
      totalPoints: 100,
      sections: [
        {
          title: "Part 1: Reading Comprehension (5 pts each)",
          ...(isReading ? { passage: samplePassage } : {}),
          questions: isReading ? [
            { type: "multiple_choice", text: "What color did the oak tree's leaves turn in autumn?", options: ["A. Green", "B. Orange", "C. Brown", "D. Yellow"], points: 5 },
            { type: "multiple_choice", text: "Why did kids call it the \"Wishing Tree\"?", options: ["A. It was the tallest tree in town", "B. Touching its bark before a test was said to bring good luck", "C. It granted wishes on birthdays", "D. Maria planted it as a wish"], points: 5 },
          ] : [
            { type: "multiple_choice", text: "What is the main idea of a paragraph?", options: ["A. The first sentence", "B. The most important point the author makes", "C. The last sentence", "D. The title"], points: 5 },
            { type: "multiple_choice", text: "Which sentence is a topic sentence?", options: ["A. Dogs have four legs.", "B. There are many reasons dogs make great pets.", "C. My dog is brown.", "D. Dogs eat food."], points: 5 },
          ]
        },
        {
          title: "Part 2: Short Answer (10 pts each)",
          questions: isReading ? [
            { type: "short_answer", text: "Why did Maria stop believing the story — and what changed her mind? Use details from the passage.", points: 10, lines: 3 },
            { type: "short_answer", text: "Describe the oak tree using at least two details from the passage.", points: 10, lines: 3 },
          ] : [
            { type: "short_answer", text: "In your own words, explain what a main idea is.", points: 10, lines: 3 },
            { type: "short_answer", text: "Write a topic sentence for a paragraph about your favorite season.", points: 10, lines: 3 },
          ]
        }
      ]
    });
  }

  try {
    const subjectGuide =
      subject === "Math"
        ? `This is a MATH worksheet. You MUST include:
- Real math problems with actual numbers (e.g., "Calculate 347 + 289 = ___", "What is 8 × 7?")
- Word problems that require calculation (e.g., "Maria had 124 stickers. She gave away 37. How many does she have left?")
- Multiple choice with plausible wrong answers (e.g., common mistakes like wrong carrying/borrowing)
- Fill-in-blank for equations (e.g., "6 × ___ = 42")
- At least one visual/story word problem per section
- NO grammar or reading comprehension questions`
        : subject === "Reading"
        ? `This is a READING / ELA worksheet. You MUST include:
- A short reading passage (4-6 sentences) at the start of the first section, then comprehension questions about it
- Vocabulary questions (definitions, context clues, synonyms/antonyms)
- Questions about main idea, supporting details, author's purpose, or text structure
- Short answer questions asking students to cite evidence from the passage
- No math calculation questions`
        : subject === "Writing"
        ? `This is a WRITING / GRAMMAR worksheet. You MUST include:
- Grammar questions (correct the sentence, identify parts of speech, subject-verb agreement)
- Punctuation questions (where does the comma/period/apostrophe go?)
- Sentence structure questions (complete vs. fragment vs. run-on)
- Short answer questions asking students to write their own sentences or a short paragraph
- Fill-in-blank grammar practice
- No math calculation questions`
        : `Create questions appropriate for a ${subject || "General"} worksheet at the ${grade || "3rd grade"} level.`;

    const safePassage = passage ? passage.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").replace(/\r/g, "") : "";
    const passageInstruction = passage
      ? `USE THIS PASSAGE exactly as written (do not modify it):\n---\n${passage.replace(/\r/g, "").trim()}\n---\nAll reading/comprehension questions must refer to this passage. Put this passage verbatim in the "passage" field of the first section.`
      : subject === "Reading" || subject === "reading"
      ? `GENERATE a short age-appropriate reading passage (5-8 sentences) and include it as the "passage" field in the first section. All comprehension questions must refer to it.`
      : "";

    const prompt = `You are an experienced elementary school teacher creating a printable paper worksheet.

Grade Level: ${grade || "3rd Grade"}
Subject: ${subject || "General"}
Worksheet Title: ${title || "Assignment"}
${instructions ? `Teacher's special instructions: ${instructions}` : ""}

${subjectGuide}

${passageInstruction}

Create a thorough, realistic worksheet with 2-3 sections and 8-12 total questions appropriate for ${grade || "3rd grade"} level.
The worksheet should feel like something a real teacher would hand out in class.
Mix question types: multiple_choice, short_answer, and fill_blank within each section.

CRITICAL RULES:
1. Every multiple_choice question MUST include a "correctIndex" field (0-based index of the correct answer).
2. Options must be prefixed: "A. ...", "B. ...", "C. ...", "D. ..."
3. For READING assignments: you MUST write the full passage in the "passage" field of the first section. Do not leave it as a placeholder.

IMPORTANT: Return ONLY valid JSON, no markdown, no code fences — just the JSON object:
{
  "title": "string",
  "subject": "string",
  "grade": "string",
  "instructions": "string",
  "totalPoints": number,
  "sections": [
    {
      "title": "Part 1: Section Name (X pts each)",
      "passage": "READING ONLY: write the complete 5-8 sentence passage here. Omit this field for non-reading subjects.",
      "questions": [
        { "type": "multiple_choice", "text": "Question?", "options": ["A. opt1","B. opt2","C. opt3","D. opt4"], "correctIndex": 2, "points": 5 },
        { "type": "short_answer", "text": "Question?", "points": 10, "lines": 3 },
        { "type": "fill_blank", "text": "The ___ is important.", "points": 5 }
      ]
    }
  ]
}`;

    const GROQ_KEY = process.env.GROQ_API_KEY;
    let text = "";
    const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
    if (MISTRAL_KEY) {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MISTRAL_KEY}` },
        body: JSON.stringify({ model: "mistral-small-latest", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`Mistral error: ${response.status} ${await response.text()}`);
      const data: any = await response.json();
      text = data.choices?.[0]?.message?.content || "";
    } else if (GROQ_KEY) {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({ model: "llama3-70b-8192", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`Groq error: ${response.status} ${await response.text()}`);
      const data: any = await response.json();
      text = data.choices?.[0]?.message?.content || "";
    } else if (OPENAI_KEY) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`OpenAI error: ${response.status} ${await response.text()}`);
      const data: any = await response.json();
      text = data.choices?.[0]?.message?.content || "";
    } else {
      const client = new Anthropic({ apiKey: ANTHROPIC_KEY! });
      const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      });
      text = (msg.content[0] as any).text || "";
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    let jsonStr = jsonMatch[0];
    // If truncated, try to close open structures gracefully
    try {
      JSON.parse(jsonStr);
    } catch {
      // Count unclosed brackets/braces and close them
      const opens = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length;
      const openBraces = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length;
      // Remove trailing comma if present before closing
      jsonStr = jsonStr.replace(/,\s*$/, "");
      for (let i = 0; i < opens; i++) jsonStr += "]";
      for (let i = 0; i < openBraces; i++) jsonStr += "}";
    }
    const assignment = JSON.parse(jsonStr);
    res.json(assignment);
  } catch (err: any) {
    console.error("generate-assignment failed:", err?.message || err);
    res.status(500).json({ error: "AI generation failed", details: err?.message || String(err) });
  }
});

/* ─────────────────────────────────────────────────────────────────
 * Video → Assignment
 * POST /api/ai/generate-assignment-from-video
 * Body: { videoUrl, title?, subject?, grade?, questionCount? }
 * Returns the same shape as /generate-assignment, plus { videoUrl, videoId }
 * so the builder can populate the form and save video_url on the assignment.
 * ───────────────────────────────────────────────────────────────── */

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

// Fetch { title, author } via YouTube's public oEmbed endpoint (no API key).
async function fetchVideoOEmbed(videoId: string): Promise<{ title: string; author: string } | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = (await r.json()) as any;
    return { title: data?.title || "", author: data?.author_name || "" };
  } catch {
    return null;
  }
}

// Fetch an English transcript via YouTube's public timedtext API.
// Returns plain text (concatenated caption lines) or empty string if unavailable.
async function fetchVideoTranscript(videoId: string): Promise<string> {
  const tryOne = async (lang: string, kind?: string) => {
    const q = new URLSearchParams({ v: videoId, lang });
    if (kind) q.set("kind", kind);
    const url = `https://www.youtube.com/api/timedtext?${q.toString()}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return "";
      const xml = await r.text();
      if (!xml || !xml.includes("<text")) return "";
      // Strip XML tags, decode basic HTML entities, collapse whitespace.
      const lines = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)).map((m) => m[1]);
      const decoded = lines
        .join(" ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return decoded;
    } catch {
      return "";
    }
  };
  // Try manual English, then auto-captions, then en-US.
  return (
    (await tryOne("en")) ||
    (await tryOne("en", "asr")) ||
    (await tryOne("en-US")) ||
    ""
  );
}

router.post("/generate-assignment-from-video", async (req: AuthRequest, res: Response) => {
  if (req.user!.role === "student") return res.status(403).json({ error: "Forbidden" });

  const { videoUrl, title, subject, grade, questionCount } = req.body || {};
  if (!videoUrl || typeof videoUrl !== "string") {
    return res.status(400).json({ error: "videoUrl is required" });
  }

  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) {
    return res.status(400).json({ error: "Could not extract a YouTube video ID from that URL. Paste a standard youtube.com/watch or youtu.be link." });
  }

  // Normalize to a canonical watch URL — this is what we persist on the assignment.
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Gather the best context we can about the video (no API key required).
  const [oembed, transcript] = await Promise.all([
    fetchVideoOEmbed(videoId),
    fetchVideoTranscript(videoId),
  ]);
  const videoTitle = oembed?.title || "";
  const videoAuthor = oembed?.author || "";
  const hasTranscript = transcript.length > 40;

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const nQuestions = Math.min(Math.max(Number(questionCount) || 6, 3), 15);

  // Dev fallback — no API key. Still returns a usable shape.
  if (!ANTHROPIC_KEY) {
    return res.json({
      title: title || videoTitle || "Video Assignment",
      subject: subject || "General",
      grade: grade || "3rd Grade",
      instructions: `Watch the video "${videoTitle || canonicalUrl}" and answer the questions below.`,
      totalPoints: nQuestions * 10,
      videoUrl: canonicalUrl,
      videoId,
      videoTitle,
      transcriptUsed: hasTranscript,
      sections: [
        {
          title: "Part 1: Comprehension (10 pts each)",
          questions: Array.from({ length: nQuestions }, (_, i) => ({
            type: i % 2 === 0 ? "multiple_choice" : "short_answer",
            text: `Sample comprehension question ${i + 1} about the video.`,
            ...(i % 2 === 0
              ? { options: ["A. Option one", "B. Option two", "C. Option three", "D. Option four"], correctIndex: 0 }
              : { lines: 3 }),
            points: 10,
          })),
        },
      ],
    });
  }

  try {
    // Trim transcript for token budget — Claude is smart about this, but keep the
    // prompt lean. ~12k chars ≈ ~3k tokens which is comfortably inside Opus limits.
    const transcriptSnippet = hasTranscript ? transcript.slice(0, 12000) : "";
    const contextBlock = hasTranscript
      ? `VIDEO TITLE: ${videoTitle || "(unknown)"}
VIDEO CHANNEL: ${videoAuthor || "(unknown)"}
VIDEO URL: ${canonicalUrl}

TRANSCRIPT (auto-fetched from YouTube captions):
"""
${transcriptSnippet}
"""`
      : `VIDEO TITLE: ${videoTitle || "(unknown)"}
VIDEO CHANNEL: ${videoAuthor || "(unknown)"}
VIDEO URL: ${canonicalUrl}

(Captions/transcript were not available for this video. Base questions on the title and channel alone — keep them general enough that a student who watches the video can answer them. Do NOT invent specific quotes or numbers that you cannot verify.)`;

    const gradeLabel = grade || "3rd Grade";
    const subjectLabel = subject || "General";
    const assignmentTitle = title?.trim() || (videoTitle ? `Video: ${videoTitle}` : "Video Assignment");

    const prompt = `You are an experienced elementary school teacher. A student will watch a YouTube video in class and then answer comprehension questions on a printable worksheet.

${contextBlock}

Assignment metadata:
- Grade Level: ${gradeLabel}
- Subject: ${subjectLabel}
- Worksheet Title: ${assignmentTitle}

Create a thorough comprehension worksheet with 1-2 sections and exactly ${nQuestions} total questions appropriate for ${gradeLabel}.
Mix question types: multiple_choice, short_answer, and fill_blank.
Questions MUST be about the content of this specific video — not generic subject questions.
Include a mix of literal recall ("According to the video, what…") and higher-order thinking ("Why do you think…", "How does this connect to…").

CRITICAL RULES FOR multiple_choice QUESTIONS:
1. Every multiple_choice question MUST include a "correctIndex" field.
2. "correctIndex" is the 0-based index of the correct answer in the "options" array.
3. Options must be prefixed: "A. ...", "B. ...", "C. ...", "D. ..."
4. There must be exactly ONE correct answer per question.

Return ONLY valid JSON, no markdown, no code fences, no explanation — just this object:
{
  "title": "string",
  "subject": "string",
  "grade": "string",
  "instructions": "Watch the video, then answer the questions below. (1-2 sentences, student-facing.)",
  "totalPoints": number,
  "sections": [
    {
      "title": "Part 1: Section Name (X pts each)",
      "questions": [
        { "type": "multiple_choice", "text": "…?", "options": ["A. …","B. …","C. …","D. …"], "correctIndex": 0, "points": 5 },
        { "type": "short_answer", "text": "…?", "points": 10, "lines": 3 },
        { "type": "fill_blank", "text": "The ___ is …", "points": 5 }
      ]
    }
  ]
}`;

    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as any).text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in model response");
    const assignment = JSON.parse(jsonMatch[0]);

    // Attach the pieces the UI needs to save the assignment correctly.
    return res.json({
      ...assignment,
      videoUrl: canonicalUrl,
      videoId,
      videoTitle,
      transcriptUsed: hasTranscript,
    });
  } catch (err) {
    console.error("generate-assignment-from-video failed:", err);
    return res.status(500).json({
      error: "Video assignment generation failed",
      details: String(err),
      videoUrl: canonicalUrl,
      videoId,
    });
  }
});

/* ─────────────────────────────────────────────────────────────────
 * Text-to-speech
 * POST /api/ai/tts
 * Body: { text: string, mode?: "spelling" | "passage" }
 *
 * mode "spelling" (default): Rachel voice, word repeated twice, turbo model
 * mode "passage": Matilda voice, warm storytelling, multilingual v2 model
 *
 * Falls back to 503 if no ElevenLabs key.
 * ───────────────────────────────────────────────────────────────── */
const EL_VOICE_SPELLING = "21m00Tio1uXcvkmUEBsA"; // Rachel — clear, neutral
const EL_VOICE_PASSAGE  = "XrExE9yKIg1WjnnlVkGX"; // Matilda — warm, expressive, great for stories

router.post("/tts", async (req: AuthRequest, res: Response) => {
  const { text, mode } = req.body;
  if (!text || typeof text !== "string") return res.status(400).json({ error: "text required" });

  const EL_KEY = process.env.ELEVENLABS_API_KEY;
  if (!EL_KEY) return res.status(503).json({ error: "no_tts_key" });

  const isPassage = mode === "passage";

  const voiceId  = isPassage ? EL_VOICE_PASSAGE  : EL_VOICE_SPELLING;
  const modelId  = isPassage ? "eleven_multilingual_v2" : "eleven_turbo_v2_5";
  // Passages: lower stability = more natural expression; higher style = storytelling feel
  const voiceSettings = isPassage
    ? { stability: 0.40, similarity_boost: 0.75, style: 0.55, use_speaker_boost: true }
    : { stability: 0.75, similarity_boost: 0.80 };

  // Spelling: repeat the word twice. Passage: read as-is (up to 5000 chars).
  const spoken = isPassage
    ? text.trim().slice(0, 5000)
    : `${text.trim().slice(0, 200)}. ${text.trim().slice(0, 200)}.`;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": EL_KEY },
        body: JSON.stringify({ text: spoken, model_id: modelId, voice_settings: voiceSettings }),
      }
    );
    if (!response.ok) {
      const err = await response.text();
      console.error("ElevenLabs TTS error:", response.status, err);
      return res.status(502).json({ error: "tts_failed" });
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    const buf = await response.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch (err: any) {
    console.error("TTS route failed:", err?.message || err);
    res.status(500).json({ error: "tts_failed" });
  }
});

export default router;
