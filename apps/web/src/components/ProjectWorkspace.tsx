import React, { useState, useCallback, useEffect, useRef } from "react";
import type { Sprite, Asset, StageSettings, ProjectMode, Block, Shape3D } from "@scratch/shared";
import BlockEditor from "./BlockEditor.tsx";
import JSView from "./JSView.tsx";
import Stage2D from "./Stage2D.tsx";
import Stage3D from "./Stage3D.tsx";
import UnityStage from "./UnityStage.tsx";
import SpritePanel from "./SpritePanel.tsx";
import AssetManager from "./AssetManager.tsx";
import Timeline from "./Timeline.tsx";
import AIAssistant from "./AIAssistant.tsx";
import AIBlockCreator from "./AIBlockCreator.tsx";
import CostumeEditor from "./CostumeEditor.tsx";
import SpriteLibrary from "./SpriteLibrary.tsx";
import ShapeEditor3D from "./ShapeEditor3D.tsx";
import LessonsBrowser from "./LessonsBrowser.tsx";
import GameSystemsPanel from "./GameSystemsPanel.tsx";
import { api } from "../lib/api.ts";
import { getSocket } from "../lib/ws.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { createDefaultGameData } from "../lib/game/engine.ts";
import type { EnvironmentPreset, GameTemplate, UnityTemplate } from "../lib/game/templates.ts";
import type { GameProjectData } from "../lib/game/types.ts";
import { getBlockDef } from "../lib/blockDefinitions.ts";
import { createRuntime, startGreenFlag, stepRuntime, stopRuntime } from "../lib/runtime.ts";
import type { RuntimeEngine } from "../lib/runtime.ts";

interface Props {
  projectId?: string;
  aiEnabled?: boolean;
}

const DEFAULT_STAGE: StageSettings = {
  width: 480,
  height: 360,
  backgroundColor: "#0a0a1a",
};

// Generate the Nova animated character as a data-URL
function generateNovaAnimation(size = 160): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;

  // Aura glow ring
  ctx.save();
  ctx.shadowColor = "#6d5efc";
  ctx.shadowBlur = size * 0.22;
  ctx.strokeStyle = "rgba(255, 110, 199, 0.7)";
  ctx.lineWidth = Math.max(2, size * 0.04);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.34, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(131, 168, 255, 0.55)";
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.27, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Suit body gradient
  const suit = ctx.createRadialGradient(cx, cy - size * 0.16, size * 0.06, cx, cy, size * 0.36);
  suit.addColorStop(0, "#b8c0ff");
  suit.addColorStop(0.55, "#6f7dff");
  suit.addColorStop(1, "#4a55d4");
  ctx.fillStyle = suit;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.31, 0, Math.PI * 2);
  ctx.fill();

  // Helmet visor
  const visor = ctx.createLinearGradient(cx - size * 0.2, cy - size * 0.24, cx + size * 0.2, cy);
  visor.addColorStop(0, "rgba(243, 247, 255, 0.95)");
  visor.addColorStop(1, "rgba(205, 221, 255, 0.75)");
  ctx.fillStyle = visor;
  ctx.beginPath();
  ctx.ellipse(cx, cy - size * 0.08, size * 0.16, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#5b49ff";
  ctx.beginPath();
  ctx.arc(cx - size * 0.055, cy - size * 0.09, size * 0.016, 0, Math.PI * 2);
  ctx.arc(cx + size * 0.055, cy - size * 0.09, size * 0.016, 0, Math.PI * 2);
  ctx.fill();

  // Chest core
  const core = ctx.createRadialGradient(cx, cy + size * 0.1, size * 0.015, cx, cy + size * 0.1, size * 0.08);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(1, "#9ac0ff");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.1, size * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Simple shoulder fins
  ctx.fillStyle = "rgba(176, 194, 255, 0.92)";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.11, cy - size * 0.23);
  ctx.lineTo(cx - size * 0.25, cy - size * 0.1);
  ctx.lineTo(cx - size * 0.07, cy - size * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.11, cy - size * 0.23);
  ctx.lineTo(cx + size * 0.25, cy - size * 0.1);
  ctx.lineTo(cx + size * 0.07, cy - size * 0.08);
  ctx.closePath();
  ctx.fill();

  // Top direction marker
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.4);
  ctx.lineTo(cx - size * 0.06, cy - size * 0.29);
  ctx.lineTo(cx + size * 0.06, cy - size * 0.29);
  ctx.closePath();
  ctx.fill();

  return canvas.toDataURL("image/png");
}

function makeDefaultNova(): Sprite {
  const url = generateNovaAnimation(160);
  return {
    id: "s_" + Math.random().toString(36).slice(2, 8),
    name: "Nova",
    x: 0, y: 0, rotation: 0, scale: 2.3, costumeIndex: 0,
    costumes: [{ id: "costume_nova_1", name: "Nova-1", url, type: "image" }],
    sounds: [], blocks: [], visible: true,
  };
}

function makeSprite(name: string): Sprite {
  return {
    id: "s_" + Math.random().toString(36).slice(2, 8),
    name,
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    costumeIndex: 0,
    costumes: [],
    sounds: [],
    blocks: [],
    visible: true,
  };
}

function isEnvironmentSprite(sprite: Sprite): boolean {
  return sprite.id.startsWith("env_") || sprite.name.toLowerCase().startsWith("environment ");
}

function getPlayableSpriteId(sprites: Sprite[], selectedSpriteId: string): string | undefined {
  const selected = sprites.find((s) => s.id === selectedSpriteId);
  if (selected && !isEnvironmentSprite(selected)) return selected.id;
  return sprites.find((s) => !isEnvironmentSprite(s))?.id;
}

type TemplateBlockSpec = { type: string; inputs?: Record<string, string | number | boolean> };
type TemplateStackSpec = { blocks: TemplateBlockSpec[] };

function movementStacks(step = 12, runStep = 22, jumpStep = 18): TemplateStackSpec[] {
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

function makeTemplateSpecs(template: GameTemplate): TemplateStackSpec[] {
  if (template === "platformer") {
    return [
      {
        blocks: [
          { type: "event_whenflagclicked" },
          { type: "game_setstate", inputs: { STATE: "playing" } },
          { type: "game_startlevel", inputs: { LEVEL: 1 } },
          { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 100 } },
          { type: "game_setplayerstat", inputs: { STAT: "score", VALUE: 0 } },
          { type: "game_setworldgravity", inputs: { GRAVITY: 0.8 } },
          { type: "game_spawnenemy", inputs: { TYPE: "slime", X: 150, Y: -40 } },
          { type: "game_setenemyai", inputs: { STYLE: "chase" } },
          { type: "game_setobjective", inputs: { TEXT: "Reach the exit and avoid enemy hits" } },
          { type: "game_showhud", inputs: { TEXT: "Move: Arrows or WASD | Run: Shift/Ctrl" } },
        ],
      },
      ...movementStacks(14, 28, 22),
    ];
  }

  if (template === "fps") {
    return [
      {
        blocks: [
          { type: "event_whenflagclicked" },
          { type: "game_setstate", inputs: { STATE: "combat" } },
          { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 150 } },
          { type: "game_setplayerstat", inputs: { STAT: "score", VALUE: 0 } },
          { type: "game_spawnenemy", inputs: { TYPE: "drone", X: 120, Y: 40 } },
          { type: "game_spawnenemy", inputs: { TYPE: "drone", X: -140, Y: -60 } },
          { type: "game_setenemyai", inputs: { STYLE: "chase" } },
          { type: "game_shakecamera", inputs: { POWER: 10, SECS: 0.25 } },
          { type: "game_musicmode", inputs: { MODE: "battle" } },
          { type: "game_showhud", inputs: { TEXT: "Move: Arrows or WASD | Run: Shift/Ctrl" } },
        ],
      },
      ...movementStacks(10, 24, 14),
    ];
  }

  if (template === "survival") {
    return [
      {
        blocks: [
          { type: "event_whenflagclicked" },
          { type: "game_setstate", inputs: { STATE: "playing" } },
          { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 120 } },
          { type: "game_setplayerstat", inputs: { STAT: "score", VALUE: 0 } },
          { type: "game_additem", inputs: { ITEM: "berries" } },
          { type: "game_spawnenemy", inputs: { TYPE: "zombie", X: 140, Y: -40 } },
          { type: "game_spawnenemy", inputs: { TYPE: "zombie", X: -120, Y: 60 } },
          { type: "game_setenemyai", inputs: { STYLE: "patrol" } },
          { type: "game_setobjective", inputs: { TEXT: "Survive, gather food, and hold your ground" } },
          { type: "game_showhud", inputs: { TEXT: "Move: Arrows or WASD | Run: Shift/Ctrl" } },
        ],
      },
      ...movementStacks(11, 24, 16),
    ];
  }

  if (template === "racing") {
    return [
      {
        blocks: [
          { type: "event_whenflagclicked" },
          { type: "game_setstate", inputs: { STATE: "playing" } },
          { type: "game_startlevel", inputs: { LEVEL: 1 } },
          { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 100 } },
          { type: "game_setplayerstat", inputs: { STAT: "score", VALUE: 0 } },
          { type: "game_setobjective", inputs: { TEXT: "Race through checkpoints as fast as possible" } },
          { type: "game_showhud", inputs: { TEXT: "Accelerate: Right/D | Brake: Left/A | Boost: Shift" } },
          { type: "game_musicmode", inputs: { MODE: "battle" } },
        ],
      },
      ...movementStacks(16, 34, 12),
    ];
  }

  if (template === "water") {
    return [
      {
        blocks: [
          { type: "event_whenflagclicked" },
          { type: "game_setstate", inputs: { STATE: "playing" } },
          { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 130 } },
          { type: "game_setplayerstat", inputs: { STAT: "score", VALUE: 0 } },
          { type: "game_spawnenemy", inputs: { TYPE: "shark", X: 140, Y: 40 } },
          { type: "game_spawnenemy", inputs: { TYPE: "eel", X: -130, Y: -60 } },
          { type: "game_setenemyai", inputs: { STYLE: "chase" } },
          { type: "game_setobjective", inputs: { TEXT: "Collect pearls and dodge sea predators" } },
          { type: "game_showhud", inputs: { TEXT: "Swim: Arrows/WASD | Dash: Shift/Ctrl | Rise: Space" } },
          { type: "game_musicmode", inputs: { MODE: "battle" } },
        ],
      },
      ...movementStacks(13, 26, 18),
    ];
  }

  return [
    {
      blocks: [
        { type: "event_whenflagclicked" },
        { type: "game_setstate", inputs: { STATE: "exploring" } },
        { type: "game_setplayerstat", inputs: { STAT: "health", VALUE: 90 } },
        { type: "game_additem", inputs: { ITEM: "wooden sword" } },
        { type: "game_setquest", inputs: { QUEST: "Speak to the village elder", STATUS: "active" } },
        { type: "game_spawnenemy", inputs: { TYPE: "zombie", X: -140, Y: 80 } },
        { type: "game_setobjective", inputs: { TEXT: "Defeat the monster and find the elder" } },
        { type: "game_showhud", inputs: { TEXT: "Move: Arrows or WASD | Run: Shift/Ctrl" } },
        { type: "game_save", inputs: { SLOT: "rpg-slot" } },
      ],
    },
    ...movementStacks(12, 24, 18),
  ];
}

function makeUnityTemplateSpecs(template: UnityTemplate): TemplateStackSpec[] {
  if (template === "unity_fps") {
    return [
      { blocks: [
        { type: "event_whenflagclicked" },
        { type: "unity_setgamemode", inputs: { MODE: "fps" } },
        { type: "unity_setlives", inputs: { VALUE: 3 } },
        { type: "unity_sethealth", inputs: { VALUE: 100, MAX: 100 } },
        { type: "unity_setscore", inputs: { VALUE: 0 } },
        { type: "unity_starttimer", inputs: { SECONDS: 60 } },
        { type: "unity_setbg", inputs: { R: 0.02, G: 0.05, B: 0.15 } },
        { type: "unity_showtext", inputs: { TEXT: "FPS Microgame\nClick to Shoot!", DURATION: 2 } },
        { type: "unity_playsound", inputs: { TYPE: "start" } },
      ]},
      { blocks: [
        { type: "event_whenflagclicked" },
        { type: "unity_addenemy", inputs: { TYPE: "chaser", X: 8, Z: 8, SPEED: 2.5 } },
        { type: "unity_addenemy", inputs: { TYPE: "chaser", X: -8, Z: 6, SPEED: 2 } },
        { type: "unity_addenemy", inputs: { TYPE: "spinner", X: 5, Z: -8, SPEED: 3 } },
        { type: "unity_addenemy", inputs: { TYPE: "ghost", X: -6, Z: -10, SPEED: 1.5 } },
        { type: "unity_addcollectible", inputs: { TYPE: "heart", X: 0, Y: 1, Z: 5 } },
        { type: "unity_addcollectible", inputs: { TYPE: "powerup", X: 5, Y: 1, Z: 0 } },
      ]},
    ];
  }
  if (template === "unity_platformer") {
    return [
      { blocks: [
        { type: "event_whenflagclicked" },
        { type: "unity_setgamemode", inputs: { MODE: "platformer" } },
        { type: "unity_setlives", inputs: { VALUE: 3 } },
        { type: "unity_setscore", inputs: { VALUE: 0 } },
        { type: "unity_setsky", inputs: { COLOR: "#0ea5e9" } },
        { type: "unity_showtext", inputs: { TEXT: "3D Platformer\nCollect all coins!", DURATION: 2 } },
        { type: "unity_playsound", inputs: { TYPE: "start" } },
      ]},
      { blocks: [
        { type: "event_whenflagclicked" },
        { type: "unity_addplatform", inputs: { X: 4, Y: 2, Z: 0, W: 4, D: 4 } },
        { type: "unity_addplatform", inputs: { X: 8, Y: 4, Z: 4, W: 4, D: 4 } },
        { type: "unity_addplatform", inputs: { X: 0, Y: 6, Z: 8, W: 5, D: 5 } },
        { type: "unity_addcollectible", inputs: { TYPE: "coin", X: 4, Y: 3, Z: 0 } },
        { type: "unity_addcollectible", inputs: { TYPE: "coin", X: 8, Y: 5, Z: 4 } },
        { type: "unity_addcollectible", inputs: { TYPE: "star", X: 0, Y: 7.5, Z: 8 } },
      ]},
    ];
  }
  if (template === "unity_collect") {
    return [
      { blocks: [
        { type: "event_whenflagclicked" },
        { type: "unity_setscore", inputs: { VALUE: 0 } },
        { type: "unity_setlives", inputs: { VALUE: 5 } },
        { type: "unity_starttimer", inputs: { SECONDS: 45 } },
        { type: "unity_setsky", inputs: { COLOR: "#1e003f" } },
        { type: "unity_showtext", inputs: { TEXT: "Collect-a-thon!\nGrab everything!", DURATION: 2 } },
        { type: "unity_playsound", inputs: { TYPE: "start" } },
      ]},
      { blocks: [
        { type: "event_whenflagclicked" },
        { type: "unity_addcollectible", inputs: { TYPE: "coin",    X: 3,  Y: 1, Z: 3  } },
        { type: "unity_addcollectible", inputs: { TYPE: "coin",    X: -3, Y: 1, Z: 3  } },
        { type: "unity_addcollectible", inputs: { TYPE: "gem",     X: 5,  Y: 1, Z: -5 } },
        { type: "unity_addcollectible", inputs: { TYPE: "star",    X: -5, Y: 1, Z: -5 } },
        { type: "unity_addcollectible", inputs: { TYPE: "diamond", X: 0,  Y: 1, Z: 7  } },
        { type: "unity_addcollectible", inputs: { TYPE: "coin",    X: 7,  Y: 1, Z: 0  } },
        { type: "unity_addcollectible", inputs: { TYPE: "coin",    X: -7, Y: 1, Z: 0  } },
        { type: "unity_addenemy", inputs: { TYPE: "patrol", X: 0, Z: 0, SPEED: 2.5 } },
      ]},
    ];
  }
  if (template === "unity_survival") {
    return [
      { blocks: [
        { type: "event_whenflagclicked" },
        { type: "unity_setlives", inputs: { VALUE: 1 } },
        { type: "unity_sethealth", inputs: { VALUE: 100, MAX: 100 } },
        { type: "unity_setscore", inputs: { VALUE: 0 } },
        { type: "unity_setbg", inputs: { R: 0.05, G: 0.1, B: 0.05 } },
        { type: "unity_showtext", inputs: { TEXT: "Survival Arena\nStay Alive!", DURATION: 2 } },
        { type: "unity_playsound", inputs: { TYPE: "start" } },
      ]},
      { blocks: [
        { type: "event_whenflagclicked" },
        { type: "unity_addenemy", inputs: { TYPE: "chaser",  X: 8,  Z: 0,  SPEED: 2   } },
        { type: "unity_addenemy", inputs: { TYPE: "chaser",  X: -8, Z: 0,  SPEED: 2   } },
        { type: "unity_addenemy", inputs: { TYPE: "spinner", X: 0,  Z: 8,  SPEED: 3   } },
        { type: "unity_addenemy", inputs: { TYPE: "ghost",   X: 0,  Z: -8, SPEED: 1.5 } },
        { type: "unity_addcollectible", inputs: { TYPE: "heart",  X: 5,  Y: 1, Z: 5  } },
        { type: "unity_addcollectible", inputs: { TYPE: "heart",  X: -5, Y: 1, Z: -5 } },
      ]},
    ];
  }
  // unity_arena
  return [
    { blocks: [
      { type: "event_whenflagclicked" },
      { type: "unity_setlives", inputs: { VALUE: 3 } },
      { type: "unity_sethealth", inputs: { VALUE: 120, MAX: 120 } },
      { type: "unity_setscore", inputs: { VALUE: 0 } },
      { type: "unity_setbg", inputs: { R: 0.2, G: 0.01, B: 0.01 } },
      { type: "unity_showtext", inputs: { TEXT: "Battle Arena!\nDefeat all enemies!", DURATION: 2 } },
      { type: "unity_playsound", inputs: { TYPE: "start" } },
    ]},
    { blocks: [
      { type: "event_whenflagclicked" },
      { type: "unity_addenemy", inputs: { TYPE: "chaser",  X: 8,  Z: 8,  SPEED: 3   } },
      { type: "unity_addenemy", inputs: { TYPE: "chaser",  X: -8, Z: 8,  SPEED: 3   } },
      { type: "unity_addenemy", inputs: { TYPE: "spinner", X: 8,  Z: -8, SPEED: 4   } },
      { type: "unity_addenemy", inputs: { TYPE: "spinner", X: -8, Z: -8, SPEED: 4   } },
      { type: "unity_addenemy", inputs: { TYPE: "ghost",   X: 0,  Z: 10, SPEED: 2   } },
      { type: "unity_addwall", inputs: { X: 12, Y: 2, Z: 0, W: 1, H: 4 } },
      { type: "unity_addwall", inputs: { X: -12, Y: 2, Z: 0, W: 1, H: 4 } },
    ]},
  ];
}

function makeEnvironmentCostume(preset: EnvironmentPreset): string {
  const themes: Record<EnvironmentPreset, { skyA: string; skyB: string; horizon: string; ground: string; deco: string; glow: string; sun: string; label: string }> = {
    dojo: { skyA: "#f9f1d8", skyB: "#e7c99f", horizon: "#d9a66f", ground: "#7f5539", deco: "#b08968", glow: "#ffe8b8", sun: "#ffd166", label: "Dojo" },
    forest: { skyA: "#b7ef8a", skyB: "#2f9e44", horizon: "#276749", ground: "#2d5a3a", deco: "#1f4332", glow: "#bbf7d0", sun: "#fef08a", label: "Forest" },
    desert: { skyA: "#f8c273", skyB: "#f18f5e", horizon: "#d97706", ground: "#a95d1f", deco: "#d08a49", glow: "#fde68a", sun: "#fffbeb", label: "Desert" },
    snow: { skyA: "#dff2ff", skyB: "#78b5ff", horizon: "#4d8bd9", ground: "#dce5ed", deco: "#b7c7d6", glow: "#f0f9ff", sun: "#ffffff", label: "Snow" },
    city: { skyA: "#0f172a", skyB: "#334155", horizon: "#1f2937", ground: "#0b1020", deco: "#4f46e5", glow: "#a5b4fc", sun: "#f59e0b", label: "City" },
    space: { skyA: "#050816", skyB: "#2b1f70", horizon: "#3f2ca8", ground: "#14103a", deco: "#8b5cf6", glow: "#f5d0fe", sun: "#f9a8d4", label: "Space" },
    ocean: { skyA: "#82f4ff", skyB: "#0e7ebf", horizon: "#0369a1", ground: "#0a3b58", deco: "#0ea5e9", glow: "#bae6fd", sun: "#e0f2fe", label: "Ocean" },
    volcano: { skyA: "#2b0d0d", skyB: "#7f1d1d", horizon: "#dc2626", ground: "#2a1414", deco: "#7a1a1a", glow: "#fca5a5", sun: "#fb923c", label: "Volcano" },
    cave: { skyA: "#0b1120", skyB: "#1f2937", horizon: "#334155", ground: "#111827", deco: "#0f172a", glow: "#86efac", sun: "#d9f99d", label: "Crystal Cave" },
    neon: { skyA: "#0b0720", skyB: "#3b0764", horizon: "#7e22ce", ground: "#0f102a", deco: "#f43f5e", glow: "#fbcfe8", sun: "#22d3ee", label: "Neon Grid" },
  };
  const t = themes[preset];
  const stars = preset === "space" || preset === "cave"
    ? "<circle cx='34' cy='34' r='1.7' fill='white'/><circle cx='118' cy='40' r='1.8' fill='white'/><circle cx='212' cy='24' r='1.6' fill='white'/><circle cx='370' cy='56' r='1.7' fill='white'/><circle cx='430' cy='38' r='1.5' fill='white'/>"
    : "";
  const skyline = preset === "city" || preset === "neon"
    ? "<rect x='34' y='122' width='34' height='56' fill='#0f172a'/><rect x='80' y='100' width='44' height='78' fill='#111827'/><rect x='136' y='114' width='28' height='64' fill='#1e293b'/><rect x='176' y='92' width='52' height='86' fill='#0f172a'/><rect x='244' y='106' width='36' height='72' fill='#1e293b'/><rect x='294' y='90' width='50' height='88' fill='#0f172a'/>"
    : "";
  const skylineLights = preset === "city" || preset === "neon"
    ? "<rect x='91' y='116' width='4' height='4' fill='#fef08a'/><rect x='99' y='130' width='4' height='4' fill='#fde68a'/><rect x='188' y='112' width='4' height='4' fill='#fef08a'/><rect x='206' y='126' width='4' height='4' fill='#fde68a'/><rect x='304' y='118' width='4' height='4' fill='#fef08a'/>"
    : "";
  const waves = preset === "ocean"
    ? "<path d='M0 252 C40 226 80 272 120 252 C160 232 200 270 240 252 C280 234 320 270 360 252 C400 234 440 272 480 252 L480 360 L0 360 Z' fill='#0369a1' fill-opacity='0.56'/><path d='M0 276 C35 258 70 292 105 276 C140 260 175 292 210 276 C245 260 280 292 315 276 C350 260 385 292 420 276 C445 264 468 278 480 272 L480 360 L0 360 Z' fill='#0ea5e9' fill-opacity='0.24'/>"
    : "";
  const dunes = preset === "desert"
    ? "<path d='M0 248 C84 210 132 288 220 248 C290 220 344 282 430 250 L480 260 L480 360 L0 360 Z' fill='#c57a35' fill-opacity='0.7'/>"
    : "";
  const trees = preset === "forest"
    ? "<circle cx='82' cy='212' r='28' fill='#1f7a40'/><rect x='76' y='212' width='10' height='44' fill='#5f3b20'/><circle cx='392' cy='208' r='30' fill='#256d3d'/><rect x='386' y='208' width='10' height='48' fill='#5f3b20'/>"
    : "";
  const lava = preset === "volcano"
    ? "<path d='M0 262 L80 244 L124 274 L182 246 L230 278 L292 250 L352 280 L420 254 L480 270 L480 360 L0 360 Z' fill='#7f1d1d'/><path d='M0 286 L72 276 L120 304 L172 276 L236 308 L302 274 L366 304 L430 276 L480 292 L480 360 L0 360 Z' fill='#ef4444' fill-opacity='0.58'/>"
    : "";
  const crystals = preset === "cave"
    ? "<polygon points='70,262 86,222 104,262' fill='#86efac' fill-opacity='0.78'/><polygon points='124,268 142,228 160,268' fill='#6ee7b7' fill-opacity='0.72'/><polygon points='366,272 382,230 400,272' fill='#86efac' fill-opacity='0.7'/>"
    : "";
  const neonGrid = preset === "neon"
    ? "<path d='M0 258 L480 258' stroke='#fb7185' stroke-opacity='0.55'/><path d='M0 278 L480 278' stroke='#fb7185' stroke-opacity='0.35'/><path d='M48 258 L48 360 M96 258 L96 360 M144 258 L144 360 M192 258 L192 360 M240 258 L240 360 M288 258 L288 360 M336 258 L336 360 M384 258 L384 360 M432 258 L432 360' stroke='#22d3ee' stroke-opacity='0.3'/>"
    : "";
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='480' height='360' viewBox='0 0 480 360'>
      <defs>
        <linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stop-color='${t.skyA}'/>
          <stop offset='100%' stop-color='${t.skyB}'/>
        </linearGradient>
        <radialGradient id='sunGlow' cx='82%' cy='18%' r='20%'>
          <stop offset='0%' stop-color='${t.glow}' stop-opacity='0.9'/>
          <stop offset='100%' stop-color='${t.glow}' stop-opacity='0'/>
        </radialGradient>
      </defs>
      <rect width='480' height='360' fill='url(#sky)'/>
      <rect y='186' width='480' height='88' fill='${t.horizon}' fill-opacity='0.28'/>
      <circle cx='410' cy='62' r='46' fill='url(#sunGlow)'/>
      <circle cx='410' cy='62' r='32' fill='${t.sun}' fill-opacity='0.88'/>
      ${stars}
      <rect y='258' width='480' height='102' fill='${t.ground}'/>
      <ellipse cx='120' cy='268' rx='96' ry='24' fill='${t.deco}' fill-opacity='0.72'/>
      <ellipse cx='338' cy='274' rx='136' ry='28' fill='${t.deco}' fill-opacity='0.62'/>
      ${skyline}
      ${skylineLights}
      ${waves}
      ${dunes}
      ${trees}
      ${lava}
      ${crystals}
      ${neonGrid}
      <text x='18' y='30' fill='white' fill-opacity='0.82' font-size='18' font-family='Arial'>${t.label} Environment</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeEnvironmentOverlayCostume(preset: EnvironmentPreset): string {
  const overlays: Record<EnvironmentPreset, { a: string; b: string; label: string }> = {
    dojo: { a: "#8d6e63", b: "#6d4c41", label: "Tatami" },
    forest: { a: "#2d6a4f", b: "#1b4332", label: "Canopy" },
    desert: { a: "#bc6c25", b: "#99582a", label: "Dunes" },
    snow: { a: "#ced4da", b: "#adb5bd", label: "Ice" },
    city: { a: "#334155", b: "#1e293b", label: "Streets" },
    space: { a: "#5a189a", b: "#3c096c", label: "Nebula" },
    ocean: { a: "#0ea5e9", b: "#0369a1", label: "Coral" },
    volcano: { a: "#b91c1c", b: "#7f1d1d", label: "Lava Ridge" },
    cave: { a: "#1e293b", b: "#0f172a", label: "Cavern Floor" },
    neon: { a: "#fb7185", b: "#7e22ce", label: "Neon Grid" },
  };
  const t = overlays[preset];
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='480' height='360' viewBox='0 0 480 360'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='${t.a}' stop-opacity='0.52'/>
          <stop offset='100%' stop-color='${t.b}' stop-opacity='0.74'/>
        </linearGradient>
      </defs>
      <ellipse cx='120' cy='315' rx='130' ry='45' fill='url(#g)'/>
      <ellipse cx='360' cy='310' rx='160' ry='52' fill='url(#g)'/>
      ${preset === "neon" ? "<path d='M0 300 L480 300' stroke='#22d3ee' stroke-opacity='0.35'/><path d='M0 322 L480 322' stroke='#fb7185' stroke-opacity='0.35'/>" : ""}
      ${preset === "volcano" ? "<path d='M36 320 C72 300 104 342 148 320' stroke='#fb923c' stroke-width='4' stroke-opacity='0.55' fill='none'/>" : ""}
      ${preset === "cave" ? "<polygon points='74,334 88,298 102,334' fill='rgba(134,239,172,0.35)'/><polygon points='390,334 404,296 418,334' fill='rgba(134,239,172,0.28)'/>" : ""}
      <text x='16' y='344' fill='white' fill-opacity='0.6' font-size='12' font-family='Arial'>${t.label} foreground</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function ProjectWorkspace({ projectId, aiEnabled = true }: Props) {
  const { user } = useAuth();
  const [sprites, setSprites] = useState<Sprite[]>(() => [makeDefaultNova()]);
  const [selectedSpriteId, setSelectedSpriteId] = useState<string>(() => {
    // will be patched in useEffect below, but init to something stable
    return "";
  });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stage, setStage] = useState<StageSettings>(DEFAULT_STAGE);
  const [mode, setMode] = useState<ProjectMode>("2d");
  const [running, setRunning] = useState(false);
  const unityEngineRef = useRef<RuntimeEngine | null>(null);
  const unityRafRef = useRef(0);
  const [shaking, setShaking] = useState(false);
  const [viewMode, setViewMode] = useState<"blocks" | "js">("blocks");
  const [showAssets, setShowAssets] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showCostumeEditor, setShowCostumeEditor] = useState(false);
  const [showSpriteLibrary, setShowSpriteLibrary] = useState(false);
  const [showShapeEditor, setShowShapeEditor] = useState(false);
  const [showLessons, setShowLessons] = useState(false);
  const [showAICreator, setShowAICreator] = useState(false);
  const [showGameSystems, setShowGameSystems] = useState(false);
  const [title, setTitle] = useState("Untitled Project");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [lockedScreen, setLockedScreen] = useState(false);
  const [gameData, setGameData] = useState<GameProjectData>(() => createDefaultGameData());
  const autoSaveTimer = useRef<number>();
  const analyticsTimer = useRef<number>();

  const triggerShake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }, []);
  const startTime = useRef(Date.now());

  const selectedSprite = sprites.find((s) => s.id === selectedSpriteId) || sprites[0];

  // Auto-select first sprite if none selected
  useEffect(() => {
    if (!selectedSpriteId && sprites.length > 0) setSelectedSpriteId(sprites[0].id);
  }, [selectedSpriteId, sprites]);

  useEffect(() => {
    if (!projectId) return;
    api.getProject(projectId).then((proj) => {
      const data = typeof proj.data === "string" ? JSON.parse(proj.data) : proj.data;
      if (data.sprites?.length) setSprites(data.sprites);
      if (data.stage) setStage(data.stage);
      if (data.assets) setAssets(data.assets);
      if (data.gameData) setGameData(data.gameData);
      setTitle(proj.title);
      setMode(proj.mode);
      if (data.sprites?.[0]) setSelectedSpriteId(data.sprites[0].id);
    }).catch(console.error);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !dirty) return;
    autoSaveTimer.current = window.setTimeout(() => { handleSave(); }, 5000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [dirty, sprites, stage, assets, gameData, title, mode, projectId]);

  useEffect(() => {
    if (!projectId) return;
    analyticsTimer.current = window.setInterval(() => {
      const totalBlocks = sprites.reduce((sum, s) => sum + s.blocks.length, 0);
      api.trackAnalytics({ projectId, timeSpent: Math.round((Date.now() - startTime.current) / 1000), blocksUsed: totalBlocks, errorsMade: 0 }).catch(() => {});
    }, 60000);
    return () => clearInterval(analyticsTimer.current);
  }, [projectId, sprites]);

  useEffect(() => {
    if (!projectId) return;
    const socket = getSocket();
    socket.emit("join:project", projectId);
  }, [projectId]);

  // Lock screen check for students (REST fallback for Vercel)
  useEffect(() => {
    if (!user || user.role !== "student") return;
    const checkLock = async () => {
      try {
        const classes = await api.getClasses();
        for (const cls of classes) {
          const ctrl = await api.getMyControls(cls.id);
          if (ctrl?.screen_locked) { setLockedScreen(true); return; }
        }
        setLockedScreen(false);
      } catch { /* ignore */ }
    };
    checkLock();
    const iv = setInterval(checkLock, 5000);
    return () => clearInterval(iv);
  }, [user]);

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await api.saveProject(projectId, { data: { sprites, stage, assets, gameData }, title, mode });
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) { console.error("Save failed:", e); }
    setSaving(false);
  }, [projectId, sprites, stage, assets, gameData, title, mode]);

  const handleBlocksChange = useCallback((blocks: Block[]) => {
    setSprites((prev) => {
      const targetId = selectedSpriteId || prev[0]?.id;
      if (!targetId) return prev;
      return prev.map((s) => (s.id === targetId ? { ...s, blocks } : s));
    });
    setDirty(true);
  }, [selectedSpriteId]);

  const handleResetProjectFromBlocks = useCallback(() => {
    const confirmed = window.confirm("Reset this project? This will clear sprites, blocks, stage settings, assets, and game systems.");
    if (!confirmed) return;

    const freshSprite = makeDefaultNova();
    setSprites([freshSprite]);
    setSelectedSpriteId(freshSprite.id);
    setStage(DEFAULT_STAGE);
    setAssets([]);
    setGameData(createDefaultGameData());
    setRunning(false);
    setDirty(true);
  }, []);

  const handleAddSprite = useCallback(() => {
    const newSprite = makeSprite(`Sprite${sprites.length + 1}`);
    setSprites((prev) => [...prev, newSprite]);
    setSelectedSpriteId(newSprite.id);
    setDirty(true);
  }, [sprites.length]);

  const handleDeleteSprite = useCallback((id: string) => {
    if (sprites.length <= 1) return;
    setSprites((prev) => prev.filter((s) => s.id !== id));
    if (selectedSpriteId === id) setSelectedSpriteId(sprites.find((s) => s.id !== id)?.id || "");
    setDirty(true);
  }, [sprites, selectedSpriteId]);

  const handleRenameSprite = useCallback((id: string, name: string) => {
    setSprites((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    setDirty(true);
  }, []);

  const handleDuplicateSprite = useCallback((id: string) => {
    const original = sprites.find((s) => s.id === id);
    if (!original) return;
    const clone: Sprite = { ...JSON.parse(JSON.stringify(original)), id: "s_" + Math.random().toString(36).slice(2, 8), name: original.name + " copy", x: original.x + 30 };
    setSprites((prev) => [...prev, clone]);
    setDirty(true);
  }, [sprites]);

  const handleSpriteMove = useCallback((id: string, x: number, y: number) => {
    setSprites((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)));
    setDirty(true);
  }, []);

  const handleCostumeSave = useCallback((asset: Asset) => {
    setSprites((prev) => prev.map((s) => {
      if (s.id !== selectedSpriteId) return s;
      const existingIndex = s.costumes.findIndex((c) => c.id === asset.id);
      if (existingIndex >= 0) {
        const nextCostumes = [...s.costumes];
        nextCostumes[existingIndex] = asset;
        return { ...s, costumes: nextCostumes, costumeIndex: existingIndex };
      }
      const nextCostumes = [...s.costumes, asset];
      return { ...s, costumes: nextCostumes, costumeIndex: nextCostumes.length - 1 };
    }));
    setShowCostumeEditor(false);
    setDirty(true);
  }, [selectedSpriteId]);

  const handleLibrarySelect = useCallback((asset: Asset) => {
    if (asset.type === "image") {
      setSprites((prev) => prev.map((s) => s.id === selectedSpriteId ? { ...s, costumes: [...s.costumes, asset] } : s));
    } else if (asset.type === "sound") {
      setSprites((prev) => prev.map((s) => s.id === selectedSpriteId ? { ...s, sounds: [...s.sounds, asset] } : s));
    }
    setShowSpriteLibrary(false);
    setDirty(true);
  }, [selectedSpriteId]);

  const handleShapeSave = useCallback((shape: string, color: string, scaleX: number, scaleY: number, scaleZ: number) => {
    setSprites((prev) => prev.map((s) => s.id === selectedSpriteId ? { ...s, shape3d: shape as Sprite["shape3d"] } : s));
    setShowShapeEditor(false);
    setDirty(true);
  }, [selectedSpriteId]);

  const handleApplyTemplateBlocks = useCallback((template: GameTemplate) => {
    const specs = makeTemplateSpecs(template);
    setSprites((prev) => {
      const targetId = getPlayableSpriteId(prev, selectedSpriteId) || prev[0]?.id;
      if (!targetId) return prev;
      return prev.map((sprite) => {
        if (sprite.id !== targetId) return sprite;

        const baseStackCount = Math.max(1, Math.ceil(sprite.blocks.filter((b) => b.x != null && b.y != null).length));
        const injected: Block[] = [];

        specs.forEach((stack, stackIndex) => {
          let parentId: string | undefined;
          const stackNumber = baseStackCount + stackIndex;
          const x = 36 + (stackNumber % 2) * 220;
          const y = 36 + Math.floor(stackNumber / 2) * 120;

          stack.blocks.forEach((spec, blockIndex) => {
            const def = getBlockDef(spec.type);
            if (!def) return;
            const block: Block = {
              id: "b_" + Math.random().toString(36).slice(2, 11),
              type: def.type,
              category: def.category,
              inputs: Object.fromEntries(
                (def.inputs || []).map((inp) => [
                  inp.name,
                  { type: "value" as const, value: spec.inputs?.[inp.name] ?? inp.default },
                ])
              ),
            };

            if (blockIndex === 0) {
              block.x = x;
              block.y = y;
            } else if (parentId) {
              block.parent = parentId;
            }

            parentId = block.id;
            injected.push(block);
          });
        });

        return { ...sprite, blocks: [...sprite.blocks, ...injected] };
      });
    });
    setDirty(true);
  }, [selectedSpriteId]);

  /* ── Unity mode runtime engine ──
     When mode=unity and running=true, run the block engine so unity_ blocks
     fire their unityBridge() calls into the stage iframe.
  ── */
  useEffect(() => {
    if (mode !== "unity") return;
    if (!running) {
      // Stop engine when user hits stop
      cancelAnimationFrame(unityRafRef.current);
      if (unityEngineRef.current) {
        stopRuntime(unityEngineRef.current);
        unityEngineRef.current = null;
      }
      return;
    }

    const engine = createRuntime(sprites, 480, 360);
    unityEngineRef.current = engine;
    startGreenFlag(engine, sprites);

    let lastTs = 0;
    const tick = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      if (engine.running) {
        stepRuntime(engine, sprites, dt);
        unityRafRef.current = requestAnimationFrame(tick);
      }
    };
    unityRafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(unityRafRef.current);
      stopRuntime(engine);
      unityEngineRef.current = null;
    };
  // sprites changes should not restart the engine mid-run; only running/mode transitions matter
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, running]);

  const handleApplyUnityTemplate = useCallback((template: UnityTemplate) => {
    setMode("unity");
    // FPS microgame defaults to first-person camera
    if (template === "unity_fps" && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`blockforge:camera-mode.${projectId || "default"}`, "first");
        window.dispatchEvent(new CustomEvent("blockforge:camera-mode", { detail: "first" }));
      } catch {}
    }
    const specs = makeUnityTemplateSpecs(template);
    setSprites((prev) => {
      const targetId = getPlayableSpriteId(prev, selectedSpriteId) || prev[0]?.id;
      if (!targetId) return prev;
      return prev.map((sprite) => {
        if (sprite.id !== targetId) return sprite;
        const baseStackCount = Math.max(1, Math.ceil(sprite.blocks.filter((b) => b.x != null && b.y != null).length));
        const injected: Block[] = [];
        specs.forEach((stack, stackIndex) => {
          let parentId: string | undefined;
          const stackNumber = baseStackCount + stackIndex;
          const x = 36 + (stackNumber % 2) * 220;
          const y = 36 + Math.floor(stackNumber / 2) * 120;
          stack.blocks.forEach((spec, blockIndex) => {
            const def = getBlockDef(spec.type);
            if (!def) return;
            const block: Block = {
              id: "b_" + Math.random().toString(36).slice(2, 11),
              type: def.type,
              category: def.category,
              inputs: Object.fromEntries(
                (def.inputs || []).map((inp) => [
                  inp.name,
                  { type: "value" as const, value: spec.inputs?.[inp.name] ?? inp.default },
                ])
              ),
            };
            if (blockIndex === 0) { block.x = x; block.y = y; } else if (parentId) { block.parent = parentId; }
            parentId = block.id;
            injected.push(block);
          });
        });
        return { ...sprite, blocks: [...sprite.blocks, ...injected] };
      });
    });
    setDirty(true);
  }, [selectedSpriteId]);

  const handleApplyEnvironment = useCallback((preset: EnvironmentPreset) => {
    const costumeUrl = makeEnvironmentCostume(preset);
    const overlayCostumeUrl = makeEnvironmentOverlayCostume(preset);
    const bgByPreset: Record<EnvironmentPreset, string> = {
      dojo: "#f0e6c8",
      forest: "#1f5132",
      desert: "#c7792a",
      snow: "#99c9ea",
      city: "#0f172a",
      space: "#060915",
      ocean: "#083344",
      volcano: "#1b0d0d",
      cave: "#0b1220",
      neon: "#130a2b",
    };
    const environmentSprite: Sprite = {
      id: `env_${preset}`,
      name: `Environment ${preset}`,
      x: 0,
      y: 0,
      rotation: 90,
      scale: 12,
      costumeIndex: 0,
      costumes: [{ id: `costume_env_${preset}`, name: `${preset}-backdrop`, url: costumeUrl, type: "image" }],
      sounds: [],
      blocks: [],
      visible: true,
    };

    const overlaySprite: Sprite = {
      id: `env_overlay_${preset}`,
      name: `Environment Overlay ${preset}`,
      x: 0,
      y: -150,
      rotation: 90,
      scale: 6.5,
      costumeIndex: 0,
      costumes: [{ id: `costume_env_overlay_${preset}`, name: `${preset}-overlay`, url: overlayCostumeUrl, type: "image" }],
      sounds: [],
      blocks: [],
      visible: true,
    };

    const preserveSelectedPlayable = (sprites: Sprite[]) => getPlayableSpriteId(sprites, selectedSpriteId);

    setStage((prev) => ({ ...prev, backgroundColor: bgByPreset[preset], backgroundImage: `env:${preset}` }));

    if (mode === "3d") {
      // In 3D mode use stage theme only; avoid adding giant 2D environment sprites.
      setSprites((prev) => {
        const next = prev.filter((s) => !s.id.startsWith("env_"));
        const playable = preserveSelectedPlayable(next);
        if (playable) setSelectedSpriteId(playable);
        return next;
      });
    } else {
      setSprites((prev) => {
        const withoutOldEnvironment = prev.filter((s) => !s.id.startsWith("env_"));
        // Keep environment layers behind gameplay sprites so movement is always visible.
        const next = [environmentSprite, overlaySprite, ...withoutOldEnvironment];
        const playable = preserveSelectedPlayable(next);
        if (playable) setSelectedSpriteId(playable);
        return next;
      });
    }
    setDirty(true);
  }, [selectedSpriteId, mode]);

  const handleAdd3DSprite = useCallback((name: string, shape: Shape3D) => {
    const id = "s_" + Math.random().toString(36).slice(2, 8);
    const offset = sprites.length * 60;
    const newSprite: Sprite = {
      id, name: `${name}${sprites.length}`, x: offset, y: 0, z: 0,
      rotation: 0, scale: 1, costumeIndex: 0,
      costumes: [], sounds: [], blocks: [], visible: true, shape3d: shape,
    };
    setSprites((prev) => [...prev, newSprite]);
    setSelectedSpriteId(id);
    setDirty(true);
  }, [sprites.length]);

  const { theme, toggleTheme } = useTheme();
  const dk = theme === "dark";

  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 900);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className={`flex flex-col ${dk ? "bg-[#07071a]" : "bg-[#f2f3f8]"}`} style={{ height: "100dvh" }}>
      {/* Lock screen overlay */}
      {lockedScreen && (
        <div className={`fixed inset-0 z-50 backdrop-blur-xl flex items-center justify-center ${dk ? "bg-[#07071a]/98" : "bg-white/95"}`}>
          <div className="text-center screen-shake">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${dk ? "bg-white/[0.06]" : "bg-gray-100"}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={dk ? "text-white/50" : "text-gray-400"}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 className={`text-2xl font-bold ${dk ? "text-white" : "text-gray-900"}`}>Screen Locked</h2>
            <p className={`mt-2 text-sm ${dk ? "text-white/40" : "text-gray-500"}`}>Your teacher has locked screens.</p>
          </div>
        </div>
      )}
      {/* Toolbar */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b flex-shrink-0 overflow-x-auto ${dk ? "bg-[#0a0b20] border-white/[0.05]" : "bg-white border-gray-200"}`} style={{ minHeight: 44, WebkitOverflowScrolling: "touch" }}>
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>
          </div>
          <span className={`font-semibold text-sm hidden sm:inline ${dk ? "text-white/60" : "text-gray-600"}`}>BlockForge</span>
        </a>

        <div className={`w-px h-5 ${dk ? "bg-white/[0.08]" : "bg-gray-200"}`} />

        <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          className={`bg-transparent border-none font-medium text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50 rounded px-2 py-1 w-28 sm:w-48 flex-shrink-0 ${dk ? "text-white" : "text-gray-900"}`} />

        {/* Mode toggle */}
        <div className={`flex rounded-lg overflow-hidden border ${dk ? "border-white/[0.08]" : "border-gray-200"}`}>
          {(["2d", "3d", "unity"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs font-medium transition-all ${
                mode === m
                  ? m === "unity" ? "bg-cyan-500 text-white" : "bg-violet-600 text-white"
                  : dk ? "text-white/40 hover:text-white/60" : "text-gray-500 hover:text-gray-700"
              }`}>
              {m === "unity" ? "🎮 Unity" : m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className={`flex rounded-lg overflow-hidden border ${dk ? "border-white/[0.08]" : "border-gray-200"}`}>
          {(["blocks", "js"] as const).map((v) => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`px-3 py-1 text-xs font-medium transition-all ${viewMode === v ? "bg-violet-600 text-white" : dk ? "text-white/40 hover:text-white/60" : "text-gray-500 hover:text-gray-700"}`}>
              {v === "blocks" ? "Blocks" : "JavaScript"}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Theme toggle */}
        <button onClick={toggleTheme}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all duration-300 ${
            dk ? "bg-white/[0.06] hover:bg-white/[0.12] text-white/60" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
          }`} title={dk ? "Switch to Light Mode" : "Switch to Dark Mode"}>
          {dk ? "☀️" : "🌙"}
        </button>

        <button onClick={() => setShowTimeline(!showTimeline)}
          className={`flex-shrink-0 px-2.5 py-1 text-xs rounded-lg border transition-colors ${dk ? "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border-white/[0.06]" : "bg-white text-gray-600 hover:bg-gray-100 border-gray-200"}`}>
          <span className="hidden sm:inline">{showTimeline ? "Hide Timeline" : "Timeline"}</span>
          <span className="sm:hidden">⏱</span>
        </button>
        <button onClick={() => setShowAssets(!showAssets)}
          className={`flex-shrink-0 px-2.5 py-1 text-xs rounded-lg border transition-colors ${dk ? "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border-white/[0.06]" : "bg-white text-gray-600 hover:bg-gray-100 border-gray-200"}`}>
          <span className="hidden sm:inline">{showAssets ? "Hide Assets" : "Assets"}</span>
          <span className="sm:hidden">🖼</span>
        </button>
        <button onClick={() => setShowAICreator(true)}
          className="flex-shrink-0 px-2.5 py-1 text-xs rounded-lg bg-gradient-to-r from-[#FF6B9D]/20 to-violet-500/20 text-[#FF6B9D] hover:from-[#FF6B9D]/30 hover:to-violet-500/30 border border-[#FF6B9D]/20 transition-colors font-medium">
          <span className="hidden sm:inline">✧ AI Creator</span>
          <span className="sm:hidden">✧</span>
        </button>
        <button onClick={() => setShowGameSystems(true)}
          className="flex-shrink-0 px-2.5 py-1 text-xs rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/20 transition-colors font-medium">
          <span className="hidden sm:inline">Game Systems</span>
          <span className="sm:hidden">🎮</span>
        </button>
        <button onClick={() => setShowLessons(true)}
          className={`flex-shrink-0 px-2.5 py-1 text-xs rounded-lg border transition-colors ${dk ? "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border-white/[0.06]" : "bg-white text-gray-600 hover:bg-gray-100 border-gray-200"}`}>
          📖<span className="hidden sm:inline"> Lessons</span>
        </button>

        {/* Run/Stop — ping ring when running, glow invite when stopped */}
        <div className="relative flex-shrink-0">
          {running && (
            <span className="absolute inset-0 rounded-lg pointer-events-none animate-ping-slow bg-red-400/20" />
          )}
          <button
            onClick={() => { setRunning(!running); if (!running) triggerShake(); }}
            className={`relative px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 active:scale-90 ${
              running
                ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/30 shadow-lg"
                : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30 shadow-lg animate-glow-pulse hover:scale-[1.03]"
            }`}
          >
            {running ? "⏹ Stop" : "▶ Run"}
          </button>
        </div>

        {/* Save — spinner → flash checkmark */}
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-lg text-white transition-all duration-200 disabled:opacity-40 active:scale-95 ${
            savedFlash ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25 shadow-md" : "bg-violet-600 hover:bg-violet-500"
          }`}
        >
          {saving ? (
            <span className="flex items-center gap-1.5">
              <span className="save-spinner" />
              Saving
            </span>
          ) : savedFlash ? (
            <span className="animate-check-pop inline-block">☁ Saved ✓</span>
          ) : dirty ? (
            <span className="flex items-center gap-1">☁ Save <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" /></span>
          ) : (
            "☁ Saved ✓"
          )}
        </button>
      </div>

      {/* Main content */}
      <div className={`flex-1 min-h-0 flex overflow-hidden ${isNarrow ? "flex-col" : "flex-row"} ${shaking ? "screen-shake" : ""}`}>
        {/* Editor area */}
        <div className="flex-1 min-h-0 flex flex-col min-w-0" style={isNarrow ? { minHeight: "45vh", maxHeight: "55vh" } : {}}>
          <div className="flex-1 min-h-0 p-2 overflow-hidden" style={{ touchAction: "pan-y" }}>
            {viewMode === "blocks" ? (
              <BlockEditor
                blocks={selectedSprite?.blocks || []}
                onChange={handleBlocksChange}
                onResetProject={handleResetProjectFromBlocks}
              />
            ) : (
              <JSView sprites={sprites} />
            )}
          </div>
          {showTimeline && (
            <div className="p-2 border-t border-white/[0.06]">
              <Timeline sprites={sprites} duration={10} onPlay={() => {}} />
            </div>
          )}
        </div>

        {/* Right panel: Stage + sprites */}
        <div
          className={`flex flex-col p-2 gap-2 overflow-y-auto bg-white/[0.01] ${isNarrow ? "border-t border-white/[0.06] w-full" : "border-l border-white/[0.06]"}`}
          style={isNarrow ? { maxHeight: "45vh", touchAction: "pan-y" } : { width: 420, flexShrink: 0, touchAction: "pan-y" }}
        >
          {mode === "2d" ? (
            <Stage2D sprites={sprites} stage={stage} running={running} selectedSpriteId={selectedSpriteId} onRunningChange={setRunning} onSpriteMove={handleSpriteMove} />
          ) : mode === "3d" ? (
            <Stage3D sprites={sprites} stage={stage} running={running} projectId={projectId} onSpriteMove={handleSpriteMove} onAddSprite={handleAdd3DSprite} />
          ) : (
            <UnityStage />
          )}

          {/* Sprite info panel (character info bar below stage) */}
          {selectedSprite && (
            <div className={`flex flex-wrap gap-x-3 gap-y-1 items-center px-2 py-1.5 rounded-lg border text-[11px] ${dk ? "bg-white/[0.04] border-white/[0.06]" : "bg-gray-50 border-gray-200"}`}>
              {/* Visibility toggle */}
              <button
                onClick={() => {
                  setSprites((prev) => prev.map((s) => s.id === selectedSprite.id ? { ...s, visible: !s.visible } : s));
                  setDirty(true);
                }}
                className={`text-base transition-opacity ${selectedSprite.visible ? "opacity-100" : "opacity-30"}`}
                title={selectedSprite.visible ? "Hide sprite" : "Show sprite"}
              >👁</button>
              {/* Name */}
              <span className={dk ? "text-white/40" : "text-gray-500"}>Sprite:</span>
              <span className={dk ? "text-white font-medium" : "text-gray-900 font-medium"}>{selectedSprite.name}</span>
              {/* X */}
              <span className={dk ? "text-white/40" : "text-gray-500"}>x:</span>
              <input
                type="number"
                value={Math.round(selectedSprite.x)}
                onChange={(e) => { setSprites((prev) => prev.map((s) => s.id === selectedSprite.id ? { ...s, x: Number(e.target.value) } : s)); setDirty(true); }}
                className={`w-14 border rounded px-1 py-0.5 text-[11px] text-center focus:outline-none ${dk ? "bg-white/[0.06] border-white/[0.08] text-white" : "bg-white border-gray-200 text-gray-900"}`}
              />
              {/* Y */}
              <span className={dk ? "text-white/40" : "text-gray-500"}>y:</span>
              <input
                type="number"
                value={Math.round(selectedSprite.y)}
                onChange={(e) => { setSprites((prev) => prev.map((s) => s.id === selectedSprite.id ? { ...s, y: Number(e.target.value) } : s)); setDirty(true); }}
                className={`w-14 border rounded px-1 py-0.5 text-[11px] text-center focus:outline-none ${dk ? "bg-white/[0.06] border-white/[0.08] text-white" : "bg-white border-gray-200 text-gray-900"}`}
              />
              {/* Size */}
              <span className={dk ? "text-white/40" : "text-gray-500"}>Size:</span>
              <input
                type="number"
                value={Math.round(selectedSprite.scale * 100)}
                min={1}
                onChange={(e) => { setSprites((prev) => prev.map((s) => s.id === selectedSprite.id ? { ...s, scale: Number(e.target.value) / 100 } : s)); setDirty(true); }}
                className={`w-14 border rounded px-1 py-0.5 text-[11px] text-center focus:outline-none ${dk ? "bg-white/[0.06] border-white/[0.08] text-white" : "bg-white border-gray-200 text-gray-900"}`}
              />
              {/* Direction */}
              <span className={dk ? "text-white/40" : "text-gray-500"}>Dir:</span>
              <input
                type="number"
                value={Math.round(selectedSprite.rotation)}
                onChange={(e) => { setSprites((prev) => prev.map((s) => s.id === selectedSprite.id ? { ...s, rotation: Number(e.target.value) } : s)); setDirty(true); }}
                className={`w-14 border rounded px-1 py-0.5 text-[11px] text-center focus:outline-none ${dk ? "bg-white/[0.06] border-white/[0.08] text-white" : "bg-white border-gray-200 text-gray-900"}`}
              />
            </div>
          )}

          {/* Stage settings */}
          <div className="flex gap-2 items-center">
            <label className={`text-xs ${dk ? "text-white/40" : "text-gray-500"}`}>BG:</label>
            <input type="color" value={stage.backgroundColor}
              onChange={(e) => setStage({ ...stage, backgroundColor: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer" />
            <label className={`text-xs ${dk ? "text-white/40" : "text-gray-500"}`}>Size:</label>
            <input type="number" value={stage.width}
              onChange={(e) => setStage({ ...stage, width: Number(e.target.value) })}
              className={`w-16 text-xs py-1 border rounded-lg px-2 ${dk ? "bg-white/[0.06] border-white/[0.08] text-white" : "bg-white border-gray-200 text-gray-900"}`} />
            <span className={`text-xs ${dk ? "text-white/20" : "text-gray-400"}`}>×</span>
            <input type="number" value={stage.height}
              onChange={(e) => setStage({ ...stage, height: Number(e.target.value) })}
              className={`w-16 text-xs py-1 border rounded-lg px-2 ${dk ? "bg-white/[0.06] border-white/[0.08] text-white" : "bg-white border-gray-200 text-gray-900"}`} />
          </div>

          <SpritePanel sprites={sprites} selectedId={selectedSpriteId}
            onSelect={setSelectedSpriteId} onAdd={handleAddSprite} onDelete={handleDeleteSprite}
            onRename={handleRenameSprite} onDuplicate={handleDuplicateSprite}
            onEditCostume={() => setShowCostumeEditor(true)}
            onOpenLibrary={() => setShowSpriteLibrary(true)}
            onEdit3DShape={() => setShowShapeEditor(true)} />

          {showAssets && (
            <AssetManager assets={assets}
              onAdd={(a) => { setAssets((prev) => [...prev, a]); setDirty(true); }}
              onDelete={(id) => { setAssets((prev) => prev.filter((a) => a.id !== id)); setDirty(true); }} />
          )}
        </div>
      </div>

      <AIAssistant
        projectContext={`BlockForge project: "${title}", Mode: ${mode}, Sprites: [${sprites.map((s) => `${s.name}(${s.blocks.length} blocks)`).join(", ")}], Block types used: ${[...new Set(sprites.flatMap((s) => s.blocks.map((b) => b.type)))].slice(0, 20).join(", ")}, Total blocks: ${sprites.reduce((n, s) => n + s.blocks.length, 0)}. You are an AI coding assistant for a Scratch-like block programming platform called BlockForge. Help students learn programming with blocks. Suggest specific block types they can use. Available categories: Motion, Looks, Sound, Events, Control, Operators, Variables, Lists, Physics, Sensing, Pen, 3D Environments, Game Systems, AI, My Blocks.`}
        enabled={aiEnabled} />

      {showCostumeEditor && (
        <CostumeEditor
          costume={selectedSprite?.costumes[selectedSprite.costumeIndex] ?? null}
          onSave={handleCostumeSave}
          onClose={() => setShowCostumeEditor(false)} />
      )}
      {showSpriteLibrary && (
        <SpriteLibrary
          onSelect={handleLibrarySelect}
          onClose={() => setShowSpriteLibrary(false)} />
      )}
      {showShapeEditor && (
        <ShapeEditor3D
          currentShape={selectedSprite?.shape3d ?? "box"}
          currentColor="#8b5cf6"
          onSave={handleShapeSave}
          onClose={() => setShowShapeEditor(false)} />
      )}
      {showLessons && (
        <LessonsBrowser onClose={() => setShowLessons(false)} />
      )}
      {showAICreator && (
        <AIBlockCreator
          onAddBlock={(block) => {
            setSprites((prev) => {
              const targetId = selectedSpriteId || prev[0]?.id;
              if (!targetId) return prev;
              return prev.map((s) =>
                s.id === targetId ? { ...s, blocks: [...(s.blocks || []), block] } : s
              );
            });
            setDirty(true);
            setShowAICreator(false);
          }}
          onClose={() => setShowAICreator(false)}
        />
      )}
      {showGameSystems && (
        <GameSystemsPanel
          projectId={projectId}
          sprites={sprites}
          gameData={gameData}
          onChange={(next) => { setGameData(next); setDirty(true); }}
          onApplyTemplateBlocks={handleApplyTemplateBlocks}
          onApplyUnityTemplate={handleApplyUnityTemplate}
          onApplyEnvironment={handleApplyEnvironment}
          onClose={() => setShowGameSystems(false)}
        />
      )}
    </div>
  );
}
