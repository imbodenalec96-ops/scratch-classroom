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
      // AI may return brand new block names; map them to an existing block type
      // so the editor can render and execute the added block immediately.
      const normalizeId = (value: string) => value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
      const slug = normalizeId(gen.name);
      const preferredType = `${gen.category}_${slug}`;
      const resolvedDef =
        BLOCK_DEFS.find((d) => d.type === preferredType) ||
        BLOCK_DEFS.find((d) => normalizeId(d.type) === normalizeId(preferredType)) ||
        BLOCK_DEFS.find((d) => d.category === gen.category && normalizeId(d.type.replace(`${gen.category}_`, "")) === slug) ||
        BLOCK_DEFS.find((d) => d.category === gen.category && d.shape === "stack") ||
        BLOCK_DEFS.find((d) => d.shape === "stack") ||
        BLOCK_DEFS[0];

      const defaultInputs = Object.fromEntries(
        (resolvedDef.inputs || []).map((inp) => [inp.name, { type: "value" as const, value: inp.default }])
      );

      // Copy AI input defaults into matching real inputs (case-insensitive match).
      const incomingInputs = gen.inputs || [];
      for (const inp of incomingInputs) {
        const targetKey = Object.keys(defaultInputs).find(
          (k) => k.toLowerCase() === inp.name.toLowerCase()
        );
        if (targetKey) {
          defaultInputs[targetKey] = { type: "value", value: inp.default };
        }
      }

      const newBlock: Block = {
        id: "b_" + Math.random().toString(36).slice(2, 11),
        type: resolvedDef.type,
        category: resolvedDef.category,
        inputs: defaultInputs,
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
        className="ai-panel w-[600px] max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b bg-gradient-to-r from-[#FF6B9D]/20 to-violet-500/20" style={{ borderColor: "var(--border)" }}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B9D] to-violet-500 flex items-center justify-center text-lg shadow-lg shadow-[#FF6B9D]/30">
            ✧
          </div>
          <div className="flex-1">
            <h2 className="text-t1 font-bold text-lg">AI Block Creator</h2>
            <p className="text-t3 text-xs">Describe what you want and AI will create custom blocks for you</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer text-t3 hover:text-t1" style={{ background: "var(--bg-hover)" }}>
            ✕
          </button>
        </div>

        {/* Input area */}
        <div className="p-4 space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the blocks you want to create... e.g., 'Make blocks for a gravity simulator'"
            className="input w-full h-24 resize-none focus:ring-2 focus:ring-[#FF6B9D]/50 focus:border-[#FF6B9D]/50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="px-5 py-2 bg-gradient-to-r from-[#FF6B9D] to-violet-500 text-white font-bold text-sm rounded-xl hover:opacity-90 disabled:opacity-40 transition-all shadow-lg shadow-[#FF6B9D]/20 flex items-center gap-2 cursor-pointer"
            >
              {loading ? <><span className="animate-spin">⟳</span> Generating...</> : <>✧ Create Blocks</>}
            </button>
            {prompt && (
              <button onClick={() => { setPrompt(""); setGeneratedBlocks([]); }} className="btn-ghost text-sm">
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                onClick={() => setPrompt(qp.prompt)}
                className="px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border"
                style={{ background: "var(--bg-muted)", borderColor: "var(--border)", color: "var(--text-3)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent-light)"; (e.currentTarget as HTMLElement).style.color = "var(--text-accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)"; (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-4 mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">{error}</div>
        )}

        {generatedBlocks.length > 0 && (
          <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-2 scrollbar-thin">
            <p className="table-header mb-1">Generated Blocks</p>
            {generatedBlocks.map((gen, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl transition-all border"
                style={{ background: "var(--bg-muted)", borderColor: "var(--border)" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)"}
              >
                <div
                  className="px-3 py-1.5 rounded-lg text-white font-bold text-xs min-w-[140px] text-center"
                  style={{ backgroundColor: getCatColor(gen.category) }}
                >
                  {gen.label}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-t2 text-xs truncate">{gen.description}</p>
                  {gen.inputs && gen.inputs.length > 0 && (
                    <p className="text-t3 text-[10px] mt-0.5">Inputs: {gen.inputs.map((i) => i.name).join(", ")}</p>
                  )}
                </div>
                <button
                  onClick={() => handleAddGenerated(gen)}
                  className="px-3 py-1.5 bg-[#FF6B9D]/20 hover:bg-[#FF6B9D]/30 text-[#FF6B9D] font-bold text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer"
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

  const hasAny = (...terms: string[]) => terms.some((t) => lower.includes(t));

  if (hasAny("flashlight", "torch", "light") && hasAny("enemy", "enemies", "monster", "zombie", "chase", "running")) {
    blocks.push(
      { name: "follow_mouse", label: "follow mouse speed (SPEED)", category: "motion", description: "Aim flashlight toward mouse", inputs: [{ name: "SPEED", type: "number", default: 3 }] },
      { name: "distance_check", label: "distance to player (DIST)", category: "sensing", description: "Measure enemy distance", inputs: [{ name: "DIST", type: "number", default: 80 }] },
      { name: "push_away", label: "push enemy away (POWER)", category: "motion", description: "Repel enemies when flashlight hits", inputs: [{ name: "POWER", type: "number", default: 6 }] },
      { name: "threat_loop", label: "enemy chase loop", category: "control", description: "Run enemy AI continuously" },
      { name: "flash_effect", label: "flashlight glow (VALUE)", category: "looks", description: "Set brightness to show flashlight cone", inputs: [{ name: "VALUE", type: "number", default: 30 }] }
    );
  }

  if (hasAny("game", "jump", "platform", "enemy", "chase")) {
    blocks.push(
      { name: "setstate", label: "set game state to (STATE)", category: "game", description: "Switch the game into play, pause, menu, or battle mode", inputs: [{ name: "STATE", type: "string", default: "playing" }] },
      { name: "setplayerstat", label: "set player (STAT) to (VALUE)", category: "game", description: "Track player health, score, ammo, or speed", inputs: [{ name: "STAT", type: "string", default: "health" }, { name: "VALUE", type: "number", default: 100 }] },
      { name: "spawnenemy", label: "spawn enemy (TYPE) at x: (X) y: (Y)", category: "game", description: "Spawn an enemy for the current scene", inputs: [{ name: "TYPE", type: "string", default: "slime" }, { name: "X", type: "number", default: 120 }, { name: "Y", type: "number", default: -100 }] },
      { name: "setworldgravity", label: "set world gravity to (GRAVITY)", category: "game", description: "Control platformer or physics movement", inputs: [{ name: "GRAVITY", type: "number", default: 0.8 }] }
    );
  }

  if (hasAny("inventory", "quest", "save", "checkpoint", "hud", "objective", "rpg")) {
    blocks.push(
      { name: "additem", label: "add item (ITEM)", category: "game", description: "Add a reward or pickup to the inventory", inputs: [{ name: "ITEM", type: "string", default: "key" }] },
      { name: "setquest", label: "set quest (QUEST) to (STATUS)", category: "game", description: "Track quest progress", inputs: [{ name: "QUEST", type: "string", default: "Open the gate" }, { name: "STATUS", type: "string", default: "active" }] },
      { name: "save", label: "save game slot (SLOT)", category: "game", description: "Store game progress locally", inputs: [{ name: "SLOT", type: "string", default: "slot1" }] },
      { name: "showhud", label: "show HUD message (TEXT)", category: "game", description: "Display the next objective or hint", inputs: [{ name: "TEXT", type: "string", default: "Find the exit" }] }
    );
  }

  if (hasAny("color", "rainbow", "effect", "flashlight", "light")) {
    blocks.push(
      { name: "rainbow", label: "rainbow cycle speed (SPEED)", category: "looks", description: "Cycle through rainbow colors", inputs: [{ name: "SPEED", type: "number", default: 5 }] },
      { name: "glow", label: "glow color (COLOR)", category: "looks", description: "Add a glowing effect", inputs: [{ name: "COLOR", type: "string", default: "#ff00ff" }] },
      { name: "fade", label: "fade to (OPACITY) %", category: "looks", description: "Fade transparency", inputs: [{ name: "OPACITY", type: "number", default: 50 }] }
    );
  }

  if (hasAny("chat", "talk", "respond", "ai", "npc")) {
    blocks.push(
      { name: "greet", label: "greet user with (MSG)", category: "ai", description: "Say hello to the user", inputs: [{ name: "MSG", type: "string", default: "Hi there!" }] },
      { name: "respond_to", label: "respond to (INPUT)", category: "ai", description: "Generate a smart reply", inputs: [{ name: "INPUT", type: "string", default: "hello" }] },
      { name: "remember", label: "remember (FACT)", category: "ai", description: "Store information for later", inputs: [{ name: "FACT", type: "string", default: "user likes cats" }] }
    );
  }

  if (hasAny("music", "note", "melody", "song", "sound")) {
    blocks.push(
      { name: "play_note", label: "play note (NOTE) for (BEATS) beats", category: "sound", description: "Play a musical note", inputs: [{ name: "NOTE", type: "number", default: 60 }, { name: "BEATS", type: "number", default: 1 }] },
      { name: "set_tempo", label: "set tempo to (BPM)", category: "sound", description: "Change how fast the music plays", inputs: [{ name: "BPM", type: "number", default: 120 }] },
      { name: "drum", label: "play drum (DRUM) for (BEATS) beats", category: "sound", description: "Play a drum sound", inputs: [{ name: "DRUM", type: "number", default: 1 }, { name: "BEATS", type: "number", default: 1 }] }
    );
  }

  if (hasAny("random", "spawn", "item", "event")) {
    blocks.push(
      { name: "spawn_at_random", label: "spawn at random position", category: "motion", description: "Place sprite at a random spot" },
      { name: "random_costume", label: "switch to random costume", category: "looks", description: "Pick a random look" },
      { name: "random_wait", label: "wait random (MIN) to (MAX) secs", category: "control", description: "Pause for a random time", inputs: [{ name: "MIN", type: "number", default: 1 }, { name: "MAX", type: "number", default: 5 }] }
    );
  }

  if (hasAny("follow", "chase", "ai", "smart", "enemy")) {
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

  // Keep only unique names and avoid overwhelming the list
  const seen = new Set<string>();
  return blocks.filter((b) => {
    if (seen.has(b.name)) return false;
    seen.add(b.name);
    return true;
  }).slice(0, 12);
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
    game: "#E85D2A",
    ai: "#FF6B9D",
  };
  return colors[cat] || "#888";
}
