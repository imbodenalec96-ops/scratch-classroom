import React, { useRef, useState, useCallback, useEffect } from "react";
import type { Asset } from "@scratch/shared";
import { useTheme } from "../lib/theme.tsx";

interface Props {
  costume: Asset | null;
  onSave: (asset: Asset) => void;
  onClose: () => void;
}

type Tool = "brush" | "eraser" | "fill" | "line" | "rect" | "circle" | "text" | "picker" | "stamp" | "spray";

const PALETTE = [
  "#000000", "#ffffff", "#ff0000", "#ff6600", "#ffcc00", "#33cc33",
  "#0099ff", "#6633ff", "#ff33cc", "#993300", "#666666", "#cccccc",
  "#ff9999", "#ffcc99", "#ffffcc", "#ccffcc", "#99ccff", "#cc99ff",
  "#ff99cc", "#ffcccc", "#4C97FF", "#9966FF", "#CF63CF", "#59C059",
  "#FFAB19", "#FF6680", "#5CB1D6", "#8b5cf6", "#6366f1", "#ec4899",
];

const STAMP_SHAPES = ["⭐", "❤️", "💎", "🔥", "⚡", "🌟", "🎵", "🌸", "🍀", "👾", "🚀", "🎯", "🦋", "🐱", "🐶", "🎭", "🌈", "🎪", "🏆", "💫", "🎃", "🦄", "🐉", "🎸"];

const CHARACTER_TEMPLATES: { name: string; icon: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[] = [
  {
    name: "Robot", icon: "🤖",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#7c8a97";
      ctx.fillRect(c - s * 0.2, c - s * 0.25, s * 0.4, s * 0.5);
      ctx.fillStyle = "#4C97FF";
      ctx.fillRect(c - s * 0.12, c - s * 0.18, s * 0.08, s * 0.08);
      ctx.fillRect(c + s * 0.04, c - s * 0.18, s * 0.08, s * 0.08);
      ctx.fillStyle = "#ff6680";
      ctx.fillRect(c - s * 0.08, c + s * 0.05, s * 0.16, s * 0.06);
      ctx.fillStyle = "#555";
      ctx.fillRect(c - s * 0.06, c - s * 0.35, s * 0.12, s * 0.1);
    },
  },
  {
    name: "Cat", icon: "🐱",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#ffb347";
      ctx.beginPath(); ctx.arc(c, c, s * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(c - s * 0.2, c - s * 0.2); ctx.lineTo(c - s * 0.12, c - s * 0.35); ctx.lineTo(c - s * 0.02, c - s * 0.2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(c + s * 0.2, c - s * 0.2); ctx.lineTo(c + s * 0.12, c - s * 0.35); ctx.lineTo(c + s * 0.02, c - s * 0.2); ctx.fill();
      ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(c - s * 0.08, c - s * 0.05, s * 0.03, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.08, c - s * 0.05, s * 0.03, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff6680"; ctx.beginPath(); ctx.ellipse(c, c + s * 0.04, s * 0.02, s * 0.015, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#333"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(c, c + s * 0.08, s * 0.06, 0.2, Math.PI - 0.2); ctx.stroke();
    },
  },
  {
    name: "Ghost", icon: "👻",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#e0d8ff";
      ctx.beginPath(); ctx.arc(c, c - s * 0.05, s * 0.22, Math.PI, 0); ctx.lineTo(c + s * 0.22, c + s * 0.25); ctx.quadraticCurveTo(c + s * 0.15, c + s * 0.2, c + s * 0.11, c + s * 0.28); ctx.quadraticCurveTo(c + s * 0.04, c + s * 0.2, c, c + s * 0.28); ctx.quadraticCurveTo(c - s * 0.04, c + s * 0.2, c - s * 0.11, c + s * 0.28); ctx.quadraticCurveTo(c - s * 0.15, c + s * 0.2, c - s * 0.22, c + s * 0.25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(c - s * 0.08, c - s * 0.05, s * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.08, c - s * 0.05, s * 0.04, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    name: "Wizard", icon: "🧙",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#7c3aed";
      ctx.beginPath(); ctx.moveTo(c, c - s * 0.38); ctx.lineTo(c - s * 0.18, c - s * 0.1); ctx.lineTo(c + s * 0.18, c - s * 0.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffd166";
      ctx.beginPath(); ctx.arc(c, c - s * 0.18, s * 0.025, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#dbb89c";
      ctx.beginPath(); ctx.arc(c, c + s * 0.02, s * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(c - s * 0.05, c - s * 0.02, s * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.05, c - s * 0.02, s * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(c - s * 0.18, c + s * 0.12, s * 0.36, s * 0.24);
    },
  },
  {
    name: "Alien", icon: "👽",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#86efac";
      ctx.beginPath(); ctx.ellipse(c, c, s * 0.2, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.ellipse(c - s * 0.08, c - s * 0.06, s * 0.06, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c + s * 0.08, c - s * 0.06, s * 0.06, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath(); ctx.arc(c - s * 0.08, c - s * 0.06, s * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.08, c - s * 0.06, s * 0.02, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    name: "Knight", icon: "⚔️",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#a0a0b0";
      ctx.beginPath(); ctx.arc(c, c - s * 0.1, s * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#888";
      ctx.beginPath(); ctx.moveTo(c - s * 0.08, c - s * 0.28); ctx.lineTo(c + s * 0.08, c - s * 0.28); ctx.lineTo(c + s * 0.04, c - s * 0.36); ctx.lineTo(c - s * 0.04, c - s * 0.36); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#333"; ctx.fillRect(c - s * 0.14, c - s * 0.06, s * 0.28, s * 0.04);
      ctx.fillStyle = "#4C97FF"; ctx.beginPath(); ctx.arc(c - s * 0.05, c - s * 0.06, s * 0.025, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.05, c - s * 0.06, s * 0.025, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(c - s * 0.2, c + s * 0.06, s * 0.4, s * 0.32);
      ctx.fillStyle = "#ffd166"; ctx.fillRect(c - s * 0.03, c + s * 0.12, s * 0.06, s * 0.08);
    },
  },
  {
    name: "Penguin", icon: "🐧",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#1a1a2e";
      ctx.beginPath(); ctx.ellipse(c, c + s * 0.02, s * 0.2, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(c, c + s * 0.08, s * 0.13, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(c - s * 0.06, c - s * 0.1, s * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.06, c - s * 0.1, s * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(c - s * 0.06, c - s * 0.1, s * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.06, c - s * 0.1, s * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff9500";
      ctx.beginPath(); ctx.moveTo(c - s * 0.03, c); ctx.lineTo(c + s * 0.03, c); ctx.lineTo(c, c + s * 0.04); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ff9500";
      ctx.beginPath(); ctx.ellipse(c - s * 0.06, c + s * 0.28, s * 0.04, s * 0.015, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c + s * 0.06, c + s * 0.28, s * 0.04, s * 0.015, 0, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    name: "Tree", icon: "🌳",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#8b5e3c";
      ctx.fillRect(c - s * 0.04, c + s * 0.1, s * 0.08, s * 0.25);
      ctx.fillStyle = "#22c55e";
      ctx.beginPath(); ctx.moveTo(c, c - s * 0.35); ctx.lineTo(c - s * 0.2, c); ctx.lineTo(c + s * 0.2, c); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(c, c - s * 0.25); ctx.lineTo(c - s * 0.16, c + s * 0.05); ctx.lineTo(c + s * 0.16, c + s * 0.05); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(c, c - s * 0.15); ctx.lineTo(c - s * 0.22, c + s * 0.12); ctx.lineTo(c + s * 0.22, c + s * 0.12); ctx.closePath(); ctx.fill();
    },
  },
  {
    name: "Rocket", icon: "🚀",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#e0e0e0";
      ctx.beginPath(); ctx.moveTo(c, c - s * 0.35); ctx.quadraticCurveTo(c + s * 0.12, c - s * 0.1, c + s * 0.1, c + s * 0.15); ctx.lineTo(c - s * 0.1, c + s * 0.15); ctx.quadraticCurveTo(c - s * 0.12, c - s * 0.1, c, c - s * 0.35); ctx.fill();
      ctx.fillStyle = "#4C97FF";
      ctx.beginPath(); ctx.arc(c, c - s * 0.08, s * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath(); ctx.moveTo(c - s * 0.1, c + s * 0.15); ctx.lineTo(c - s * 0.18, c + s * 0.25); ctx.lineTo(c - s * 0.04, c + s * 0.15); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(c + s * 0.1, c + s * 0.15); ctx.lineTo(c + s * 0.18, c + s * 0.25); ctx.lineTo(c + s * 0.04, c + s * 0.15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ff9500";
      ctx.beginPath(); ctx.moveTo(c - s * 0.05, c + s * 0.15); ctx.lineTo(c, c + s * 0.32); ctx.lineTo(c + s * 0.05, c + s * 0.15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffd166";
      ctx.beginPath(); ctx.moveTo(c - s * 0.03, c + s * 0.15); ctx.lineTo(c, c + s * 0.26); ctx.lineTo(c + s * 0.03, c + s * 0.15); ctx.closePath(); ctx.fill();
    },
  },
  {
    name: "Flower", icon: "🌸",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(c - s * 0.015, c + s * 0.05, s * 0.03, s * 0.3);
      ctx.fillStyle = "#16a34a";
      ctx.beginPath(); ctx.ellipse(c + s * 0.06, c + s * 0.18, s * 0.06, s * 0.025, 0.3, 0, Math.PI * 2); ctx.fill();
      const petals = 6;
      for (let i = 0; i < petals; i++) {
        const angle = (i / petals) * Math.PI * 2;
        const px = c + Math.cos(angle) * s * 0.1;
        const py = c - s * 0.05 + Math.sin(angle) * s * 0.1;
        ctx.fillStyle = i % 2 === 0 ? "#ff6b9d" : "#ff85b1";
        ctx.beginPath(); ctx.ellipse(px, py, s * 0.06, s * 0.04, angle, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#ffd166";
      ctx.beginPath(); ctx.arc(c, c - s * 0.05, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    name: "Fish", icon: "🐟",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#5CB1D6";
      ctx.beginPath(); ctx.ellipse(c, c, s * 0.22, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff9500";
      ctx.beginPath(); ctx.moveTo(c + s * 0.2, c); ctx.lineTo(c + s * 0.32, c - s * 0.1); ctx.lineTo(c + s * 0.32, c + s * 0.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(c - s * 0.1, c - s * 0.02, s * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(c - s * 0.1, c - s * 0.02, s * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4C97FF";
      ctx.beginPath(); ctx.ellipse(c + s * 0.02, c - s * 0.1, s * 0.08, s * 0.03, -0.3, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    name: "Dinosaur", icon: "🦕",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#86efac";
      ctx.beginPath(); ctx.ellipse(c, c + s * 0.05, s * 0.2, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#86efac";
      ctx.beginPath(); ctx.arc(c - s * 0.12, c - s * 0.16, s * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#86efac";
      ctx.fillRect(c + s * 0.1, c + s * 0.1, s * 0.16, s * 0.04);
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(c - s * 0.14, c - s * 0.18, s * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#86efac";
      ctx.fillRect(c - s * 0.1, c + s * 0.2, s * 0.06, s * 0.12);
      ctx.fillRect(c + s * 0.04, c + s * 0.2, s * 0.06, s * 0.12);
      ctx.fillStyle = "#4ade80";
      const spikes = [c - s * 0.05, c, c + s * 0.05, c + s * 0.1];
      spikes.forEach(sx => {
        ctx.beginPath(); ctx.moveTo(sx - s * 0.02, c - s * 0.1); ctx.lineTo(sx, c - s * 0.16); ctx.lineTo(sx + s * 0.02, c - s * 0.1); ctx.closePath(); ctx.fill();
      });
    },
  },
  {
    name: "Car", icon: "🚗",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#ff6b6b";
      ctx.fillRect(c - s * 0.28, c - s * 0.04, s * 0.56, s * 0.16);
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath(); ctx.moveTo(c - s * 0.12, c - s * 0.04); ctx.lineTo(c - s * 0.06, c - s * 0.16); ctx.lineTo(c + s * 0.14, c - s * 0.16); ctx.lineTo(c + s * 0.2, c - s * 0.04); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#a0d8ef";
      ctx.beginPath(); ctx.moveTo(c - s * 0.1, c - s * 0.04); ctx.lineTo(c - s * 0.05, c - s * 0.14); ctx.lineTo(c + s * 0.12, c - s * 0.14); ctx.lineTo(c + s * 0.18, c - s * 0.04); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#333";
      ctx.beginPath(); ctx.arc(c - s * 0.15, c + s * 0.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.15, c + s * 0.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#666";
      ctx.beginPath(); ctx.arc(c - s * 0.15, c + s * 0.12, s * 0.03, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.15, c + s * 0.12, s * 0.03, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(c + s * 0.26, c, s * 0.04, s * 0.06);
    },
  },
  {
    name: "Star", icon: "⭐",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const x = c + Math.cos(angle) * s * 0.25;
        const y = c + Math.sin(angle) * s * 0.25;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffb800";
      ctx.beginPath(); ctx.arc(c, c, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    name: "Heart", icon: "❤️",
    draw: (ctx, s) => {
      const c = s / 2;
      ctx.fillStyle = "#ff6b9d";
      ctx.beginPath();
      ctx.moveTo(c, c + s * 0.12);
      ctx.bezierCurveTo(c - s * 0.25, c - s * 0.05, c - s * 0.25, c - s * 0.25, c, c - s * 0.12);
      ctx.bezierCurveTo(c + s * 0.25, c - s * 0.25, c + s * 0.25, c - s * 0.05, c, c + s * 0.12);
      ctx.fill();
      ctx.fillStyle = "#ff85b1";
      ctx.beginPath(); ctx.arc(c - s * 0.07, c - s * 0.1, s * 0.03, 0, Math.PI * 2); ctx.fill();
    },
  },
];

const TOOL_ICONS: Record<Tool, string> = {
  brush: "✏️", eraser: "🧹", fill: "🪣", line: "╱",
  rect: "▢", circle: "◯", text: "T", picker: "💧",
  stamp: "⭐", spray: "🌫️",
};

export default function CostumeEditor({ costume, onSave, onClose }: Props) {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#4C97FF");
  const [brushSize, setBrushSize] = useState(4);
  const drawingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [textInput, setTextInput] = useState("");
  const DEFAULT_CANVAS_SIZE = 480;
  const MIN_CANVAS_SIZE = 120;
  const MAX_CANVAS_SIZE = 1024;
  const [canvasSize, setCanvasSize] = useState(DEFAULT_CANVAS_SIZE);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [opacity, setOpacity] = useState(1);
  const [fillShape, setFillShape] = useState(false);
  const [importedImg, setImportedImg] = useState<HTMLImageElement|null>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selection, setSelection] = useState<{x:number,y:number,w:number,h:number}|null>(null);
  const [customCode, setCustomCode] = useState<string>("");
  const [selectedStamp, setSelectedStamp] = useState("⭐");
  const [symmetryMode, setSymmetryMode] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    if (costume?.url) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
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
      ctx.arc(canvasSize/2, canvasSize/2, canvasSize/4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(canvasSize/2-20, canvasSize/2-15, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(canvasSize/2+20, canvasSize/2-15, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(canvasSize/2, canvasSize/2+10, 40, 0.2, Math.PI - 0.2);
      ctx.stroke();
      saveUndo();
    }
    if (importedImg) ctx.drawImage(importedImg, 0, 0, canvasSize, canvasSize);
  }, [costume, canvasSize, importedImg]);

  const saveUndo = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvasSize, canvasSize);
    setUndoStack(prev => [...prev.slice(-20), data]);
  }, [canvasSize]);

  useEffect(() => {
    if (!customCode.trim()) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    try {
      // eslint-disable-next-line no-new-func
      new Function("ctx", "canvasSize", customCode)(ctx, canvasSize);
      saveUndo();
    } catch {
      // Ignore invalid custom code and keep existing drawing.
    }
  }, [customCode, canvasSize, saveUndo]);

  const undo = useCallback(() => {
    if (undoStack.length < 2) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const newStack = [...undoStack];
    const popped = newStack.pop()!;
    setRedoStack(prev => [...prev, popped]);
    const prev = newStack[newStack.length - 1];
    if (prev) ctx.putImageData(prev, 0, 0);
    setUndoStack(newStack);
  }, [undoStack]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const newRedo = [...redoStack];
    const data = newRedo.pop()!;
    setRedoStack(newRedo);
    ctx.putImageData(data, 0, 0);
    setUndoStack(prev => [...prev, data]);
  }, [redoStack]);

  const flipCanvas = useCallback((horizontal: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    saveUndo();
    const imgData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvasSize;
    tempCanvas.height = canvasSize;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.putImageData(imgData, 0, 0);
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.save();
    if (horizontal) {
      ctx.translate(canvasSize, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, canvasSize);
      ctx.scale(1, -1);
    }
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  }, [canvasSize, saveUndo]);

  const rotateCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    saveUndo();
    const imgData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvasSize;
    tempCanvas.height = canvasSize;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.putImageData(imgData, 0, 0);
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.save();
    ctx.translate(canvasSize / 2, canvasSize / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(tempCanvas, -canvasSize / 2, -canvasSize / 2);
    ctx.restore();
  }, [canvasSize, saveUndo]);

  const clear = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    saveUndo();
  }, [saveUndo]);

  const getPos = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = canvasSize / rect.width;
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  }, [canvasSize]);

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

    const drawStroke = (px: number, py: number, prevPx?: number, prevPy?: number) => {
      if (tool === "brush" || tool === "eraser") {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (tool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
          ctx.strokeStyle = color;
        }
        ctx.beginPath();
        if (prevPx !== undefined && prevPy !== undefined) {
          ctx.moveTo(prevPx, prevPy);
          ctx.lineTo(px, py);
        } else {
          ctx.moveTo(px, py);
          ctx.lineTo(px + 0.1, py + 0.1);
        }
        ctx.stroke();
        ctx.restore();
      } else if (tool === "spray") {
        ctx.save();
        ctx.globalAlpha = opacity * 0.3;
        ctx.fillStyle = color;
        for (let i = 0; i < 12; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * brushSize * 2;
          const dpx = px + Math.cos(angle) * radius;
          const dpy = py + Math.sin(angle) * radius;
          ctx.beginPath();
          ctx.arc(dpx, dpy, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    drawStroke(x, y, prevX, prevY);

    // Symmetry mode: mirror across the center
    if (symmetryMode) {
      const mirrorX = canvasSize - x;
      const mirrorPrevX = prevX !== undefined ? canvasSize - prevX : undefined;
      drawStroke(mirrorX, y, mirrorPrevX, prevY);
    }
  }, [tool, color, brushSize, opacity, symmetryMode, canvasSize]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getPos(e.clientX, e.clientY);
    canvasRef.current?.setPointerCapture(e.pointerId);
    saveUndo();
    drawingRef.current = true;
    dragStartRef.current = pos;
    lastPosRef.current = pos;

    if (tool === "fill") {
      floodFill(pos.x, pos.y, color);
      saveUndo();
      drawingRef.current = false;
      dragStartRef.current = null;
      lastPosRef.current = null;
      return;
    }
    if (tool === "picker") {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        const pixel = ctx.getImageData(Math.floor(pos.x), Math.floor(pos.y), 1, 1).data;
        setColor(`#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`);
      }
      drawingRef.current = false;
      dragStartRef.current = null;
      lastPosRef.current = null;
      return;
    }
    if (tool === "text") {
      const text = textInput || "Hello";
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.font = `bold ${brushSize * 4}px system-ui, sans-serif`;
        ctx.fillText(text, pos.x, pos.y);
        ctx.restore();
        saveUndo();
      }
      drawingRef.current = false;
      dragStartRef.current = null;
      lastPosRef.current = null;
      return;
    }
    if (tool === "stamp") {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.globalAlpha = opacity;
        const sz = brushSize * 3;
        ctx.font = `${sz}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(selectedStamp, pos.x, pos.y);
        if (symmetryMode) {
          ctx.fillText(selectedStamp, canvasSize - pos.x, pos.y);
        }
        ctx.restore();
        saveUndo();
      }
      drawingRef.current = false;
      dragStartRef.current = null;
      lastPosRef.current = null;
      return;
    }

    drawAt(pos.x, pos.y);
  }, [tool, color, brushSize, getPos, drawAt, floodFill, saveUndo, textInput, opacity, selectedStamp, symmetryMode, canvasSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPosRef.current) return;

    if (tool === "brush" || tool === "eraser" || tool === "spray") {
      // Use coalesced events for smooth high-frequency drawing
      const events = (e.nativeEvent as any).getCoalescedEvents?.() ?? [e];
      for (const ce of events) {
        const pos = getPos(ce.clientX, ce.clientY);
        drawAt(pos.x, pos.y, lastPosRef.current.x, lastPosRef.current.y);
        lastPosRef.current = pos;
      }
    }
  }, [tool, getPos, drawAt]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const pos = getPos(e.clientX, e.clientY);
    const ctx = canvasRef.current?.getContext("2d");
    const dsp = dragStartRef.current;

    if (ctx && dsp) {
      if (tool === "line") {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(dsp.x, dsp.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
      } else if (tool === "rect") {
        const x = Math.min(dsp.x, pos.x);
        const y = Math.min(dsp.y, pos.y);
        const w = Math.abs(pos.x - dsp.x);
        const h = Math.abs(pos.y - dsp.y);
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.lineWidth = brushSize;
        if (fillShape) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeStyle = color;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      } else if (tool === "circle") {
        const rx = Math.abs(pos.x - dsp.x) / 2;
        const ry = Math.abs(pos.y - dsp.y) / 2;
        const cx = (dsp.x + pos.x) / 2;
        const cy = (dsp.y + pos.y) / 2;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fillShape) {
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.stroke();
        ctx.restore();
      }
    }

    drawingRef.current = false;
    dragStartRef.current = null;
    lastPosRef.current = null;
    saveUndo();
  }, [tool, color, brushSize, getPos, saveUndo, fillShape, opacity]);

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
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${dk ? "bg-black/70" : "bg-black/40"} backdrop-blur-sm`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${dk ? "bg-[#12122a] border-white/[0.08]" : "bg-white border-gray-200"} rounded-2xl border shadow-2xl w-[960px] max-h-[95vh] overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${dk ? "border-white/[0.06]" : "border-gray-200"}`}>
          <div className="flex items-center gap-3">
            <span className="text-lg">🎨</span>
            <h2 className={`font-bold text-sm ${dk ? "text-white" : "text-gray-800"}`}>Costume Editor</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${dk ? "bg-violet-600/20 text-violet-300" : "bg-violet-100 text-violet-600"}`}>{canvasSize}×{canvasSize}</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={undo} disabled={undoStack.length < 2} className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${dk ? "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border-white/[0.06] disabled:opacity-30" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200 disabled:opacity-30"}`}>↩ Undo</button>
            <button onClick={redo} disabled={redoStack.length === 0} className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${dk ? "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border-white/[0.06] disabled:opacity-30" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200 disabled:opacity-30"}`}>↪ Redo</button>
            <button onClick={clear} className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${dk ? "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border-white/[0.06]" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200"}`}>🗑 Clear</button>
            <div className={`w-px mx-1 ${dk ? "bg-white/10" : "bg-gray-200"}`} />
            <button onClick={() => flipCanvas(true)} className={`px-2 py-1.5 text-xs rounded-lg border transition-all ${dk ? "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border-white/[0.06]" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200"}`} title="Flip Horizontal">↔</button>
            <button onClick={() => flipCanvas(false)} className={`px-2 py-1.5 text-xs rounded-lg border transition-all ${dk ? "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border-white/[0.06]" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200"}`} title="Flip Vertical">↕</button>
            <button onClick={rotateCanvas} className={`px-2 py-1.5 text-xs rounded-lg border transition-all ${dk ? "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border-white/[0.06]" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200"}`} title="Rotate 90°">⟳</button>
            <div className={`w-px mx-1 ${dk ? "bg-white/10" : "bg-gray-200"}`} />
            <button onClick={handleSave} className="px-4 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-500 font-medium shadow-lg shadow-violet-600/20 transition-all">✓ Save</button>
            <button onClick={onClose} className={`px-2 py-1.5 text-xs rounded-lg ${dk ? "text-white/40 hover:text-white/70" : "text-gray-400 hover:text-gray-600"}`}>✕</button>
          </div>
        </div>
        <div className="flex" style={{ height: "calc(95vh - 52px)", maxHeight: 680 }}>
          {/* Tools sidebar */}
          <div className={`w-[72px] ${dk ? "bg-black/30 border-white/[0.06]" : "bg-gray-50 border-gray-200"} border-r p-2 flex flex-col gap-1 overflow-y-auto`}>
            <span className={`text-[9px] font-semibold uppercase tracking-wider px-1 mb-1 ${dk ? "text-white/30" : "text-gray-400"}`}>Tools</span>
            {(Object.entries(TOOL_ICONS) as [Tool, string][]).map(([t, icon]) => (
              <button key={t} onClick={() => setTool(t)}
                className={`w-full h-11 rounded-lg flex flex-col items-center justify-center transition-all
                  ${tool === t ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30 scale-105" : dk ? "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-100"}`}
                title={t.charAt(0).toUpperCase() + t.slice(1)}>
                <span className="text-base leading-none">{icon}</span>
                <span className="text-[8px] mt-0.5 leading-none">{t}</span>
              </button>
            ))}
            <hr className={`my-1.5 ${dk ? "border-white/10" : "border-gray-200"}`} />
            <span className={`text-[9px] font-semibold uppercase tracking-wider px-1 mb-1 ${dk ? "text-white/30" : "text-gray-400"}`}>Options</span>
            <button onClick={() => setShowGrid(g => !g)} className={`w-full h-9 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all ${showGrid ? "bg-violet-600 text-white" : dk ? "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-100"}`}>🔲 Grid</button>
            <button onClick={() => setMultiSelect(m => !m)} className={`w-full h-9 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all ${multiSelect ? "bg-violet-600 text-white" : dk ? "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-100"}`}>⬚ Select</button>
            <button onClick={() => setFillShape(f => !f)} className={`w-full h-9 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all ${fillShape ? "bg-violet-600 text-white" : dk ? "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-100"}`}>◼ Fill</button>
            <button onClick={() => setSymmetryMode(s => !s)} className={`w-full h-9 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all ${symmetryMode ? "bg-violet-600 text-white" : dk ? "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-100"}`} title="Symmetry Mirror">🪞 Mirror</button>
            <button onClick={() => setShowTemplates(t => !t)} className={`w-full h-9 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all ${showTemplates ? "bg-violet-600 text-white" : dk ? "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-100"}`} title="Character Templates">🧑‍🎨 Art</button>
            <hr className={`my-1.5 ${dk ? "border-white/10" : "border-gray-200"}`} />
            <label className={`w-full h-9 rounded-lg text-[10px] flex items-center justify-center cursor-pointer transition-all ${dk ? "bg-white/[0.04] hover:bg-white/[0.08] text-white/50" : "bg-white hover:bg-gray-100 text-gray-500 border border-gray-100"}`}>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  const img = new window.Image();
                  img.onload = () => setImportedImg(img);
                  img.src = URL.createObjectURL(file);
                }
              }} />📷 Import
            </label>
            <button onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const a = document.createElement("a");
              a.href = canvas.toDataURL("image/png");
              a.download = "costume.png";
              a.click();
            }} className={`w-full h-9 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all ${dk ? "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-100"}`}>💾 Export</button>
            <button onClick={() => setCustomCode(prompt("Custom drawing code (ctx, canvasSize):", customCode) || customCode)} className={`w-full h-9 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all ${dk ? "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-100"}`}>💻 Code</button>
          </div>
          {/* Canvas area */}
          <div className="flex-1 flex flex-col">
            {/* Controls bar */}
            <div className={`flex gap-3 items-center px-4 py-2 border-b ${dk ? "border-white/[0.06] bg-black/20" : "border-gray-100 bg-gray-50/50"}`}>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${dk ? "text-white/40" : "text-gray-400"}`}>Size:</span>
                <button onClick={() => setBrushSize(s => Math.max(1, s - 1))} className={`w-5 h-5 text-[10px] rounded flex items-center justify-center ${dk ? "bg-white/[0.08] text-white/60" : "bg-gray-200 text-gray-600"}`}>−</button>
                <input type="range" min={1} max={60} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="accent-violet-500 w-20" />
                <span className={`text-[10px] w-5 text-center ${dk ? "text-white/60" : "text-gray-600"}`}>{brushSize}</span>
              </div>
              <div className={`w-px h-4 ${dk ? "bg-white/10" : "bg-gray-200"}`} />
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${dk ? "text-white/40" : "text-gray-400"}`}>Zoom:</span>
                <input type="range" min={0.5} max={2} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="accent-violet-500 w-20" />
                <span className={`text-[10px] w-8 ${dk ? "text-white/60" : "text-gray-600"}`}>{Math.round(zoom * 100)}%</span>
              </div>
              <div className={`w-px h-4 ${dk ? "bg-white/10" : "bg-gray-200"}`} />
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${dk ? "text-white/40" : "text-gray-400"}`}>Opacity:</span>
                <input type="range" min={0.1} max={1} step={0.01} value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="accent-violet-500 w-16" />
                <span className={`text-[10px] w-7 ${dk ? "text-white/60" : "text-gray-600"}`}>{Math.round(opacity * 100)}%</span>
              </div>
              <div className={`w-px h-4 ${dk ? "bg-white/10" : "bg-gray-200"}`} />
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${dk ? "text-white/40" : "text-gray-400"}`}>Canvas:</span>
                <button onClick={() => setCanvasSize(s => Math.max(MIN_CANVAS_SIZE, s - 40))} className={`w-5 h-5 text-[10px] rounded flex items-center justify-center ${dk ? "bg-white/[0.08] text-white/60" : "bg-gray-200 text-gray-600"}`}>−</button>
                <span className={`text-[10px] ${dk ? "text-white/60" : "text-gray-600"}`}>{canvasSize}px</span>
                <button onClick={() => setCanvasSize(s => Math.min(MAX_CANVAS_SIZE, s + 40))} className={`w-5 h-5 text-[10px] rounded flex items-center justify-center ${dk ? "bg-white/[0.08] text-white/60" : "bg-gray-200 text-gray-600"}`}>+</button>
              </div>
            </div>
            {/* Canvas */}
            <div className={`flex-1 flex items-center justify-center overflow-auto ${dk ? "bg-[#0e0e1f]" : "bg-gray-100"}`} style={{ backgroundImage: `radial-gradient(circle, ${dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.03)"} 1px, transparent 1px)`, backgroundSize: "24px 24px" }}>
              <div
                className="rounded-xl shadow-2xl relative"
                style={{
                  width: canvasSize * zoom,
                  height: canvasSize * zoom,
                  backgroundImage: showGrid ? `linear-gradient(to right, ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} 1px, transparent 1px), linear-gradient(to bottom, ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} 1px, transparent 1px)` : "none",
                  backgroundSize: showGrid ? `${40 * zoom}px ${40 * zoom}px` : "auto",
                  backgroundColor: "#fff",
                }}
              >
                <canvas ref={canvasRef} width={canvasSize} height={canvasSize}
                  className="block cursor-crosshair rounded-xl"
                  style={{ width: canvasSize * zoom, height: canvasSize * zoom, touchAction: "none" }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={() => { drawingRef.current = false; dragStartRef.current = null; lastPosRef.current = null; }}
                  onPointerLeave={() => { if (!drawingRef.current) { dragStartRef.current = null; lastPosRef.current = null; } }} />
              </div>
            </div>
            {/* Bottom panel for text input, stamp picker, or templates */}
            {(tool === "text" || tool === "stamp" || showTemplates) && (
              <div className={`border-t px-4 py-3 ${dk ? "border-white/[0.06] bg-black/20" : "border-gray-100 bg-gray-50/80"}`}>
                {tool === "text" && (
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${dk ? "text-white/40" : "text-gray-400"}`}>Text:</span>
                    <input value={textInput} onChange={e => setTextInput(e.target.value)}
                      placeholder="Type text here..."
                      className={`flex-1 text-xs py-1.5 px-3 rounded-lg border ${dk ? "bg-white/[0.06] border-white/[0.08] text-white" : "bg-white border-gray-200 text-gray-800"}`} />
                  </div>
                )}
                {tool === "stamp" && (
                  <div>
                    <span className={`text-[10px] ${dk ? "text-white/40" : "text-gray-400"}`}>Pick a stamp:</span>
                    <div className="grid grid-cols-12 gap-1 mt-1.5">
                      {STAMP_SHAPES.map(s => (
                        <button key={s} onClick={() => setSelectedStamp(s)}
                          className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${selectedStamp === s ? "bg-violet-600 scale-110 shadow-md" : dk ? "bg-white/[0.06] hover:bg-white/[0.1]" : "bg-white hover:bg-gray-100 border border-gray-100"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showTemplates && (
                  <div>
                    <span className={`text-[10px] ${dk ? "text-white/40" : "text-gray-400"}`}>Character Templates (click to apply):</span>
                    <div className="grid grid-cols-5 gap-1.5 mt-1.5">
                      {CHARACTER_TEMPLATES.map(t => (
                        <button key={t.name} onClick={() => {
                          const ctx = canvasRef.current?.getContext("2d");
                          if (ctx) {
                            saveUndo();
                            ctx.clearRect(0, 0, canvasSize, canvasSize);
                            t.draw(ctx, canvasSize);
                          }
                        }} className={`px-2 py-2 rounded-lg text-xs border transition-all hover:scale-105 flex flex-col items-center gap-0.5 ${dk ? "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 border-white/[0.06]" : "bg-white hover:bg-violet-50 text-gray-600 border-gray-200 hover:border-violet-300"}`}>
                          <span className="text-lg">{t.icon}</span>
                          <span>{t.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Color palette */}
          <div className={`w-36 ${dk ? "bg-black/30 border-white/[0.06]" : "bg-gray-50 border-gray-200"} border-l p-3 flex flex-col gap-2.5 overflow-y-auto`}>
            <span className={`text-[9px] font-semibold uppercase tracking-wider ${dk ? "text-white/30" : "text-gray-400"}`}>Color</span>
            <div className={`w-14 h-14 rounded-xl border-2 mx-auto shadow-lg ${dk ? "border-white/20" : "border-gray-300"}`} style={{ backgroundColor: color }} />
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-full h-8 rounded-lg cursor-pointer border-0" />
            <div className="grid grid-cols-5 gap-1">
              {PALETTE.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-md border-2 transition-all ${color === c ? "border-violet-500 scale-125 shadow-md" : dk ? "border-white/10 hover:border-white/30" : "border-gray-200 hover:border-gray-400"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <hr className={`my-1 ${dk ? "border-white/10" : "border-gray-200"}`} />
            <span className={`text-[9px] font-semibold uppercase tracking-wider ${dk ? "text-white/30" : "text-gray-400"}`}>Quick Colors</span>
            <div className="flex flex-wrap gap-1">
              {["#ff0000","#ff9500","#ffcc00","#4cd964","#5ac8fa","#007aff","#5856d6","#ff2d55","#000000","#ffffff"].map(c => (
                <button key={c + "-quick"} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? "border-violet-500 scale-110" : dk ? "border-white/10" : "border-gray-200"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
