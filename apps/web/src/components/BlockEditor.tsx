import React, { useState, useCallback, useRef } from "react";
import type { Block, BlockCategory } from "@scratch/shared";
import { BLOCK_DEFS, CATEGORIES, getBlockDef, type BlockDef } from "../lib/blockDefinitions.ts";

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  disabledCategories?: BlockCategory[];
}

export default function BlockEditor({ blocks, onChange, disabledCategories = [] }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<BlockCategory>("motion");
  const [dragBlock, setDragBlock] = useState<BlockDef | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const categoryBlocks = BLOCK_DEFS.filter(
    (b) => b.category === selectedCategory && !disabledCategories.includes(b.category)
  );

  const handlePaletteDragStart = useCallback((e: React.DragEvent, def: BlockDef) => {
    setDragBlock(def);
    e.dataTransfer.setData("text/plain", def.type);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleWorkspaceDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragBlock) return;
      const rect = workspaceRef.current?.getBoundingClientRect();
      const x = e.clientX - (rect?.left || 0);
      const y = e.clientY - (rect?.top || 0);

      const newBlock: Block = {
        id: uid(),
        type: dragBlock.type,
        category: dragBlock.category,
        inputs: Object.fromEntries(
          (dragBlock.inputs || []).map((inp) => [inp.name, { type: "value" as const, value: inp.default }])
        ),
        x,
        y,
      };

      // Auto-snap: find the closest tail block (no children) to snap below
      const tailBlocks = blocks.filter(b => !blocks.some(other => other.parent === b.id));
      let bestSnap: { id: string; dist: number } | null = null;
      for (const tail of tailBlocks) {
        const pos = getBlockVisualPos(tail, blocks);
        const snapY = pos.y + 36;
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - snapY) ** 2);
        if (dist < 80 && (!bestSnap || dist < bestSnap.dist)) {
          bestSnap = { id: tail.id, dist };
        }
      }
      if (bestSnap) {
        newBlock.parent = bestSnap.id;
        const parentPos = getBlockVisualPos(blocks.find(b => b.id === bestSnap!.id)!, blocks);
        newBlock.x = parentPos.x;
        newBlock.y = parentPos.y + 36;
      }

      onChange([...blocks, newBlock]);
      setDragBlock(null);
    },
    [dragBlock, blocks, onChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleBlockMove = useCallback(
    (id: string, x: number, y: number) => {
      onChange(blocks.map((b) => (b.id === id ? { ...b, x, y } : b)));
    },
    [blocks, onChange]
  );

  const handleInputChange = useCallback(
    (blockId: string, inputName: string, value: any) => {
      onChange(
        blocks.map((b) =>
          b.id === blockId
            ? { ...b, inputs: { ...b.inputs, [inputName]: { type: "value", value } } }
            : b
        )
      );
    },
    [blocks, onChange]
  );

  const handleDeleteBlock = useCallback(
    (id: string) => {
      onChange(blocks.filter((b) => b.id !== id && b.parent !== id));
    },
    [blocks, onChange]
  );

  const handleSnapBlock = useCallback(
    (dragId: string, targetId: string) => {
      onChange(blocks.map((b) => (b.id === dragId ? { ...b, parent: targetId } : b)));
    },
    [blocks, onChange]
  );

  return (
    <div className="flex h-full bg-[#0d0d1a] rounded-xl overflow-hidden border border-white/[0.06]">
      {/* Category tabs */}
      <div className="w-20 bg-black/40 flex flex-col gap-1 p-1 overflow-y-auto">
        {CATEGORIES.filter((c) => !disabledCategories.includes(c.id)).map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`text-xs py-2 px-1 rounded-lg font-medium transition-all duration-200 ${
              selectedCategory === cat.id ? "text-white scale-105" : "text-white/60 hover:text-white/80"
            }`}
            style={{ backgroundColor: selectedCategory === cat.id ? cat.color : "transparent" }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Block palette */}
      <div className="w-56 bg-white/[0.03] border-r border-white/[0.06] p-2 overflow-y-auto">
        <div className="space-y-1.5">
          {categoryBlocks.map((def) => (
            <div
              key={def.type}
              draggable
              onDragStart={(e) => handlePaletteDragStart(e, def)}
              className="px-3 py-2 rounded-lg text-white text-sm font-medium cursor-grab active:cursor-grabbing 
                         shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-150"
              style={{ backgroundColor: def.color }}
            >
              {formatLabel(def)}
            </div>
          ))}
        </div>
      </div>

      {/* Workspace */}
      <div
        ref={workspaceRef}
        className="flex-1 relative overflow-auto bg-[#1a1a2e]"
        style={{ backgroundImage: "radial-gradient(circle, #2a2a4a 1px, transparent 1px)", backgroundSize: "20px 20px" }}
        onDrop={handleWorkspaceDrop}
        onDragOver={handleDragOver}
      >
        {blocks.map((block) => {
          const def = getBlockDef(block.type);
          if (!def) return null;
          return (
            <WorkspaceBlock
              key={block.id}
              block={block}
              def={def}
              onMove={handleBlockMove}
              onInputChange={handleInputChange}
              onDelete={handleDeleteBlock}
              onSnap={handleSnapBlock}
              allBlocks={blocks}
            />
          );
        })}
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-white/20 text-lg">
            Drag blocks here to start coding
          </div>
        )}
      </div>
    </div>
  );
}

function WorkspaceBlock({
  block,
  def,
  onMove,
  onInputChange,
  onDelete,
  onSnap,
  allBlocks,
}: {
  block: Block;
  def: BlockDef;
  onMove: (id: string, x: number, y: number) => void;
  onInputChange: (blockId: string, inputName: string, value: any) => void;
  onDelete: (id: string) => void;
  onSnap: (dragId: string, targetId: string) => void;
  allBlocks: Block[];
}) {
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Calculate position: walk parent chain for accurate positioning
  const vPos = getBlockVisualPos(block, allBlocks);
  let posX = vPos.x;
  let posY = vPos.y;

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.stopPropagation();
    setDragging(true);
    dragOffset.current = { x: e.clientX - posX, y: e.clientY - posY };

    const handleMouseMove = (me: MouseEvent) => {
      onMove(block.id, me.clientX - dragOffset.current.x, me.clientY - dragOffset.current.y);
    };
    const handleMouseUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      // Check snapping — find closest tail block to snap below
      const tailBlocks = allBlocks.filter(b =>
        b.id !== block.id && !allBlocks.some(other => other.id !== block.id && other.parent === b.id)
      );
      let bestSnap: { id: string; dist: number } | null = null;
      const bx = block.x || 0;
      const by = block.y || 0;
      for (const tail of tailBlocks) {
        const pos = getBlockVisualPos(tail, allBlocks);
        const snapY = pos.y + 36;
        const dist = Math.sqrt((bx - pos.x) ** 2 + (by - snapY) ** 2);
        if (dist < 80 && (!bestSnap || dist < bestSnap.dist)) {
          bestSnap = { id: tail.id, dist };
        }
      }
      if (bestSnap) {
        onSnap(block.id, bestSnap.id);
      }
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className={`absolute select-none group ${dragging ? "z-50 opacity-80" : "z-10"}`}
      style={{ left: posX, top: posY, transition: dragging ? "none" : "left 0.1s, top 0.1s" }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-sm font-medium shadow-md
                    cursor-grab active:cursor-grabbing relative"
        style={{ backgroundColor: def.color, minWidth: 120 }}
      >
        <span className="whitespace-nowrap">{formatLabel(def)}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] leading-none
                     opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          ×
        </button>
      </div>
      {/* Input fields */}
      {def.inputs && def.inputs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 pl-2">
          {def.inputs.map((inp) => (
            <input
              key={inp.name}
              type={inp.type === "number" ? "number" : "text"}
              value={String(block.inputs[inp.name]?.value ?? inp.default ?? "")}
              onChange={(e) => onInputChange(block.id, inp.name, inp.type === "number" ? Number(e.target.value) : e.target.value)}
              className="w-16 px-1 py-0.5 text-xs bg-white/20 rounded border-none text-white text-center
                         focus:outline-none focus:ring-1 focus:ring-white/50"
              title={inp.name}
            />
          ))}
        </div>
      )}
      {/* Snap indicator */}
      <div className="w-4 h-2 rounded-b ml-3" style={{ backgroundColor: def.color, opacity: 0.6 }} />
    </div>
  );
}

// Walk parent chain to compute accurate visual position
function getBlockVisualPos(block: Block, allBlocks: Block[]): { x: number; y: number } {
  if (!block.parent) return { x: block.x || 0, y: block.y || 0 };
  const parent = allBlocks.find(b => b.id === block.parent);
  if (!parent) return { x: block.x || 0, y: block.y || 0 };
  const parentPos = getBlockVisualPos(parent, allBlocks);
  const siblings = allBlocks.filter(b => b.parent === block.parent);
  const idx = siblings.indexOf(block);
  return { x: parentPos.x, y: parentPos.y + 36 + idx * 36 };
}

function formatLabel(def: BlockDef): string {
  let label = def.label;
  if (def.inputs) {
    for (const inp of def.inputs) {
      label = label.replace(`(${inp.name})`, `[${inp.default}]`);
    }
  }
  return label;
}

// Simple unique ID generator
function uid(): string {
  return "b_" + Math.random().toString(36).slice(2, 11);
}
