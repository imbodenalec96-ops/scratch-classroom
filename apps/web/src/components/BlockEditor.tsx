import React, { useState, useCallback, useRef } from "react";
import type { Block, BlockCategory } from "@scratch/shared";
import { BLOCK_DEFS, CATEGORIES, getBlockDef, type BlockDef, type BlockShape } from "../lib/blockDefinitions.ts";

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  disabledCategories?: BlockCategory[];
}

/* ── Helpers ── */
function uid(): string {
  return "b_" + Math.random().toString(36).slice(2, 11);
}

function darken(hex: string, pct: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - pct / 100;
  return `#${Math.round(r * f).toString(16).padStart(2, "0")}${Math.round(g * f).toString(16).padStart(2, "0")}${Math.round(b * f).toString(16).padStart(2, "0")}`;
}

function getBlockVisualPos(block: Block, allBlocks: Block[]): { x: number; y: number } {
  if (!block.parent) return { x: block.x || 20, y: block.y || 20 };
  const parent = allBlocks.find((b) => b.id === block.parent);
  if (!parent) return { x: block.x || 20, y: block.y || 20 };
  const parentPos = getBlockVisualPos(parent, allBlocks);
  const siblings = allBlocks.filter((b) => b.parent === block.parent);
  const idx = siblings.indexOf(block);
  const parentDef = getBlockDef(parent.type);
  const isC = parentDef?.shape === "c";
  return {
    x: isC ? parentPos.x + 16 : parentPos.x,
    y: parentPos.y + 40 + idx * 40,
  };
}

/* ── Render block label with embedded inputs ── */
function BlockLabel({
  def,
  block,
  onInputChange,
  isPalette,
}: {
  def: BlockDef;
  block?: Block;
  onInputChange?: (blockId: string, inputName: string, value: any) => void;
  isPalette?: boolean;
}) {
  const parts = def.label.split(/(\([A-Z_]+\))/);
  return (
    <span className="flex items-center gap-0.5 flex-wrap text-white font-bold text-[13px] leading-tight whitespace-nowrap select-none">
      {parts.map((part, i) => {
        const match = part.match(/^\(([A-Z_]+)\)$/);
        if (match && def.inputs) {
          const inputName = match[1];
          const inputDef = def.inputs.find((inp) => inp.name === inputName);
          if (!inputDef) return <span key={i}>{part}</span>;
          const value = block?.inputs[inputName]?.value ?? inputDef.default ?? "";
          if (isPalette) {
            return (
              <span key={i} className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-white/20 text-white text-[12px] min-w-[24px] text-center font-normal">
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
                onInputChange?.(block!.id, inputName, inputDef.type === "number" ? Number(e.target.value) : e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="inline-block w-14 px-1.5 py-0.5 mx-0.5 rounded bg-white/25 text-white text-[12px] text-center border-none outline-none focus:bg-white/35 focus:ring-1 focus:ring-white/50 font-normal"
            />
          );
        }
        if (part === "◇") {
          return (
            <span key={i} className="inline-block w-3 h-3 mx-0.5 border-2 border-white/60 rotate-45 rounded-[1px]" />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/* ── SVG Notch shapes ── */
const NOTCH_WIDTH = 14;
const NOTCH_HEIGHT = 4;

function TopNotch({ color }: { color: string }) {
  return (
    <div className="relative h-1" style={{ marginLeft: 14 }}>
      <div
        className="absolute bottom-0 rounded-t-sm"
        style={{ width: NOTCH_WIDTH, height: NOTCH_HEIGHT, backgroundColor: color }}
      />
    </div>
  );
}

function BottomBump({ color }: { color: string }) {
  return (
    <div className="relative h-1" style={{ marginLeft: 14 }}>
      <div
        className="absolute top-0 rounded-b-sm"
        style={{ width: NOTCH_WIDTH, height: NOTCH_HEIGHT, backgroundColor: color }}
      />
    </div>
  );
}

/* ── Block Shape Components ── */
function StackBlockShape({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div>
      <TopNotch color={color} />
      <div
        className="px-3 py-1.5 min-h-[34px] flex items-center"
        style={{
          backgroundColor: color,
          borderRadius: 4,
          borderTop: `2px solid ${darken(color, -15)}`,
          borderBottom: `2px solid ${darken(color, 20)}`,
          boxShadow: `0 1px 3px rgba(0,0,0,0.25)`,
        }}
      >
        {children}
      </div>
      <BottomBump color={color} />
    </div>
  );
}

function HatBlockShape({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="px-3 py-1.5 min-h-[34px] flex items-center"
        style={{
          backgroundColor: color,
          borderRadius: "16px 16px 4px 4px",
          borderTop: `2px solid ${darken(color, -15)}`,
          borderBottom: `2px solid ${darken(color, 20)}`,
          boxShadow: `0 1px 3px rgba(0,0,0,0.25)`,
        }}
      >
        {children}
      </div>
      <BottomBump color={color} />
    </div>
  );
}

function CBlockShape({ color, children, innerBlockCount }: { color: string; children: React.ReactNode; innerBlockCount: number }) {
  const minInnerH = Math.max(32, innerBlockCount * 40);
  return (
    <div>
      <TopNotch color={color} />
      <div
        className="px-3 py-1.5 min-h-[34px] flex items-center"
        style={{
          backgroundColor: color,
          borderRadius: "4px 4px 0 0",
          borderTop: `2px solid ${darken(color, -15)}`,
          boxShadow: `0 1px 3px rgba(0,0,0,0.25)`,
        }}
      >
        {children}
      </div>
      {/* C-block mouth */}
      <div className="flex">
        <div style={{ width: 16, backgroundColor: color, borderRight: `2px solid ${darken(color, 20)}` }} />
        <div
          style={{ flex: 1, minHeight: minInnerH, backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 2, margin: "2px 0" }}
          className="relative"
        >
          <div className="absolute left-0 top-1 h-1" style={{ marginLeft: 0 }}>
            <div className="rounded-b-sm" style={{ width: NOTCH_WIDTH, height: NOTCH_HEIGHT, backgroundColor: color }} />
          </div>
        </div>
      </div>
      {/* C-block bottom bar */}
      <div
        className="px-3 py-1 min-h-[12px]"
        style={{
          backgroundColor: color,
          borderRadius: "0 0 4px 4px",
          borderBottom: `2px solid ${darken(color, 20)}`,
        }}
      />
      <BottomBump color={color} />
    </div>
  );
}

function CapBlockShape({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div>
      <TopNotch color={color} />
      <div
        className="px-3 py-1.5 min-h-[34px] flex items-center"
        style={{
          backgroundColor: color,
          borderRadius: "4px 4px 12px 12px",
          borderTop: `2px solid ${darken(color, -15)}`,
          borderBottom: `2px solid ${darken(color, 20)}`,
          boxShadow: `0 1px 3px rgba(0,0,0,0.25)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ReporterBlockShape({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div
      className="px-3 py-1 min-h-[28px] flex items-center"
      style={{
        backgroundColor: color,
        borderRadius: 999,
        border: `2px solid ${darken(color, 20)}`,
        boxShadow: `0 1px 3px rgba(0,0,0,0.25)`,
      }}
    >
      {children}
    </div>
  );
}

function BooleanBlockShape({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div
      className="px-4 py-1 min-h-[28px] flex items-center"
      style={{
        backgroundColor: color,
        clipPath: "polygon(10px 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0% 50%)",
        boxShadow: `0 1px 3px rgba(0,0,0,0.25)`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Render a block with the correct shape ── */
function BlockShapeWrapper({
  def,
  children,
  innerBlockCount,
}: {
  def: BlockDef;
  children: React.ReactNode;
  innerBlockCount?: number;
}) {
  switch (def.shape) {
    case "hat":
      return <HatBlockShape color={def.color}>{children}</HatBlockShape>;
    case "c":
      return <CBlockShape color={def.color} innerBlockCount={innerBlockCount ?? 0}>{children}</CBlockShape>;
    case "cap":
      return <CapBlockShape color={def.color}>{children}</CapBlockShape>;
    case "reporter":
      return <ReporterBlockShape color={def.color}>{children}</ReporterBlockShape>;
    case "boolean":
      return <BooleanBlockShape color={def.color}>{children}</BooleanBlockShape>;
    default:
      return <StackBlockShape color={def.color}>{children}</StackBlockShape>;
  }
}

/* ── Workspace Block (draggable, editable) ── */
function WorkspaceBlock({
  block,
  def,
  allBlocks,
  onMove,
  onInputChange,
  onDelete,
  onSnap,
}: {
  block: Block;
  def: BlockDef;
  allBlocks: Block[];
  onMove: (id: string, x: number, y: number) => void;
  onInputChange: (blockId: string, inputName: string, value: any) => void;
  onDelete: (id: string) => void;
  onSnap: (dragId: string, targetId: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const vPos = getBlockVisualPos(block, allBlocks);
  const innerBlockCount = allBlocks.filter((b) => b.parent === block.id).length;

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.stopPropagation();
    setDragging(true);
    dragOffset.current = { x: e.clientX - vPos.x, y: e.clientY - vPos.y };

    const handleMouseMove = (me: MouseEvent) => {
      onMove(block.id, me.clientX - dragOffset.current.x, me.clientY - dragOffset.current.y);
    };
    const handleMouseUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      // Snap check
      const bx = block.x || 0;
      const by = block.y || 0;
      const tailBlocks = allBlocks.filter(
        (b) => b.id !== block.id && !allBlocks.some((o) => o.id !== block.id && o.parent === b.id)
      );
      let bestSnap: { id: string; dist: number } | null = null;
      for (const tail of tailBlocks) {
        const pos = getBlockVisualPos(tail, allBlocks);
        const snapY = pos.y + 40;
        const dist = Math.sqrt((bx - pos.x) ** 2 + (by - snapY) ** 2);
        if (dist < 60 && (!bestSnap || dist < bestSnap.dist)) {
          bestSnap = { id: tail.id, dist };
        }
      }
      if (bestSnap) onSnap(block.id, bestSnap.id);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className={`absolute select-none group block-enter ${dragging ? "z-50 opacity-75 scale-[1.02]" : "z-10"}`}
      style={{
        left: vPos.x,
        top: vPos.y,
        transition: dragging ? "none" : "left 0.15s ease, top 0.15s ease",
        cursor: dragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
    >
      <BlockShapeWrapper def={def} innerBlockCount={innerBlockCount}>
        <BlockLabel def={def} block={block} onInputChange={onInputChange} />
      </BlockShapeWrapper>
      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full text-[11px] font-bold text-white
                   opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg z-20"
      >
        ×
      </button>
    </div>
  );
}

/* ── Palette Block (template, draggable to workspace) ── */
function PaletteBlock({ def, onDragStart }: { def: BlockDef; onDragStart: (e: React.DragEvent, def: BlockDef) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, def)}
      className="cursor-grab active:cursor-grabbing hover:brightness-110 transition-all duration-100 hover:translate-x-1"
      title={def.hint}
    >
      <BlockShapeWrapper def={def}>
        <BlockLabel def={def} isPalette />
      </BlockShapeWrapper>
    </div>
  );
}

/* ─────────────────── MAIN COMPONENT ─────────────────── */
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
      // Auto-snap
      const tailBlocks = blocks.filter((b) => !blocks.some((other) => other.parent === b.id));
      let bestSnap: { id: string; dist: number } | null = null;
      for (const tail of tailBlocks) {
        const pos = getBlockVisualPos(tail, blocks);
        const snapY = pos.y + 40;
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - snapY) ** 2);
        if (dist < 60 && (!bestSnap || dist < bestSnap.dist)) {
          bestSnap = { id: tail.id, dist };
        }
      }
      if (bestSnap) {
        newBlock.parent = bestSnap.id;
        const parentPos = getBlockVisualPos(blocks.find((b) => b.id === bestSnap!.id)!, blocks);
        newBlock.x = parentPos.x;
        newBlock.y = parentPos.y + 40;
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
          b.id === blockId ? { ...b, inputs: { ...b.inputs, [inputName]: { type: "value", value } } } : b
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

  const enabledCategories = CATEGORIES.filter((c) => !disabledCategories.includes(c.id));

  return (
    <div className="flex h-full rounded-xl overflow-hidden border border-white/[0.06]">
      {/* ── Category Sidebar ── */}
      <div className="w-[72px] bg-[#1e1e3a] flex flex-col gap-0.5 p-1.5 overflow-y-auto border-r border-white/[0.06]">
        {enabledCategories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-[10px] font-semibold transition-all duration-150 ${
                isSelected
                  ? "text-white shadow-lg scale-105"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
              }`}
              style={{
                backgroundColor: isSelected ? cat.color : "transparent",
                boxShadow: isSelected ? `0 2px 12px ${cat.color}40` : undefined,
              }}
            >
              <span className="text-lg leading-none">{cat.icon}</span>
              <span className="leading-none">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Block Palette ── */}
      <div className="w-[240px] bg-[#1a1a30] border-r border-white/[0.06] p-3 overflow-y-auto">
        <div className="space-y-2">
          {categoryBlocks.map((def) => (
            <PaletteBlock key={def.type} def={def} onDragStart={handlePaletteDragStart} />
          ))}
          {categoryBlocks.length === 0 && (
            <p className="text-white/20 text-xs text-center py-4">No blocks available</p>
          )}
        </div>
      </div>

      {/* ── Workspace ── */}
      <div
        ref={workspaceRef}
        className="flex-1 relative overflow-auto"
        style={{
          backgroundColor: "#1a1a2e",
          backgroundImage: `
            radial-gradient(circle, rgba(100,100,180,0.08) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }}
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
              allBlocks={blocks}
              onMove={handleBlockMove}
              onInputChange={handleInputChange}
              onDelete={handleDeleteBlock}
              onSnap={handleSnapBlock}
            />
          );
        })}
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center text-3xl">
              🧩
            </div>
            <p className="text-white/20 text-sm font-medium">Drag blocks here to start coding</p>
            <p className="text-white/10 text-xs">Choose a category on the left, then drag blocks into this area</p>
          </div>
        )}
      </div>
    </div>
  );
}
