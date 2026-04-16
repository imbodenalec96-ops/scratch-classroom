import React, { useState } from "react";
import type { Sprite } from "@scratch/shared";
import { useTheme } from "../lib/theme.tsx";
import { Plus, Copy, Trash2, Paintbrush, Library, Box } from "lucide-react";

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
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleStartRename = (id: string, name: string) => { setEditingId(id); setEditName(name); };
  const handleFinishRename = () => {
    if (editingId && editName.trim()) onRename(editingId, editName.trim());
    setEditingId(null);
  };

  const COLORS = ["#8b5cf6", "#6366f1", "#a78bfa", "#818cf8", "#c084fc", "#7c3aed"];

  return (
    <div className={`rounded-xl border flex flex-col gap-0 overflow-hidden ${dk ? "bg-[#0f1028] border-white/[0.06]" : "bg-white border-gray-200"}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${dk ? "border-white/[0.05]" : "border-gray-100"}`}>
        <h3 className={`text-xs font-bold uppercase tracking-wider ${dk ? "text-white/50" : "text-gray-500"}`}>
          Sprites
        </h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-[11px] font-semibold py-1 px-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white transition-all active:scale-95 cursor-pointer"
        >
          <Plus size={11} />
          New
        </button>
      </div>

      {/* Sprite grid */}
      <div className="p-2">
        <div className="flex flex-wrap gap-2">
          {sprites.map((sprite, i) => (
            <div
              key={sprite.id}
              onClick={() => onSelect(sprite.id)}
              className={`relative group w-[62px] h-[72px] rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-200 ${
                selectedId === sprite.id
                  ? dk
                    ? "ring-2 ring-violet-400 bg-violet-500/15"
                    : "ring-2 ring-violet-400 bg-violet-50"
                  : dk
                    ? "bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05]"
                    : "bg-gray-50 hover:bg-gray-100 border border-gray-100"
              }`}
            >
              {/* Costume preview */}
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-md overflow-hidden"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              >
                {sprite.costumes.length > 0 && sprite.costumes[sprite.costumeIndex]?.url ? (
                  <img
                    src={sprite.costumes[sprite.costumeIndex].url}
                    alt={sprite.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  sprite.name.slice(0, 2)
                )}
              </div>

              {/* Name / rename input */}
              {editingId === sprite.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={(e) => e.key === "Enter" && handleFinishRename()}
                  className={`w-[54px] text-[10px] text-center rounded px-0.5 py-0.5 border outline-none focus:ring-1 focus:ring-violet-500/50 ${
                    dk
                      ? "bg-white/[0.08] border-white/[0.12] text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className={`text-[10px] truncate w-[54px] text-center leading-tight ${dk ? "text-white/55" : "text-gray-600"}`}
                  onDoubleClick={(e) => { e.stopPropagation(); handleStartRename(sprite.id, sprite.name); }}
                  title={`Double-click to rename ${sprite.name}`}
                >
                  {sprite.name}
                </span>
              )}

              {/* Hover actions */}
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onDuplicate(sprite.id); }}
                  className="w-5 h-5 bg-violet-600 hover:bg-violet-500 rounded-full flex items-center justify-center shadow cursor-pointer transition-colors"
                  title="Duplicate"
                >
                  <Copy size={9} className="text-white" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(sprite.id); }}
                  className="w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center shadow cursor-pointer transition-colors"
                  title="Delete"
                >
                  <Trash2 size={9} className="text-white" />
                </button>
              </div>

              {/* Selected indicator */}
              {selectedId === sprite.id && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-violet-400" />
              )}
            </div>
          ))}

          {sprites.length === 0 && (
            <div className={`w-full py-6 text-center ${dk ? "text-white/20" : "text-gray-400"}`}>
              <p className="text-2xl mb-1">👾</p>
              <p className="text-[10px]">Add a sprite to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* Editor buttons */}
      <div className={`flex gap-1.5 px-2 pb-2 pt-1 border-t ${dk ? "border-white/[0.05]" : "border-gray-100"}`}>
        {onEditCostume && (
          <button
            onClick={onEditCostume}
            className={`flex-1 flex items-center justify-center gap-1 text-[10.5px] font-medium py-1.5 rounded-lg border transition-all cursor-pointer ${
              dk
                ? "bg-white/[0.04] hover:bg-white/[0.08] text-white/45 hover:text-white/75 border-white/[0.05]"
                : "bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 border-gray-200"
            }`}
          >
            <Paintbrush size={11} />
            Paint
          </button>
        )}
        {onOpenLibrary && (
          <button
            onClick={onOpenLibrary}
            className={`flex-1 flex items-center justify-center gap-1 text-[10.5px] font-medium py-1.5 rounded-lg border transition-all cursor-pointer ${
              dk
                ? "bg-white/[0.04] hover:bg-white/[0.08] text-white/45 hover:text-white/75 border-white/[0.05]"
                : "bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 border-gray-200"
            }`}
          >
            <Library size={11} />
            Library
          </button>
        )}
        {onEdit3DShape && (
          <button
            onClick={onEdit3DShape}
            className={`flex-1 flex items-center justify-center gap-1 text-[10.5px] font-medium py-1.5 rounded-lg border transition-all cursor-pointer ${
              dk
                ? "bg-white/[0.04] hover:bg-white/[0.08] text-white/45 hover:text-white/75 border-white/[0.05]"
                : "bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 border-gray-200"
            }`}
          >
            <Box size={11} />
            3D Shape
          </button>
        )}
      </div>
    </div>
  );
}
