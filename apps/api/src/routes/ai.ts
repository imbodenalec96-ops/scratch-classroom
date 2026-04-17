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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
    const data = await response.json();
    const text = (data as any).content?.[0]?.text || "";
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

// AI Assignment Generator (uses Anthropic claude API)
router.post("/generate-assignment", async (req: AuthRequest, res: Response) => {
  if (req.user!.role === "student") return res.status(403).json({ error: "Forbidden" });

  const { title, subject, grade, instructions } = req.body;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_KEY) {
    // Return a sample assignment for testing
    return res.json({
      title: title || "Sample Assignment",
      subject: subject || "Reading",
      grade: grade || "3rd Grade",
      instructions: instructions || "Answer all questions carefully.",
      totalPoints: 100,
      sections: [
        {
          title: "Part 1: Multiple Choice (5 pts each)",
          questions: [
            { type: "multiple_choice", text: "What is the main idea of a paragraph?", options: ["A. The first sentence", "B. The most important point the author makes", "C. The last sentence", "D. The title"], points: 5 },
            { type: "multiple_choice", text: "Which sentence is a topic sentence?", options: ["A. Dogs have four legs.", "B. There are many reasons dogs make great pets.", "C. My dog is brown.", "D. Dogs eat food."], points: 5 },
          ]
        },
        {
          title: "Part 2: Short Answer (10 pts each)",
          questions: [
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

    const prompt = `You are an experienced elementary school teacher creating a printable paper worksheet.

Grade Level: ${grade || "3rd Grade"}
Subject: ${subject || "General"}
Worksheet Title: ${title || "Assignment"}
${instructions ? `Teacher's special instructions: ${instructions}` : ""}

${subjectGuide}

Create a thorough, realistic worksheet with 2-3 sections and 8-12 total questions appropriate for ${grade || "3rd grade"} level.
The worksheet should feel like something a real teacher would hand out in class.
Mix question types: multiple_choice, short_answer, and fill_blank within each section.

CRITICAL RULES FOR multiple_choice QUESTIONS:
1. Every multiple_choice question MUST include a "correctIndex" field.
2. "correctIndex" is the 0-based index of the correct answer in the "options" array.
   - If "A. Paris" is correct and appears first in options, set "correctIndex": 0
   - If "B. London" is correct and appears second, set "correctIndex": 1
   - If "C. Rome" is correct and appears third, set "correctIndex": 2
   - If "D. Berlin" is correct and appears fourth, set "correctIndex": 3
3. Options must be prefixed: "A. ...", "B. ...", "C. ...", "D. ..."
4. There must be exactly ONE correct answer per question.

IMPORTANT: Return ONLY valid JSON, no markdown, no code fences, no explanation — just the JSON object:
{
  "title": "string",
  "subject": "string",
  "grade": "string",
  "instructions": "string (1-2 sentences of clear student-facing directions)",
  "totalPoints": number,
  "sections": [
    {
      "title": "Part 1: Section Name (X pts each)",
      "questions": [
        {
          "type": "multiple_choice",
          "text": "Question text?",
          "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
          "correctIndex": 2,
          "points": 5
        },
        {
          "type": "short_answer",
          "text": "Question requiring written answer?",
          "points": 10,
          "lines": 3
        },
        {
          "type": "fill_blank",
          "text": "The ___ of a paragraph is its most important point.",
          "points": 5
        }
      ]
    }
  ]
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    const text = (data as any).content?.[0]?.text || "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const assignment = JSON.parse(jsonMatch[0]);
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ error: "AI generation failed", details: String(err) });
  }
});

export default router;
