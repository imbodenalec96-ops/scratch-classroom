import React, { useEffect, useRef, useState, useCallback } from "react";

// Bridge builder — drag planks between anchor points to bridge a gap
// Simplified physics: check if connected path spans the gap, then "simulate" by counting stress

const W = 420, H = 380;

type Pt = { x: number; y: number; fixed: boolean };
type Plank = { a: number; b: number; stress: number };

const LEVELS: { label: string; anchors: Pt[]; carPath: number[]; goal: string }[] = [
  {
    label: "🌊 River Crossing",
    anchors: [
      // Left bank (fixed)
      { x: 40, y: 240, fixed: true }, { x: 80, y: 220, fixed: true }, { x: 80, y: 270, fixed: true },
      // Middle (free — bridge nodes)
      { x: 140, y: 210, fixed: false }, { x: 200, y: 210, fixed: false },
      { x: 260, y: 210, fixed: false }, { x: 320, y: 210, fixed: false },
      // Right bank (fixed)
      { x: 380, y: 220, fixed: true }, { x: 380, y: 270, fixed: true }, { x: 340, y: 240, fixed: true },
    ],
    carPath: [3, 4, 5, 6], // these nodes must all be connected in a chain for car to cross
    goal: "Connect all 4 middle nodes to span the river",
  },
  {
    label: "🏔️ Canyon Bridge",
    anchors: [
      { x: 30, y: 200, fixed: true }, { x: 70, y: 230, fixed: true },
      { x: 140, y: 220, fixed: false }, { x: 210, y: 220, fixed: false },
      { x: 280, y: 220, fixed: false },
      { x: 350, y: 230, fixed: true }, { x: 390, y: 200, fixed: true },
    ],
    carPath: [2, 3, 4],
    goal: "Span the canyon with 3 bridge nodes",
  },
  {
    label: "🌉 Double Gap",
    anchors: [
      { x: 20, y: 220, fixed: true }, { x: 60, y: 230, fixed: true },
      { x: 120, y: 215, fixed: false }, { x: 180, y: 215, fixed: false },
      { x: 210, y: 200, fixed: true }, // middle pillar
      { x: 240, y: 215, fixed: false }, { x: 300, y: 215, fixed: false },
      { x: 360, y: 230, fixed: true }, { x: 400, y: 220, fixed: true },
    ],
    carPath: [2, 3, 5, 6],
    goal: "Bridge both gaps using the middle pillar",
  },
];

function lineLen(pts: Pt[], a: number, b: number) {
  return Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
}

function isBridged(planks: Plank[], carPath: number[]): boolean {
  // Build adjacency from planks
  const adj: Map<number, Set<number>> = new Map();
  planks.forEach(({ a, b }) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b); adj.get(b)!.add(a);
  });
  // BFS from carPath[0] to carPath[last] passing through all carPath nodes
  for (let i = 0; i < carPath.length - 1; i++) {
    const src = carPath[i], dst = carPath[i + 1];
    const visited = new Set<number>(); const queue = [src];
    let found = false;
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === dst) { found = true; break; }
      if (visited.has(cur)) continue; visited.add(cur);
      (adj.get(cur) || []).forEach(n => queue.push(n));
    }
    if (!found) return false;
  }
  return true;
}

export default function BridgeBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [levelIdx, setLevelIdx] = useState(0);
  const [planks, setPlanks] = useState<Plank[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [hoverNode, setHoverNode] = useState<number | null>(null);
  const [tested, setTested] = useState(false);
  const [success, setSuccess] = useState(false);
  const dragStart = useRef<number | null>(null);

  const level = LEVELS[levelIdx];
  const pts = level.anchors;

  const getNearNode = useCallback((mx: number, my: number, canvas: HTMLCanvasElement): number | null => {
    const rect = canvas.getBoundingClientRect();
    const sx = (mx - rect.left) * (W / rect.width);
    const sy = (my - rect.top) * (H / rect.height);
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(pts[i].x - sx, pts[i].y - sy) < 22) return i;
    }
    return null;
  }, [pts]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);

    // Sky + ground
    ctx.fillStyle = "#bfdbfe"; ctx.fillRect(0, 0, W, H * 0.72);
    ctx.fillStyle = "#92400e"; ctx.fillRect(0, H * 0.72, W, H * 0.28);

    // Water / gap
    const leftX = 100, rightX = 340;
    ctx.fillStyle = "#38bdf8"; ctx.fillRect(leftX, H * 0.5, rightX - leftX, H * 0.22);

    // Banks
    ctx.fillStyle = "#a3e635"; ctx.fillRect(0, H * 0.6, leftX, H * 0.12);
    ctx.fillRect(rightX, H * 0.6, W - rightX, H * 0.12);

    // Planks
    planks.forEach(({ a, b, stress }) => {
      const sa = pts[a], sb = pts[b];
      const hue = tested ? (stress > 0.8 ? "#ef4444" : stress > 0.5 ? "#f97316" : "#4ade80") : "#d97706";
      ctx.strokeStyle = hue; ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
      // Wood grain
      ctx.strokeStyle = "#ffffffa0"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
    });

    // Nodes
    pts.forEach((pt, i) => {
      const isHover = hoverNode === i;
      const isDragSrc = dragging === i;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, isHover || isDragSrc ? 14 : 10, 0, Math.PI * 2);
      ctx.fillStyle = pt.fixed ? "#64748b" : isDragSrc ? "#7c3aed" : isHover ? "#a78bfa" : "#818cf8";
      ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke();
      if (pt.fixed) {
        ctx.fillStyle = "#fff"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center";
        ctx.fillText("⚓", pt.x, pt.y + 3.5); ctx.textAlign = "left";
      }
    });

    // Dragging line preview
    if (dragging !== null && hoverNode !== null && hoverNode !== dragging) {
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "#a78bfa90"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pts[dragging].x, pts[dragging].y);
      ctx.lineTo(pts[hoverNode].x, pts[hoverNode].y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Car (if success)
    if (success) {
      ctx.font = "28px serif"; ctx.fillText("🚗", pts[level.carPath[0]].x - 14, pts[level.carPath[0]].y - 20);
    }

    // HUD
    ctx.fillStyle = "#1e293b"; ctx.font = "bold 13px system-ui";
    ctx.fillText(`Planks: ${planks.length}`, 12, 22);
    ctx.fillStyle = "#64748b"; ctx.font = "12px system-ui";
    ctx.fillText(level.goal, 12, 40);
  }, [planks, pts, hoverNode, dragging, tested, success, level]);

  useEffect(() => { draw(); }, [draw]);

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const n = getNearNode(e.clientX, e.clientY, e.currentTarget);
    if (n !== null) { dragStart.current = n; setDragging(n); }
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const n = getNearNode(e.clientX, e.clientY, e.currentTarget);
    setHoverNode(n);
  };
  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragStart.current !== null) {
      const n = getNearNode(e.clientX, e.clientY, e.currentTarget);
      if (n !== null && n !== dragStart.current) {
        const a = dragStart.current, b = n;
        const exists = planks.some(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
        if (!exists && lineLen(pts, a, b) < 200) {
          setPlanks(prev => [...prev, { a, b, stress: Math.random() * 0.4 + 0.2 }]);
        }
      }
    }
    setDragging(null); dragStart.current = null; setTested(false); setSuccess(false);
  };

  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const t = e.touches[0]; const n = getNearNode(t.clientX, t.clientY, e.currentTarget);
    if (n !== null) { dragStart.current = n; setDragging(n); }
  };
  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const t = e.touches[0]; const n = getNearNode(t.clientX, t.clientY, e.currentTarget);
    setHoverNode(n);
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (dragStart.current !== null && hoverNode !== null && hoverNode !== dragStart.current) {
      const a = dragStart.current, b = hoverNode;
      const exists = planks.some(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
      if (!exists && lineLen(pts, a, b) < 200) {
        setPlanks(prev => [...prev, { a, b, stress: Math.random() * 0.4 + 0.2 }]);
      }
    }
    setDragging(null); dragStart.current = null; setTested(false); setSuccess(false);
  };

  const testBridge = () => {
    setTested(true);
    setSuccess(isBridged(planks, level.carPath));
  };

  const reset = () => { setPlanks([]); setTested(false); setSuccess(false); };

  const nextLevel = () => { setLevelIdx(i => (i + 1) % LEVELS.length); setPlanks([]); setTested(false); setSuccess(false); };

  const removeLastPlank = () => { setPlanks(p => p.slice(0, -1)); setTested(false); setSuccess(false); };

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#eff6ff" }}>
      <div className="flex gap-2 flex-wrap justify-center">
        {LEVELS.map((lv, i) => (
          <button key={i} onClick={() => { setLevelIdx(i); setPlanks([]); setTested(false); setSuccess(false); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${i === levelIdx ? "bg-blue-500 text-white border-blue-400" : "bg-white text-blue-600 border-blue-200"}`}
            style={{ touchAction: "manipulation" }}>{lv.label}</button>
        ))}
      </div>

      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border-2 border-blue-200 max-w-full"
        style={{ cursor: "pointer", touchAction: "none" }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      />

      {tested && (
        <div className={`px-4 py-2 rounded-xl font-bold text-center ${success ? "bg-green-100 text-green-700 border-2 border-green-300" : "bg-red-100 text-red-600 border-2 border-red-200"}`}>
          {success ? "🚗 Car crossed safely! Great bridge!" : "❌ Bridge incomplete — keep adding planks!"}
        </div>
      )}

      <div className="flex gap-2 flex-wrap justify-center">
        <button onClick={testBridge} className="bg-blue-500 text-white px-4 py-2 rounded-xl font-bold border-2 border-blue-400" style={{ touchAction: "manipulation" }}>🚗 Test Bridge</button>
        <button onClick={removeLastPlank} className="bg-amber-100 text-amber-700 px-4 py-2 rounded-xl font-bold border-2 border-amber-300" disabled={!planks.length} style={{ touchAction: "manipulation" }}>↩ Undo</button>
        <button onClick={reset} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl font-bold border-2 border-gray-200" style={{ touchAction: "manipulation" }}>🔄 Clear</button>
        {success && <button onClick={nextLevel} className="bg-green-500 text-white px-4 py-2 rounded-xl font-bold border-2 border-green-400" style={{ touchAction: "manipulation" }}>Next Level →</button>}
      </div>
      <p className="text-blue-400/60 text-xs">Drag between dots to place planks · connect the path · test!</p>
    </div>
  );
}
