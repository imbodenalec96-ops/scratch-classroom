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
    const ctrl = db.prepare(
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
