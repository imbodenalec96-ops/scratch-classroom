export type GameState = "menu" | "playing" | "paused" | "game_over";

export interface SceneDef {
  id: string;
  name: string;
  checkpoint?: { x: number; y: number };
  completed?: boolean;
}

export interface PlayerStats {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  sprintEnabled: boolean;
  jumpPower: number;
  speed: number;
  inventory: string[];
  equipment: Record<string, string>;
  skills: Record<string, number>;
}

export interface EnemySystem {
  aiState: "idle" | "patrol" | "chase" | "attack";
  pathfindingEnabled: boolean;
  spawnWaveSize: number;
  defeatedCount: number;
}

export interface CombatSystem {
  meleeEnabled: boolean;
  rangedEnabled: boolean;
  hitboxesVisible: boolean;
  cooldownMs: number;
  damageType: "physical" | "fire" | "ice" | "electric";
  statusEffects: string[];
}

export interface WorldSystem {
  terrainEnabled: boolean;
  propsCount: number;
  dayNightCycle: boolean;
  timeOfDay: number;
  weather: "clear" | "rain" | "storm" | "fog";
  waterEnabled: boolean;
}

export interface UISystem {
  menuBuilderEnabled: boolean;
  dragEditorEnabled: boolean;
  healthBar: boolean;
  minimap: boolean;
  inventoryUi: boolean;
  notifications: boolean;
}

export interface AudioSystem {
  musicTrack: string;
  zoneAudioEnabled: boolean;
  masterVolume: number;
}

export interface MultiplayerSystem {
  enabled: boolean;
  maxPlayers: number;
  syncPositions: boolean;
}

export interface OptimizationSystem {
  profilerEnabled: boolean;
  objectPooling: boolean;
  lodEnabled: boolean;
  fpsTarget: number;
}

export interface DevToolsSystem {
  debugConsole: boolean;
  showFps: boolean;
  showHitboxes: boolean;
}

export interface ExportSystem {
  publishSlug: string;
  shareableLink: string;
  embedCode: string;
}

export interface GameProjectData {
  version: number;
  activeSceneId: string;
  scenes: SceneDef[];
  state: GameState;
  checkpoints: Record<string, { x: number; y: number }>;
  respawn: { x: number; y: number };
  player: PlayerStats;
  enemies: EnemySystem;
  combat: CombatSystem;
  world: WorldSystem;
  ui: UISystem;
  audio: AudioSystem;
  multiplayer: MultiplayerSystem;
  optimization: OptimizationSystem;
  devtools: DevToolsSystem;
  export: ExportSystem;
  quests: { id: string; title: string; done: boolean }[];
  dialogue: { npc: string; line: string }[];
  achievements: string[];
  metadata: {
    templatesUsed: string[];
    lastSavedAt: number;
  };
}
