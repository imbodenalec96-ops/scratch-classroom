import React, { useState, useCallback, Suspense, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import type { Shape3D } from "@scratch/shared";

interface Props {
  currentShape: Shape3D;
  currentColor: string;
  onSave: (shape: Shape3D, color: string, scaleX: number, scaleY: number, scaleZ: number) => void;
  onClose: () => void;
}

const SHAPES: { id: Shape3D; label: string; icon: string }[] = [
  { id: "box", label: "Box", icon: "◻️" },
  { id: "sphere", label: "Sphere", icon: "🔵" },
  { id: "cylinder", label: "Cylinder", icon: "🥫" },
  { id: "cone", label: "Cone", icon: "🔺" },
  { id: "torus", label: "Torus", icon: "🍩" },
  { id: "plane", label: "Plane", icon: "📄" },
  { id: "capsule", label: "Capsule", icon: "💊" },
];

const COLOR_PRESETS = [
  { name: "Violet", color: "#8b5cf6" },
  { name: "Indigo", color: "#6366f1" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Cyan", color: "#06b6d4" },
  { name: "Green", color: "#22c55e" },
  { name: "Yellow", color: "#eab308" },
  { name: "Orange", color: "#f97316" },
  { name: "Red", color: "#ef4444" },
  { name: "Pink", color: "#ec4899" },
  { name: "White", color: "#ffffff" },
  { name: "Gray", color: "#6b7280" },
  { name: "Dark", color: "#1f2937" },
  { name: "Gold", color: "#FFD700" },
  { name: "Bronze", color: "#CD7F32" },
  { name: "Silver", color: "#C0C0C0" },
  { name: "Wood", color: "#8B4513" },
];

const MATERIAL_PRESETS = [
  { name: "Default", roughness: 0.5, metalness: 0.1 },
  { name: "Shiny", roughness: 0.1, metalness: 0.8 },
  { name: "Matte", roughness: 0.9, metalness: 0.0 },
  { name: "Glass", roughness: 0.0, metalness: 0.1 },
  { name: "Metal", roughness: 0.3, metalness: 1.0 },
  { name: "Plastic", roughness: 0.4, metalness: 0.0 },
];

function ShapeGeometry({ shape }: { shape: Shape3D }) {
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

function PreviewMesh({ shape, color, scaleX, scaleY, scaleZ, roughness, metalness, emissive, wireframe }: {
  shape: Shape3D; color: string; scaleX: number; scaleY: number; scaleZ: number;
  roughness: number; metalness: number; emissive: string; wireframe: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);

  return (
    <mesh ref={meshRef} scale={[scaleX, scaleY, scaleZ]} castShadow>
      <ShapeGeometry shape={shape} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive}
        emissiveIntensity={emissive !== "#000000" ? 0.3 : 0}
        wireframe={wireframe}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function ShapeEditor3D({ currentShape, currentColor, onSave, onClose }: Props) {
  const [shape, setShape] = useState<Shape3D>(currentShape);
  const [color, setColor] = useState(currentColor || "#8b5cf6");
  const [emissive, setEmissive] = useState("#000000");
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [scaleZ, setScaleZ] = useState(1);
  const [roughness, setRoughness] = useState(0.5);
  const [metalness, setMetalness] = useState(0.1);
  const [wireframe, setWireframe] = useState(false);

  const handleSave = useCallback(() => {
    onSave(shape, color, scaleX, scaleY, scaleZ);
  }, [shape, color, scaleX, scaleY, scaleZ, onSave]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#12122a] rounded-2xl border border-white/[0.08] shadow-2xl w-[700px] max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-white font-bold text-sm">🧊 3D Shape Editor</h2>
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-3 py-1 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-500 font-medium">
              ✓ Apply Shape
            </button>
            <button onClick={onClose} className="px-2 py-1 text-xs rounded-lg text-white/40 hover:text-white/70">✕</button>
          </div>
        </div>

        <div className="flex">
          {/* 3D Preview */}
          <div className="flex-1 h-[400px] bg-black/40">
            <Canvas camera={{ position: [2, 2, 3], fov: 50 }} shadows>
              <Suspense fallback={<Html center><div className="text-white text-xs">Loading...</div></Html>}>
                <ambientLight intensity={0.4} />
                <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
                <pointLight position={[-3, 3, -3]} intensity={0.3} color="#8b5cf6" />

                <PreviewMesh shape={shape} color={color} scaleX={scaleX} scaleY={scaleY} scaleZ={scaleZ}
                  roughness={roughness} metalness={metalness} emissive={emissive} wireframe={wireframe} />

                {/* Ground plane */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, 0]} receiveShadow>
                  <planeGeometry args={[10, 10]} />
                  <shadowMaterial opacity={0.3} />
                </mesh>

                <OrbitControls enableDamping dampingFactor={0.1} />
                <Environment preset="night" />
              </Suspense>
            </Canvas>
          </div>

          {/* Controls */}
          <div className="w-56 bg-black/20 border-l border-white/[0.06] p-3 overflow-y-auto max-h-[400px] space-y-4">
            {/* Shape picker */}
            <div>
              <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Shape</span>
              <div className="grid grid-cols-4 gap-1 mt-1.5">
                {SHAPES.map(s => (
                  <button key={s.id} onClick={() => setShape(s.id)}
                    className={`py-1.5 rounded-lg text-center transition-all ${
                      shape === s.id ? "bg-violet-600 text-white" : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]"
                    }`}>
                    <div className="text-sm">{s.icon}</div>
                    <div className="text-[8px]">{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div>
              <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Color</span>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="w-8 h-8 rounded-lg border border-white/20" style={{ backgroundColor: color }} />
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer" />
              </div>
              <div className="grid grid-cols-8 gap-1 mt-1.5">
                {COLOR_PRESETS.map(c => (
                  <button key={c.name} onClick={() => setColor(c.color)}
                    className={`w-5 h-5 rounded-md border transition-all ${
                      color === c.color ? "border-white scale-110" : "border-white/10 hover:border-white/30"
                    }`} style={{ backgroundColor: c.color }} title={c.name} />
                ))}
              </div>
            </div>

            {/* Glow color */}
            <div>
              <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Glow</span>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={emissive} onChange={e => setEmissive(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer" />
                <button onClick={() => setEmissive("#000000")} className="text-[10px] text-white/40 hover:text-white/60">Reset</button>
              </div>
            </div>

            {/* Scale */}
            <div>
              <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Scale</span>
              <div className="space-y-1 mt-1.5">
                {[
                  { label: "X", value: scaleX, set: setScaleX },
                  { label: "Y", value: scaleY, set: setScaleY },
                  { label: "Z", value: scaleZ, set: setScaleZ },
                ].map(({ label, value, set }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[10px] text-white/40 w-3">{label}</span>
                    <input type="range" min={0.1} max={4} step={0.1} value={value}
                      onChange={e => set(Number(e.target.value))}
                      className="flex-1 accent-violet-500" />
                    <span className="text-[10px] text-white/50 w-6 text-right">{value.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Material */}
            <div>
              <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Material</span>
              <div className="grid grid-cols-3 gap-1 mt-1.5">
                {MATERIAL_PRESETS.map(m => (
                  <button key={m.name} onClick={() => { setRoughness(m.roughness); setMetalness(m.metalness); }}
                    className={`text-[9px] py-1 rounded-md transition-all ${
                      roughness === m.roughness && metalness === m.metalness
                        ? "bg-violet-600 text-white" : "bg-white/[0.04] text-white/40 hover:bg-white/[0.08]"
                    }`}>{m.name}</button>
                ))}
              </div>
              <div className="space-y-1 mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-white/30 w-12">Rough</span>
                  <input type="range" min={0} max={1} step={0.1} value={roughness}
                    onChange={e => setRoughness(Number(e.target.value))}
                    className="flex-1 accent-violet-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-white/30 w-12">Metal</span>
                  <input type="range" min={0} max={1} step={0.1} value={metalness}
                    onChange={e => setMetalness(Number(e.target.value))}
                    className="flex-1 accent-violet-500" />
                </div>
              </div>
            </div>

            {/* Wireframe toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={wireframe} onChange={e => setWireframe(e.target.checked)}
                className="accent-violet-500" />
              <span className="text-xs text-white/50">Wireframe</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
