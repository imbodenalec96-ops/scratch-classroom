import React, { useRef, useState, useCallback, useEffect } from "react";
import type { Asset } from "@scratch/shared";

interface Props {
  costume: Asset | null;
  onSave: (asset: Asset) => void;
  onClose: () => void;
}

type Tool = "brush" | "eraser" | "fill" | "line" | "rect" | "circle" | "text" | "picker";

const PALETTE = [
  "#000000", "#ffffff", "#ff0000", "#ff6600", "#ffcc00", "#33cc33",
  "#0099ff", "#6633ff", "#ff33cc", "#993300", "#666666", "#cccccc",
  "#ff9999", "#ffcc99", "#ffffcc", "#ccffcc", "#99ccff", "#cc99ff",
  "#ff99cc", "#ffcccc", "#4C97FF", "#9966FF", "#CF63CF", "#59C059",
  "#FFAB19", "#FF6680", "#5CB1D6", "#8b5cf6", "#6366f1", "#ec4899",
];

const TOOL_ICONS: Record<Tool, string> = {
  brush: "✏️", eraser: "🧹", fill: "🪣", line: "╱",
  rect: "▢", circle: "◯", text: "T", picker: "💧",
};

export default function CostumeEditor({ costume, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#4C97FF");
  const [brushSize, setBrushSize] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [textInput, setTextInput] = useState("");
  const canvasSize = 240;

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    if (costume?.url) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.fillStyle = "transparent";
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
        saveUndo();
      };
      img.src = costume.url;
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasSize, canvasSize);
      // Default smiley
      ctx.fillStyle = "#4C97FF";
      ctx.beginPath();
      ctx.arc(120, 120, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(100, 105, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(140, 105, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(120, 125, 25, 0.2, Math.PI - 0.2);
      ctx.stroke();
      saveUndo();
    }
  }, []);

  const saveUndo = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvasSize, canvasSize);
    setUndoStack(prev => [...prev.slice(-20), data]);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length < 2) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const newStack = [...undoStack];
    newStack.pop();
    const prev = newStack[newStack.length - 1];
    if (prev) ctx.putImageData(prev, 0, 0);
    setUndoStack(newStack);
  }, [undoStack]);

  const clear = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    saveUndo();
  }, [saveUndo]);

  const getPos = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = canvasSize / rect.width;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
  }, []);

  const floodFill = useCallback((startX: number, startY: number, fillColor: string) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    const data = imageData.data;
    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    const startIdx = (sy * canvasSize + sx) * 4;
    const sr = data[startIdx], sg = data[startIdx + 1], sb = data[startIdx + 2];

    // Parse fill color
    const tmp = document.createElement("canvas").getContext("2d")!;
    tmp.fillStyle = fillColor;
    tmp.fillRect(0, 0, 1, 1);
    const fc = tmp.getImageData(0, 0, 1, 1).data;

    if (sr === fc[0] && sg === fc[1] && sb === fc[2]) return;

    const stack = [[sx, sy]];
    const visited = new Set<number>();
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cx >= canvasSize || cy < 0 || cy >= canvasSize) continue;
      const idx = (cy * canvasSize + cx) * 4;
      if (visited.has(idx)) continue;
      if (Math.abs(data[idx] - sr) > 30 || Math.abs(data[idx + 1] - sg) > 30 || Math.abs(data[idx + 2] - sb) > 30) continue;
      visited.add(idx);
      data[idx] = fc[0]; data[idx + 1] = fc[1]; data[idx + 2] = fc[2]; data[idx + 3] = 255;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  const drawAt = useCallback((x: number, y: number, prevX?: number, prevY?: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    if (tool === "brush" || tool === "eraser") {
      ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (prevX !== undefined && prevY !== undefined) {
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.1, y + 0.1);
      }
      ctx.stroke();
    }
  }, [tool, color, brushSize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getPos(e);
    setDrawing(true);
    setLastPos(pos);

    if (tool === "fill") {
      floodFill(pos.x, pos.y, color);
      saveUndo();
      return;
    }
    if (tool === "picker") {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        const pixel = ctx.getImageData(Math.floor(pos.x), Math.floor(pos.y), 1, 1).data;
        setColor(`#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`);
      }
      return;
    }
    if (tool === "text") {
      const text = textInput || "Hello";
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.fillStyle = color;
        ctx.font = `bold ${brushSize * 4}px system-ui, sans-serif`;
        ctx.fillText(text, pos.x, pos.y);
        saveUndo();
      }
      return;
    }

    drawAt(pos.x, pos.y);
  }, [tool, color, brushSize, getPos, drawAt, floodFill, saveUndo, textInput]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing || !lastPos) return;
    const pos = getPos(e);

    if (tool === "brush" || tool === "eraser") {
      drawAt(pos.x, pos.y, lastPos.x, lastPos.y);
      setLastPos(pos);
    }
  }, [drawing, lastPos, tool, getPos, drawAt]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawing) return;
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");

    if (ctx && lastPos) {
      if (tool === "line") {
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (tool === "rect") {
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.strokeRect(lastPos.x, lastPos.y, pos.x - lastPos.x, pos.y - lastPos.y);
      } else if (tool === "circle") {
        const rx = Math.abs(pos.x - lastPos.x) / 2;
        const ry = Math.abs(pos.y - lastPos.y) / 2;
        const cx = (lastPos.x + pos.x) / 2;
        const cy = (lastPos.y + pos.y) / 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    setDrawing(false);
    setLastPos(null);
    saveUndo();
  }, [drawing, lastPos, tool, color, brushSize, getPos, saveUndo]);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave({
      id: costume?.id || "c_" + Math.random().toString(36).slice(2, 8),
      name: costume?.name || "costume1",
      url: dataUrl,
      type: "image",
    });
  }, [costume, onSave]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#12122a] rounded-2xl border border-white/[0.08] shadow-2xl w-[600px] max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-white font-bold text-sm">🎨 Costume Editor</h2>
          <div className="flex gap-2">
            <button onClick={undo} className="px-2.5 py-1 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border border-white/[0.06]">
              ↩ Undo
            </button>
            <button onClick={clear} className="px-2.5 py-1 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border border-white/[0.06]">
              🗑 Clear
            </button>
            <button onClick={handleSave} className="px-3 py-1 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-500 font-medium">
              ✓ Save Costume
            </button>
            <button onClick={onClose} className="px-2 py-1 text-xs rounded-lg text-white/40 hover:text-white/70">✕</button>
          </div>
        </div>

        <div className="flex">
          {/* Tools sidebar */}
          <div className="w-14 bg-black/30 border-r border-white/[0.06] p-2 flex flex-col gap-1.5">
            {(Object.entries(TOOL_ICONS) as [Tool, string][]).map(([t, icon]) => (
              <button key={t} onClick={() => setTool(t)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm transition-all
                  ${tool === t ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30" : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]"}`}
                title={t.charAt(0).toUpperCase() + t.slice(1)}>
                {icon}
              </button>
            ))}
          </div>

          {/* Canvas */}
          <div className="flex-1 p-4 flex flex-col items-center gap-3">
            <div className="bg-white rounded-lg shadow-lg" style={{ width: canvasSize, height: canvasSize }}>
              <canvas ref={canvasRef} width={canvasSize} height={canvasSize}
                className="block cursor-crosshair rounded-lg"
                style={{ width: canvasSize, height: canvasSize }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { setDrawing(false); setLastPos(null); }} />
            </div>

            {/* Brush size */}
            <div className="flex items-center gap-2 w-full max-w-[240px]">
              <span className="text-xs text-white/40 w-10">Size:</span>
              <input type="range" min={1} max={30} value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                className="flex-1 accent-violet-500" />
              <span className="text-xs text-white/60 w-6 text-right">{brushSize}</span>
            </div>

            {/* Text input (for text tool) */}
            {tool === "text" && (
              <input value={textInput} onChange={e => setTextInput(e.target.value)}
                placeholder="Type text here..."
                className="w-full max-w-[240px] text-xs py-1.5 px-3 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white" />
            )}
          </div>

          {/* Color palette */}
          <div className="w-24 bg-black/30 border-l border-white/[0.06] p-2 flex flex-col gap-2">
            <span className="text-[10px] text-white/40 font-medium">Color</span>
            <div className="w-10 h-10 rounded-lg border-2 border-white/20 mx-auto" style={{ backgroundColor: color }} />
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-full h-6 rounded cursor-pointer" />
            <div className="grid grid-cols-3 gap-1 mt-1">
              {PALETTE.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-md border transition-all ${color === c ? "border-white scale-110" : "border-white/10 hover:border-white/30"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
