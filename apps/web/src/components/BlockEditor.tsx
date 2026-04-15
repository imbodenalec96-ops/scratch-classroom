import React, { useState, useCallback, useRef, useEffect } from "react";
import type { Block, BlockCategory } from "@scratch/shared";
import {
  BLOCK_DEFS,
  CATEGORIES,
  getBlockDef,
  type BlockDef,
  type BlockShape,
} from "../lib/blockDefinitions.ts";

/* ─────────── Types & Helpers ─────────── */

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  disabledCategories?: BlockCategory[];
}

function uid(): string {
  return "b_" + Math.random().toString(36).slice(2, 11);
}

/* Height of a stack block row */
const BLOCK_H = 42;
const SNAP_RADIUS = 55;

/* Darken / lighten a hex colour */
function shade(hex: string, pct: number): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - pct / 100;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/* Get children of a block, sorted by their original drop order */
function getChildren(parentId: string, blocks: Block[]): Block[] {
  return blocks
    .filter((b) => b.parent === parentId)
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
}

/* Get all root blocks (no parent, or parent missing) */
function getRoots(blocks: Block[]): Block[] {
  const ids = new Set(blocks.map((b) => b.id));
  return blocks.filter((b) => !b.parent || !ids.has(b.parent));
}

/* Measure the rendered height of a block stack from a root */
function stackHeight(blockId: string, blocks: Block[]): number {
  const def = getBlockDef(blocks.find((b) => b.id === blockId)?.type || "");
  let h = BLOCK_H;
  if (def?.shape === "c") h += 20; // bottom bar
  const kids = getChildren(blockId, blocks);
  for (const kid of kids) {
    h += stackHeight(kid.id, blocks);
  }
  return h;
}

/* ─────────── Block Label (with embedded inputs) ─────────── */

function BlockLabel({
  def,
  block,
  onInputChange,
  isPalette,
}: {
  def: BlockDef;
  block?: Block;
  onInputChange?: (blockId: string, key: string, val: any) => void;
  isPalette?: boolean;
}) {
  const parts = def.label.split(/(\([A-Z_]+\))/);
  return (
    <span className="flex items-center gap-0.5 flex-wrap text-white font-bold text-[13px] leading-tight whitespace-nowrap select-none">
      {parts.map((part, i) => {
        const m = part.match(/^\(([A-Z_]+)\)$/);
        if (m && def.inputs) {
          const inputDef = def.inputs.find((inp) => inp.name === m[1]);
          if (!inputDef) return <span key={i}>{part}</span>;
          const value =
            block?.inputs[m[1]]?.value ?? inputDef.default ?? "";
          if (isPalette) {
            return (
              <span
                key={i}
                className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-black/20 text-white text-[12px] min-w-[26px] text-center font-semibold"
              >
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
                onInputChange?.(
                  block!.id,
                  m[1],
                  inputDef.type === "number"
                    ? Number(e.target.value)
                    : e.target.value
                );
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="inline-block w-14 px-1.5 py-0.5 mx-0.5 rounded-md bg-black/25 text-white text-[12px] text-center border border-white/10 outline-none focus:bg-black/35 focus:ring-1 focus:ring-white/40 font-semibold"
            />
          );
        }
        if (part === "◇") {
          return (
            <span
              key={i}
              className="inline-block w-3 h-3 mx-0.5 border-2 border-white/60 rotate-45 rounded-[1px]"
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/* ─────────── SVG Notch (Scratch connector) ─────────── */

function SvgNotch({ y, color }: { y: number; color: string }) {
  return (
    <svg
      className="absolute left-[12px]"
      style={{ top: y - 2 }}
      width="20"
      height="6"
      viewBox="0 0 20 6"
      fill="none"
    >
      <path d="M0 0 L4 0 L6 4 L14 4 L16 0 L20 0" fill={color} />
    </svg>
  );
}

/* ─────────── Block Shape Renderers ─────────── */

function renderBlockBody(
  def: BlockDef,
  children: React.ReactNode,
  innerContent?: React.ReactNode
) {
  const c = def.color;
  const light = shade(c, -12);
  const dark = shade(c, 22);

  switch (def.shape) {
    case "hat":
      return (
        <div className="relative">
          <div
            className="px-3 py-[7px] min-h-[36px] flex items-center rounded-t-[14px] rounded-b"
            style={{
              background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
              borderBottom: `3px solid ${dark}`,
              boxShadow: `0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 ${light}`,
            }}
          >
            {children}
          </div>
          {/* bottom notch */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="0" width="14" height="4" rx="1" fill={c} />
          </svg>
        </div>
      );

    case "stack":
      return (
        <div className="relative">
          {/* top notch cutout */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="2" width="14" height="4" rx="1" fill={c} />
          </svg>
          <div
            className="px-3 py-[7px] min-h-[36px] flex items-center rounded"
            style={{
              background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
              borderBottom: `3px solid ${dark}`,
              boxShadow: `0 2px 4px rgba(0,0,0,0.25), inset 0 1px 0 ${light}`,
            }}
          >
            {children}
          </div>
          {/* bottom notch */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="0" width="14" height="4" rx="1" fill={c} />
          </svg>
        </div>
      );

    case "c":
      return (
        <div className="relative">
          {/* top notch cutout */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="2" width="14" height="4" rx="1" fill={c} />
          </svg>
          {/* top bar */}
          <div
            className="px-3 py-[7px] min-h-[36px] flex items-center"
            style={{
              background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
              borderRadius: "4px 4px 0 0",
              boxShadow: `inset 0 1px 0 ${light}`,
            }}
          >
            {children}
          </div>
          {/* mouth - inner notch + child blocks go here */}
          <div className="flex">
            <div
              style={{
                width: 18,
                backgroundColor: c,
                borderRight: `2px solid ${dark}`,
                borderLeft: `2px solid ${light}`,
              }}
            />
            <div className="flex-1 min-h-[40px] bg-[#13132a] rounded-sm my-[2px] relative pl-0 py-1">
              {/* inner top notch */}
              <svg width="100%" height="6" className="block">
                <rect width="100%" height="6" fill="transparent" />
                <rect x="4" y="0" width="14" height="4" rx="1" fill={c} />
              </svg>
              {innerContent}
            </div>
          </div>
          {/* bottom bar */}
          <div
            className="px-3 py-[3px] min-h-[14px]"
            style={{
              backgroundColor: c,
              borderRadius: "0 0 4px 4px",
              borderBottom: `3px solid ${dark}`,
              borderLeft: `2px solid ${light}`,
            }}
          />
          {/* bottom notch */}
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="0" width="14" height="4" rx="1" fill={c} />
          </svg>
        </div>
      );

    case "cap":
      return (
        <div className="relative">
          <svg width="100%" height="6" className="block">
            <rect width="100%" height="6" fill="transparent" />
            <rect x="14" y="2" width="14" height="4" rx="1" fill={c} />
          </svg>
          <div
            className="px-3 py-[7px] min-h-[36px] flex items-center"
            style={{
              background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
              borderRadius: "4px 4px 14px 14px",
              borderBottom: `3px solid ${dark}`,
              boxShadow: `0 2px 4px rgba(0,0,0,0.25), inset 0 1px 0 ${light}`,
            }}
          >
            {children}
          </div>
        </div>
      );

    case "reporter":
      return (
        <div
          className="px-4 py-[5px] min-h-[28px] flex items-center"
          style={{
            background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
            borderRadius: 999,
            border: `2px solid ${dark}`,
            boxShadow: `0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 ${light}`,
          }}
        >
          {children}
        </div>
      );

    case "boolean":
      return (
        <div
          className="px-5 py-[5px] min-h-[28px] flex items-center"
          style={{
            background: `linear-gradient(180deg, ${light} 0%, ${c} 100%)`,
            clipPath:
              "polygon(12px 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0% 50%)",
            boxShadow: `0 1px 4px rgba(0,0,0,0.3)`,
          }}
        >
          {children}
        </div>
      );

    default:
      return (
        <div
          className="px-3 py-[7px] min-h-[36px] flex items-center rounded"
          style={{ backgroundColor: c }}
        >
          {children}
        </div>
      );
  }
}

/* ─────────── Recursive Block Stack Renderer ─────────── */
/* Renders a block + all its children as a visual column. This is the key
   difference from the old editor: child blocks are rendered INSIDE this
   component instead of as separate absolutely-positioned elements. */

function BlockStack({
  blockId,
  blocks,
  onInputChange,
  onDetach,
  onDelete,
}: {
  blockId: string;
  blocks: Block[];
  onInputChange: (blockId: string, key: string, val: any) => void;
  onDetach: (blockId: string) => void;
  onDelete: (blockId: string) => void;
}) {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const def = getBlockDef(block.type);
  if (!def) return null;

  const children = getChildren(block.id, blocks);

  /* For C-blocks, children render inside the mouth */
  const isCBlock = def.shape === "c";

  const innerContent = isCBlock ? (
    <div className="pl-1">
      {children.map((child) => (
        <BlockStack
          key={child.id}
          blockId={child.id}
          blocks={blocks}
          onInputChange={onInputChange}
          onDetach={onDetach}
          onDelete={onDelete}
        />
      ))}
      {children.length === 0 && (
        <div className="h-8 flex items-center pl-2">
          <span className="text-white/15 text-[10px] italic">drop blocks here</span>
        </div>
      )}
    </div>
  ) : null;

  /* For stack/hat blocks, children render below */
  const belowContent = !isCBlock ? (
    <>
      {children.map((child) => (
        <BlockStack
          key={child.id}
          blockId={child.id}
          blocks={blocks}
          onInputChange={onInputChange}
          onDetach={onDetach}
          onDelete={onDelete}
        />
      ))}
    </>
  ) : null;

  return (
    <div className="relative group/block">
      {/* The block body */}
      <div
        onDoubleClick={(e) => { e.stopPropagation(); onDetach(block.id); }}
        className="relative"
      >
        {renderBlockBody(
          def,
          <BlockLabel def={def} block={block} onInputChange={onInputChange} />,
          innerContent
        )}
        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(block.id);
          }}
          className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-red-500 hover:bg-red-400 rounded-full text-[10px] font-bold text-white opacity-0 group-hover/block:opacity-100 transition-opacity flex items-center justify-center shadow-lg z-20 leading-none"
        >
          ×
        </button>
      </div>
      {/* Children below (for non-C blocks) */}
      {belowContent}
    </div>
  );
}

/* ─────────── Draggable Root Stack ─────────── */

function DraggableStack({
  rootBlock,
  blocks,
  onMove,
  onInputChange,
  onDetach,
  onDelete,
  isDragTarget,
}: {
  rootBlock: Block;
  blocks: Block[];
  onMove: (id: string, x: number, y: number) => void;
  onInputChange: (blockId: string, key: string, val: any) => void;
  onDetach: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  isDragTarget: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      e.stopPropagation();
      e.preventDefault();
      setDragging(true);
      offset.current = {
        x: e.clientX - (rootBlock.x || 20),
        y: e.clientY - (rootBlock.y || 20),
      };

      const handleMove = (me: MouseEvent) => {
        onMove(
          rootBlock.id,
          me.clientX - offset.current.x,
          me.clientY - offset.current.y
        );
      };
      const handleUp = () => {
        setDragging(false);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [rootBlock.id, rootBlock.x, rootBlock.y, onMove]
  );

  return (
    <div
      className={`absolute select-none transition-shadow ${
        dragging ? "z-50 opacity-80" : "z-10"
      } ${isDragTarget ? "ring-2 ring-yellow-400/70 ring-offset-2 ring-offset-transparent rounded-lg" : ""}`}
      style={{
        left: rootBlock.x || 20,
        top: rootBlock.y || 20,
        transition: dragging ? "none" : "left 0.12s ease, top 0.12s ease",
        cursor: dragging ? "grabbing" : "grab",
        filter: isDragTarget ? "brightness(1.15)" : undefined,
      }}
      onMouseDown={handleMouseDown}
    >
      <BlockStack
        blockId={rootBlock.id}
        blocks={blocks}
        onInputChange={onInputChange}
        onDetach={onDetach}
        onDelete={onDelete}
      />
    </div>
  );
}

/* ─────────── Palette Block ─────────── */

function PaletteBlock({
  def,
  onDragStart,
}: {
  def: BlockDef;
  onDragStart: (e: React.DragEvent, def: BlockDef) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, def)}
      className="cursor-grab active:cursor-grabbing hover:brightness-110 transition-all duration-100 hover:translate-x-0.5"
      title={def.hint}
    >
      {renderBlockBody(
        def,
        <BlockLabel def={def} isPalette />
      )}
    </div>
  );
}

/* ─────────── Search bar for block palette ─────────── */

function PaletteSearch({
  search,
  onSearch,
}: {
  search: string;
  onSearch: (v: string) => void;
}) {
  return (
    <div className="px-2 pb-2 pt-1">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search blocks..."
        className="w-full px-2.5 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-xs text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN BLOCK EDITOR COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function BlockEditor({
  blocks,
  onChange,
  disabledCategories = [],
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<BlockCategory>("motion");
  const [paletteDragDef, setPaletteDragDef] = useState<BlockDef | null>(null);
  const [snapTarget, setSnapTarget] = useState<string | null>(null);
  const [paletteSearch, setPaletteSearch] = useState("");
  const workspaceRef = useRef<HTMLDivElement>(null);

  /* Which blocks show in the palette */
  const categoryBlocks = paletteSearch
    ? BLOCK_DEFS.filter(
        (b) =>
          !disabledCategories.includes(b.category) &&
          (b.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
            b.type.toLowerCase().includes(paletteSearch.toLowerCase()) ||
            b.hint?.toLowerCase().includes(paletteSearch.toLowerCase()))
      )
    : BLOCK_DEFS.filter(
        (b) =>
          b.category === selectedCategory &&
          !disabledCategories.includes(b.category)
      );

  /* Root blocks (no parent or orphaned) */
  const roots = getRoots(blocks);

  /* ── Palette -> Workspace drop ── */
  const handlePaletteDragStart = useCallback(
    (e: React.DragEvent, def: BlockDef) => {
      setPaletteDragDef(def);
      e.dataTransfer.setData("text/plain", def.type);
      e.dataTransfer.effectAllowed = "copy";
      // Ghost image
      const ghost = document.createElement("div");
      ghost.style.cssText =
        "position:absolute;top:-1000px;left:-1000px;padding:6px 12px;border-radius:6px;color:#fff;font-size:12px;font-weight:700;white-space:nowrap;";
      ghost.style.backgroundColor = def.color;
      ghost.textContent = def.label.replace(/\([A-Z_]+\)/g, "___");
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 30, 18);
      requestAnimationFrame(() => ghost.remove());
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";

      /* While dragging over workspace, highlight nearest snap target */
      if (paletteDragDef && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left + workspaceRef.current.scrollLeft;
        const my = e.clientY - rect.top + workspaceRef.current.scrollTop;

        let best: { id: string; dist: number } | null = null;
        for (const b of blocks) {
          const def = getBlockDef(b.type);
          // Can't snap to reporters/booleans
          if (def?.shape === "reporter" || def?.shape === "boolean") continue;
          // Find bottom of this block's stack
          const bx = b.parent ? 0 : b.x || 0;
          const by = b.parent ? 0 : b.y || 0;
          if (b.parent) continue; // only snap to root-level stacks for now
          // Estimate bottom y
          const sh = stackHeight(b.id, blocks);
          const snapX = bx;
          const snapY = by + sh;
          const dist = Math.sqrt((mx - snapX) ** 2 + (my - snapY) ** 2);
          if (dist < SNAP_RADIUS && (!best || dist < best.dist)) {
            best = { id: b.id, dist };
          }
        }
        setSnapTarget(best?.id ?? null);
      }
    },
    [paletteDragDef, blocks]
  );

  const handleWorkspaceDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!paletteDragDef) return;
      const rect = workspaceRef.current?.getBoundingClientRect();
      const scrollL = workspaceRef.current?.scrollLeft || 0;
      const scrollT = workspaceRef.current?.scrollTop || 0;
      const x = e.clientX - (rect?.left || 0) + scrollL;
      const y = e.clientY - (rect?.top || 0) + scrollT;

      const newBlock: Block = {
        id: uid(),
        type: paletteDragDef.type,
        category: paletteDragDef.category,
        inputs: Object.fromEntries(
          (paletteDragDef.inputs || []).map((inp) => [
            inp.name,
            { type: "value" as const, value: inp.default },
          ])
        ),
        x,
        y,
      };

      /* Try to snap to bottom of nearest stack */
      if (snapTarget) {
        // Find the deepest last child of the snap target stack
        let tail = snapTarget;
        while (true) {
          const kids = getChildren(tail, blocks);
          if (kids.length === 0) break;
          tail = kids[kids.length - 1].id;
        }
        newBlock.parent = tail;
        delete (newBlock as any).x;
        delete (newBlock as any).y;
      }

      onChange([...blocks, newBlock]);
      setPaletteDragDef(null);
      setSnapTarget(null);
    },
    [paletteDragDef, blocks, onChange, snapTarget]
  );

  const handleDragLeave = useCallback(() => {
    setSnapTarget(null);
  }, []);

  /* ── Block movement ── */
  const handleBlockMove = useCallback(
    (id: string, x: number, y: number) => {
      onChange(blocks.map((b) => (b.id === id ? { ...b, x, y } : b)));

      /* Live snap detection while dragging */
      let best: { id: string; dist: number } | null = null;
      for (const b of blocks) {
        if (b.id === id) continue;
        const def = getBlockDef(b.type);
        if (def?.shape === "reporter" || def?.shape === "boolean") continue;
        if (b.parent) continue;
        const sh = stackHeight(b.id, blocks);
        const bx = b.x || 0;
        const by = (b.y || 0) + sh;
        const dist = Math.sqrt((x - bx) ** 2 + (y - by) ** 2);
        if (dist < SNAP_RADIUS && (!best || dist < best.dist)) {
          best = { id: b.id, dist };
        }
      }
      setSnapTarget(best?.id ?? null);
    },
    [blocks, onChange]
  );

  /* ── Snap on mouse up (handled via move + effect) ── */
  /* This is triggered when a stack is dropped near another stack */
  const handleBlockMoveEnd = useCallback(
    (id: string) => {
      if (!snapTarget) return;
      // Find deepest tail of snap target
      let tail = snapTarget;
      while (true) {
        const kids = getChildren(tail, blocks);
        if (kids.length === 0) break;
        tail = kids[kids.length - 1].id;
      }
      // Reparent the dragged block under the tail
      onChange(
        blocks.map((b) => {
          if (b.id === id) {
            const { x, y, ...rest } = b;
            return { ...rest, parent: tail };
          }
          return b;
        })
      );
      setSnapTarget(null);
    },
    [snapTarget, blocks, onChange]
  );

  /* We need to detect mouseup on dragged stacks. Patch into DraggableStack
     via a ref-based approach: store a callback and call it on mouseup. */
  const moveEndRef = useRef(handleBlockMoveEnd);
  moveEndRef.current = handleBlockMoveEnd;

  /* Enhanced block move with mouseup snap */
  const handleBlockMoveWrapped = useCallback(
    (id: string, x: number, y: number) => {
      handleBlockMove(id, x, y);
    },
    [handleBlockMove]
  );

  /* Detach a block from its parent (double-click) */
  const handleDetach = useCallback(
    (blockId: string) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block?.parent) return;
      onChange(
        blocks.map((b) =>
          b.id === blockId
            ? { ...b, parent: undefined, x: (b.x || 100) + 40, y: (b.y || 100) + 30 }
            : b
        )
      );
    },
    [blocks, onChange]
  );

  const handleInputChange = useCallback(
    (blockId: string, inputName: string, value: any) => {
      onChange(
        blocks.map((b) =>
          b.id === blockId
            ? {
                ...b,
                inputs: {
                  ...b.inputs,
                  [inputName]: { type: "value", value },
                },
              }
            : b
        )
      );
    },
    [blocks, onChange]
  );

  const handleDeleteBlock = useCallback(
    (id: string) => {
      // Delete block and all descendants
      const toDelete = new Set<string>();
      const collectChildren = (bid: string) => {
        toDelete.add(bid);
        for (const b of blocks) {
          if (b.parent === bid) collectChildren(b.id);
        }
      };
      collectChildren(id);
      onChange(blocks.filter((b) => !toDelete.has(b.id)));
    },
    [blocks, onChange]
  );

  /* ── Workspace mouse-up listener (for snap completion) ── */
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const handler = () => {
      if (snapTarget) {
        // Find which root was being dragged - the one at the mouse position
        // We'll handle this in DraggableStack component instead
      }
    };
    el.addEventListener("mouseup", handler);
    return () => el.removeEventListener("mouseup", handler);
  }, [snapTarget]);

  const enabledCategories = CATEGORIES.filter(
    (c) => !disabledCategories.includes(c.id)
  );

  return (
    <div className="flex h-full rounded-xl overflow-hidden border border-white/[0.06] bg-[#12122a]">
      {/* ── Category Sidebar ── */}
      <div className="w-[68px] bg-[#16163a] flex flex-col gap-0.5 p-1 overflow-y-auto border-r border-white/[0.06] scrollbar-none">
        {enabledCategories.map((cat) => {
          const isSelected = selectedCategory === cat.id && !paletteSearch;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                setPaletteSearch("");
              }}
              className={`flex flex-col items-center gap-[2px] py-1.5 px-0.5 rounded-lg text-[9px] font-bold transition-all duration-100 ${
                isSelected
                  ? "text-white shadow-lg"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
              }`}
              style={{
                backgroundColor: isSelected ? cat.color : "transparent",
                boxShadow: isSelected
                  ? `0 2px 10px ${cat.color}50`
                  : undefined,
              }}
            >
              <span className="text-[15px] leading-none">{cat.icon}</span>
              <span className="leading-none tracking-tight">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Block Palette ── */}
      <div className="w-[230px] bg-[#161630] border-r border-white/[0.06] flex flex-col overflow-hidden">
        <PaletteSearch search={paletteSearch} onSearch={setPaletteSearch} />
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1.5 scrollbar-thin scrollbar-thumb-white/10">
          {categoryBlocks.map((def) => (
            <PaletteBlock
              key={def.type}
              def={def}
              onDragStart={handlePaletteDragStart}
            />
          ))}
          {categoryBlocks.length === 0 && (
            <p className="text-white/15 text-xs text-center py-6">
              {paletteSearch ? "No matches" : "No blocks"}
            </p>
          )}
        </div>
      </div>

      {/* ── Workspace ── */}
      <div
        ref={workspaceRef}
        className="flex-1 relative overflow-auto"
        style={{
          backgroundColor: "#141428",
          backgroundImage:
            "radial-gradient(circle, rgba(100,100,200,0.06) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
        onDrop={handleWorkspaceDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Snap indicator */}
        {snapTarget && (() => {
          const target = blocks.find((b) => b.id === snapTarget);
          if (!target || target.parent) return null;
          const sh = stackHeight(target.id, blocks);
          return (
            <div
              className="absolute z-40 pointer-events-none animate-pulse"
              style={{
                left: (target.x || 20) - 4,
                top: (target.y || 20) + sh - 4,
                width: 160,
                height: 8,
                background: "linear-gradient(90deg, #facc15, #f59e0b)",
                borderRadius: 4,
                boxShadow: "0 0 16px rgba(250,204,21,0.5)",
              }}
            />
          );
        })()}

        {roots.map((root) => (
          <DraggableStack
            key={root.id}
            rootBlock={root}
            blocks={blocks}
            onMove={(id, x, y) => {
              handleBlockMoveWrapped(id, x, y);
            }}
            onInputChange={handleInputChange}
            onDetach={handleDetach}
            onDelete={handleDeleteBlock}
            isDragTarget={snapTarget === root.id}
          />
        ))}

        {blocks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center text-3xl">
              🧩
            </div>
            <p className="text-white/20 text-sm font-medium">
              Drag blocks here to start coding
            </p>
            <p className="text-white/10 text-xs">
              Blocks snap together automatically when close
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
