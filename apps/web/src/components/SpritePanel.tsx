import React, { useState } from "react";
import type { Sprite } from "@scratch/shared";

interface Props {
  sprites: Sprite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onEditCostume?: () => void;
  onOpenLibrary?: () => void;
  onEdit3DShape?: () => void;
}

export default function SpritePanel({ sprites, selectedId, onSelect, onAdd, onDelete, onRename, onDuplicate, onEditCostume, onOpenLibrary, onEdit3DShape }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleStartRename = (id: string, name: string) => { setEditingId(id); setEditName(name); };
  const handleFinishRename = () => { if (editingId && editName.trim()) onRename(editingId, editName.trim()); setEditingId(null); };

  const colors = ["#8b5cf6", "#6366f1", "#a78bfa", "#818cf8", "#c084fc", "#7c3aed"];

  return (
    <div className="bg-white/[0.04] rounded-xl border border-white/[0.06] p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">Sprites</h3>
        <button onClick={onAdd} className="text-xs py-1 px-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors">+ New</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {sprites.map((sprite, i) => (
          <div key={sprite.id} onClick={() => onSelect(sprite.id)}
            className={`relative group w-16 h-20 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-200
              ${selectedId === sprite.id ? "ring-2 ring-violet-400 bg-white/[0.08]" : "bg-white/[0.02] hover:bg-white/[0.06]"}`}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: colors[i % colors.length] }}>
              {sprite.costumes.length > 0 && sprite.costumes[sprite.costumeIndex]?.url ? (
                <img src={sprite.costumes[sprite.costumeIndex].url} alt={sprite.name} className="w-full h-full rounded-lg object-cover" />
              ) : sprite.name.slice(0, 2)}
            </div>
            {editingId === sprite.id ? (
              <input value={editName} onChange={(e) => setEditName(e.target.value)}
                onBlur={handleFinishRename} onKeyDown={(e) => e.key === "Enter" && handleFinishRename()}
                className="w-14 text-[10px] text-center bg-white/[0.06] border border-white/[0.08] rounded px-0.5 text-white" autoFocus />
            ) : (
              <span className="text-[10px] text-white/60 truncate w-14 text-center"
                onDoubleClick={() => handleStartRename(sprite.id, sprite.name)}>{sprite.name}</span>
            )}
            <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); onDuplicate(sprite.id); }}
                className="w-4 h-4 bg-violet-600 rounded-full text-[8px] text-white flex items-center justify-center">⧉</button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(sprite.id); }}
                className="w-4 h-4 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center">×</button>
            </div>
          </div>
        ))}
      </div>

      {/* Editor buttons */}
      <div className="flex gap-1.5 mt-2 pt-2 border-t border-white/[0.06]">
        {onEditCostume && (
          <button onClick={onEditCostume}
            className="flex-1 text-[10px] py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 border border-white/[0.06] transition-all">
            🎨 Paint
          </button>
        )}
        {onOpenLibrary && (
          <button onClick={onOpenLibrary}
            className="flex-1 text-[10px] py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 border border-white/[0.06] transition-all">
            📁 Library
          </button>
        )}
        {onEdit3DShape && (
          <button onClick={onEdit3DShape}
            className="flex-1 text-[10px] py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 border border-white/[0.06] transition-all">
            🧊 3D Shape
          </button>
        )}
      </div>
    </div>
  );
}
