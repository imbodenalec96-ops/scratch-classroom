import React, { useMemo, useState } from "react";
import type { GameProjectData } from "../lib/game/types.ts";
import {
  createTemplateGameData,
  ENVIRONMENT_PRESET_OPTIONS,
  GAME_TEMPLATE_OPTIONS,
  UNITY_TEMPLATE_OPTIONS,
  type EnvironmentPreset,
  type GameTemplate,
  type UnityTemplate,
} from "../lib/game/templates.ts";
import { blockCountFromSprites, estimateProjectSizeKb, performanceWarnings, respawnAtCheckpoint, setCheckpoint, withScene, removeScene } from "../lib/game/engine.ts";
import { saveGameProgress, loadGameProgress, clearGameProgress } from "../lib/game/storage.ts";

interface Props {
  projectId?: string;
  sprites: { blocks?: unknown[] }[];
  gameData: GameProjectData;
  onChange: (data: GameProjectData) => void;
  onApplyTemplateBlocks?: (template: GameTemplate) => void;
  onApplyUnityTemplate?: (template: UnityTemplate) => void;
  onApplyEnvironment?: (preset: EnvironmentPreset) => void;
  onClose: () => void;
}

export default function GameSystemsPanel({ projectId, sprites, gameData, onChange, onApplyTemplateBlocks, onApplyUnityTemplate, onApplyEnvironment, onClose }: Props) {
  const [sceneName, setSceneName] = useState("New Level");
  const [questText, setQuestText] = useState("");
  const [notif, setNotif] = useState("");

  const blockCount = useMemo(() => blockCountFromSprites(sprites), [sprites]);
  const sizeKb = useMemo(() => estimateProjectSizeKb({ sprites, gameData }), [sprites, gameData]);
  const warnings = useMemo(() => performanceWarnings(sizeKb, blockCount), [sizeKb, blockCount]);

  const applyTemplate = (t: GameTemplate) => {
    onChange(createTemplateGameData(t));
    onApplyTemplateBlocks?.(t);
    const templateEnvironment: Record<GameTemplate, EnvironmentPreset> = {
      platformer: "forest",
      fps: "city",
      rpg: "dojo",
      survival: "desert",
      racing: "space",
      water: "ocean",
    };
    onApplyEnvironment?.(templateEnvironment[t]);
    setNotif(`Applied ${t.toUpperCase()} template`);
  };

  const applyEnvironment = (preset: EnvironmentPreset) => {
    onApplyEnvironment?.(preset);
    setNotif(`Applied ${preset.toUpperCase()} environment`);
  };

  const saveLocal = () => {
    saveGameProgress(projectId, gameData);
    setNotif("Saved progress locally");
  };

  const loadLocal = () => {
    const loaded = loadGameProgress(projectId);
    if (loaded) {
      onChange(loaded);
      setNotif("Loaded saved progress");
    } else {
      setNotif("No saved progress found");
    }
  };

  const publishLink = useMemo(() => {
    const slug = gameData.export.publishSlug || `game-${(projectId || "playground").slice(-6)}`;
    return `${window.location.origin}/playground?published=${encodeURIComponent(slug)}`;
  }, [gameData.export.publishSlug, projectId]);

  const sectionCls = "card space-y-3";
  const inputCls = "input w-full text-xs py-1";
  const selectCls = "input text-xs py-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="ai-panel w-[980px] max-h-[88vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-t1 text-xl font-bold">Game Systems Builder</h2>
            <p className="text-t3 text-xs">Modular engine data + templates + checkpoints + publish flow</p>
          </div>
          <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">Close</button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-4">
          <section className={sectionCls}>
            <h3 className="text-t1 font-semibold">Scene Manager + States</h3>
            <div className="flex gap-2">
              <input value={sceneName} onChange={(e) => setSceneName(e.target.value)} className={inputCls} />
              <button onClick={() => onChange(withScene(gameData, sceneName || "Level"))} className="btn-primary text-xs px-2 py-1">Add Level</button>
            </div>
            <div className="space-y-1 max-h-32 overflow-auto scrollbar-thin">
              {gameData.scenes.map((s) => (
                <div key={s.id} className="list-row text-xs">
                  <button className={`text-left cursor-pointer ${gameData.activeSceneId === s.id ? "text-emerald-500" : "text-t2"}`} onClick={() => onChange({ ...gameData, activeSceneId: s.id })}>{s.name}</button>
                  <button onClick={() => onChange(removeScene(gameData, s.id))} className="text-red-400 cursor-pointer">Delete</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-t3 text-xs">State</span>
              <select value={gameData.state} onChange={(e) => onChange({ ...gameData, state: e.target.value as GameProjectData["state"] })} className="input text-xs py-1 w-auto">
                <option value="menu">menu</option><option value="playing">playing</option>
                <option value="paused">paused</option><option value="game_over">game over</option>
              </select>
            </div>
          </section>

          <section className={sectionCls}>
            <h3 className="text-t1 font-semibold">Save/Load + Checkpoints</h3>
            <div className="flex gap-2">
              <button onClick={saveLocal} className="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">Save</button>
              <button onClick={loadLocal} className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white cursor-pointer">Load</button>
              <button onClick={() => { clearGameProgress(projectId); setNotif("Cleared save slot"); }} className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-500 text-white cursor-pointer">Clear</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onChange(setCheckpoint(gameData, gameData.activeSceneId, 0, 0))} className="btn-secondary text-xs px-2 py-1">Set Checkpoint</button>
              <button onClick={() => { const p = respawnAtCheckpoint(gameData); setNotif(`Respawn at x:${p.x} y:${p.y}`); }} className="btn-secondary text-xs px-2 py-1">Test Respawn</button>
            </div>
            <p className="text-xs text-t3">Checkpoint in active scene: {gameData.checkpoints[gameData.activeSceneId] ? "set" : "none"}</p>
          </section>

          <section className={sectionCls}>
            <h3 className="text-t1 font-semibold">Player + Combat + Enemy AI</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="text-t2">Health <input type="number" value={gameData.player.health} onChange={(e) => onChange({ ...gameData, player: { ...gameData.player, health: Number(e.target.value) } })} className={`${inputCls} mt-1`} /></label>
              <label className="text-t2">Stamina <input type="number" value={gameData.player.stamina} onChange={(e) => onChange({ ...gameData, player: { ...gameData.player, stamina: Number(e.target.value) } })} className={`${inputCls} mt-1`} /></label>
              <label className="text-t2">Enemy AI
                <select value={gameData.enemies.aiState} onChange={(e) => onChange({ ...gameData, enemies: { ...gameData.enemies, aiState: e.target.value as GameProjectData["enemies"]["aiState"] } })} className={`${selectCls} mt-1`}>
                  <option value="idle">idle</option><option value="patrol">patrol</option>
                  <option value="chase">chase</option><option value="attack">attack</option>
                </select>
              </label>
              <label className="text-t2">Damage Type
                <select value={gameData.combat.damageType} onChange={(e) => onChange({ ...gameData, combat: { ...gameData.combat, damageType: e.target.value as GameProjectData["combat"]["damageType"] } })} className={`${selectCls} mt-1`}>
                  <option value="physical">physical</option><option value="fire">fire</option>
                  <option value="ice">ice</option><option value="electric">electric</option>
                </select>
              </label>
            </div>
          </section>

          <section className={sectionCls}>
            <h3 className="text-t1 font-semibold">World + UI + Audio</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-t2">
              {[
                { label: "Day/Night cycle", checked: gameData.world.dayNightCycle, onChange: (v: boolean) => onChange({ ...gameData, world: { ...gameData.world, dayNightCycle: v } }) },
                { label: "Water system", checked: gameData.world.waterEnabled, onChange: (v: boolean) => onChange({ ...gameData, world: { ...gameData.world, waterEnabled: v } }) },
                { label: "Minimap", checked: gameData.ui.minimap, onChange: (v: boolean) => onChange({ ...gameData, ui: { ...gameData.ui, minimap: v } }) },
                { label: "Notifications", checked: gameData.ui.notifications, onChange: (v: boolean) => onChange({ ...gameData, ui: { ...gameData.ui, notifications: v } }) },
                { label: "Show FPS", checked: gameData.devtools.showFps, onChange: (v: boolean) => onChange({ ...gameData, devtools: { ...gameData.devtools, showFps: v } }) },
                { label: "Show hitboxes", checked: gameData.devtools.showHitboxes, onChange: (v: boolean) => onChange({ ...gameData, devtools: { ...gameData.devtools, showHitboxes: v } }) },
              ].map((item) => (
                <label key={item.label} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={item.checked} onChange={(e) => item.onChange(e.target.checked)} className="accent-violet-500" />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 items-center text-xs">
              <span className="text-t3">Weather</span>
              <select value={gameData.world.weather} onChange={(e) => onChange({ ...gameData, world: { ...gameData.world, weather: e.target.value as GameProjectData["world"]["weather"] } })} className="input text-xs py-1 w-auto">
                <option value="clear">clear</option><option value="rain">rain</option>
                <option value="storm">storm</option><option value="fog">fog</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-t3">Environment presets</p>
              <div className="grid grid-cols-2 gap-2">
                {ENVIRONMENT_PRESET_OPTIONS.map((env) => (
                  <button key={env.id} onClick={() => applyEnvironment(env.id)}
                    className="rounded-xl border px-2 py-1.5 text-left text-xs transition-colors cursor-pointer"
                    style={{ background: "var(--bg-muted)", borderColor: env.color + "55" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)"}>
                    <div className="font-semibold text-t1">{env.label}</div>
                    <div className="text-[10px] text-t3">{env.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={sectionCls}>
            <h3 className="text-t1 font-semibold">Inventory, Quests, Templates</h3>
            <div className="flex gap-2">
              <button onClick={() => onChange({ ...gameData, player: { ...gameData.player, inventory: [...gameData.player.inventory, `item_${gameData.player.inventory.length + 1}`] } })} className="btn-secondary text-xs px-2 py-1">Add Item</button>
              <button onClick={() => onChange({ ...gameData, player: { ...gameData.player, inventory: gameData.player.inventory.slice(0, -1) } })} className="btn-secondary text-xs px-2 py-1">Drop Item</button>
            </div>
            <div className="text-xs text-t3">Inventory: {gameData.player.inventory.join(", ") || "empty"}</div>
            <div className="flex gap-2">
              <input value={questText} onChange={(e) => setQuestText(e.target.value)} placeholder="Quest title" className="input flex-1 text-xs py-1" />
              <button onClick={() => { if (!questText.trim()) return; onChange({ ...gameData, quests: [...gameData.quests, { id: `q_${Date.now()}`, title: questText.trim(), done: false }] }); setQuestText(""); }} className="btn-primary text-xs px-2 py-1">Add Quest</button>
            </div>
            {/* Unity 3D Templates */}
            <div className="rounded-xl p-2.5 space-y-2" style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)" }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold" style={{ color: "#22d3ee", letterSpacing: "0.08em", textTransform: "uppercase" }}>🎮 Unity 3D Templates</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(34,211,238,0.15)", color: "#22d3ee" }}>NEW</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {UNITY_TEMPLATE_OPTIONS.map((t) => (
                  <button key={t.id} onClick={() => { onApplyUnityTemplate?.(t.id); setNotif(`Loaded ${t.label} → Unity mode`); }}
                    className="rounded-xl px-2 py-2 text-left text-xs transition-all cursor-pointer hover:scale-[1.02]"
                    style={{ background: `${t.color}14`, border: `1px solid ${t.color}40` }}>
                    <div className="text-base mb-0.5">{t.icon}</div>
                    <div className="font-bold text-white text-[11px]">{t.label}</div>
                    <div className="text-[9px] leading-tight" style={{ color: "rgba(255,255,255,0.45)" }}>{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2D Game Templates */}
            <div className="text-[10px] font-semibold text-t3 mt-1">2D Game Templates</div>
            <div className="grid grid-cols-2 gap-2">
              {GAME_TEMPLATE_OPTIONS.map((template) => (
                <button key={template.id} onClick={() => applyTemplate(template.id)}
                  className="rounded-xl border border-blue-400/35 bg-blue-600/10 hover:bg-blue-500/20 px-2 py-1.5 text-left text-xs transition-colors cursor-pointer">
                  <div className="font-semibold text-t1">{template.label}</div>
                  <div className="text-[10px] text-t3">{template.description}</div>
                </button>
              ))}
            </div>
          </section>

          <section className={sectionCls}>
            <h3 className="text-t1 font-semibold">Publish + Optimization</h3>
            <div className="text-xs text-t3">Block count: {blockCount} | Project size: {sizeKb} KB</div>
            <div className="space-y-1">
              {warnings.length === 0 ? <p className="text-xs text-emerald-500">No performance warnings.</p> : warnings.map((w, i) => <p key={i} className="text-xs text-amber-500">{w}</p>)}
            </div>
            <input value={gameData.export.publishSlug} onChange={(e) => onChange({ ...gameData, export: { ...gameData.export, publishSlug: e.target.value } })} placeholder="publish-slug" className="input w-full text-xs py-1" />
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(publishLink); setNotif("Copied share link"); }} className="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">Copy Share Link</button>
              <button onClick={() => {
                const embed = `<iframe src='${publishLink}' width='960' height='540' style='border:0;'></iframe>`;
                onChange({ ...gameData, export: { ...gameData.export, shareableLink: publishLink, embedCode: embed } });
                navigator.clipboard.writeText(embed); setNotif("Copied embed code");
              }} className="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">Copy Embed</button>
            </div>
            <p className="text-[11px] text-t3">Setup guide: 1) Pick a template. 2) Configure scenes/states. 3) Build gameplay with blocks. 4) Test Play. 5) Publish.</p>
          </section>
        </div>

        <div className="px-5 pb-4 text-xs text-violet-400 min-h-5">{notif}</div>
      </div>
    </div>
  );
}
