import React, { useState, useCallback, useRef, useEffect } from "react";
import type { Block, BlockCategory } from "@scratch/shared";
import { useTheme } from "../lib/theme.tsx";
import {
  BLOCK_DEFS,
  CATEGORIES,
  getBlockDef,
  type BlockDef,
  type BlockShape,
} from "../lib/blockDefinitions.ts";

/* ─────────── Types & Helpers ─────────── */

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  onResetProject?: () => void;
  disabledCategories?: BlockCategory[];
}

interface StarterPackBlock {
  type: string;
  inputs?: Record<string, string | number | boolean>;
}

interface StarterPackStack {
  blocks: StarterPackBlock[];
}

interface StarterPack {
  id: string;
  label: string;
  description: string;
  accent: string;
  blocks: StarterPackBlock[];
  stacks?: StarterPackStack[];
}

function uid(): string {
  return "b_" + Math.random().toString(36).slice(2, 11);
}

function makeBlockFromDef(def: BlockDef, inputOverrides?: Record<string, string | number | boolean>): Block {
  return {
    id: uid(),
    type: def.type,
    category: def.category,
    inputs: Object.fromEntries(
      (def.inputs || []).map((inp) => [
        inp.name,
        {
          type: "value" as const,
          value: inputOverrides?.[inp.name] ?? inp.default,
        },
      ])
    ),
  };
}

/* Height of a stack block row */
const BLOCK_H = 44;
const SNAP_RADIUS = 88;
const FAVORITES_STORAGE_KEY = "block-editor.favorite-blocks";
const DEFAULT_GAME_FAVORITES = [
  "game_setstate",
  "game_setplayerstat",
  "game_spawnenemy",
  "game_damage",
  "game_additem",
  "game_save",
];
const GAME_GROUP_ORDER = [
  "Game Flow",
  "Player System",
  "Enemy System",
  "Combat",
  "Inventory",
  "Quests",
  "World",
  "UI",
  "Save System",
  "Multiplayer",
  "Animation",
  "Audio",
  "Logic Helpers",
];
const GAME_STARTER_PACKS: StarterPack[] = [
  {
    id: "platformer",
    label: "Platformer",
    description: "Level flow, checkpoint, gravity, combat, and HUD.",
    accent: "#E85D2A",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "playing" } },
      { type: "game_startlevel", inputs: { LEVEL: 1 } },
      { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 100 } },
      { type: "game_setplayerstat", inputs: { STAT: "score", VALUE: 0 } },
      { type: "game_setcheckpoint", inputs: { X: -180, Y: -120 } },
      { type: "game_setworldgravity", inputs: { GRAVITY: 0.8 } },
      { type: "game_showhud", inputs: { TEXT: "Platformer mode ready" } },
      { type: "game_setobjective", inputs: { TEXT: "Reach the exit and collect coins" } },
    ],
  },
  {
    id: "fps",
    label: "FPS",
    description: "Enemy spawns, camera feedback, AI, and battle audio.",
    accent: "#F08A24",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "combat" } },
      { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 150 } },
      { type: "game_spawnenemy", inputs: { TYPE: "drone", X: 120, Y: 40 } },
      { type: "game_setenemyai", inputs: { STYLE: "chase" } },
      { type: "game_shakecamera", inputs: { POWER: 10, SECS: 0.25 } },
      { type: "game_musicmode", inputs: { MODE: "battle" } },
      { type: "game_showhud", inputs: { TEXT: "Enemies incoming" } },
    ],
  },
  {
    id: "rpg",
    label: "RPG",
    description: "Inventory, quests, save slots, and status-based flow.",
    accent: "#C9681F",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "exploring" } },
      { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 90 } },
      { type: "game_additem", inputs: { ITEM: "wooden sword" } },
      { type: "game_setquest", inputs: { QUEST: "Speak to the village elder", STATUS: "active" } },
      { type: "game_showhud", inputs: { TEXT: "Quest accepted" } },
      { type: "game_setobjective", inputs: { TEXT: "Find the village elder" } },
      { type: "game_save", inputs: { SLOT: "rpg-slot" } },
    ],
  },
  {
    id: "demo",
    label: "Arcade Demo",
    description: "Compact example using the new game blocks end to end.",
    accent: "#B94B18",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "demo" } },
      { type: "game_startlevel", inputs: { LEVEL: 1 } },
      { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 100 } },
      { type: "game_spawnenemy", inputs: { TYPE: "bot", X: 100, Y: 0 } },
      { type: "game_damage", inputs: { AMOUNT: 5 } },
      { type: "game_additem", inputs: { ITEM: "coin" } },
      { type: "game_completequest", inputs: { QUEST: "First win" } },
      { type: "game_save", inputs: { SLOT: "demo-slot" } },
    ],
  },
  {
    id: "survival",
    label: "Survival",
    description: "Waves, inventory, objective pressure, and recovery loop.",
    accent: "#7CB518",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "playing" } },
      { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 120 } },
      { type: "game_setplayerstat", inputs: { STAT: "score", VALUE: 0 } },
      { type: "game_additem", inputs: { ITEM: "berries" } },
      { type: "game_spawnenemy", inputs: { TYPE: "zombie", X: 140, Y: -20 } },
      { type: "game_setenemyai", inputs: { STYLE: "patrol" } },
      { type: "game_setobjective", inputs: { TEXT: "Survive and keep your health above zero" } },
      { type: "game_showhud", inputs: { TEXT: "Night is coming" } },
    ],
  },
  {
    id: "racing",
    label: "Racing",
    description: "High-speed checkpoint style loop and run-focused setup.",
    accent: "#F77F00",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "playing" } },
      { type: "game_startlevel", inputs: { LEVEL: 1 } },
      { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 100 } },
      { type: "game_setplayerstat", inputs: { STAT: "score", VALUE: 0 } },
      { type: "game_setcheckpoint", inputs: { X: 0, Y: 0 } },
      { type: "game_setobjective", inputs: { TEXT: "Race to the checkpoint" } },
      { type: "game_showhud", inputs: { TEXT: "Use arrows/WASD and boost" } },
    ],
  },
  {
    id: "bossfight",
    label: "Boss Fight",
    description: "Big enemy setup with camera shake and combat tone.",
    accent: "#D00000",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "combat" } },
      { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 180 } },
      { type: "game_spawnenemy", inputs: { TYPE: "boss", X: 180, Y: 20 } },
      { type: "game_setenemyai", inputs: { STYLE: "attack" } },
      { type: "game_musicmode", inputs: { MODE: "battle" } },
      { type: "game_shakecamera", inputs: { POWER: 12, SECS: 0.35 } },
      { type: "game_setobjective", inputs: { TEXT: "Defeat the boss" } },
      { type: "game_showhud", inputs: { TEXT: "Boss incoming" } },
    ],
  },
  {
    id: "questhunt",
    label: "Quest Hunt",
    description: "Story objective + item + quest progression starter.",
    accent: "#6A4C93",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "exploring" } },
      { type: "game_setquest", inputs: { QUEST: "Find the crystal", STATUS: "active" } },
      { type: "game_additem", inputs: { ITEM: "map" } },
      { type: "game_setobjective", inputs: { TEXT: "Find the crystal cave" } },
      { type: "game_showhud", inputs: { TEXT: "Quest started" } },
      { type: "game_completequest", inputs: { QUEST: "Find the crystal" } },
      { type: "game_save", inputs: { SLOT: "quest-slot" } },
    ],
  },
  {
    id: "towerdefense",
    label: "Tower Defense",
    description: "Enemy wave concept with objective and score tracking.",
    accent: "#2A9D8F",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "playing" } },
      { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 200 } },
      { type: "game_setplayerstat", inputs: { STAT: "score", VALUE: 0 } },
      { type: "game_spawnenemy", inputs: { TYPE: "bot", X: 170, Y: 90 } },
      { type: "game_spawnenemy", inputs: { TYPE: "bot", X: 170, Y: -80 } },
      { type: "game_setenemyai", inputs: { STYLE: "chase" } },
      { type: "game_setobjective", inputs: { TEXT: "Defend your base" } },
      { type: "game_showhud", inputs: { TEXT: "Wave started" } },
    ],
  },
  {
    id: "water",
    label: "Water Adventure",
    description: "Swim controls, sea enemies, and underwater objectives.",
    accent: "#0EA5E9",
    blocks: [
      { type: "event_whenflagclicked" },
      { type: "game_setstate", inputs: { STATE: "playing" } },
      { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 130 } },
      { type: "game_spawnenemy", inputs: { TYPE: "shark", X: 140, Y: 30 } },
      { type: "game_setenemyai", inputs: { STYLE: "chase" } },
      { type: "game_setobjective", inputs: { TEXT: "Collect pearls and escape" } },
      { type: "game_showhud", inputs: { TEXT: "Swim: Arrows/WASD" } },
      { type: "game_musicmode", inputs: { MODE: "battle" } },
    ],
  },
];

function starterMovementStacks(step = 12, runStep = 24, jumpStep = 16): StarterPackStack[] {
  return [
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "right arrow" } }, { type: "motion_changex", inputs: { DX: step } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "left arrow" } }, { type: "motion_changex", inputs: { DX: -step } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "up arrow" } }, { type: "motion_changey", inputs: { DY: step } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "down arrow" } }, { type: "motion_changey", inputs: { DY: -step } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "d" } }, { type: "motion_changex", inputs: { DX: step } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "a" } }, { type: "motion_changex", inputs: { DX: -step } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "w" } }, { type: "motion_changey", inputs: { DY: step } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "s" } }, { type: "motion_changey", inputs: { DY: -step } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "space" } }, { type: "motion_changey", inputs: { DY: jumpStep } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "shift" } }, { type: "motion_changex", inputs: { DX: runStep } }] },
    { blocks: [{ type: "event_whenkeypressed", inputs: { KEY: "control" } }, { type: "motion_changex", inputs: { DX: -runStep } }] },
  ];
}

/* Darken / lighten a hex colour */
function shade(hex: string, pct: number): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - pct / 100;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/* Get children of a block, sorted by their original drop order */
function getChildren(parentId: string, blocks: Block[]): Block[] {
  return blocks
    .filter((b) => b.parent === parentId)
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
}

/* Get all root blocks (no parent, or parent missing) */
function getRoots(blocks: Block[]): Block[] {
  const ids = new Set(blocks.map((b) => b.id));
  return blocks.filter((b) => !b.parent || !ids.has(b.parent));
}

/* Measure the rendered height of a block stack from a root */
function stackHeight(blockId: string, blocks: Block[]): number {
  const def = getBlockDef(blocks.find((b) => b.id === blockId)?.type || "");
  let h = BLOCK_H;
  if (def?.shape === "c") h += 20; // bottom bar
  const kids = getChildren(blockId, blocks);
  for (const kid of kids) {
    h += stackHeight(kid.id, blocks);
  }
  return h;
}

/* Compute absolute (workspace-space) position of any block, including children */
function getBlockAbsolutePos(blockId: string, blocks: Block[]): { x: number; y: number } {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return { x: 0, y: 0 };
  if (!block.parent) return { x: block.x || 0, y: block.y || 0 };
  const parentPos = getBlockAbsolutePos(block.parent, blocks);
  const siblings = getChildren(block.parent, blocks);
  let yOff = BLOCK_H;
  const parentDef = getBlockDef(blocks.find((b) => b.id === block.parent)?.type || "");
  if (parentDef?.shape === "c") yOff += 8;
  for (const sib of siblings) {
    if (sib.id === blockId) break;
    yOff += stackHeight(sib.id, blocks);
  }
  return { x: parentPos.x, y: parentPos.y + yOff };
}

/* ─────────── Block Label (with embedded inputs) ─────────── */

function BlockLabel({
  def,
  block,
  onInputChange,
  isPalette,
}: {
  def: BlockDef;
  block?: Block;
  onInputChange?: (blockId: string, key: string, val: any) => void;
  isPalette?: boolean;
}) {
  const parts = def.label.split(/(\([A-Z_]+\))/);
  return (
    <span className="flex items-center gap-0.5 flex-wrap text-white font-bold text-[13.5px] leading-tight whitespace-nowrap select-none">
      {parts.map((part, i) => {
        const m = part.match(/^\(([A-Z_]+)\)$/);
        if (m && def.inputs) {
          const inputDef = def.inputs.find((inp) => inp.name === m[1]);
          if (!inputDef) return <span key={i}>{part}</span>;
          const value =
            block?.inputs[m[1]]?.value ?? inputDef.default ?? "";
          if (isPalette) {
            return (
              <span
                key={i}
                className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-black/20 text-white text-[12px] min-w-[26px] text-center font-semibold"
              >
                {String(inputDef.default)}
              </span>
            );
          }
          return (
            <input
              key={i}
              type={inputDef.type === "number" ? "number" : "text"}
              value={String(value)}
              onChange={(e) => {
                e.stopPropagation();
                onInputChange?.(
                  block!.id,
                  m[1],
                  inputDef.type === "number"
                    ? Number(e.target.value)
                    : e.target.value
                );
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-block w-14 px-1.5 py-0.5 mx-0.5 rounded-md bg-black/25 text-white text-[12px] text-center border border-white/10 outline-none focus:bg-black/35 focus:ring-1 focus:ring-white/40 font-semibold"
            />
          );
        }
        if (part === "◇") {
          return (
            <span
              key={i}
              className="inline-block w-3 h-3 mx-0.5 border-2 border-white/60 rotate-45 rounded-[1px]"
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/* ─────────── SVG Notch (Scratch connector) ─────────── */

function SvgNotch({ y, color }: { y: number; color: string }) {
  return (
    <svg
      className="absolute left-[12px]"
      style={{ top: y - 2 }}
      width="20"
      height="6"
      viewBox="0 0 20 6"
      fill="none"
    >
      <path d="M0 0 L4 0 L6 4 L14 4 L16 0 L20 0" fill={color} />
    </svg>
  );
}

/* ─────────── Block Shape Renderers ─────────── */

function renderBlockBody(
  def: BlockDef,
  children: React.ReactNode,
  innerContent?: React.ReactNode
) {
  const c = def.color;
  const light = shade(c, -12);
  const dark = shade(c, 22);

  switch (def.shape) {
    case "hat":
      return (
        <div className="relative">
          <div
            className="px-3 py-[7px] min-h-[36px] flex items-center rounded-t-[14px] rounded-b"
            style={{
              background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
              borderBottom: `3px solid ${dark}`,
              boxShadow: `0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 ${light}`,
            }}
          >
            {children}
          </div>
          {/* bottom notch */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="0" width="14" height="4" rx="1" fill={c} />
          </svg>
        </div>
      );

    case "stack":
      return (
        <div className="relative">
          {/* top notch cutout */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="2" width="14" height="4" rx="1" fill={c} />
          </svg>
          <div
            className="px-3 py-[7px] min-h-[36px] flex items-center rounded"
            style={{
              background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
              borderBottom: `3px solid ${dark}`,
              boxShadow: `0 2px 4px rgba(0,0,0,0.25), inset 0 1px 0 ${light}`,
            }}
          >
            {children}
          </div>
          {/* bottom notch */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="0" width="14" height="4" rx="1" fill={c} />
          </svg>
        </div>
      );

    case "c":
      return (
        <div className="relative">
          {/* top notch cutout */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="2" width="14" height="4" rx="1" fill={c} />
          </svg>
          {/* top bar */}
          <div
            className="px-3 py-[7px] min-h-[36px] flex items-center"
            style={{
              background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
              borderRadius: "4px 4px 0 0",
              boxShadow: `inset 0 1px 0 ${light}`,
            }}
          >
            {children}
          </div>
          {/* mouth - inner notch + child blocks go here */}
          <div className="flex">
            <div
              style={{
                width: 18,
                backgroundColor: c,
                borderRight: `2px solid ${dark}`,
                borderLeft: `2px solid ${light}`,
              }}
            />
            <div className="flex-1 min-h-[40px] bg-gray-100 dark:bg-[#13132a] rounded-sm my-[2px] relative pl-0 py-1">
              {/* inner top notch */}
              <svg width="100%" height="6" className="block">
                <rect width="100%" height="6" fill="transparent" />
                <rect x="4" y="0" width="14" height="4" rx="1" fill={c} />
              </svg>
              {innerContent}
            </div>
          </div>
          {/* bottom bar */}
          <div
            className="px-3 py-[3px] min-h-[14px]"
            style={{
              backgroundColor: c,
              borderRadius: "0 0 4px 4px",
              borderBottom: `3px solid ${dark}`,
              borderLeft: `2px solid ${light}`,
            }}
          />
          {/* bottom notch */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="0" width="14" height="4" rx="1" fill={c} />
          </svg>
        </div>
      );

    case "cap":
      return (
        <div className="relative">
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="2" width="14" height="4" rx="1" fill={c} />
          </svg>
          <div
            className="px-3 py-[7px] min-h-[36px] flex items-center"
            style={{
              background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
              borderRadius: "4px 4px 14px 14px",
              borderBottom: `3px solid ${dark}`,
              boxShadow: `0 2px 4px rgba(0,0,0,0.25), inset 0 1px 0 ${light}`,
            }}
          >
            {children}
          </div>
        </div>
      );

    case "reporter":
      return (
        <div
          className="px-4 py-[5px] min-h-[28px] flex items-center"
          style={{
            background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
            borderRadius: 999,
            border: `2px solid ${dark}`,
            boxShadow: `0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 ${light}`,
          }}
        >
          {children}
        </div>
      );

    case "boolean":
      return (
        <div
          className="px-5 py-[5px] min-h-[28px] flex items-center"
          style={{
            background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
            clipPath:
              "polygon(12px 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0% 50%)",
            boxShadow: `0 1px 4px rgba(0,0,0,0.3)`,
          }}
        >
          {children}
        </div>
      );

    default:
      return (
        <div
          className="px-3 py-[7px] min-h-[36px] flex items-center rounded"
          style={{ backgroundColor: c }}
        >
          {children}
        </div>
      );
  }
}

/* ─────────── Recursive Block Stack Renderer ─────────── */
/* Renders a block + all its children as a visual column. This is the key
   difference from the old editor: child blocks are rendered INSIDE this
   component instead of as separate absolutely-positioned elements. */

function BlockStack({
  blockId,
  blocks,
  onInputChange,
  onDetach,
  onDelete,
  replaceTargetId,
}: {
  blockId: string;
  blocks: Block[];
  onInputChange: (blockId: string, key: string, val: any) => void;
  onDetach: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  replaceTargetId?: string | null;
}) {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const def = getBlockDef(block.type);
  if (!def) return null;

  const children = getChildren(block.id, blocks);
  const isReplaceTarget = replaceTargetId === block.id;

  /* For C-blocks, children render inside the mouth */
  const isCBlock = def.shape === "c";

  const innerContent = isCBlock ? (
    <div className="pl-1">
      {children.map((child) => (
        <BlockStack
          key={child.id}
          blockId={child.id}
          blocks={blocks}
          onInputChange={onInputChange}
          onDetach={onDetach}
          onDelete={onDelete}
          replaceTargetId={replaceTargetId}
        />
      ))}
      {children.length === 0 && (
        <div className="h-8 flex items-center pl-2">
          <span className="text-gray-300 dark:text-white/15 text-[10px] italic">drop blocks here</span>
        </div>
      )}
    </div>
  ) : null;

  /* For stack/hat blocks, children render below */
  const belowContent = !isCBlock ? (
    <>
      {children.map((child) => (
        <BlockStack
          key={child.id}
          blockId={child.id}
          blocks={blocks}
          onInputChange={onInputChange}
          onDetach={onDetach}
          onDelete={onDelete}
          replaceTargetId={replaceTargetId}
        />
      ))}
    </>
  ) : null;

  return (
    <div className="relative group/block">
      {/* The block body */}
      <div
        onDoubleClick={(e) => { e.stopPropagation(); onDetach(block.id); }}
        className="relative"
      >
        {isReplaceTarget && (
          <div className="absolute inset-0 z-10 pointer-events-none rounded ring-2 ring-orange-400 animate-pulse" style={{ boxShadow: "0 0 12px rgba(251,146,60,0.6)" }} />
        )}
        {renderBlockBody(
          def,
          <BlockLabel def={def} block={block} onInputChange={onInputChange} />,
          innerContent
        )}
        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(block.id);
          }}
          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-400 active:scale-90 rounded-full text-[12px] font-black text-white opacity-0 group-hover/block:opacity-100 transition-all duration-100 flex items-center justify-center shadow-lg z-20 leading-none"
          title="Delete block"
        >
          ×
        </button>
      </div>
      {/* Children below (for non-C blocks) */}
      {belowContent}
    </div>
  );
}

/* ─────────── Draggable Root Stack ─────────── */

function DraggableStack({
  rootBlock,
  blocks,
  positionOverride,
  onMove,
  onMoveEnd,
  onInputChange,
  onDetach,
  onDelete,
  isDragTarget,
  replaceTargetId,
  workspaceRef,
}: {
  rootBlock: Block;
  blocks: Block[];
  positionOverride?: { x: number; y: number };
  onMove: (id: string, x: number, y: number) => void;
  onMoveEnd: (id: string) => void;
  onInputChange: (blockId: string, key: string, val: any) => void;
  onDetach: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  isDragTarget: boolean;
  replaceTargetId?: string | null;
  workspaceRef: React.RefObject<HTMLDivElement>;
}) {
  const [dragging, setDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const pendingPos = useRef<{ x: number; y: number } | null>(null);
  const currentX = positionOverride?.x ?? rootBlock.x ?? 20;
  const currentY = positionOverride?.y ?? rootBlock.y ?? 20;

  const flushMove = useCallback(() => {
    const next = pendingPos.current;
    rafRef.current = null;
    if (!next) return;
    onMove(rootBlock.id, next.x, next.y);
  }, [onMove, rootBlock.id]);

  // Active pen pointerId for palm rejection on the workspace
  const activePenRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      // Palm rejection: ignore touch if a pen is active
      if (e.pointerType === "touch" && activePenRef.current !== null) return;
      if (e.pointerType === "pen") activePenRef.current = e.pointerId;
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const rect = workspace.getBoundingClientRect();
      const scrollL = workspace.scrollLeft;
      const scrollT = workspace.scrollTop;
      const baseX = currentX;
      const baseY = currentY;

      offset.current = {
        x: e.clientX - (rect.left + scrollL + baseX),
        y: e.clientY - (rect.top + scrollT + baseY),
      };

      const handleMove = (me: PointerEvent) => {
        if (e.pointerType === "touch" && activePenRef.current !== null) return;
        const ws = workspaceRef.current;
        if (!ws) return;
        const wsRect = ws.getBoundingClientRect();
        const nextX = me.clientX - wsRect.left + ws.scrollLeft - offset.current.x;
        const nextY = me.clientY - wsRect.top + ws.scrollTop - offset.current.y;
        pendingPos.current = { x: nextX, y: nextY };
        if (rafRef.current == null) {
          rafRef.current = window.requestAnimationFrame(flushMove);
        }
      };
      const handleUp = (me: PointerEvent) => {
        if (me.pointerId !== e.pointerId) return;
        if (e.pointerType === "pen") activePenRef.current = null;
        if (rafRef.current != null) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        if (pendingPos.current) {
          onMove(rootBlock.id, pendingPos.current.x, pendingPos.current.y);
        }
        setDragging(false);
        onMoveEnd(rootBlock.id);
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        document.removeEventListener("pointercancel", handleUp);
      };
      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
      document.addEventListener("pointercancel", handleUp);
    },
    [rootBlock.id, currentX, currentY, onMove, onMoveEnd, workspaceRef, flushMove]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`absolute select-none transition-shadow ${
        dragging ? "z-50 opacity-80" : "z-10"
      } ${isDragTarget ? "ring-2 ring-yellow-400/70 ring-offset-2 ring-offset-transparent rounded-lg" : ""}`}
      style={{
        left: currentX,
        top: currentY,
        transition: dragging ? "none" : "left 0.12s ease, top 0.12s ease",
        cursor: dragging ? "grabbing" : "grab",
        filter: isDragTarget ? "brightness(1.15)" : undefined,
        willChange: dragging ? "left, top" : undefined,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none" as React.CSSProperties["WebkitUserSelect"],
      }}
      onPointerDown={handlePointerDown}
    >
      <BlockStack
        blockId={rootBlock.id}
        blocks={blocks}
        onInputChange={onInputChange}
        onDetach={onDetach}
        onDelete={onDelete}
        replaceTargetId={replaceTargetId}
      />
    </div>
  );
}

const MemoDraggableStack = React.memo(DraggableStack, (prev, next) => {
  const prevPos = prev.positionOverride;
  const nextPos = next.positionOverride;
  const samePos =
    (prevPos == null && nextPos == null) ||
    (prevPos != null && nextPos != null && prevPos.x === nextPos.x && prevPos.y === nextPos.y);

  return (
    prev.rootBlock === next.rootBlock &&
    prev.blocks === next.blocks &&
    prev.isDragTarget === next.isDragTarget &&
    prev.replaceTargetId === next.replaceTargetId &&
    samePos &&
    prev.onMove === next.onMove &&
    prev.onMoveEnd === next.onMoveEnd &&
    prev.onInputChange === next.onInputChange &&
    prev.onDetach === next.onDetach &&
    prev.onDelete === next.onDelete
  );
});

/* ─────────── Palette Block ─────────── */

function PaletteBlock({
  def,
  onDragStart,
  isFavorite,
  onToggleFavorite,
}: {
  def: BlockDef;
  onDragStart: (e: React.DragEvent, def: BlockDef) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (type: string) => void;
}) {
  return (
    <div
      className="group relative hover:translate-x-0.5 transition-all duration-100"
      title={def.hint}
    >
      <div
        draggable
        onDragStart={(e) => onDragStart(e, def)}
        className="cursor-grab active:cursor-grabbing hover:brightness-110"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
      >
        {renderBlockBody(def, <BlockLabel def={def} isPalette />)}
      </div>
      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(def.type);
          }}
          className={`absolute right-2 top-2 z-10 h-6 w-6 rounded-full border text-[11px] transition-all ${
            isFavorite
              ? "border-white/30 bg-black/30 text-[#FFD166]"
              : "border-black/10 dark:border-white/10 bg-black/10 dark:bg-black/20 text-gray-400 dark:text-white/45 opacity-0 group-hover:opacity-100"
          }`}
          aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
        >
          ★
        </button>
      )}
    </div>
  );
}

/* ─────────── Search bar for block palette ─────────── */

function PaletteSearch({
  search,
  onSearch,
  dk,
}: {
  search: string;
  onSearch: (v: string) => void;
  dk?: boolean;
}) {
  return (
    <div className="px-2.5 pb-2 pt-2.5">
      <div className="relative">
        <svg className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${dk ? "text-white/30" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search blocks…"
          className={`w-full pl-8 pr-3 py-2 border rounded-xl text-[12.5px] focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all ${
            dk
              ? "bg-white/[0.07] border-white/[0.10] text-white placeholder-white/25 focus:border-violet-500/50"
              : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-violet-400"
          }`}
        />
        {search && (
          <button
            onClick={() => onSearch("")}
            className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold cursor-pointer ${dk ? "bg-white/20 text-white/60 hover:bg-white/30" : "bg-gray-200 text-gray-500 hover:bg-gray-300"}`}
          >×</button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN BLOCK EDITOR COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function BlockEditor({
  blocks,
  onChange,
  onResetProject,
  disabledCategories = [],
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<BlockCategory>("game");
  const [paletteDragDef, setPaletteDragDef] = useState<BlockDef | null>(null);
  const [snapTarget, setSnapTarget] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [favoriteTypes, setFavoriteTypes] = useState<string[]>(DEFAULT_GAME_FAVORITES);
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});
  const dragPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setFavoriteTypes(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      // Ignore corrupted local storage and keep defaults.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteTypes));
    } catch {
      // Ignore storage errors.
    }
  }, [favoriteTypes]);

  /* Which blocks show in the palette */
  const categoryBlocks = paletteSearch
    ? BLOCK_DEFS.filter(
        (b) =>
          !disabledCategories.includes(b.category) &&
          (b.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
            b.type.toLowerCase().includes(paletteSearch.toLowerCase()) ||
            b.hint?.toLowerCase().includes(paletteSearch.toLowerCase()))
      )
    : BLOCK_DEFS.filter(
        (b) =>
          b.category === selectedCategory &&
          !disabledCategories.includes(b.category)
      );

  const toggleFavorite = useCallback((type: string) => {
    setFavoriteTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [type, ...current].slice(0, 12)
    );
  }, []);

  const addStarterPack = useCallback(
    (pack: StarterPack) => {
      const profileByPack: Partial<Record<StarterPack["id"], { step: number; run: number; jump: number }>> = {
        platformer: { step: 14, run: 28, jump: 22 },
        fps: { step: 10, run: 24, jump: 14 },
        rpg: { step: 11, run: 20, jump: 16 },
        survival: { step: 12, run: 24, jump: 16 },
        racing: { step: 16, run: 34, jump: 12 },
        demo: { step: 12, run: 22, jump: 15 },
        bossfight: { step: 12, run: 24, jump: 16 },
        questhunt: { step: 11, run: 20, jump: 15 },
        towerdefense: { step: 10, run: 20, jump: 14 },
        water: { step: 13, run: 26, jump: 18 },
      };

      const baseStacks: StarterPackStack[] = pack.stacks?.length
        ? pack.stacks
        : (pack.blocks.length ? [{ blocks: pack.blocks }] : []);

      const profile = profileByPack[pack.id];
      const stackSpecs = profile
        ? [...baseStacks, ...starterMovementStacks(profile.step, profile.run, profile.jump)]
        : baseStacks;

      if (stackSpecs.length === 0) return;

      const rootY = getRoots(blocks).reduce((maxY, block) => Math.max(maxY, block.y ?? 20), 20);
      const startY = blocks.length ? rootY + 120 : 26;
      const newBlocks: Block[] = [];

      stackSpecs.forEach((stack, stackIndex) => {
        const defs = stack.blocks
          .map((spec) => {
            const def = getBlockDef(spec.type);
            return def ? { def, spec } : null;
          })
          .filter((item): item is { def: BlockDef; spec: StarterPackBlock } => Boolean(item));

        if (defs.length === 0) return;

        let parentId: string | undefined;
        const x = 26 + ((stackIndex % 3) * 200);
        const y = startY + Math.floor(stackIndex / 3) * 120;

        defs.forEach(({ def, spec }, index) => {
          const block = makeBlockFromDef(def, spec.inputs);
          if (index === 0) {
            block.x = x;
            block.y = y;
          } else if (parentId) {
            block.parent = parentId;
          }
          parentId = block.id;
          newBlocks.push(block);
        });
      });

      if (newBlocks.length === 0) return;
      onChange([...blocks, ...newBlocks]);
    },
    [blocks, onChange]
  );

  const favoriteBlocks = BLOCK_DEFS.filter((def) => favoriteTypes.includes(def.type));
  const gameBlocks = BLOCK_DEFS.filter((def) => def.category === "game");
  const gameSections = GAME_GROUP_ORDER.map((group) => ({
    title: group,
    blocks: gameBlocks.filter((def) => def.group === group),
  })).filter((section) => section.blocks.length > 0);

  const paletteSections = paletteSearch
    ? [{ title: "Search Results", blocks: categoryBlocks }]
    : selectedCategory === "game"
      ? [
          { title: "Favorites", blocks: favoriteBlocks.filter((def) => def.category === "game") },
          ...gameSections,
        ].filter((section) => section.blocks.length > 0)
      : [{ title: "", blocks: categoryBlocks }];

  /* Root blocks (no parent or orphaned) */
  const roots = getRoots(blocks);

  /* ── Palette -> Workspace drop ── */
  const handlePaletteDragStart = useCallback(
    (e: React.DragEvent, def: BlockDef) => {
      setPaletteDragDef(def);
      e.dataTransfer.setData("text/plain", def.type);
      e.dataTransfer.effectAllowed = "copy";
      // Ghost image
      const ghost = document.createElement("div");
      ghost.style.cssText =
        "position:absolute;top:-1000px;left:-1000px;padding:6px 12px;border-radius:6px;color:#fff;font-size:12px;font-weight:700;white-space:nowrap;";
      ghost.style.backgroundColor = def.color;
      ghost.textContent = def.label.replace(/\([A-Z_]+\)/g, "___");
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 30, 18);
      requestAnimationFrame(() => ghost.remove());
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";

      /* While dragging over workspace, highlight nearest snap or replace target */
      if (paletteDragDef && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left + workspaceRef.current.scrollLeft;
        const my = e.clientY - rect.top + workspaceRef.current.scrollTop;

        /* Check for replace target – cursor directly over a block */
        let replaceCandidate: { id: string; dist: number } | null = null;
        for (const b of blocks) {
          const def = getBlockDef(b.type);
          if (def?.shape === "reporter" || def?.shape === "boolean") continue;
          const pos = getBlockAbsolutePos(b.id, blocks);
          const bw = 180;
          if (mx >= pos.x && mx <= pos.x + bw && my >= pos.y && my <= pos.y + BLOCK_H) {
            const cx = pos.x + bw / 2;
            const cy = pos.y + BLOCK_H / 2;
            const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
            if (!replaceCandidate || dist < replaceCandidate.dist) {
              replaceCandidate = { id: b.id, dist };
            }
          }
        }

        if (replaceCandidate) {
          setReplaceTarget(replaceCandidate.id);
          setSnapTarget(null);
          return;
        }
        setReplaceTarget(null);

        /* Snap to bottom of nearest stack */
        let best: { id: string; dist: number } | null = null;
        for (const b of blocks) {
          const def = getBlockDef(b.type);
          if (def?.shape === "reporter" || def?.shape === "boolean") continue;
          const bx = b.parent ? 0 : b.x || 0;
          const by = b.parent ? 0 : b.y || 0;
          if (b.parent) continue;
          const sh = stackHeight(b.id, blocks);
          const snapX = bx;
          const snapY = by + sh;
          const dist = Math.sqrt((mx - snapX) ** 2 + (my - snapY) ** 2);
          if (dist < SNAP_RADIUS && (!best || dist < best.dist)) {
            best = { id: b.id, dist };
          }
        }
        setSnapTarget(best?.id ?? null);
      }
    },
    [paletteDragDef, blocks]
  );

  const handleWorkspaceDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!paletteDragDef) return;
      const rect = workspaceRef.current?.getBoundingClientRect();
      const scrollL = workspaceRef.current?.scrollLeft || 0;
      const scrollT = workspaceRef.current?.scrollTop || 0;
      const x = e.clientX - (rect?.left || 0) + scrollL;
      const y = e.clientY - (rect?.top || 0) + scrollT;

      const newBlock: Block = {
        id: uid(),
        type: paletteDragDef.type,
        category: paletteDragDef.category,
        inputs: Object.fromEntries(
          (paletteDragDef.inputs || []).map((inp) => [
            inp.name,
            { type: "value" as const, value: inp.default },
          ])
        ),
        x,
        y,
      };

      /* Replace an existing block */
      if (replaceTarget) {
        const target = blocks.find((b) => b.id === replaceTarget);
        if (target) {
          newBlock.parent = target.parent;
          newBlock.x = target.x;
          newBlock.y = target.y;
          // Reparent children of the replaced block to the new block
          const updated = blocks
            .filter((b) => b.id !== replaceTarget)
            .map((b) => (b.parent === replaceTarget ? { ...b, parent: newBlock.id } : b));
          onChange([...updated, newBlock]);
          setPaletteDragDef(null);
          setSnapTarget(null);
          setReplaceTarget(null);
          return;
        }
      }

      /* Try to snap to bottom of nearest stack */
      if (snapTarget) {
        // Find the deepest last child of the snap target stack
        let tail = snapTarget;
        while (true) {
          const kids = getChildren(tail, blocks);
          if (kids.length === 0) break;
          tail = kids[kids.length - 1].id;
        }
        newBlock.parent = tail;
        delete (newBlock as any).x;
        delete (newBlock as any).y;
      }

      onChange([...blocks, newBlock]);
      setPaletteDragDef(null);
      setSnapTarget(null);
      setReplaceTarget(null);
    },
    [paletteDragDef, blocks, onChange, snapTarget, replaceTarget]
  );

  const handleDragLeave = useCallback(() => {
    setSnapTarget(null);
    setReplaceTarget(null);
  }, []);

  /* ── Block movement ── */
  const handleBlockMove = useCallback(
    (id: string, x: number, y: number) => {
      dragPosRef.current = { ...dragPosRef.current, [id]: { x, y } };
      setDragPositions((prev) => {
        const existing = prev[id];
        if (existing && existing.x === x && existing.y === y) return prev;
        return { ...prev, [id]: { x, y } };
      });

      /* Check for replace target – cursor over a block */
      let replaceCandidate: { id: string; dist: number } | null = null;
      for (const b of blocks) {
        if (b.id === id) continue;
        const def = getBlockDef(b.type);
        if (def?.shape === "reporter" || def?.shape === "boolean") continue;
        const pos = getBlockAbsolutePos(b.id, blocks);
        const bw = 180;
        if (x >= pos.x && x <= pos.x + bw && y >= pos.y && y <= pos.y + BLOCK_H) {
          const cx = pos.x + bw / 2;
          const cy = pos.y + BLOCK_H / 2;
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (!replaceCandidate || dist < replaceCandidate.dist) {
            replaceCandidate = { id: b.id, dist };
          }
        }
      }

      if (replaceCandidate) {
        setReplaceTarget(replaceCandidate.id);
        setSnapTarget(null);
        return;
      }
      setReplaceTarget(null);

      /* Live snap detection while dragging */
      let best: { id: string; dist: number } | null = null;
      for (const b of blocks) {
        if (b.id === id) continue;
        const def = getBlockDef(b.type);
        if (def?.shape === "reporter" || def?.shape === "boolean") continue;
        if (b.parent) continue;
        const sh = stackHeight(b.id, blocks);
        const dragged = dragPosRef.current[b.id];
        const bx = dragged?.x ?? b.x ?? 0;
        const by = (b.y || 0) + sh;
        const dist = Math.sqrt((x - bx) ** 2 + (y - by) ** 2);
        if (dist < SNAP_RADIUS && (!best || dist < best.dist)) {
          best = { id: b.id, dist };
        }
      }
      setSnapTarget(best?.id ?? null);
    },
    [blocks]
  );

  /* ── Snap on mouse up (handled via move + effect) ── */
  /* This is triggered when a stack is dropped near another stack */
  const handleBlockMoveEnd = useCallback(
    (id: string) => {
      const moved = dragPosRef.current[id];
      const nextBlocks = blocks.map((b) => {
        if (b.id !== id) return b;
        const { parent, ...rest } = b;
        if (!moved) return b;
        return { ...rest, x: moved.x, y: moved.y };
      });

      /* Replace target takes priority */
      if (replaceTarget) {
        const target = nextBlocks.find((b) => b.id === replaceTarget);
        const dragged = nextBlocks.find((b) => b.id === id);
        if (target && dragged) {
          // Dragged block takes the replaced block's position & parent
          const updated = nextBlocks
            .filter((b) => b.id !== replaceTarget)
            .map((b) => {
              if (b.id === id) {
                return { ...b, parent: target.parent, x: target.x, y: target.y };
              }
              // Reparent children of the replaced block to the dragged block
              if (b.parent === replaceTarget) {
                return { ...b, parent: id };
              }
              return b;
            });
          onChange(updated);
        }
      } else if (snapTarget) {
        let tail = snapTarget;
        while (true) {
          const kids = getChildren(tail, nextBlocks);
          if (kids.length === 0) break;
          tail = kids[kids.length - 1].id;
        }
        onChange(
          nextBlocks.map((b) => {
            if (b.id === id) {
              const { x, y, ...rest } = b;
              return { ...rest, parent: tail };
            }
            return b;
          })
        );
      } else if (moved) {
        onChange(nextBlocks);
      }

      setDragPositions((prev) => {
        if (!(id in prev)) return prev;
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
      delete dragPosRef.current[id];
      setSnapTarget(null);
      setReplaceTarget(null);
    },
    [snapTarget, replaceTarget, blocks, onChange]
  );

  /* Detach a block from its parent (double-click) */
  const handleDetach = useCallback(
    (blockId: string) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block?.parent) return;
      onChange(
        blocks.map((b) =>
          b.id === blockId
            ? { ...b, parent: undefined, x: (b.x || 100) + 40, y: (b.y || 100) + 30 }
            : b
        )
      );
    },
    [blocks, onChange]
  );

  const handleInputChange = useCallback(
    (blockId: string, inputName: string, value: any) => {
      onChange(
        blocks.map((b) =>
          b.id === blockId
            ? {
                ...b,
                inputs: {
                  ...b.inputs,
                  [inputName]: { type: "value", value },
                },
              }
            : b
        )
      );
    },
    [blocks, onChange]
  );

  const handleDeleteBlock = useCallback(
    (id: string) => {
      // Delete block and all descendants
      const toDelete = new Set<string>();
      const collectChildren = (bid: string) => {
        toDelete.add(bid);
        for (const b of blocks) {
          if (b.parent === bid) collectChildren(b.id);
        }
      };
      collectChildren(id);
      onChange(blocks.filter((b) => !toDelete.has(b.id)));
    },
    [blocks, onChange]
  );

  const enabledCategories = CATEGORIES.filter(
    (c) => !disabledCategories.includes(c.id)
  );

  const { theme } = useTheme();
  const dk = theme === "dark";

  return (
    <div className={`flex h-full min-h-0 rounded-xl overflow-hidden border ${dk ? "border-white/[0.06] bg-[#0f1028]" : "border-gray-200 bg-white"}`}>
      {/* ── Category Sidebar ── */}
      <div className={`w-[76px] flex flex-col gap-1 py-2 px-1.5 overflow-y-auto overflow-x-hidden border-r scrollbar-none ${dk ? "bg-[#13143a] border-white/[0.06]" : "bg-gray-50 border-gray-200"}`}>
        {enabledCategories.map((cat) => {
          const isSelected = selectedCategory === cat.id && !paletteSearch;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                setPaletteSearch("");
              }}
              title={cat.label}
              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-[9.5px] font-bold transition-all duration-150 cursor-pointer ${
                isSelected
                  ? "text-white shadow-lg"
                  : dk
                    ? "text-white/35 hover:text-white/65 hover:bg-white/[0.05]"
                    : "text-gray-500 hover:text-gray-700 hover:bg-white"
              }`}
              style={{
                backgroundColor: isSelected ? cat.color : undefined,
                boxShadow: isSelected ? `0 3px 12px ${cat.color}55` : undefined,
              }}
            >
              <span className="text-[18px] leading-none">{cat.icon}</span>
              <span className="leading-tight tracking-tight text-center" style={{ fontSize: "8.5px" }}>
                {cat.label.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Block Palette ── */}
      <div className={`w-[244px] border-r flex flex-col overflow-hidden min-h-0 ${dk ? "bg-[#141432] border-white/[0.06]" : "bg-gray-50 border-gray-200"}`}>
        {/* Palette header */}
        <div className={`px-3 pt-2.5 pb-1 border-b ${dk ? "border-white/[0.05]" : "border-gray-100"}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base leading-none">{enabledCategories.find(c => c.id === selectedCategory)?.icon ?? "📦"}</span>
            <span className={`text-xs font-bold truncate ${dk ? "text-white/70" : "text-gray-700"}`}>
              {paletteSearch ? "Search Results" : enabledCategories.find(c => c.id === selectedCategory)?.label ?? "Blocks"}
            </span>
          </div>
          <PaletteSearch search={paletteSearch} onSearch={setPaletteSearch} dk={dk} />
        </div>
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-3 pt-2 space-y-2 scrollbar-thin"
          style={{ touchAction: "pan-y" }}
        >
          {!paletteSearch && selectedCategory === "game" && (
            <div className={`rounded-xl border p-2.5 space-y-2.5 ${dk ? "border-white/[0.08] bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
              <div>
                <p className={`text-[10.5px] font-extrabold uppercase tracking-widest ${dk ? "text-white/50" : "text-gray-500"}`}>
                  🚀 Starter Packs
                </p>
                <p className={`text-[10.5px] mt-0.5 leading-relaxed ${dk ? "text-white/30" : "text-gray-400"}`}>
                  Instantly add connected block stacks for any game type.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {GAME_STARTER_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => addStarterPack(pack)}
                    className={`rounded-xl px-2.5 py-2 text-left transition-all duration-150 cursor-pointer active:scale-95 hover:brightness-110 ${dk ? "bg-black/25 hover:bg-black/35" : "bg-gray-50 hover:bg-gray-100"}`}
                    style={{
                      border: `1.5px solid ${pack.accent}40`,
                      boxShadow: `0 0 0 0px ${pack.accent}20, inset 0 1px 0 ${pack.accent}15`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                      <span className={`text-[11.5px] font-bold ${dk ? "text-white" : "text-gray-900"}`}>{pack.label}</span>
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: pack.accent }} />
                    </div>
                    <p className={`text-[9.5px] leading-snug ${dk ? "text-white/30" : "text-gray-400"}`}>{pack.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {paletteSections.map((section) => (
            <div key={section.title || "default"} className="space-y-1.5">
              {section.title && (
                <div className={`sticky top-0 z-10 -mx-2 px-2.5 py-1.5 backdrop-blur-sm ${dk ? "bg-[#141432]/95" : "bg-gray-50/95"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[10px] font-extrabold uppercase tracking-widest ${dk ? "text-white/40" : "text-gray-500"}`}>
                      {section.title}
                    </p>
                    {section.title === "Favorites" && (
                      <span className={`text-[9px] ${dk ? "text-white/20" : "text-gray-400"}`}>★ to pin</span>
                    )}
                  </div>
                </div>
              )}
              {section.blocks.map((def) => (
                <PaletteBlock
                  key={def.type}
                  def={def}
                  onDragStart={handlePaletteDragStart}
                  isFavorite={favoriteTypes.includes(def.type)}
                  onToggleFavorite={selectedCategory === "game" || def.category === "game" ? toggleFavorite : undefined}
                />
              ))}
            </div>
          ))}
          {categoryBlocks.length === 0 && (
            <div className={`text-center py-8 ${dk ? "text-white/15" : "text-gray-400"}`}>
              <p className="text-2xl mb-1">🔍</p>
              <p className="text-xs">{paletteSearch ? "No matching blocks" : "No blocks"}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Workspace ── */}
      <div
        ref={workspaceRef}
        className="flex-1 relative overflow-auto"
        style={{
          backgroundColor: dk ? "#0f1028" : "#f5f6fb",
          backgroundImage: dk
            ? "radial-gradient(circle, rgba(120,100,220,0.07) 1px, transparent 1px)"
            : "radial-gradient(circle, rgba(0,0,30,0.055) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
        onDrop={handleWorkspaceDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Workspace toolbar */}
        <div className={`sticky top-0 right-0 z-50 flex items-center justify-end gap-2 px-3 py-2 pointer-events-none`}>
          {onResetProject && (
            <button
              type="button"
              onClick={onResetProject}
              className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/15 hover:bg-red-500/25 px-3 py-1.5 text-[11px] font-semibold text-red-300 transition-all backdrop-blur-sm cursor-pointer"
            >
              ↺ Reset Project
            </button>
          )}
          {blocks.length > 0 && (
            <div className={`pointer-events-none text-[10px] px-2.5 py-1 rounded-lg backdrop-blur-sm ${dk ? "bg-black/30 text-white/20" : "bg-white/70 text-gray-400"}`}>
              {roots.length} stack{roots.length !== 1 ? "s" : ""} · {blocks.length} block{blocks.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Snap indicator */}
        {snapTarget && (() => {
          const target = blocks.find((b) => b.id === snapTarget);
          if (!target || target.parent) return null;
          const sh = stackHeight(target.id, blocks);
          return (
            <div
              className="absolute z-40 pointer-events-none snap-glow"
              style={{
                left: (target.x || 20) - 4,
                top: (target.y || 20) + sh - 5,
                width: 168,
                height: 10,
                background: "linear-gradient(90deg, #facc15, #f59e0b)",
                borderRadius: 6,
                boxShadow: "0 0 20px rgba(250,204,21,0.55)",
              }}
            />
          );
        })()}

        {roots.map((root) => (
          <MemoDraggableStack
            key={root.id}
            rootBlock={root}
            blocks={blocks}
            positionOverride={dragPositions[root.id]}
            onMove={handleBlockMove}
            onMoveEnd={handleBlockMoveEnd}
            onInputChange={handleInputChange}
            onDetach={handleDetach}
            onDelete={handleDeleteBlock}
            isDragTarget={snapTarget === root.id}
            replaceTargetId={replaceTarget}
            workspaceRef={workspaceRef}
          />
        ))}

        {blocks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none select-none">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shadow-inner ${dk ? "bg-white/[0.04] border border-white/[0.06]" : "bg-white border border-gray-200 shadow-sm"}`}>
              🧩
            </div>
            <div className="text-center">
              <p className={`text-sm font-semibold mb-1 ${dk ? "text-white/30" : "text-gray-500"}`}>
                Drag blocks here to start coding
              </p>
              <p className={`text-xs ${dk ? "text-white/15" : "text-gray-400"}`}>
                Blocks snap together automatically • Double-click to detach
              </p>
            </div>
            <div className={`flex items-center gap-6 text-center ${dk ? "text-white/15" : "text-gray-300"}`}>
              {[
                { icon: "🎮", text: "Pick a starter pack" },
                { icon: "⬅️", text: "Drag from palette" },
                { icon: "🔗", text: "Snap to connect" },
              ].map((tip) => (
                <div key={tip.text} className="flex flex-col items-center gap-1">
                  <span className="text-xl">{tip.icon}</span>
                  <span className="text-[10px]">{tip.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
