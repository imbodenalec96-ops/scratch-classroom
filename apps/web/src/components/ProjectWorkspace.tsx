import React, { useState, useCallback, useEffect, useRef } from "react";
import type { Sprite, Asset, StageSettings, ProjectMode, Block, Shape3D } from "@scratch/shared";
import BlockEditor from "./BlockEditor.tsx";
import JSView from "./JSView.tsx";
import Stage2D from "./Stage2D.tsx";
import Stage3D from "./Stage3D.tsx";
import SpritePanel from "./SpritePanel.tsx";
import AssetManager from "./AssetManager.tsx";
import Timeline from "./Timeline.tsx";
import AIAssistant from "./AIAssistant.tsx";
import CostumeEditor from "./CostumeEditor.tsx";
import SpriteLibrary from "./SpriteLibrary.tsx";
import ShapeEditor3D from "./ShapeEditor3D.tsx";
import LessonsBrowser from "./LessonsBrowser.tsx";
import { api } from "../lib/api.ts";
import { getSocket } from "../lib/ws.ts";

interface Props {
  projectId?: string;
  aiEnabled?: boolean;
}

const DEFAULT_STAGE: StageSettings = {
  width: 480,
  height: 360,
  backgroundColor: "#0a0a1a",
};

const makeSprite = (name: string): Sprite => ({
  id: "s_" + Math.random().toString(36).slice(2, 8),
  name,
  x: 0, y: 0, rotation: 0, scale: 1, costumeIndex: 0,
  costumes: [], sounds: [], blocks: [], visible: true,
});

export default function ProjectWorkspace({ projectId, aiEnabled = true }: Props) {
  const [sprites, setSprites] = useState<Sprite[]>([makeSprite("Sprite1")]);
  const [selectedSpriteId, setSelectedSpriteId] = useState<string>(sprites[0].id);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stage, setStage] = useState<StageSettings>(DEFAULT_STAGE);
  const [mode, setMode] = useState<ProjectMode>("2d");
  const [running, setRunning] = useState(false);
  const [viewMode, setViewMode] = useState<"blocks" | "js">("blocks");
  const [showAssets, setShowAssets] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showCostumeEditor, setShowCostumeEditor] = useState(false);
  const [showSpriteLibrary, setShowSpriteLibrary] = useState(false);
  const [showShapeEditor, setShowShapeEditor] = useState(false);
  const [showLessons, setShowLessons] = useState(false);
  const [title, setTitle] = useState("Untitled Project");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autoSaveTimer = useRef<number>();
  const analyticsTimer = useRef<number>();
  const startTime = useRef(Date.now());

  const selectedSprite = sprites.find((s) => s.id === selectedSpriteId) || sprites[0];

  useEffect(() => {
    if (!projectId) return;
    api.getProject(projectId).then((proj) => {
      const data = typeof proj.data === "string" ? JSON.parse(proj.data) : proj.data;
      if (data.sprites?.length) setSprites(data.sprites);
      if (data.stage) setStage(data.stage);
      if (data.assets) setAssets(data.assets);
      setTitle(proj.title);
      setMode(proj.mode);
      if (data.sprites?.[0]) setSelectedSpriteId(data.sprites[0].id);
    }).catch(console.error);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !dirty) return;
    autoSaveTimer.current = window.setTimeout(() => { handleSave(); }, 30000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [dirty, sprites, stage, assets]);

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

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await api.saveProject(projectId, { data: { sprites, stage, assets }, title, mode });
      setDirty(false);
    } catch (e) { console.error("Save failed:", e); }
    setSaving(false);
  }, [projectId, sprites, stage, assets, title, mode]);

  const handleBlocksChange = useCallback((blocks: Block[]) => {
    setSprites((prev) => prev.map((s) => (s.id === selectedSpriteId ? { ...s, blocks } : s)));
    setDirty(true);
  }, [selectedSpriteId]);

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
    setSprites((prev) => prev.map((s) => s.id === selectedSpriteId ? { ...s, costumes: [...s.costumes, asset] } : s));
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

  return (
    <div className="h-screen flex flex-col bg-[#0a0a1a]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] backdrop-blur-sm">
        <a href="/" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">B</div>
          <span className="text-white/60 font-semibold text-sm hidden sm:inline">BlockForge</span>
        </a>

        <div className="w-px h-5 bg-white/[0.08]" />

        <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          className="bg-transparent border-none text-white font-medium text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50 rounded px-2 py-1 w-48" />

        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
          {(["2d", "3d"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs font-medium transition-all ${mode === m ? "bg-violet-600 text-white" : "text-white/40 hover:text-white/60"}`}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
          {(["blocks", "js"] as const).map((v) => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`px-3 py-1 text-xs font-medium transition-all ${viewMode === v ? "bg-violet-600 text-white" : "text-white/40 hover:text-white/60"}`}>
              {v === "blocks" ? "Blocks" : "JavaScript"}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button onClick={() => setShowTimeline(!showTimeline)}
          className="px-2.5 py-1 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border border-white/[0.06] transition-colors">
          {showTimeline ? "Hide Timeline" : "Timeline"}
        </button>
        <button onClick={() => setShowAssets(!showAssets)}
          className="px-2.5 py-1 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border border-white/[0.06] transition-colors">
          {showAssets ? "Hide Assets" : "Assets"}
        </button>
        <button onClick={() => setShowLessons(true)}
          className="px-2.5 py-1 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border border-white/[0.06] transition-colors">
          📖 Lessons
        </button>

        <button onClick={() => setRunning(!running)}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 ${
            running ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/25 shadow-lg" : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/25 shadow-lg"
          }`}>
          {running ? "⏹ Stop" : "▶ Run"}
        </button>

        <button onClick={handleSave} disabled={saving || !dirty}
          className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-500 transition-colors">
          {saving ? "Saving..." : dirty ? "Save ●" : "Saved ✓"}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 p-2">
            {viewMode === "blocks" ? (
              <BlockEditor blocks={selectedSprite?.blocks || []} onChange={handleBlocksChange} />
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
        <div className="w-[500px] flex flex-col border-l border-white/[0.06] p-2 gap-2 overflow-y-auto bg-white/[0.01]">
          {mode === "2d" ? (
            <Stage2D sprites={sprites} stage={stage} running={running} onSpriteMove={handleSpriteMove} />
          ) : (
            <Stage3D sprites={sprites} stage={stage} running={running} onSpriteMove={handleSpriteMove} onAddSprite={handleAdd3DSprite} />
          )}

          {/* Stage settings */}
          <div className="flex gap-2 items-center">
            <label className="text-xs text-white/40">BG:</label>
            <input type="color" value={stage.backgroundColor}
              onChange={(e) => setStage({ ...stage, backgroundColor: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer" />
            <label className="text-xs text-white/40">Size:</label>
            <input type="number" value={stage.width}
              onChange={(e) => setStage({ ...stage, width: Number(e.target.value) })}
              className="w-16 text-xs py-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 text-white" />
            <span className="text-xs text-white/20">×</span>
            <input type="number" value={stage.height}
              onChange={(e) => setStage({ ...stage, height: Number(e.target.value) })}
              className="w-16 text-xs py-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 text-white" />
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
        projectContext={`Project: ${title}, Mode: ${mode}, Sprites: ${sprites.map((s) => s.name).join(", ")}, Total blocks: ${sprites.reduce((n, s) => n + s.blocks.length, 0)}`}
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
    </div>
  );
}
