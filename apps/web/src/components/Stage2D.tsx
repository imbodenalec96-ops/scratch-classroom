import React, { useRef, useEffect, useCallback, useState } from "react";
import type { Sprite, StageSettings } from "@scratch/shared";
import {
  createRuntime, startGreenFlag, stepRuntime, stopRuntime,
  triggerKeyPress, triggerSpriteClick, triggerStageClick, answerAsk,
  type RuntimeEngine, type SpriteState,
} from "../lib/runtime.ts";

interface Props {
  sprites: Sprite[];
  stage: StageSettings;
  running: boolean;
  selectedSpriteId?: string;
  onRunningChange?: (running: boolean) => void;
  onSpriteMove?: (id: string, x: number, y: number) => void;
}

export default function Stage2D({ sprites, stage, running, selectedSpriteId, onRunningChange, onSpriteMove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef(0);
  const engineRef = useRef<RuntimeEngine | null>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const stageBackdropRef = useRef<{ key: string; img: HTMLImageElement | null }>({ key: "", img: null });
  const [askAnswer, setAskAnswer] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
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
    const rect = canvas.getBoundingClientRect();
    const displayW = Math.max(1, Math.round(rect.width || w));
    const displayH = Math.max(1, Math.round(rect.height || h));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const targetW = Math.round(displayW * dpr);
    const targetH = Math.round(displayH * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    // Keep all drawing in logical stage units while using a high-res backing store.
    ctx.setTransform(targetW / w, 0, 0, targetH / h, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const engine = engineRef.current;
    const runtimeBackdropColor = typeof engine?.globalVariables["stage_backdrop_color"] === "string"
      ? String(engine.globalVariables["stage_backdrop_color"])
      : null;
    const runtimeBackdropImage = typeof engine?.globalVariables["stage_backdrop_image"] === "string"
      ? String(engine.globalVariables["stage_backdrop_image"])
      : null;
    const backdropImageUrl = runtimeBackdropImage || stage.backgroundImage || "";

    // Clear with backdrop color
    ctx.fillStyle = runtimeBackdropColor || stage.backgroundColor || "#0a0a1a";
    ctx.fillRect(0, 0, w, h);

    // Draw stage backdrop image if present.
    if (backdropImageUrl) {
      if (stageBackdropRef.current.key !== backdropImageUrl) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => draw();
        img.src = backdropImageUrl;
        stageBackdropRef.current = { key: backdropImageUrl, img };
      }
      const backdropImg = stageBackdropRef.current.img;
      if (backdropImg && backdropImg.complete && backdropImg.naturalWidth > 0) {
        ctx.drawImage(backdropImg, 0, 0, w, h);
      }
    }

    // Subtle grid
    ctx.strokeStyle = "rgba(100,100,140,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Pen lines
    if (engine) {
      for (const stamp of engine.stampImages) {
        if (!stamp.costumeUrl) continue;
        let img = imageCache.current.get(stamp.costumeUrl);
        if (!img) {
          img = new Image();
          img.onload = () => draw();
          img.onerror = () => {
            imageCache.current.delete(stamp.costumeUrl);
            draw();
          };
          img.src = stamp.costumeUrl;
          imageCache.current.set(stamp.costumeUrl, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.translate(w / 2 + stamp.x, h / 2 - stamp.y);
          ctx.rotate(((stamp.rotation - 90) * Math.PI) / 180);
          ctx.drawImage(img, -stamp.size / 2, -stamp.size / 2, stamp.size, stamp.size);
          ctx.restore();
        }
      }
      for (const line of engine.penLines) {
        const anyLine = line as any;
        if (anyLine.text) {
          // Pen+ text rendering
          ctx.fillStyle = line.color;
          ctx.font = `${line.width}px sans-serif`;
          ctx.fillText(anyLine.text, w / 2 + line.x1, h / 2 - line.y1);
        } else {
          ctx.strokeStyle = line.color;
          ctx.lineWidth = line.width;
          ctx.beginPath();
          ctx.moveTo(w / 2 + line.x1, h / 2 - line.y1);
          ctx.lineTo(w / 2 + line.x2, h / 2 - line.y2);
          ctx.stroke();
        }
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
      const isEnvironmentLayer = sprite.id.startsWith("env_");

      const sx = w / 2 + (rs?.x ?? sprite.x);
      const sy = h / 2 - (rs?.y ?? sprite.y);
      const rot = rs?.rotation ?? sprite.rotation;
      const scale = rs?.scale ?? sprite.scale;
      const rotationStyle = isEnvironmentLayer ? "don't rotate" : (rs?.rotationStyle ?? "all around");
      const size = 40 * scale;

      ctx.save();
      ctx.translate(sx, sy);

      // ── Scratch visual effects ──────────────────────────────────────
      const effects = rs?.effects ?? {};
      // ghost effect: reduce opacity (0 = fully visible, 100 = invisible)
      const ghostVal = Number(effects["ghost"] ?? 0);
      ctx.globalAlpha = (rs?.opacity ?? 1) * (1 - Math.min(100, Math.max(0, ghostVal)) / 100);
      // Build CSS filter string for color/brightness/fisheye/whirl/mosaic/pixelate
      const filterParts: string[] = [];
      const colorVal = Number(effects["color"] ?? 0);
      if (colorVal !== 0) filterParts.push(`hue-rotate(${(colorVal / 200) * 360}deg)`);
      const brightnessVal = Number(effects["brightness"] ?? 0);
      if (brightnessVal !== 0) filterParts.push(`brightness(${1 + brightnessVal / 100})`);
      // fisheye: approximate with blur+saturate combo since CSS can't do barrel distortion
      const fisheyeVal = Number(effects["fisheye"] ?? 0);
      if (fisheyeVal > 0) {
        filterParts.push(`saturate(${1 + fisheyeVal / 100})`);
        // draw scaled up slightly to simulate bulge
        ctx.scale(1 + fisheyeVal * 0.004, 1 + fisheyeVal * 0.004);
      }
      // whirl: approximate with rotation overlay on the sprite transform
      const whirlVal = Number(effects["whirl"] ?? 0);
      if (whirlVal !== 0) ctx.rotate((whirlVal / 100) * Math.PI * 0.5);
      if (filterParts.length > 0) ctx.filter = filterParts.join(" ");

      // Glow effect
      if (effects["__glow_color"]) {
        ctx.shadowColor = rs?.penColor || "#ffcc00";
        ctx.shadowBlur = Number(effects["__glow_size"] || 15);
      }

      if (rotationStyle === "left-right") {
        ctx.scale(rot < 0 ? -1 : 1, 1);
      } else if (rotationStyle !== "don't rotate") {
        ctx.rotate(((rot - 90) * Math.PI) / 180);
      }

      // Draw sprite body: costume image or colored box
      const colors = ["#4C97FF", "#9966FF", "#CF63CF", "#59C059", "#FF8C1A", "#FF6680"];
      const colorIdx = spritesRef.current.indexOf(sprite) % colors.length;
      const baseColor = colors[colorIdx];

      const costumeIdx = rs?.costumeIndex ?? sprite.costumeIndex;
      const costume = sprite.costumes[costumeIdx];
      let drewCostume = false;

      // mosaic/pixelate: draw to offscreen canvas at reduced resolution, then stretch back
      const mosaicVal = Number(effects["mosaic"] ?? 0);
      const pixelateVal = Number(effects["pixelate"] ?? 0);
      const pixelEffect = Math.max(mosaicVal, pixelateVal);
      if (pixelEffect > 0 && (costume?.url || true)) {
        // render sprite normally first to offscreen, then pixelate
        const tileSize = Math.max(2, Math.round(size * (pixelEffect / 100)));
        const oc = document.createElement("canvas");
        oc.width = size; oc.height = size;
        const oct = oc.getContext("2d")!;
        oct.imageSmoothingEnabled = false;
        if (costume?.url) {
          let img2 = imageCache.current.get(costume.url);
          if (img2?.complete) { oct.drawImage(img2, 0, 0, size, size); }
        } else {
          oct.fillStyle = baseColor;
          oct.fillRect(0, 0, size, size);
        }
        // downscale then upscale for pixelate
        const smallW = Math.max(1, Math.round(size / tileSize));
        const tmp = document.createElement("canvas");
        tmp.width = smallW; tmp.height = smallW;
        const tmpt = tmp.getContext("2d")!;
        tmpt.drawImage(oc, 0, 0, smallW, smallW);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, -size / 2, -size / 2, size, size);
        ctx.imageSmoothingEnabled = true;
        drewCostume = true;
      } else if (costume?.url) {
        let img = imageCache.current.get(costume.url);
        if (!img) {
          img = new Image();
          img.onload = () => draw();
          img.onerror = () => {
            imageCache.current.delete(costume.url);
            draw();
          };
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
      // reset filter after drawing sprite
      ctx.filter = "none";

      // Direction indicator (small triangle at front)
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 3, -size / 8);
      ctx.lineTo(size / 3, size / 8);
      ctx.closePath();
      ctx.fill();

      // Keep the costume clean by not rendering name labels directly on the sprite.

      ctx.restore();

      // Name tag bubble (if enabled via blocks)
      if (rs?.effects?.["__nametag"]) {
        const sprName = sprite.name;
        ctx.save();
        ctx.font = "bold 10px system-ui, sans-serif";
        const nameW = ctx.measureText(sprName).width + 8;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.roundRect(sx - nameW / 2, sy - size / 2 - 18, nameW, 14, 4);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText(sprName, sx, sy - size / 2 - 7);
        ctx.restore();
      }

      // Speech bubble
      const sayText = rs?.sayText || "";
      if (sayText) {
        ctx.save();
        ctx.font = "12px system-ui, sans-serif";
        const maxTextWidth = 220;
        const words = sayText.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let current = "";

        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (ctx.measureText(test).width <= maxTextWidth) {
            current = test;
          } else {
            if (current) lines.push(current);
            current = word;
          }
        }
        if (current) lines.push(current);

        const maxLines = 4;
        const visibleLines = lines.slice(0, maxLines);
        if (lines.length > maxLines) {
          const last = visibleLines[maxLines - 1];
          visibleLines[maxLines - 1] = last.length > 2 ? `${last.slice(0, -2)}…` : `${last}…`;
        }

        const textWidth = Math.min(
          maxTextWidth,
          Math.max(...visibleLines.map((l) => ctx.measureText(l).width), 40)
        );
        const paddingX = 10;
        const lineHeight = 14;
        const bubbleW = textWidth + paddingX * 2;
        const bubbleH = visibleLines.length * lineHeight + 10;

        const rawBx = sx + size / 2 + 4;
        const bx = Math.max(6, Math.min(rawBx, w - bubbleW - 6));
        const by = Math.max(6, sy - size / 2 - bubbleH - 8);

        // Bubble shape
        ctx.fillStyle = "white";
        ctx.strokeStyle = "#c0c0c0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, bubbleW, bubbleH, 8);
        ctx.fill();
        ctx.stroke();

        // Tail
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.moveTo(bx + 10, by + bubbleH);
        ctx.lineTo(bx + 6, by + bubbleH + 8);
        ctx.lineTo(bx + 18, by + bubbleH);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#c0c0c0";
        ctx.beginPath();
        ctx.moveTo(bx + 10, by + bubbleH);
        ctx.lineTo(bx + 6, by + bubbleH + 8);
        ctx.lineTo(bx + 18, by + bubbleH);
        ctx.stroke();

        // Text
        ctx.fillStyle = "#333";
        ctx.textAlign = "left";
        for (let i = 0; i < visibleLines.length; i++) {
          ctx.fillText(visibleLines[i], bx + paddingX, by + 16 + i * lineHeight);
        }
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

    // Screen flash effect
    if (engine) {
      const flashUntil = Number(engine.globalVariables["screen_flash_until"] ?? 0);
      if (engine.timer < flashUntil) {
        const flashColor = String(engine.globalVariables["screen_flash_color"] ?? "#ffffff");
        const alpha = Math.max(0, (flashUntil - engine.timer) * 3);
        ctx.save();
        ctx.globalAlpha = Math.min(0.8, alpha);
        ctx.fillStyle = flashColor;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    // Camera shake effect - offset canvas
    if (engine) {
      const shakeUntil = Number(engine.globalVariables["camera_shake_until"] ?? 0);
      if (engine.timer < shakeUntil) {
        const power = Number(engine.globalVariables["camera_shake_power"] ?? 8);
        const offsetX = (Math.random() - 0.5) * power;
        const offsetY = (Math.random() - 0.5) * power;
        ctx.translate(offsetX, offsetY);
      }
    }

    // Particle effects overlay
    if (engine && Number(engine.globalVariables["env_particles_active"] ?? 0)) {
      const pType = String(engine.globalVariables["env_particles_type"] ?? "sparkle");
      const pCount = Math.min(40, Number(engine.globalVariables["env_particles_count"] ?? 10));
      ctx.save();
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      const emojis: Record<string, string> = { fire: "🔥", sparkle: "✨", smoke: "💨", confetti: "🎊", hearts: "💖", stars: "⭐" };
      const emoji = emojis[pType] || "✨";
      for (let i = 0; i < pCount; i++) {
        const px = Math.sin(engine.timer * (2 + i * 0.3) + i * 1.7) * w * 0.45 + w / 2;
        const py = ((engine.timer * 40 * (1 + i * 0.1) + i * 37) % (h + 30)) - 15;
        ctx.globalAlpha = 0.5 + Math.sin(engine.timer * 3 + i) * 0.3;
        ctx.fillText(emoji, px, py);
      }
      ctx.restore();
    }

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
      // Prevent browser scrolling so gameplay keys always control the stage.
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
      engine.keysPressed.add(e.key.toLowerCase());
      triggerKeyPress(engine, spritesRef.current, e.key.toLowerCase());
      // Map common key names
      if (e.key === " ") triggerKeyPress(engine, spritesRef.current, "space");
      if (e.key === "ArrowUp") triggerKeyPress(engine, spritesRef.current, "up arrow");
      if (e.key === "ArrowDown") triggerKeyPress(engine, spritesRef.current, "down arrow");
      if (e.key === "ArrowLeft") triggerKeyPress(engine, spritesRef.current, "left arrow");
      if (e.key === "ArrowRight") triggerKeyPress(engine, spritesRef.current, "right arrow");
      // WASD aliases for Scratch-like controls
      if (e.key.toLowerCase() === "w") triggerKeyPress(engine, spritesRef.current, "up arrow");
      if (e.key.toLowerCase() === "s") triggerKeyPress(engine, spritesRef.current, "down arrow");
      if (e.key.toLowerCase() === "a") triggerKeyPress(engine, spritesRef.current, "left arrow");
      if (e.key.toLowerCase() === "d") triggerKeyPress(engine, spritesRef.current, "right arrow");
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

      const pickPlayableSpriteId = (): string | undefined => {
        const selected = spritesRef.current.find((s) => s.id === selectedSpriteId);
        if (selected && !selected.id.startsWith("env_")) return selected.id;
        return spritesRef.current.find((s) => !s.id.startsWith("env_"))?.id;
      };

      const applyManualControls = () => {
        const targetId = pickPlayableSpriteId();
        if (!targetId) return;
        const state = engine.sprites.get(targetId);
        if (!state) return;

        const keys = engine.keysPressed;
        const has = (...names: string[]) => names.some((name) => keys.has(name));

        const run = has("shift", "control", "meta") ? 8 : 4;
        const up = has("arrowup", "w");
        const down = has("arrowdown", "s");
        const left = has("arrowleft", "a");
        const right = has("arrowright", "d");
        const jump = has(" ", "space");

        if (!up && !down && !left && !right && !jump) return;

        if (left) state.x -= run;
        if (right) state.x += run;
        if (up) state.y += run;
        if (down) state.y -= run;
        if (jump) state.y += run * 1.5;

        const halfW = stage.width / 2 - 20;
        const halfH = stage.height / 2 - 20;
        state.x = Math.max(-halfW, Math.min(halfW, state.x));
        state.y = Math.max(-halfH, Math.min(halfH, state.y));
      };

      let lastTime = performance.now();
      const loop = (time: number) => {
        const dt = Math.min((time - lastTime) / 1000, 0.05);
        lastTime = time;
        applyManualControls();
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
  }, [running, sprites, stage, selectedSpriteId, draw]);

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
      triggerStageClick(engine, spritesRef.current);
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

  const handleAskSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const engine = engineRef.current;
    if (engine) answerAsk(engine, askAnswer);
    setAskAnswer("");
  }, [askAnswer]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Track fullscreen changes
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Compute what monitors to show
  const monitors: { label: string; value: string | number }[] = [];
  if (engineRef.current?.running) {
    for (const [, rs] of engineRef.current.sprites) {
      for (const [key, val] of Object.entries(rs.variables)) {
        if (key.startsWith("__")) continue; // internal vars
        if (key.startsWith("__counter_step:")) continue;
        if (rs.hiddenVars.has(`show:${key}`) && !rs.hiddenVars.has(`hide:${key}`)) {
          monitors.push({ label: key, value: val });
        }
      }
    }
    for (const [key, val] of Object.entries(engineRef.current.globalVariables)) {
      monitors.push({ label: key + " (global)", value: val });
    }
  }

  const askingEngine = engineRef.current;
  const isAsking = !!(askingEngine?.askingSprite);
  const askQuestion = askingEngine?.askQuestion || "";

  return (
    <div ref={containerRef} className={`relative rounded-xl overflow-hidden border border-white/[0.08] bg-black group ${isFullscreen ? "w-screen h-screen" : ""}`}>
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

      {/* Stage controls overlay (bottom bar) */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
        <div className="flex items-center gap-1.5">
          {/* Green flag */}
          <button
            onClick={() => onRunningChange?.(true)}
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all shadow-lg text-base ${running ? "bg-emerald-500/50 text-white/60" : "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/40"}`}
            title="Run (Green Flag)"
          >
            🟢
          </button>
          {/* Stop */}
          <button
            onClick={() => onRunningChange?.(false)}
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all shadow-lg text-base ${!running ? "bg-red-500/50 text-white/60" : "bg-red-500 hover:bg-red-400 text-white shadow-red-500/40"}`}
            title="Stop"
          >
            🔴
          </button>
        </div>
        {running && (
          <span className="text-emerald-400 text-[10px] font-bold bg-emerald-500/10 px-2 py-0.5 rounded">▶ RUNNING</span>
        )}
        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors text-xs"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? "⊠" : "⛶"}
        </button>
      </div>

      {/* Variable monitors (floating overlay top-left) */}
      {monitors.length > 0 && (
        <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
          {monitors.slice(0, 12).map((m, i) => (
            <div key={i} className="flex items-center gap-1 bg-[#ff8c1a] rounded text-white text-[10px] font-bold shadow overflow-hidden">
              <span className="bg-[#cc6600] px-1.5 py-0.5 whitespace-nowrap">{m.label}</span>
              <span className="px-1.5 py-0.5 bg-black/20 min-w-[24px] text-center">{typeof m.value === "number" ? (Number.isInteger(m.value) ? m.value : m.value.toFixed(2)) : String(m.value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ask dialog */}
      {isAsking && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/80 backdrop-blur-sm border-t border-white/10">
          <p className="text-white text-xs mb-1.5 font-medium">{askQuestion}</p>
          <form onSubmit={handleAskSubmit} className="flex gap-1.5">
            <input
              type="text"
              value={askAnswer}
              onChange={(e) => setAskAnswer(e.target.value)}
              autoFocus
              placeholder="Type your answer..."
              className="flex-1 px-2.5 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            />
            <button type="submit" className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-colors">
              ✓
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
