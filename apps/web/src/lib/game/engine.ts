import type { GameProjectData, SceneDef } from "./types.ts";

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultGameData(): GameProjectData {
  const firstSceneId = id("scene");
  return {
    version: 1,
    activeSceneId: firstSceneId,
    scenes: [{ id: firstSceneId, name: "Level 1", checkpoint: { x: 0, y: 0 }, completed: false }],
    state: "menu",
    checkpoints: {},
    respawn: { x: 0, y: 0 },
    player: {
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      sprintEnabled: true,
      jumpPower: 14,
      speed: 6,
      inventory: [],
      equipment: {},
      skills: { movement: 1, combat: 1, crafting: 1 },
    },
    enemies: {
      aiState: "idle",
      pathfindingEnabled: true,
      spawnWaveSize: 3,
      defeatedCount: 0,
    },
    combat: {
      meleeEnabled: true,
      rangedEnabled: false,
      hitboxesVisible: false,
      cooldownMs: 500,
      damageType: "physical",
      statusEffects: [],
    },
    world: {
      terrainEnabled: true,
      propsCount: 0,
      dayNightCycle: true,
      timeOfDay: 12,
      weather: "clear",
      waterEnabled: false,
    },
    ui: {
      menuBuilderEnabled: true,
      dragEditorEnabled: true,
      healthBar: true,
      minimap: false,
      inventoryUi: true,
      notifications: true,
    },
    audio: {
      musicTrack: "",
      zoneAudioEnabled: false,
      masterVolume: 80,
    },
    multiplayer: {
      enabled: false,
      maxPlayers: 2,
      syncPositions: true,
    },
    optimization: {
      profilerEnabled: false,
      objectPooling: true,
      lodEnabled: false,
      fpsTarget: 60,
    },
    devtools: {
      debugConsole: false,
      showFps: false,
      showHitboxes: false,
    },
    export: {
      publishSlug: "",
      shareableLink: "",
      embedCode: "",
    },
    quests: [],
    dialogue: [],
    achievements: [],
    metadata: {
      templatesUsed: [],
      lastSavedAt: Date.now(),
    },
  };
}

export function withScene(game: GameProjectData, name: string): GameProjectData {
  const scene: SceneDef = { id: id("scene"), name, checkpoint: { x: 0, y: 0 }, completed: false };
  return { ...game, scenes: [...game.scenes, scene] };
}

export function removeScene(game: GameProjectData, sceneId: string): GameProjectData {
  const next = game.scenes.filter((s) => s.id !== sceneId);
  if (next.length === 0) return game;
  const activeSceneId = next.some((s) => s.id === game.activeSceneId) ? game.activeSceneId : next[0].id;
  return { ...game, scenes: next, activeSceneId };
}

export function setCheckpoint(game: GameProjectData, sceneId: string, x: number, y: number): GameProjectData {
  return {
    ...game,
    checkpoints: { ...game.checkpoints, [sceneId]: { x, y } },
    respawn: { x, y },
  };
}

export function respawnAtCheckpoint(game: GameProjectData): { x: number; y: number } {
  return game.checkpoints[game.activeSceneId] || game.respawn;
}

export function estimateProjectSizeKb(obj: unknown): number {
  try {
    const bytes = new Blob([JSON.stringify(obj)]).size;
    return Math.round((bytes / 1024) * 10) / 10;
  } catch {
    return 0;
  }
}

export function blockCountFromSprites(sprites: { blocks?: unknown[] }[]): number {
  return sprites.reduce((sum, s) => sum + (Array.isArray(s.blocks) ? s.blocks.length : 0), 0);
}

export function performanceWarnings(sizeKb: number, blockCount: number): string[] {
  const warnings: string[] = [];
  if (sizeKb > 750) warnings.push("Project size is high. Consider reducing assets.");
  if (blockCount > 1200) warnings.push("Block count is high. Consider splitting logic into scenes.");
  if (sizeKb > 1200 || blockCount > 2000) warnings.push("Performance risk: turn on pooling/LOD and disable heavy effects.");
  return warnings;
}
