import type { GameProjectData } from "./types.ts";
import { createDefaultGameData } from "./engine.ts";

export type GameTemplate = "platformer" | "fps" | "rpg" | "survival" | "racing" | "water";
export type UnityTemplate = "unity_fps" | "unity_platformer" | "unity_collect" | "unity_survival" | "unity_arena";
export type EnvironmentPreset =
  | "dojo"
  | "forest"
  | "desert"
  | "snow"
  | "city"
  | "space"
  | "ocean"
  | "volcano"
  | "cave"
  | "neon";

export const GAME_TEMPLATE_OPTIONS: { id: GameTemplate; label: string; description: string }[] = [
  { id: "platformer", label: "Platformer", description: "Jump, dodge, defeat enemies, and reach the exit." },
  { id: "fps", label: "FPS Arena", description: "Fast combat loop with enemy waves and camera feedback." },
  { id: "rpg", label: "RPG Quest", description: "Story scenes, quests, inventory, and save slots." },
  { id: "survival", label: "Survival", description: "Stay alive, gather items, and fight growing threats." },
  { id: "racing", label: "Racing", description: "Checkpoint race with speed-focused controls and timer feel." },
  { id: "water", label: "Water Adventure", description: "Swim movement, ocean enemies, and underwater quest goals." },
];

export const ENVIRONMENT_PRESET_OPTIONS: { id: EnvironmentPreset; label: string; description: string; color: string }[] = [
  { id: "dojo", label: "Dojo", description: "Training ground with clean contrast.", color: "#e3b341" },
  { id: "forest", label: "Forest", description: "Trees, grass tones, and adventure mood.", color: "#2f9e44" },
  { id: "desert", label: "Desert", description: "Warm sand and canyon sky.", color: "#f08c00" },
  { id: "snow", label: "Snow", description: "Cold high-key scene for arctic maps.", color: "#74c0fc" },
  { id: "city", label: "City", description: "Neon-night skyline for action games.", color: "#5c7cfa" },
  { id: "space", label: "Space", description: "Stars, planets, and sci-fi vibe.", color: "#845ef7" },
  { id: "ocean", label: "Ocean", description: "Underwater scene with reef and deep-sea tones.", color: "#0ea5e9" },
  { id: "volcano", label: "Volcano", description: "Molten lava fields with dramatic heat glow.", color: "#ef4444" },
  { id: "cave", label: "Crystal Cave", description: "Underground caverns with luminous crystals.", color: "#22c55e" },
  { id: "neon", label: "Neon Grid", description: "Retro-future synthwave skyline and laser horizon.", color: "#f43f5e" },
];

export const UNITY_TEMPLATE_OPTIONS: { id: UnityTemplate; label: string; description: string; icon: string; color: string }[] = [
  { id: "unity_fps",       label: "FPS Microgame",    description: "First-person shooter — click to shoot enemies, survive waves.", icon: "🔫", color: "#ef4444" },
  { id: "unity_platformer",label: "3D Platformer",    description: "Jump across platforms, collect coins, reach the goal.",          icon: "🏃", color: "#22d3ee" },
  { id: "unity_collect",   label: "Collect-a-thon",   description: "Grab every coin and gem before time runs out.",                  icon: "⭐", color: "#facc15" },
  { id: "unity_survival",  label: "Survival Arena",   description: "Dodge enemies, heal up, survive as long as possible.",           icon: "🛡️", color: "#a78bfa" },
  { id: "unity_arena",     label: "Battle Arena",     description: "Defeat all enemies to win. Fast enemies, camera shake.",         icon: "⚔️", color: "#f97316" },
];

export function createTemplateGameData(template: GameTemplate): GameProjectData {
  const base = createDefaultGameData();

  if (template === "platformer") {
    return {
      ...base,
      state: "menu",
      scenes: [
        { id: "scene_pl_1", name: "Level 1", checkpoint: { x: 0, y: 0 }, completed: false },
        { id: "scene_pl_2", name: "Level 2", checkpoint: { x: 0, y: 0 }, completed: false },
      ],
      activeSceneId: "scene_pl_1",
      world: { ...base.world, terrainEnabled: true, propsCount: 15, weather: "clear" },
      enemies: { ...base.enemies, aiState: "patrol", spawnWaveSize: 4 },
      metadata: { ...base.metadata, templatesUsed: ["platformer"] },
    };
  }

  if (template === "fps") {
    return {
      ...base,
      scenes: [{ id: "scene_fps_1", name: "Arena", checkpoint: { x: 0, y: 0 }, completed: false }],
      activeSceneId: "scene_fps_1",
      player: { ...base.player, speed: 8, jumpPower: 10, stamina: 120, maxStamina: 120 },
      combat: { ...base.combat, rangedEnabled: true, cooldownMs: 250, damageType: "physical" },
      enemies: { ...base.enemies, aiState: "chase", pathfindingEnabled: true, spawnWaveSize: 6 },
      world: { ...base.world, weather: "fog" },
      metadata: { ...base.metadata, templatesUsed: ["fps"] },
    };
  }

  if (template === "survival") {
    return {
      ...base,
      state: "playing",
      scenes: [
        { id: "scene_sv_day", name: "Wilderness Day", checkpoint: { x: 0, y: 0 }, completed: false },
        { id: "scene_sv_night", name: "Wilderness Night", checkpoint: { x: 0, y: 0 }, completed: false },
      ],
      activeSceneId: "scene_sv_day",
      player: { ...base.player, speed: 7, stamina: 140, maxStamina: 140 },
      enemies: { ...base.enemies, aiState: "patrol", spawnWaveSize: 5 },
      world: { ...base.world, weather: "storm", dayNightCycle: true, propsCount: 24 },
      combat: { ...base.combat, rangedEnabled: true, cooldownMs: 320, damageType: "physical" },
      quests: [
        { id: "sv_1", title: "Find shelter", done: false },
        { id: "sv_2", title: "Craft basic weapon", done: false },
      ],
      metadata: { ...base.metadata, templatesUsed: ["survival"] },
    };
  }

  if (template === "racing") {
    return {
      ...base,
      state: "playing",
      scenes: [
        { id: "scene_rc_1", name: "Circuit A", checkpoint: { x: 0, y: 0 }, completed: false },
      ],
      activeSceneId: "scene_rc_1",
      player: { ...base.player, speed: 12, jumpPower: 6, stamina: 160, maxStamina: 160 },
      world: { ...base.world, weather: "clear", propsCount: 30 },
      ui: { ...base.ui, minimap: true, notifications: true },
      devtools: { ...base.devtools, showFps: true },
      metadata: { ...base.metadata, templatesUsed: ["racing"] },
    };
  }

  if (template === "water") {
    return {
      ...base,
      state: "playing",
      scenes: [
        { id: "scene_water_1", name: "Coral Reef", checkpoint: { x: 0, y: 0 }, completed: false },
        { id: "scene_water_2", name: "Deep Trench", checkpoint: { x: 0, y: 0 }, completed: false },
      ],
      activeSceneId: "scene_water_1",
      player: { ...base.player, speed: 9, jumpPower: 0, stamina: 150, maxStamina: 150 },
      enemies: { ...base.enemies, aiState: "chase", spawnWaveSize: 4 },
      world: { ...base.world, weather: "clear", waterEnabled: true, propsCount: 28 },
      combat: { ...base.combat, damageType: "electric", rangedEnabled: true, cooldownMs: 280 },
      quests: [
        { id: "water_1", title: "Find the lost pearl", done: false },
        { id: "water_2", title: "Escape the shark zone", done: false },
      ],
      metadata: { ...base.metadata, templatesUsed: ["water"] },
    };
  }

  return {
    ...base,
    scenes: [
      { id: "scene_rpg_town", name: "Town", checkpoint: { x: 0, y: 0 }, completed: false },
      { id: "scene_rpg_forest", name: "Forest", checkpoint: { x: 0, y: 0 }, completed: false },
    ],
    activeSceneId: "scene_rpg_town",
    quests: [
      { id: "q1", title: "Talk to the village elder", done: false },
      { id: "q2", title: "Collect 3 herbs", done: false },
    ],
    dialogue: [
      { npc: "Elder", line: "Welcome, traveler." },
      { npc: "Guard", line: "The forest is dangerous at night." },
    ],
    enemies: { ...base.enemies, aiState: "idle", spawnWaveSize: 2 },
    world: { ...base.world, weather: "rain" },
    metadata: { ...base.metadata, templatesUsed: ["rpg"] },
  };
}
