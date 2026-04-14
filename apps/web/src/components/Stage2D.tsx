import React, { useRef, useEffect, useCallback, useState } from "react";
import type { Sprite, StageSettings } from "@scratch/shared";
import {
  createRuntime, startGreenFlag, stepRuntime, stopRuntime,
  triggerKeyPress, triggerSpriteClick,
  type RuntimeEngine, type SpriteState,
} from "../lib/runtime.ts";

interface Props {
  sprites: Sprite[];
  stage: StageSettings;
  running: boolean;
  onSpriteMove?: (id: string, x: number, y: number) => void;
}

export default function Stage2D({ sprites, stage, running, onSpriteMove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef(0);
  const engineRef = useRef<RuntimeEngine | null>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [dragId, setDragId] = useState<string | null>(null);
  const spritesRef = useRef(sprites);
  spritesRef.current = sprites;

  // Get sprite state (runtime state when running, or sprite data when not)
  const getSpriteState = useCallback((sprite: Sprite): SpriteState | null => {
    const engine = engineRef.current;
    if (engine && engine.running) {
      return engine.sprites.get(sprite.id) ?? null;
    }
    return null;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = stage.width;
    const h = stage.height;
    canvas.width = w;
    canvas.height = h;

    // Clear
    ctx.fillStyle = stage.backgroundColor || "#0a0a1a";
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = "rgba(100,100,140,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Pen lines
    const engine = engineRef.current;
    if (engine) {
      for (const line of engine.penLines) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width;
        ctx.beginPath();
        ctx.moveTo(w / 2 + line.x1, h / 2 - line.y1);
        ctx.lineTo(w / 2 + line.x2, h / 2 - line.y2);
        ctx.stroke();
      }
    }

    // Draw sprites (sorted by layer)
    const sortedSprites = [...spritesRef.current].sort((a, b) => {
      const sa = engine?.sprites.get(a.id);
      const sb = engine?.sprites.get(b.id);
      return (sa?.layer ?? 0) - (sb?.layer ?? 0);
    });

    for (const sprite of sortedSprites) {
      const rs = engine?.running ? engine.sprites.get(sprite.id) : null;
      const visible = rs ? rs.visible : sprite.visible;
      if (!visible) continue;

      const sx = w / 2 + (rs?.x ?? sprite.x);
      const sy = h / 2 - (rs?.y ?? sprite.y);
      const rot = rs?.rotation ?? sprite.rotation;
      const scale = rs?.scale ?? sprite.scale;
      const size = 40 * scale;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(((rot - 90) * Math.PI) / 180);

      // Draw sprite body: costume image or colored box
      const colors = ["#4C97FF", "#9966FF", "#CF63CF", "#59C059", "#FF8C1A", "#FF6680"];
      const colorIdx = spritesRef.current.indexOf(sprite) % colors.length;
      const baseColor = colors[colorIdx];

      const costumeIdx = rs?.costumeIndex ?? sprite.costumeIndex;
      const costume = sprite.costumes[costumeIdx];
      let drewCostume = false;

      if (costume?.url) {
        let img = imageCache.current.get(costume.url);
        if (!img) {
          img = new Image();
          img.src = costume.url;
          imageCache.current.set(costume.url, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
          drewCostume = true;
        }
      }

      if (!drewCostume) {
        // Fallback: colored box
        ctx.shadowColor = baseColor + "40";
        ctx.shadowBlur = 12;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Direction indicator (small triangle at front)
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 3, -size / 8);
      ctx.lineTo(size / 3, size / 8);
      ctx.closePath();
      ctx.fill();

      // Sprite name
      ctx.rotate(-((rot - 90) * Math.PI) / 180); // un-rotate for text
      ctx.fillStyle = "white";
      ctx.font = `bold ${Math.max(8, 10 * scale)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(sprite.name.slice(0, 8), 0, 0);

      ctx.restore();

      // Speech bubble
      const sayText = rs?.sayText || "";
      if (sayText) {
        ctx.save();
        ctx.font = "12px system-ui, sans-serif";
        const tw = Math.min(ctx.measureText(sayText).width + 20, 160);
        const bx = sx + size / 2 + 4;
        const by = sy - size / 2 - 32;

        // Bubble shape
        ctx.fillStyle = "white";
        ctx.strokeStyle = "#c0c0c0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw, 26, 8);
        ctx.fill();
        ctx.stroke();

        // Tail
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.moveTo(bx + 8, by + 26);
        ctx.lineTo(bx + 4, by + 34);
        ctx.lineTo(bx + 16, by + 26);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#c0c0c0";
        ctx.beginPath();
        ctx.moveTo(bx + 8, by + 26);
        ctx.lineTo(bx + 4, by + 34);
        ctx.lineTo(bx + 16, by + 26);
        ctx.stroke();

        // Text
        ctx.fillStyle = "#333";
        ctx.textAlign = "left";
        ctx.fillText(sayText.slice(0, 20), bx + 8, by + 17);
        ctx.restore();
      }

      // Variable display
      if (rs && Object.keys(rs.variables).length > 0) {
        ctx.save();
        let vy = sy + size / 2 + 14;
        ctx.font = "10px system-ui, monospace";
        for (const [name, val] of Object.entries(rs.variables)) {
          ctx.fillStyle = "rgba(255,140,26,0.85)";
          const text = `${name}: ${val}`;
          const tw2 = ctx.measureText(text).width + 8;
          ctx.beginPath();
          ctx.roundRect(sx - tw2 / 2, vy - 10, tw2, 14, 3);
          ctx.fill();
          ctx.fillStyle = "white";
          ctx.textAlign = "center";
          ctx.fillText(text, sx, vy);
          vy += 16;
        }
        ctx.restore();
      }
    }

    // Center crosshair (subtle)
    ctx.strokeStyle = "rgba(120,120,160,0.15)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Coordinates label
    ctx.font = "9px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.textAlign = "left";
    ctx.fillText("(0, 0)", w / 2 + 4, h / 2 + 12);
  }, [stage, getSpriteState]);

  // Handle keyboard events for the runtime
  useEffect(() => {
    if (!running) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.keysPressed.add(e.key.toLowerCase());
      triggerKeyPress(engine, spritesRef.current, e.key.toLowerCase());
      // Map common key names
      if (e.key === " ") triggerKeyPress(engine, spritesRef.current, "space");
      if (e.key === "ArrowUp") triggerKeyPress(engine, spritesRef.current, "up arrow");
      if (e.key === "ArrowDown") triggerKeyPress(engine, spritesRef.current, "down arrow");
      if (e.key === "ArrowLeft") triggerKeyPress(engine, spritesRef.current, "left arrow");
      if (e.key === "ArrowRight") triggerKeyPress(engine, spritesRef.current, "right arrow");
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (engine) engine.keysPressed.delete(e.key.toLowerCase());
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [running]);

  // Start / stop runtime
  useEffect(() => {
    if (running) {
      const engine = createRuntime(sprites, stage.width, stage.height);
      engineRef.current = engine;
      startGreenFlag(engine, sprites);

      let lastTime = performance.now();
      const loop = (time: number) => {
        const dt = Math.min((time - lastTime) / 1000, 0.05);
        lastTime = time;
        stepRuntime(engine, spritesRef.current, dt);
        draw();
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
    } else {
      if (engineRef.current) {
        stopRuntime(engineRef.current);
        engineRef.current = null;
      }
      cancelAnimationFrame(animFrameRef.current);
      draw();
    }

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [running, sprites, stage, draw]);

  // Initial draw
  useEffect(() => { draw(); }, [draw]);

  // Preload costume images and redraw when loaded
  useEffect(() => {
    for (const sprite of sprites) {
      for (const costume of sprite.costumes) {
        if (costume.url && !imageCache.current.has(costume.url)) {
          const img = new Image();
          img.onload = () => draw();
          img.src = costume.url;
          imageCache.current.set(costume.url, img);
        }
      }
    }
  }, [sprites, draw]);

  // Handle mouse events
  const getMousePos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = stage.width / rect.width;
    const scaleY = stage.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX - stage.width / 2,
      y: -((e.clientY - rect.top) * scaleY - stage.height / 2),
    };
  }, [stage]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);
    const engine = engineRef.current;
    if (engine) {
      engine.mouseDown = true;
      engine.mouseX = x;
      engine.mouseY = y;
    }

    // Check if we clicked a sprite (iterate reverse for top-most first)
    for (const sprite of [...spritesRef.current].reverse()) {
      const rs = engine?.sprites.get(sprite.id);
      const sx = rs?.x ?? sprite.x;
      const sy = rs?.y ?? sprite.y;
      const sc = rs?.scale ?? sprite.scale;
      const size = 20 * sc;
      if (Math.abs(x - sx) < size && Math.abs(y - sy) < size) {
        if (running && engine) {
          triggerSpriteClick(engine, spritesRef.current, sprite.id);
        }
        setDragId(sprite.id);
        break;
      }
    }
  }, [running, getMousePos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);
    const engine = engineRef.current;
    if (engine) {
      engine.mouseX = x;
      engine.mouseY = y;
    }
    if (!dragId) return;
    // Dragging: update both sprite data AND runtime state
    onSpriteMove?.(dragId, Math.round(x), Math.round(y));
    if (engine) {
      const state = engine.sprites.get(dragId);
      if (state) { state.x = x; state.y = y; }
    }
    draw();
  }, [dragId, getMousePos, draw, onSpriteMove]);

  const handleMouseUp = useCallback(() => {
    const engine = engineRef.current;
    if (engine) engine.mouseDown = false;
    setDragId(null);
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-black">
      <canvas
        ref={canvasRef}
        width={stage.width}
        height={stage.height}
        className="block w-full h-auto cursor-pointer"
        style={{ imageRendering: "auto" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {running && (
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-emerald-500/80 text-white text-[10px] font-bold rounded-md">
          ▶ RUNNING
        </div>
      )}
    </div>
  );
}
