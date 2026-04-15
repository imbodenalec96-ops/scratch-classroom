import React, { useState, useCallback } from "react";
import type { Block, BlockCategory } from "@scratch/shared";
import { BLOCK_DEFS, type BlockDef } from "../lib/blockDefinitions.ts";

interface Props {
  onAddBlock: (block: Block) => void;
  onClose: () => void;
}

interface GeneratedBlock {
  name: string;
  label: string;
  category: BlockCategory;
  description: string;
  inputs?: { name: string; type: "number" | "string"; default: any }[];
}

const QUICK_PROMPTS = [
  { label: "🎮 Game movement", prompt: "Create blocks for a simple platformer game with jump and move mechanics" },
  { label: "🌈 Color effects", prompt: "Create blocks that make the sprite change colors in a rainbow pattern" },
  { label: "💬 Chat bot", prompt: "Create blocks to make a simple chatbot that responds to questions" },
  { label: "🎵 Music maker", prompt: "Create blocks that play musical notes to make a melody" },
  { label: "🎲 Random events", prompt: "Create blocks for random game events like spawning items" },
  { label: "🤖 AI behavior", prompt: "Create blocks that make a sprite follow the mouse intelligently" },
];

export default function AIBlockCreator({ onAddBlock, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedBlocks, setGeneratedBlocks] = useState<GeneratedBlock[]>([]);
  const [error, setError] = useState("");

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/ai/generate-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.blocks && Array.isArray(data.blocks)) {
          setGeneratedBlocks(data.blocks);
        } else {
          setGeneratedBlocks(generateLocalBlocks(prompt.trim()));
        }
      } else {
        setGeneratedBlocks(generateLocalBlocks(prompt.trim()));
      }
    } catch {
      // AI endpoint may not exist - generate locally
      setGeneratedBlocks(generateLocalBlocks(prompt.trim()));
    }

    setLoading(false);
  }, [prompt]);

  const handleAddGenerated = useCallback(
    (gen: GeneratedBlock) => {
      const newBlock: Block = {
        id: "b_" + Math.random().toString(36).slice(2, 11),
        type: `custom_ai_${gen.name.replace(/\s+/g, "_").toLowerCase()}`,
        category: gen.category,
        inputs: Object.fromEntries(
          (gen.inputs || []).map((inp) => [inp.name, { type: "value" as const, value: inp.default }])
        ),
        x: 80,
        y: 80,
      };
      onAddBlock(newBlock);
    },
    [onAddBlock]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[600px] max-h-[80vh] bg-[#1a1a30] rounded-2xl border border-white/[0.1] shadow-2xl shadow-violet-500/10 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/[0.06] bg-gradient-to-r from-[#FF6B9D]/20 to-violet-500/20">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B9D] to-violet-500 flex items-center justify-center text-lg shadow-lg shadow-[#FF6B9D]/30">
            ✧
          </div>
          <div className="flex-1">
            <h2 className="text-white font-bold text-lg">AI Block Creator</h2>
            <p className="text-white/40 text-xs">Describe what you want and AI will create custom blocks for you</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/40 hover:text-white flex items-center justify-center transition-all">
            ✕
          </button>
        </div>

        {/* Input area */}
        <div className="p-4 space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the blocks you want to create... e.g., 'Make blocks for a gravity simulator' or 'Create blocks that make sprites talk to each other'"
            className="w-full h-24 px-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white text-sm placeholder-white/25 resize-none focus:outline-none focus:ring-2 focus:ring-[#FF6B9D]/50 focus:border-[#FF6B9D]/50 transition-all"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="px-5 py-2 bg-gradient-to-r from-[#FF6B9D] to-violet-500 text-white font-bold text-sm rounded-xl hover:opacity-90 disabled:opacity-40 transition-all shadow-lg shadow-[#FF6B9D]/20 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⟳</span> Generating...
                </>
              ) : (
                <>✧ Create Blocks</>
              )}
            </button>
            {prompt && (
              <button onClick={() => { setPrompt(""); setGeneratedBlocks([]); }} className="px-3 py-2 text-white/40 hover:text-white text-sm transition-colors">
                Clear
              </button>
            )}
          </div>

          {/* Quick prompts */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                onClick={() => { setPrompt(qp.prompt); }}
                className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg text-[11px] text-white/50 hover:text-white/80 transition-all"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Generated blocks */}
        {generatedBlocks.length > 0 && (
          <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-2">
            <p className="text-white/40 text-xs font-medium uppercase tracking-wider">Generated Blocks</p>
            {generatedBlocks.map((gen, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl transition-all group"
              >
                <div
                  className="px-3 py-1.5 rounded-lg text-white font-bold text-xs min-w-[140px] text-center"
                  style={{ backgroundColor: getCatColor(gen.category) }}
                >
                  {gen.label}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/70 text-xs truncate">{gen.description}</p>
                  {gen.inputs && gen.inputs.length > 0 && (
                    <p className="text-white/30 text-[10px] mt-0.5">
                      Inputs: {gen.inputs.map((i) => i.name).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleAddGenerated(gen)}
                  className="px-3 py-1.5 bg-[#FF6B9D]/20 hover:bg-[#FF6B9D]/30 text-[#FF6B9D] font-bold text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Local block generation fallback ── */
function generateLocalBlocks(prompt: string): GeneratedBlock[] {
  const lower = prompt.toLowerCase();
  const blocks: GeneratedBlock[] = [];

  if (lower.includes("game") || lower.includes("jump") || lower.includes("platform")) {
    blocks.push(
      { name: "jump", label: "jump (HEIGHT)", category: "motion", description: "Make the sprite jump up", inputs: [{ name: "HEIGHT", type: "number", default: 50 }] },
      { name: "fall", label: "apply gravity (STRENGTH)", category: "motion", description: "Pull sprite downward", inputs: [{ name: "STRENGTH", type: "number", default: 2 }] },
      { name: "land", label: "land on ground at (Y)", category: "motion", description: "Stop falling at ground level", inputs: [{ name: "Y", type: "number", default: -120 }] }
    );
  }

  if (lower.includes("color") || lower.includes("rainbow") || lower.includes("effect")) {
    blocks.push(
      { name: "rainbow", label: "rainbow cycle speed (SPEED)", category: "looks", description: "Cycle through rainbow colors", inputs: [{ name: "SPEED", type: "number", default: 5 }] },
      { name: "glow", label: "glow color (COLOR)", category: "looks", description: "Add a glowing effect", inputs: [{ name: "COLOR", type: "string", default: "#ff00ff" }] },
      { name: "fade", label: "fade to (OPACITY) %", category: "looks", description: "Fade transparency", inputs: [{ name: "OPACITY", type: "number", default: 50 }] }
    );
  }

  if (lower.includes("chat") || lower.includes("talk") || lower.includes("respond")) {
    blocks.push(
      { name: "greet", label: "greet user with (MSG)", category: "ai", description: "Say hello to the user", inputs: [{ name: "MSG", type: "string", default: "Hi there!" }] },
      { name: "respond_to", label: "respond to (INPUT)", category: "ai", description: "Generate a smart reply", inputs: [{ name: "INPUT", type: "string", default: "hello" }] },
      { name: "remember", label: "remember (FACT)", category: "ai", description: "Store information for later", inputs: [{ name: "FACT", type: "string", default: "user likes cats" }] }
    );
  }

  if (lower.includes("music") || lower.includes("note") || lower.includes("melody") || lower.includes("song")) {
    blocks.push(
      { name: "play_note", label: "play note (NOTE) for (BEATS) beats", category: "sound", description: "Play a musical note", inputs: [{ name: "NOTE", type: "number", default: 60 }, { name: "BEATS", type: "number", default: 1 }] },
      { name: "set_tempo", label: "set tempo to (BPM)", category: "sound", description: "Change how fast the music plays", inputs: [{ name: "BPM", type: "number", default: 120 }] },
      { name: "drum", label: "play drum (DRUM) for (BEATS) beats", category: "sound", description: "Play a drum sound", inputs: [{ name: "DRUM", type: "number", default: 1 }, { name: "BEATS", type: "number", default: 1 }] }
    );
  }

  if (lower.includes("random") || lower.includes("spawn") || lower.includes("item")) {
    blocks.push(
      { name: "spawn_at_random", label: "spawn at random position", category: "motion", description: "Place sprite at a random spot" },
      { name: "random_costume", label: "switch to random costume", category: "looks", description: "Pick a random look" },
      { name: "random_wait", label: "wait random (MIN) to (MAX) secs", category: "control", description: "Pause for a random time", inputs: [{ name: "MIN", type: "number", default: 1 }, { name: "MAX", type: "number", default: 5 }] }
    );
  }

  if (lower.includes("follow") || lower.includes("chase") || lower.includes("ai") || lower.includes("smart")) {
    blocks.push(
      { name: "follow_mouse", label: "follow mouse speed (SPEED)", category: "motion", description: "Move toward mouse pointer", inputs: [{ name: "SPEED", type: "number", default: 3 }] },
      { name: "avoid_sprite", label: "avoid (SPRITE) distance (DIST)", category: "motion", description: "Run away from a sprite", inputs: [{ name: "SPRITE", type: "string", default: "Cat" }, { name: "DIST", type: "number", default: 50 }] },
      { name: "wander", label: "wander randomly speed (SPEED)", category: "motion", description: "Move around randomly", inputs: [{ name: "SPEED", type: "number", default: 2 }] }
    );
  }

  // Always add some AI blocks as a baseline
  if (blocks.length === 0) {
    blocks.push(
      { name: "do_action", label: `AI: ${prompt.slice(0, 30)}`, category: "ai", description: `Custom AI block: ${prompt}` },
      { name: "think_about", label: "think about (TOPIC)", category: "ai", description: "AI thinks and generates ideas", inputs: [{ name: "TOPIC", type: "string", default: prompt.slice(0, 20) }] },
      { name: "respond", label: "AI respond to (INPUT)", category: "ai", description: "Generate an intelligent response", inputs: [{ name: "INPUT", type: "string", default: "hello" }] }
    );
  }

  return blocks;
}

function getCatColor(cat: BlockCategory): string {
  const colors: Partial<Record<BlockCategory, string>> = {
    motion: "#4C97FF",
    looks: "#9966FF",
    sound: "#CF63CF",
    events: "#FFBF00",
    control: "#FFAB19",
    operators: "#59C059",
    variables: "#FF8C1A",
    ai: "#FF6B9D",
  };
  return colors[cat] || "#888";
}
