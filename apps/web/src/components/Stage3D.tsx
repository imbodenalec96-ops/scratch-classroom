import React, { useRef, Suspense, useState, useCallback, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Html, TransformControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { Sprite, StageSettings, Light3D, Shape3D } from "@scratch/shared";
import type { EnvironmentPreset } from "../lib/game/templates.ts";
import { useTheme } from "../lib/theme.tsx";
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
  onAddSprite?: (name: string, shape: Shape3D) => void;
}

type TransformMode = "translate" | "rotate" | "scale";
const SCALE = 40;

type ThreeDTheme = {
  envPreset: "night" | "city" | "sunset" | "dawn" | "forest" | "park";
  background: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  ground: string;
  gridCell: string;
  gridSection: string;
  ambient: number;
  keyLight: number;
  keyLightColor: string;
  fillLight: number;
  fillLightColor: string;
  sky: {
    distance: number;
    turbidity: number;
    rayleigh: number;
    mieCoefficient: number;
    mieDirectionalG: number;
    inclination: number;
    azimuth: number;
  };
};

const ENV3D_THEMES: Record<EnvironmentPreset, ThreeDTheme> = {
  dojo: {
    envPreset: "dawn", background: "#f3e6cf", fog: "#d8bb95", fogNear: 40, fogFar: 200,
    ground: "#7a5a3a", gridCell: "#b08968", gridSection: "#8f6a4c", ambient: 0.55,
    keyLight: 0.9, keyLightColor: "#ffe0b2", fillLight: 0.28, fillLightColor: "#c7d2fe",
    sky: { distance: 250, turbidity: 8, rayleigh: 2.2, mieCoefficient: 0.018, mieDirectionalG: 0.82, inclination: 0.49, azimuth: 0.28 },
  },
  forest: {
    envPreset: "forest", background: "#143d2b", fog: "#1d5f3d", fogNear: 40, fogFar: 180,
    ground: "#2d5a3a", gridCell: "#2f7a4b", gridSection: "#1f5b38", ambient: 0.5,
    keyLight: 0.85, keyLightColor: "#c7f9cc", fillLight: 0.3, fillLightColor: "#86efac",
    sky: { distance: 260, turbidity: 6, rayleigh: 2.8, mieCoefficient: 0.012, mieDirectionalG: 0.78, inclination: 0.52, azimuth: 0.33 },
  },
  desert: {
    envPreset: "sunset", background: "#f2b880", fog: "#e39b64", fogNear: 50, fogFar: 220,
    ground: "#b96f34", gridCell: "#d08a49", gridSection: "#a95d1f", ambient: 0.62,
    keyLight: 0.95, keyLightColor: "#ffd9b0", fillLight: 0.24, fillLightColor: "#f59e0b",
    sky: { distance: 280, turbidity: 10, rayleigh: 1.8, mieCoefficient: 0.025, mieDirectionalG: 0.85, inclination: 0.54, azimuth: 0.26 },
  },
  snow: {
    envPreset: "park", background: "#a8d7ff", fog: "#d9efff", fogNear: 35, fogFar: 180,
    ground: "#dce5ed", gridCell: "#c9d7e6", gridSection: "#9fb2c6", ambient: 0.7,
    keyLight: 1.0, keyLightColor: "#ffffff", fillLight: 0.26, fillLightColor: "#bfdbfe",
    sky: { distance: 260, turbidity: 5, rayleigh: 3.1, mieCoefficient: 0.008, mieDirectionalG: 0.72, inclination: 0.5, azimuth: 0.34 },
  },
  city: {
    envPreset: "city", background: "#0b1220", fog: "#18253c", fogNear: 40, fogFar: 200,
    ground: "#161f33", gridCell: "#334155", gridSection: "#5b6b86", ambient: 0.36,
    keyLight: 0.82, keyLightColor: "#a5b4fc", fillLight: 0.35, fillLightColor: "#60a5fa",
    sky: { distance: 300, turbidity: 9, rayleigh: 0.9, mieCoefficient: 0.04, mieDirectionalG: 0.9, inclination: 0.42, azimuth: 0.18 },
  },
  space: {
    envPreset: "night", background: "#040712", fog: "#10162d", fogNear: 60, fogFar: 300,
    ground: "#161235", gridCell: "#3730a3", gridSection: "#8b5cf6", ambient: 0.28,
    keyLight: 0.72, keyLightColor: "#a78bfa", fillLight: 0.45, fillLightColor: "#60a5fa",
    sky: { distance: 340, turbidity: 3, rayleigh: 0.35, mieCoefficient: 0.003, mieDirectionalG: 0.6, inclination: 0.45, azimuth: 0.5 },
  },
  ocean: {
    envPreset: "dawn", background: "#0c4460", fog: "#0f5b7f", fogNear: 35, fogFar: 180,
    ground: "#0c3f5c", gridCell: "#0ea5e9", gridSection: "#38bdf8", ambient: 0.45,
    keyLight: 0.78, keyLightColor: "#bae6fd", fillLight: 0.38, fillLightColor: "#22d3ee",
    sky: { distance: 280, turbidity: 7, rayleigh: 2.2, mieCoefficient: 0.015, mieDirectionalG: 0.76, inclination: 0.5, azimuth: 0.4 },
  },
  volcano: {
    envPreset: "sunset", background: "#220a0a", fog: "#4a1212", fogNear: 30, fogFar: 160,
    ground: "#3a1414", gridCell: "#7f1d1d", gridSection: "#ef4444", ambient: 0.3,
    keyLight: 0.92, keyLightColor: "#fb923c", fillLight: 0.3, fillLightColor: "#f87171",
    sky: { distance: 240, turbidity: 13, rayleigh: 1.2, mieCoefficient: 0.05, mieDirectionalG: 0.92, inclination: 0.46, azimuth: 0.2 },
  },
  cave: {
    envPreset: "night", background: "#070d1a", fog: "#111827", fogNear: 20, fogFar: 120,
    ground: "#1b2437", gridCell: "#334155", gridSection: "#86efac", ambient: 0.32,
    keyLight: 0.64, keyLightColor: "#86efac", fillLight: 0.34, fillLightColor: "#93c5fd",
    sky: { distance: 220, turbidity: 4, rayleigh: 0.6, mieCoefficient: 0.006, mieDirectionalG: 0.72, inclination: 0.48, azimuth: 0.58 },
  },
  neon: {
    envPreset: "city", background: "#120625", fog: "#2b0c55", fogNear: 30, fogFar: 170,
    ground: "#1f1342", gridCell: "#22d3ee", gridSection: "#fb7185", ambient: 0.4,
    keyLight: 0.86, keyLightColor: "#f472b6", fillLight: 0.42, fillLightColor: "#22d3ee",
    sky: { distance: 260, turbidity: 6, rayleigh: 0.8, mieCoefficient: 0.03, mieDirectionalG: 0.86, inclination: 0.44, azimuth: 0.22 },
  },
};

function inferEnvironmentPreset(stage: StageSettings): EnvironmentPreset {
  const marker = (stage.backgroundImage || "").trim();
  if (marker.startsWith("env:")) {
    const preset = marker.slice(4) as EnvironmentPreset;
    if (preset in ENV3D_THEMES) return preset;
  }

  const colorMap: Record<string, EnvironmentPreset> = {
    "#f0e6c8": "dojo",
    "#1f5132": "forest",
    "#c7792a": "desert",
    "#99c9ea": "snow",
    "#0f172a": "city",
    "#060915": "space",
    "#083344": "ocean",
    "#1b0d0d": "volcano",
    "#0b1220": "cave",
    "#130a2b": "neon",
  };
  const byColor = colorMap[(stage.backgroundColor || "").toLowerCase()];
  return byColor || "city";
}

const SCENE_OBJECTS: { name: string; shape: Shape3D; icon: string }[] = [
  { name: "Box", shape: "box", icon: "📦" },
  { name: "Ball", shape: "sphere", icon: "⚽" },
  { name: "Pillar", shape: "cylinder", icon: "🏛️" },
  { name: "Cone", shape: "cone", icon: "🔺" },
  { name: "Ring", shape: "torus", icon: "🍩" },
  { name: "Wall", shape: "plane", icon: "🧱" },
  { name: "Capsule", shape: "capsule", icon: "💊" },
];

/* ── Weather particles system ── */
function WeatherParticles({ engineRef, running }: {
  engineRef: React.MutableRefObject<RuntimeEngine | null>;
  running: boolean;
}) {
  const meshRef = useRef<THREE.Points>(null!);
  const posRef = useRef(new Float32Array(600 * 3));
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Initialize random positions
    for (let i = 0; i < 600; i++) {
      posRef.current[i * 3] = (Math.random() - 0.5) * 40;
      posRef.current[i * 3 + 1] = Math.random() * 20;
      posRef.current[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
  }, []);

  useFrame(() => {
    if (!running || !engineRef.current || !meshRef.current) return;
    const weather = String(engineRef.current.globalVariables["env_weather"] ?? "clear");
    const isActive = weather !== "clear" && weather !== "";
    if (isActive !== active) setActive(isActive);
    if (!isActive) return;

    const positions = meshRef.current.geometry.attributes.position;
    if (!positions) return;
    const arr = positions.array as Float32Array;
    const speed = weather === "rain" ? 0.4 : weather === "snow" ? 0.05 : weather === "storm" ? 0.6 : 0.1;

    for (let i = 0; i < 600; i++) {
      arr[i * 3 + 1] -= speed;
      if (weather === "snow") arr[i * 3] += (Math.random() - 0.5) * 0.03;
      if (arr[i * 3 + 1] < -1) {
        arr[i * 3 + 1] = 18 + Math.random() * 4;
        arr[i * 3] = (Math.random() - 0.5) * 40;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 40;
      }
    }
    positions.needsUpdate = true;
  });

  if (!active) return null;
  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[posRef.current, 3]} count={600} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#ffffff" transparent opacity={0.7} />
    </points>
  );
}

/* ── Cute pre-placed environment decorations ── */
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function EnvironmentDecorations({ preset }: { preset: EnvironmentPreset }) {
  const items = useMemo(() => {
    const hash = Array.from(preset).reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = seededRandom(hash * 137);
    const r = () => rand();
    const spread = 90;
    const pos = (): [number, number, number] => [(r() - 0.5) * spread * 2, 0, (r() - 0.5) * spread * 2];
    // Add more types and density for each theme
    const configs: Record<EnvironmentPreset, Array<{ type: string; color: string; color2?: string; emissive?: string; scale: number; count: number }>> = {
      forest: [
        { type: "tree", color: "#5cb85c", color2: "#8B5E3C", scale: 1, count: 32 },
        { type: "tree2", color: "#A3D977", color2: "#7C4F1D", scale: 0.8, count: 18 },
        { type: "flower", color: "#FF8FAB", scale: 0.3, count: 50 },
        { type: "flower", color: "#FFD166", scale: 0.25, count: 40 },
        { type: "mushroom", color: "#FF6B6B", color2: "#FFF5E1", scale: 0.4, count: 22 },
        { type: "bush", color: "#6BCB77", scale: 0.6, count: 28 },
        { type: "rock", color: "#B0B0B0", scale: 0.5, count: 18 },
        { type: "bunny", color: "#F8F8FF", scale: 0.5, count: 8 },
        { type: "bird", color: "#7EC8E3", scale: 0.3, count: 10 },
        { type: "pond", color: "#AEEFFF", scale: 1.2, count: 2 },
        { type: "cloud", color: "#fff", scale: 1.5, count: 8 },
        { type: "butterfly", color: "#FFB6C1", scale: 0.25, count: 8 },
        { type: "swing", color: "#8B5E3C", scale: 0.7, count: 2 },
      ],
      desert: [
        { type: "cactus", color: "#6BCB77", scale: 1, count: 24 },
        { type: "rock", color: "#D2A679", scale: 0.7, count: 30 },
        { type: "tumbleweed", color: "#C4A265", scale: 0.4, count: 18 },
        { type: "cloud", color: "#fffbe6", scale: 1.2, count: 6 },
        { type: "sandcastle", color: "#F7E7B4", scale: 0.7, count: 4 },
        { type: "lizard", color: "#B2D3C2", scale: 0.3, count: 4 },
      ],
      snow: [
        { type: "pinetree", color: "#E8F0F2", color2: "#8B5E3C", scale: 1.1, count: 30 },
        { type: "snowman", color: "#FFFFFF", scale: 0.7, count: 14 },
        { type: "rock", color: "#C8D6E5", scale: 0.5, count: 18 },
        { type: "cloud", color: "#fff", scale: 1.7, count: 10 },
        { type: "igloo", color: "#E0F7FA", scale: 1, count: 2 },
        { type: "penguin", color: "#222", color2: "#fff", scale: 0.5, count: 5 },
      ],
      city: [
        { type: "lamppost", color: "#888888", color2: "#FFE066", scale: 1, count: 22 },
        { type: "bench", color: "#8B5E3C", scale: 0.6, count: 16 },
        { type: "rock", color: "#999999", scale: 0.3, count: 12 },
        { type: "cloud", color: "#e0e0e0", scale: 1.3, count: 8 },
        { type: "fountain", color: "#AEEFFF", scale: 0.8, count: 2 },
        { type: "slide", color: "#FFD166", scale: 0.7, count: 2 },
      ],
      space: [
        { type: "asteroid", color: "#888888", scale: 1, count: 36 },
        { type: "crystal", color: "#A78BFA", emissive: "#7C3AED", scale: 0.8, count: 24 },
        { type: "cloud", color: "#fff", scale: 1.2, count: 8 },
        { type: "alien", color: "#7CFC00", scale: 0.5, count: 4 },
        { type: "star", color: "#fffacd", scale: 0.3, count: 10 },
      ],
      ocean: [
        { type: "coral", color: "#FF8FAB", scale: 0.6, count: 30 },
        { type: "coral", color: "#FFB347", scale: 0.5, count: 24 },
        { type: "seaweed", color: "#2ECC71", scale: 0.8, count: 24 },
        { type: "cloud", color: "#fff", scale: 1.2, count: 7 },
        { type: "shell", color: "#FFF5E1", scale: 0.3, count: 8 },
        { type: "fish", color: "#7EC8E3", scale: 0.4, count: 8 },
        { type: "sandcastle", color: "#F7E7B4", scale: 0.7, count: 3 },
      ],
      dojo: [
        { type: "cherrytree", color: "#FFB7C5", color2: "#8B5E3C", scale: 1.1, count: 22 },
        { type: "lantern", color: "#FF6B6B", emissive: "#FF6B6B", scale: 0.5, count: 18 },
        { type: "rock", color: "#A0A0A0", scale: 0.6, count: 18 },
        { type: "cloud", color: "#fff", scale: 1.3, count: 8 },
        { type: "bridge", color: "#8B5E3C", scale: 1, count: 2 },
        { type: "koi", color: "#FFD166", scale: 0.3, count: 6 },
      ],
      volcano: [
        { type: "rock", color: "#333333", scale: 1, count: 36 },
        { type: "crystal", color: "#FF4500", emissive: "#FF4500", scale: 0.6, count: 18 },
        { type: "deadtree", color: "#4A3728", scale: 1, count: 16 },
        { type: "cloud", color: "#ffb347", scale: 1.1, count: 7 },
        { type: "lava", color: "#FF6B6B", emissive: "#FF6B6B", scale: 0.7, count: 3 },
      ],
      cave: [
        { type: "crystal", color: "#7FDBFF", emissive: "#7FDBFF", scale: 0.8, count: 26 },
        { type: "stalagmite", color: "#8B7355", scale: 1, count: 24 },
        { type: "mushroom", color: "#7FDBFF", color2: "#E0E0E0", emissive: "#7FDBFF", scale: 0.5, count: 20 },
        { type: "cloud", color: "#fff", scale: 1.1, count: 6 },
        { type: "bat", color: "#222", scale: 0.3, count: 6 },
      ],
      neon: [
        { type: "crystal", color: "#FF00FF", emissive: "#FF00FF", scale: 1, count: 24 },
        { type: "crystal", color: "#00FFFF", emissive: "#00FFFF", scale: 0.8, count: 24 },
        { type: "pillar", color: "#FF00FF", emissive: "#FF00FF", scale: 1, count: 16 },
        { type: "cloud", color: "#fff", scale: 1.2, count: 8 },
        { type: "neonbunny", color: "#FF00FF", emissive: "#FF00FF", scale: 0.5, count: 6 },
        { type: "neonbutterfly", color: "#00FFFF", emissive: "#00FFFF", scale: 0.3, count: 6 },
      ],
    };
    const list = configs[preset] ?? configs.forest;
    const result: Array<{ key: string; type: string; position: [number, number, number]; color: string; color2?: string; emissive?: string; scale: number; rotY: number }> = [];
    for (const cfg of list) {
      for (let i = 0; i < cfg.count; i++) {
        const p = pos();
        if (Math.abs(p[0]) < 6 && Math.abs(p[2]) < 6) { p[0] += p[0] >= 0 ? 8 : -8; }
        result.push({ key: `${cfg.type}-${result.length}`, type: cfg.type, position: p, color: cfg.color, color2: cfg.color2, emissive: cfg.emissive, scale: cfg.scale * (0.7 + r() * 0.6), rotY: r() * Math.PI * 2 });
      }
    }
    return result;
  }, [preset]);

  return (
    <group>
      {items.map((it) => (
        <group key={it.key} position={it.position} rotation={[0, it.rotY, 0]} scale={it.scale}>
          {/* Round leafy tree */}
          {it.type === "tree" && (
            <group>
              <mesh position={[0, 1.5, 0]} castShadow><cylinderGeometry args={[0.2, 0.3, 3, 8]} /><meshStandardMaterial color={it.color2 ?? "#8B5E3C"} /></mesh>
              <mesh position={[0, 3.5, 0]} castShadow><sphereGeometry args={[1.5, 12, 10]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.7, 3.0, 0.5]} castShadow><sphereGeometry args={[1.0, 10, 8]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[-0.5, 3.2, -0.4]}><sphereGeometry args={[0.9, 10, 8]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Alternate tree */}
          {it.type === "tree2" && (
            <group>
              <mesh position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.18, 0.22, 2.2, 8]} /><meshStandardMaterial color={it.color2 ?? "#7C4F1D"} /></mesh>
              <mesh position={[0, 2.7, 0]} castShadow><sphereGeometry args={[1.1, 10, 8]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Bunny */}
          {it.type === "bunny" && (
            <group>
              <mesh position={[0, 0.25, 0]}><sphereGeometry args={[0.22, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0, 0.45, 0]}><sphereGeometry args={[0.13, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[-0.08, 0.6, 0]}><cylinderGeometry args={[0.04, 0.04, 0.18, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.08, 0.6, 0]}><cylinderGeometry args={[0.04, 0.04, 0.18, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.06, 0.3, 0.18]}><sphereGeometry args={[0.04, 6, 4]} /><meshStandardMaterial color="#222" /></mesh>
              <mesh position={[-0.06, 0.3, 0.18]}><sphereGeometry args={[0.04, 6, 4]} /><meshStandardMaterial color="#222" /></mesh>
            </group>
          )}
          {/* Bird */}
          {it.type === "bird" && (
            <group>
              <mesh position={[0, 0.18, 0]}><sphereGeometry args={[0.12, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0, 0.28, 0]}><sphereGeometry args={[0.07, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.07, 0.18, 0]} rotation={[0, 0, 0.7]}><cylinderGeometry args={[0.01, 0.01, 0.12, 4]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[-0.07, 0.18, 0]} rotation={[0, 0, -0.7]}><cylinderGeometry args={[0.01, 0.01, 0.12, 4]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Butterfly */}
          {it.type === "butterfly" && (
            <group>
              <mesh position={[0, 0.18, 0]}><sphereGeometry args={[0.06, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.08, 0.18, 0]}><sphereGeometry args={[0.09, 8, 6]} /><meshStandardMaterial color={it.color} transparent opacity={0.7} /></mesh>
              <mesh position={[-0.08, 0.18, 0]}><sphereGeometry args={[0.09, 8, 6]} /><meshStandardMaterial color={it.color} transparent opacity={0.7} /></mesh>
            </group>
          )}
          {/* Cloud */}
          {it.type === "cloud" && (
            <group>
              <mesh position={[0, 2.2, 0]}><sphereGeometry args={[0.7, 10, 8]} /><meshStandardMaterial color={it.color} transparent opacity={0.7} /></mesh>
              <mesh position={[0.6, 2.3, 0.2]}><sphereGeometry args={[0.5, 10, 8]} /><meshStandardMaterial color={it.color} transparent opacity={0.6} /></mesh>
              <mesh position={[-0.5, 2.1, -0.2]}><sphereGeometry args={[0.4, 10, 8]} /><meshStandardMaterial color={it.color} transparent opacity={0.6} /></mesh>
            </group>
          )}
          {/* Pond */}
          {it.type === "pond" && (
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI/2, 0, 0]}><circleGeometry args={[1.2, 16]} /><meshStandardMaterial color={it.color} transparent opacity={0.7} /></mesh>
          )}
          {/* Swing */}
          {it.type === "swing" && (
            <group>
              <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.04, 0.04, 1.4, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0, 0.1, 0]}><boxGeometry args={[0.5, 0.08, 0.2]} /><meshStandardMaterial color="#FFD166" /></mesh>
              <mesh position={[0, 0.4, 0.1]}><cylinderGeometry args={[0.02, 0.02, 0.6, 6]} /><meshStandardMaterial color="#FFD166" /></mesh>
              <mesh position={[0, 0.4, -0.1]}><cylinderGeometry args={[0.02, 0.02, 0.6, 6]} /><meshStandardMaterial color="#FFD166" /></mesh>
            </group>
          )}
          {/* Sandcastle */}
          {it.type === "sandcastle" && (
            <group>
              <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.18, 0.18, 0.4, 8]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.2, 0.3, 0]}><coneGeometry args={[0.08, 0.15, 8]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[-0.2, 0.3, 0]}><coneGeometry args={[0.08, 0.15, 8]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Lizard */}
          {it.type === "lizard" && (
            <group>
              <mesh position={[0, 0.08, 0]}><sphereGeometry args={[0.08, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.1, 0.08, 0]} rotation={[0, 0, 0.7]}><cylinderGeometry args={[0.02, 0.02, 0.18, 6]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Igloo */}
          {it.type === "igloo" && (
            <group>
              <mesh position={[0, 0.3, 0]}><sphereGeometry args={[0.5, 10, 8, 0, Math.PI]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.3, 0.1, 0]} rotation={[0, 0, 0.2]}><cylinderGeometry args={[0.12, 0.12, 0.18, 8]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Penguin */}
          {it.type === "penguin" && (
            <group>
              <mesh position={[0, 0.18, 0]}><sphereGeometry args={[0.13, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0, 0.28, 0]}><sphereGeometry args={[0.09, 8, 6]} /><meshStandardMaterial color={it.color2 ?? "#fff"} /></mesh>
              <mesh position={[0.06, 0.18, 0.1]}><sphereGeometry args={[0.03, 6, 4]} /><meshStandardMaterial color={it.color2 ?? "#fff"} /></mesh>
              <mesh position={[-0.06, 0.18, 0.1]}><sphereGeometry args={[0.03, 6, 4]} /><meshStandardMaterial color={it.color2 ?? "#fff"} /></mesh>
            </group>
          )}
          {/* Fountain */}
          {it.type === "fountain" && (
            <group>
              <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.3, 0.3, 0.2, 12]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0, 0.25, 0]}><sphereGeometry args={[0.08, 8, 6]} /><meshStandardMaterial color="#AEEFFF" /></mesh>
            </group>
          )}
          {/* Slide */}
          {it.type === "slide" && (
            <group>
              <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.5, 0.08, 0.2]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.2, 0.3, 0]} rotation={[0, 0, 0.5]}><boxGeometry args={[0.2, 0.08, 0.2]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Fish */}
          {it.type === "fish" && (
            <group>
              <mesh position={[0, 0.08, 0]}><sphereGeometry args={[0.07, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.09, 0.08, 0]} rotation={[0, 0, Math.PI/2]}><coneGeometry args={[0.04, 0.1, 8]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Shell */}
          {it.type === "shell" && (
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI/2, 0, 0]}><circleGeometry args={[0.18, 12]} /><meshStandardMaterial color={it.color} /></mesh>
          )}
          {/* Bridge */}
          {it.type === "bridge" && (
            <group>
              <mesh position={[0, 0.12, 0]}><boxGeometry args={[1.2, 0.08, 0.3]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[-0.5, 0.22, 0]} rotation={[0, 0, 0.3]}><cylinderGeometry args={[0.04, 0.04, 1.0, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.5, 0.22, 0]} rotation={[0, 0, -0.3]}><cylinderGeometry args={[0.04, 0.04, 1.0, 6]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Koi */}
          {it.type === "koi" && (
            <group>
              <mesh position={[0, 0.08, 0]}><sphereGeometry args={[0.07, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.09, 0.08, 0]} rotation={[0, 0, Math.PI/2]}><coneGeometry args={[0.04, 0.1, 8]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Lava */}
          {it.type === "lava" && (
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI/2, 0, 0]}><circleGeometry args={[0.7, 16]} /><meshStandardMaterial color={it.color} emissive={it.emissive} emissiveIntensity={0.7} transparent opacity={0.8} /></mesh>
          )}
          {/* Bat */}
          {it.type === "bat" && (
            <group>
              <mesh position={[0, 0.18, 0]}><sphereGeometry args={[0.08, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.12, 0.18, 0]} rotation={[0, 0, 0.7]}><cylinderGeometry args={[0.01, 0.01, 0.18, 4]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[-0.12, 0.18, 0]} rotation={[0, 0, -0.7]}><cylinderGeometry args={[0.01, 0.01, 0.18, 4]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Star */}
          {it.type === "star" && (
            <mesh position={[0, 0.3, 0]}><octahedronGeometry args={[0.09, 0]} /><meshStandardMaterial color={it.color} emissive={it.color} emissiveIntensity={0.7} /></mesh>
          )}
          {/* Neon bunny */}
          {it.type === "neonbunny" && (
            <group>
              <mesh position={[0, 0.25, 0]}><sphereGeometry args={[0.22, 8, 6]} /><meshStandardMaterial color={it.color} emissive={it.emissive} emissiveIntensity={0.7} /></mesh>
              <mesh position={[0, 0.45, 0]}><sphereGeometry args={[0.13, 8, 6]} /><meshStandardMaterial color={it.color} emissive={it.emissive} emissiveIntensity={0.7} /></mesh>
              <mesh position={[-0.08, 0.6, 0]}><cylinderGeometry args={[0.04, 0.04, 0.18, 6]} /><meshStandardMaterial color={it.color} emissive={it.emissive} emissiveIntensity={0.7} /></mesh>
              <mesh position={[0.08, 0.6, 0]}><cylinderGeometry args={[0.04, 0.04, 0.18, 6]} /><meshStandardMaterial color={it.color} emissive={it.emissive} emissiveIntensity={0.7} /></mesh>
            </group>
          )}
          {/* Neon butterfly */}
          {it.type === "neonbutterfly" && (
            <group>
              <mesh position={[0, 0.18, 0]}><sphereGeometry args={[0.06, 8, 6]} /><meshStandardMaterial color={it.color} emissive={it.emissive} emissiveIntensity={0.7} /></mesh>
              <mesh position={[0.08, 0.18, 0]}><sphereGeometry args={[0.09, 8, 6]} /><meshStandardMaterial color={it.color} emissive={it.emissive} emissiveIntensity={0.7} transparent opacity={0.7} /></mesh>
              <mesh position={[-0.08, 0.18, 0]}><sphereGeometry args={[0.09, 8, 6]} /><meshStandardMaterial color={it.color} emissive={it.emissive} emissiveIntensity={0.7} transparent opacity={0.7} /></mesh>
            </group>
          )}
          {/* Pine tree (snow) */}
          {it.type === "pinetree" && (
            <group>
              <mesh position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.15, 0.25, 2.4, 8]} /><meshStandardMaterial color={it.color2 ?? "#8B5E3C"} /></mesh>
              <mesh position={[0, 3.2, 0]} castShadow><coneGeometry args={[1.2, 2.5, 8]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0, 4.2, 0]} castShadow><coneGeometry args={[0.8, 1.8, 8]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Cherry blossom tree */}
          {it.type === "cherrytree" && (
            <group>
              <mesh position={[0, 1.8, 0]} castShadow><cylinderGeometry args={[0.18, 0.28, 3.6, 8]} /><meshStandardMaterial color={it.color2 ?? "#8B5E3C"} /></mesh>
              <mesh position={[0, 4.0, 0]} castShadow><sphereGeometry args={[1.8, 12, 10]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[1.0, 3.5, 0.6]} castShadow><sphereGeometry args={[1.1, 10, 8]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Dead tree */}
          {it.type === "deadtree" && (
            <group>
              <mesh position={[0, 1.5, 0]} castShadow><cylinderGeometry args={[0.15, 0.25, 3, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.3, 2.8, 0]} rotation={[0, 0, 0.5]}><cylinderGeometry args={[0.06, 0.1, 1.2, 5]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[-0.2, 2.5, 0.1]} rotation={[0, 0, -0.4]}><cylinderGeometry args={[0.05, 0.08, 1.0, 5]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Flower */}
          {it.type === "flower" && (
            <group>
              <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.03, 0.03, 0.6, 6]} /><meshStandardMaterial color="#5cb85c" /></mesh>
              <mesh position={[0, 0.65, 0]}><sphereGeometry args={[0.15, 8, 6]} /><meshStandardMaterial color={it.color} emissive={it.color} emissiveIntensity={0.2} /></mesh>
            </group>
          )}
          {/* Mushroom */}
          {it.type === "mushroom" && (
            <group>
              <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.1, 0.12, 0.6, 8]} /><meshStandardMaterial color={it.color2 ?? "#FFF5E1"} /></mesh>
              <mesh position={[0, 0.65, 0]}><sphereGeometry args={[0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={it.color} emissive={it.emissive} emissiveIntensity={it.emissive ? 0.4 : 0} /></mesh>
            </group>
          )}
          {/* Bush */}
          {it.type === "bush" && (
            <group>
              <mesh position={[0, 0.4, 0]} castShadow><sphereGeometry args={[0.6, 10, 8]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.35, 0.3, 0.2]}><sphereGeometry args={[0.4, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Rock */}
          {it.type === "rock" && (
            <mesh position={[0, 0.25, 0]} castShadow><dodecahedronGeometry args={[0.5, 0]} /><meshStandardMaterial color={it.color} flatShading /></mesh>
          )}
          {/* Cactus */}
          {it.type === "cactus" && (
            <group>
              <mesh position={[0, 1.0, 0]} castShadow><cylinderGeometry args={[0.2, 0.25, 2, 8]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.28, 1.3, 0]} rotation={[0, 0, Math.PI / 3]}><cylinderGeometry args={[0.1, 0.12, 0.7, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0, 2.1, 0]}><sphereGeometry args={[0.22, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Tumbleweed */}
          {it.type === "tumbleweed" && (
            <mesh position={[0, 0.3, 0]}><sphereGeometry args={[0.35, 8, 6]} /><meshStandardMaterial color={it.color} wireframe /></mesh>
          )}
          {/* Snowman */}
          {it.type === "snowman" && (
            <group>
              <mesh position={[0, 0.5, 0]}><sphereGeometry args={[0.5, 10, 8]} /><meshStandardMaterial color="#FFFFFF" /></mesh>
              <mesh position={[0, 1.2, 0]}><sphereGeometry args={[0.35, 10, 8]} /><meshStandardMaterial color="#FFFFFF" /></mesh>
              <mesh position={[0, 1.75, 0]}><sphereGeometry args={[0.25, 10, 8]} /><meshStandardMaterial color="#FFFFFF" /></mesh>
              <mesh position={[0.12, 1.8, 0.2]}><sphereGeometry args={[0.04, 6, 4]} /><meshStandardMaterial color="#222" /></mesh>
              <mesh position={[-0.12, 1.8, 0.2]}><sphereGeometry args={[0.04, 6, 4]} /><meshStandardMaterial color="#222" /></mesh>
              <mesh position={[0, 1.72, 0.24]}><coneGeometry args={[0.05, 0.25, 6]} /><meshStandardMaterial color="#FF8C00" /></mesh>
            </group>
          )}
          {/* Crystal */}
          {it.type === "crystal" && (
            <group>
              <mesh position={[0, 0.8, 0]} rotation={[0.1, 0, 0.05]} castShadow><octahedronGeometry args={[0.5, 0]} /><meshStandardMaterial color={it.color} emissive={it.emissive ?? it.color} emissiveIntensity={0.6} transparent opacity={0.85} /></mesh>
              <mesh position={[0.3, 0.5, 0.2]} rotation={[0.2, 0.5, 0.1]}><octahedronGeometry args={[0.3, 0]} /><meshStandardMaterial color={it.color} emissive={it.emissive ?? it.color} emissiveIntensity={0.6} transparent opacity={0.85} /></mesh>
            </group>
          )}
          {/* Asteroid */}
          {it.type === "asteroid" && (
            <mesh position={[0, 0.5 + Math.random() * 3, 0]} castShadow><dodecahedronGeometry args={[0.6, 1]} /><meshStandardMaterial color={it.color} flatShading /></mesh>
          )}
          {/* Coral */}
          {it.type === "coral" && (
            <group>
              <mesh position={[0, 0.4, 0]}><sphereGeometry args={[0.4, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.2, 0.7, 0.1]}><sphereGeometry args={[0.25, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[-0.15, 0.6, -0.1]}><sphereGeometry args={[0.2, 8, 6]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Seaweed */}
          {it.type === "seaweed" && (
            <group>
              <mesh position={[0, 0.8, 0]}><cylinderGeometry args={[0.05, 0.08, 1.6, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.1, 1.0, 0.05]}><cylinderGeometry args={[0.04, 0.06, 1.2, 6]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Lamp post */}
          {it.type === "lamppost" && (
            <group>
              <mesh position={[0, 1.8, 0]}><cylinderGeometry args={[0.06, 0.08, 3.6, 6]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0, 3.7, 0]}><sphereGeometry args={[0.2, 8, 6]} /><meshStandardMaterial color={it.color2 ?? "#FFE066"} emissive={it.color2 ?? "#FFE066"} emissiveIntensity={0.8} /></mesh>
            </group>
          )}
          {/* Bench */}
          {it.type === "bench" && (
            <group>
              <mesh position={[0, 0.3, 0]}><boxGeometry args={[1.0, 0.08, 0.4]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[-0.4, 0.15, 0]}><boxGeometry args={[0.08, 0.3, 0.35]} /><meshStandardMaterial color={it.color} /></mesh>
              <mesh position={[0.4, 0.15, 0]}><boxGeometry args={[0.08, 0.3, 0.35]} /><meshStandardMaterial color={it.color} /></mesh>
            </group>
          )}
          {/* Lantern */}
          {it.type === "lantern" && (
            <group>
              <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.3, 0.5, 0.3]} /><meshStandardMaterial color={it.color} emissive={it.emissive ?? it.color} emissiveIntensity={0.5} transparent opacity={0.9} /></mesh>
              <mesh position={[0, 0.7, 0]}><boxGeometry args={[0.35, 0.05, 0.35]} /><meshStandardMaterial color="#333" /></mesh>
              <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.35, 0.05, 0.35]} /><meshStandardMaterial color="#333" /></mesh>
            </group>
          )}
          {/* Stalagmite */}
          {it.type === "stalagmite" && (
            <mesh position={[0, 0.7, 0]} castShadow><coneGeometry args={[0.3, 1.4, 6]} /><meshStandardMaterial color={it.color} flatShading /></mesh>
          )}
          {/* Neon pillar */}
          {it.type === "pillar" && (
            <mesh position={[0, 1.5, 0]} castShadow><cylinderGeometry args={[0.15, 0.15, 3, 8]} /><meshStandardMaterial color={it.color} emissive={it.emissive ?? it.color} emissiveIntensity={1.0} /></mesh>
          )}
        </group>
      ))}
    </group>
  );
}

export default function Stage3D({ sprites, stage, running, onSpriteMove, onAddSprite }: Props) {
  const [selectedSprite, setSelectedSprite] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [showGrid, setShowGrid] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const activePreset = inferEnvironmentPreset(stage);
  const theme = ENV3D_THEMES[activePreset];
  const engineRef = useRef<RuntimeEngine | null>(null);
  const spritesRef = useRef(sprites);
  spritesRef.current = sprites;

  /* ── Start / stop runtime engine ── */
  useEffect(() => {
    if (running) {
      // Use a much larger stage for 3D so the world feels big
      const engine = createRuntime(sprites, 4000, 4000);
      engineRef.current = engine;
      startGreenFlag(engine, sprites);
    } else {
      if (engineRef.current) stopRuntime(engineRef.current);
      engineRef.current = null;
    }
  }, [running]);

  /* ── Keyboard events ── */
  useEffect(() => {
    if (!running) return;
    const onDown = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      // Prevent browser scrolling for gameplay keys
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
      eng.keysPressed.add(e.key.toLowerCase());
      triggerKeyPress(eng, spritesRef.current, e.key.toLowerCase());
      if (e.key === " ") triggerKeyPress(eng, spritesRef.current, "space");
      if (e.key === "ArrowUp") triggerKeyPress(eng, spritesRef.current, "up arrow");
      if (e.key === "ArrowDown") triggerKeyPress(eng, spritesRef.current, "down arrow");
      if (e.key === "ArrowLeft") triggerKeyPress(eng, spritesRef.current, "left arrow");
      if (e.key === "ArrowRight") triggerKeyPress(eng, spritesRef.current, "right arrow");
      if (e.key.toLowerCase() === "w") triggerKeyPress(eng, spritesRef.current, "up arrow");
      if (e.key.toLowerCase() === "s") triggerKeyPress(eng, spritesRef.current, "down arrow");
      if (e.key.toLowerCase() === "a") triggerKeyPress(eng, spritesRef.current, "left arrow");
      if (e.key.toLowerCase() === "d") triggerKeyPress(eng, spritesRef.current, "right arrow");
    };
    const onUp = (e: KeyboardEvent) => { engineRef.current?.keysPressed.delete(e.key.toLowerCase()); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [running]);

  const handleClick3D = useCallback((id: string) => {
    setSelectedSprite(id);
    if (running && engineRef.current) triggerSpriteClick(engineRef.current, spritesRef.current, id);
  }, [running]);

  const handleTransform = useCallback((id: string, pos: THREE.Vector3) => {
    onSpriteMove?.(id, Math.round(pos.x * SCALE), Math.round(pos.z * SCALE));
  }, [onSpriteMove]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-black" style={{ height: 360 }}>
      <Canvas
        camera={{ position: [stage.camera?.x ?? 0, stage.camera?.y ?? 5, stage.camera?.z ?? 10], fov: stage.camera?.fov ?? 60 }}
        shadows
      >
        <Suspense fallback={<Html center><div className="text-white text-sm">Loading 3D...</div></Html>}>
          <color attach="background" args={[theme.background]} />
          <fog attach="fog" args={[theme.fog, theme.fogNear, theme.fogFar]} />
          <Sky
            distance={theme.sky.distance}
            turbidity={theme.sky.turbidity}
            rayleigh={theme.sky.rayleigh}
            mieCoefficient={theme.sky.mieCoefficient}
            mieDirectionalG={theme.sky.mieDirectionalG}
            inclination={theme.sky.inclination}
            azimuth={theme.sky.azimuth}
          />
          <ambientLight intensity={theme.ambient} />
          <hemisphereLight color={theme.keyLightColor} groundColor={theme.ground} intensity={0.34} />
          {(stage.lights || []).map((light, i) => <SceneLight key={i} light={light} />)}
          {(!stage.lights || stage.lights.length === 0) && (
            <>
              <directionalLight position={[7, 12, 6]} intensity={theme.keyLight} color={theme.keyLightColor} castShadow shadow-mapSize={[1024, 1024]} />
              <pointLight position={[-7, 5, -5]} intensity={theme.fillLight} color={theme.fillLightColor} />
              <spotLight position={[0, 15, 0]} angle={0.45} penumbra={0.85} intensity={0.25} color={theme.keyLightColor} castShadow />
            </>
          )}

          {showGrid && <Grid infiniteGrid fadeDistance={120} cellSize={2} cellColor={theme.gridCell} sectionSize={10} sectionColor={theme.gridSection} />}
          {/* Large ground plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
            <circleGeometry args={[120, 96]} />
            <meshStandardMaterial color={theme.ground} roughness={0.92} metalness={0.05} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[260, 260]} />
            <shadowMaterial opacity={0.25} />
          </mesh>

          <RuntimeStepper engineRef={engineRef} spritesRef={spritesRef} running={running} />
          <WeatherParticles engineRef={engineRef} running={running} />
          <EnvironmentDecorations preset={activePreset} />

          {sprites.map((sprite) => (
            <Sprite3D key={sprite.id} sprite={sprite} engineRef={engineRef} running={running}
              selected={selectedSprite === sprite.id}
              onClick={() => handleClick3D(sprite.id)}
              transformMode={transformMode}
              showTransform={selectedSprite === sprite.id && !running}
              onTransformChange={handleTransform} />
          ))}

          <OrbitControls makeDefault enableDamping dampingFactor={0.1} enabled={!running} />
          <Environment preset={theme.envPreset} />
        </Suspense>
      </Canvas>

      {/* 3D toolbar */}
      <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
        {(["translate", "rotate", "scale"] as TransformMode[]).map((m) => (
          <button key={m} onClick={() => setTransformMode(m)}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-all font-medium ${
              transformMode === m
                ? "bg-violet-600/90 border-violet-500/50 text-white"
                : "bg-black/50 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80"
            }`}>
            {m === "translate" ? "↔ Move" : m === "rotate" ? "↻ Rotate" : "⤢ Scale"}
          </button>
        ))}
        <button onClick={() => setShowGrid(!showGrid)}
          className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
            showGrid ? "bg-white/10 border-white/20 text-white/60" : "bg-black/50 border-white/10 text-white/30"
          }`}>Grid</button>
        {onAddSprite && (
          <div className="relative">
            <button onClick={() => setShowAddMenu(!showAddMenu)}
              className="px-2.5 py-1 text-xs rounded-lg border border-emerald-500/40 bg-emerald-600/80 text-white hover:bg-emerald-500 transition-all font-medium">
              + Object
            </button>
            {showAddMenu && (
              <div className="absolute top-full left-0 mt-1 bg-[#1a1a2e] border border-white/[0.1] rounded-lg p-1 shadow-xl z-10 min-w-[110px]"
                onMouseLeave={() => setShowAddMenu(false)}>
                {SCENE_OBJECTS.map((obj) => (
                  <button key={obj.shape}
                    onClick={() => { onAddSprite(obj.name, obj.shape); setShowAddMenu(false); }}
                    className="w-full text-left px-2 py-1.5 text-xs text-white/70 hover:bg-white/[0.08] rounded-md flex items-center gap-2">
                    <span>{obj.icon}</span> {obj.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedSprite && (
        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70">
          {sprites.find(s => s.id === selectedSprite)?.name || "Object"} · {sprites.find(s => s.id === selectedSprite)?.shape3d || "box"}
        </div>
      )}
      {running && (
        <div className="absolute top-2 right-2 bg-emerald-600/80 text-white text-[10px] px-2 py-0.5 rounded-full font-medium animate-pulse">
          ▶ Running
        </div>
      )}
    </div>
  );
}

/* ── Runtime stepper (inside Canvas for useFrame) ── */
function RuntimeStepper({ engineRef, spritesRef, running }: {
  engineRef: React.MutableRefObject<RuntimeEngine | null>;
  spritesRef: React.MutableRefObject<Sprite[]>;
  running: boolean;
}) {
  const { camera, scene } = useThree();
  const shakeRef = useRef({ ox: 0, oy: 0, oz: 0 });
  const camTargetRef = useRef(new THREE.Vector3(0, 5, 10));
  const camLookRef = useRef(new THREE.Vector3(0, 0.5, 0));

  useFrame((_, delta) => {
    if (!running || !engineRef.current) return;
    const engine = engineRef.current;
    stepRuntime(engine, spritesRef.current, Math.min(delta, 0.05));

    const gv = engine.globalVariables;
    const SC = 40; // same SCALE as sprites use

    /* ── Apply WASD / arrow key movement to first sprite ── */
    const firstSprite = spritesRef.current.find(s => !s.id.startsWith("env_"));
    const playState = firstSprite ? engine.sprites.get(firstSprite.id) : undefined;
    if (playState) {
      const keys = engine.keysPressed;
      const has = (...names: string[]) => names.some(n => keys.has(n));
      const speed = has("shift") ? 12 : 5;
      if (has("arrowleft", "a")) playState.x -= speed;
      if (has("arrowright", "d")) playState.x += speed;
      if (has("arrowup", "w")) playState.y += speed;
      if (has("arrowdown", "s")) playState.y -= speed;
      // Jump with space when on ground
      if (has(" ") && playState.gravity > 0 && playState.y <= -engine.stageHeight / 2 + 22) {
        playState.vy = 12;
      }
      // Clamp to big stage
      const hw = engine.stageWidth / 2 - 20;
      const hh = engine.stageHeight / 2 - 20;
      playState.x = Math.max(-hw, Math.min(hw, playState.x));
      playState.y = Math.max(-hh, Math.min(hh, playState.y));
    }

    /* ── Determine which sprite the camera should follow ── */
    const explicitFollowId = gv["env_cam_follow"] as string;
    const followId = explicitFollowId || firstSprite?.id;
    const followState = followId ? engine.sprites.get(followId) : undefined;

    /* ── Camera FOV ── */
    const camFov = Number(gv["env_cam_fov"] ?? undefined);
    if (!isNaN(camFov) && gv["env_cam_fov"] !== undefined && (camera as THREE.PerspectiveCamera).fov !== undefined) {
      (camera as THREE.PerspectiveCamera).fov = camFov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }

    /* ── Camera follow / manual position ── */
    if (followState) {
      // 3rd-person camera: behind and above the sprite
      const spriteX = followState.x / SC;
      const spriteZ = -followState.y / SC;
      // Height above ground for jumping sprites
      const groundLevel = -engine.stageHeight / 2;
      const heightAbove = followState.gravity > 0
        ? Math.max(0, (followState.y - groundLevel) / SC)
        : 0;
      const spriteY = 0.5 + heightAbove;

      // Camera offset: behind (+z), above (+y)
      const camOffsetY = 4;
      const camOffsetZ = 7;
      const camRotDeg = Number(gv["env_cam_rot"] ?? 0);
      const camRotRad = -(camRotDeg * Math.PI) / 180;
      const offsetX = Math.sin(camRotRad) * camOffsetZ;
      const offsetZ = Math.cos(camRotRad) * camOffsetZ;

      camTargetRef.current.set(spriteX + offsetX, spriteY + camOffsetY, spriteZ + offsetZ);
      camLookRef.current.set(spriteX, spriteY, spriteZ);

      // Smooth lerp towards target
      const lerpSpeed = 0.06;
      camera.position.lerp(camTargetRef.current, lerpSpeed);
      // Smoothly look at the sprite
      const currentLook = new THREE.Vector3();
      camera.getWorldDirection(currentLook);
      camera.lookAt(camLookRef.current);
    } else if (gv["env_cam_x"] !== undefined) {
      /* ── Manual camera position (no follow target) ── */
      const camX = Number(gv["env_cam_x"]);
      const camY = Number(gv["env_cam_y"] ?? 5);
      const camZ = Number(gv["env_cam_z"] ?? 10);
      camera.position.set(camX, camY, camZ);
      const camRot = Number(gv["env_cam_rot"] ?? 0);
      if (camRot) camera.rotation.y = -(camRot * Math.PI) / 180;
    }

    /* ── Camera shake ── */
    const shakeUntil = Number(gv["camera_shake_until"] ?? 0);
    const shakePower = Number(gv["camera_shake_power"] ?? 0);
    if (engine.timer < shakeUntil && shakePower > 0) {
      const intensity = shakePower * 0.015;
      camera.position.x += (Math.random() - 0.5) * intensity;
      camera.position.y += (Math.random() - 0.5) * intensity;
      camera.position.z += (Math.random() - 0.5) * intensity;
    }

    /* ── Fog density ── */
    const fogDensity = Number(gv["env_fog_density"] ?? undefined);
    if (!isNaN(fogDensity) && gv["env_fog_density"] !== undefined && scene.fog) {
      const fog = scene.fog as THREE.Fog;
      fog.near = Math.max(2, 30 - fogDensity * 0.3);
      fog.far = Math.max(10, 80 - fogDensity * 0.6);
    }

    /* ── Ambient light ── */
    const ambient = Number(gv["env_ambient"] ?? undefined);
    if (!isNaN(ambient) && gv["env_ambient"] !== undefined) {
      scene.traverse((child) => {
        if ((child as any).isAmbientLight) {
          (child as THREE.AmbientLight).intensity = ambient;
        }
      });
    }

    /* ── Dynamic sky/ground color ── */
    const skyColor = gv["env_sky_color"] as string;
    if (skyColor) {
      scene.background = new THREE.Color(skyColor);
    }
  });
  return null;
}

function ShapeGeometry({ shape }: { shape?: string }) {
  switch (shape) {
    case "sphere": return <sphereGeometry args={[0.5, 32, 32]} />;
    case "cylinder": return <cylinderGeometry args={[0.4, 0.4, 1, 32]} />;
    case "cone": return <coneGeometry args={[0.5, 1, 32]} />;
    case "torus": return <torusGeometry args={[0.4, 0.15, 16, 32]} />;
    case "plane": return <planeGeometry args={[1, 1]} />;
    case "capsule": return <capsuleGeometry args={[0.3, 0.5, 8, 16]} />;
    default: return <boxGeometry args={[1, 1, 1]} />;
  }
}

/* ── Individual 3D sprite with runtime integration ── */
function Sprite3D({ sprite, engineRef, running, selected, onClick, transformMode, showTransform, onTransformChange }: {
  sprite: Sprite;
  engineRef: React.MutableRefObject<RuntimeEngine | null>;
  running: boolean;
  selected: boolean;
  onClick: () => void;
  transformMode: TransformMode;
  showTransform: boolean;
  onTransformChange: (id: string, pos: THREE.Vector3) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const transformRef = useRef<any>(null);
  const [costumeTexture, setCostumeTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const costume = sprite.costumes[sprite.costumeIndex];
    if (costume?.url) {
      const loader = new THREE.TextureLoader();
      loader.load(costume.url, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; setCostumeTexture(tex); });
    } else {
      setCostumeTexture(null);
    }
  }, [sprite.costumes, sprite.costumeIndex]);

  // Persist transform when dragging ends
  useEffect(() => {
    const tc = transformRef.current;
    if (!tc) return;
    const onDragEnd = () => {
      if (meshRef.current) onTransformChange(sprite.id, meshRef.current.position);
    };
    tc.addEventListener("dragging-changed", (e: any) => {
      if (!e.value) onDragEnd(); // drag ended
    });
  }, [showTransform, sprite.id, onTransformChange]);

  // Sync runtime state → mesh every frame
  useFrame(() => {
    if (!meshRef.current) return;
    const engine = engineRef.current;
    if (running && engine) {
      const st = engine.sprites.get(sprite.id);
      if (st) {
        meshRef.current.position.x = st.x / SCALE;
        meshRef.current.position.z = -st.y / SCALE;
        // When gravity is active, use vy for vertical height in 3D
        if (st.gravity > 0) {
          const groundLevel = -engine.stageHeight / 2;
          const heightAboveGround = Math.max(0, (st.y - groundLevel) / SCALE);
          meshRef.current.position.y = 0.5 + heightAboveGround;
        }
        meshRef.current.rotation.y = -((st.rotation - 90) * Math.PI) / 180;
        meshRef.current.scale.setScalar(st.scale);
        meshRef.current.visible = st.visible;
      }
    }
  });

  const palettes = [
    ["#8b5cf6", "#312e81"], ["#6366f1", "#1e1b4b"], ["#a78bfa", "#4c1d95"],
    ["#818cf8", "#3730a3"], ["#c084fc", "#581c87"], ["#7c3aed", "#2e1065"],
  ];
  const [mainColor, emissiveColor] = palettes[Math.abs(sprite.name.charCodeAt(0)) % palettes.length];

  const engine = engineRef.current;
  const rs = running && engine ? engine.sprites.get(sprite.id) : undefined;
  const posX = rs ? rs.x / SCALE : sprite.x / SCALE;
  const posZ = rs ? -rs.y / SCALE : -(sprite.z ?? sprite.y) / SCALE;

  const meshEl = (
    <mesh ref={meshRef} position={[sprite.x / SCALE, 0.5, -(sprite.z ?? sprite.y) / SCALE]}
      scale={sprite.scale} castShadow
      onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <ShapeGeometry shape={sprite.shape3d} />
      <meshStandardMaterial
        color={costumeTexture ? "#ffffff" : mainColor}
        map={costumeTexture}
        emissive={selected ? "#8b5cf6" : emissiveColor}
        emissiveIntensity={selected ? 0.4 : 0.05} roughness={0.3} metalness={0.1} />
    </mesh>
  );

  return (
    <group>
      {showTransform ? (
        <TransformControls ref={transformRef} mode={transformMode} object={meshRef}>
          {meshEl}
        </TransformControls>
      ) : meshEl}

      <Html distanceFactor={5} position={[posX, 1.2, posZ]} center>
        <div className="text-white text-[10px] bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-md whitespace-nowrap border border-white/10 pointer-events-none">
          {sprite.name}
        </div>
      </Html>
      {rs?.sayText && (
        <Html distanceFactor={4} position={[posX, 1.8, posZ]} center>
          <div className="bg-white text-black text-xs px-2.5 py-1 rounded-lg shadow-lg max-w-[140px] border pointer-events-none">
            {rs.sayText}
          </div>
        </Html>
      )}
    </group>
  );
}

function SceneLight({ light }: { light: Light3D }) {
  const pos: [number, number, number] = [light.x ?? 0, light.y ?? 5, light.z ?? 0];
  switch (light.type) {
    case "ambient":
      return <ambientLight intensity={light.intensity} color={light.color} />;
    case "directional":
      return <directionalLight position={pos} intensity={light.intensity} color={light.color} castShadow />;
    case "point":
      return <pointLight position={pos} intensity={light.intensity} color={light.color} />;
    case "spotlight":
      return (
        <spotLight position={pos} intensity={light.intensity} color={light.color}
          angle={light.angle ?? 0.5} penumbra={light.penumbra ?? 0.5} castShadow />
      );
    default:
      return null;
  }
}
