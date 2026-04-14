import React, { useRef, Suspense, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Html, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { Sprite, StageSettings, Light3D, Shape3D } from "@scratch/shared";
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

const SCENE_OBJECTS: { name: string; shape: Shape3D; icon: string }[] = [
  { name: "Box", shape: "box", icon: "📦" },
  { name: "Ball", shape: "sphere", icon: "⚽" },
  { name: "Pillar", shape: "cylinder", icon: "🏛️" },
  { name: "Cone", shape: "cone", icon: "🔺" },
  { name: "Ring", shape: "torus", icon: "🍩" },
  { name: "Wall", shape: "plane", icon: "🧱" },
  { name: "Capsule", shape: "capsule", icon: "💊" },
];

export default function Stage3D({ sprites, stage, running, onSpriteMove, onAddSprite }: Props) {
  const [selectedSprite, setSelectedSprite] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [showGrid, setShowGrid] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const engineRef = useRef<RuntimeEngine | null>(null);
  const spritesRef = useRef(sprites);
  spritesRef.current = sprites;

  /* ── Start / stop runtime engine ── */
  useEffect(() => {
    if (running) {
      const engine = createRuntime(sprites, stage.width, stage.height);
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
      eng.keysPressed.add(e.key.toLowerCase());
      triggerKeyPress(eng, spritesRef.current, e.key.toLowerCase());
      if (e.key === " ") triggerKeyPress(eng, spritesRef.current, "space");
      if (e.key === "ArrowUp") triggerKeyPress(eng, spritesRef.current, "up arrow");
      if (e.key === "ArrowDown") triggerKeyPress(eng, spritesRef.current, "down arrow");
      if (e.key === "ArrowLeft") triggerKeyPress(eng, spritesRef.current, "left arrow");
      if (e.key === "ArrowRight") triggerKeyPress(eng, spritesRef.current, "right arrow");
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
          <ambientLight intensity={0.3} />
          {(stage.lights || []).map((light, i) => <SceneLight key={i} light={light} />)}
          {(!stage.lights || stage.lights.length === 0) && (
            <>
              <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow shadow-mapSize={[1024, 1024]} />
              <pointLight position={[-5, 5, -5]} intensity={0.4} color="#8b5cf6" />
              <spotLight position={[0, 15, 0]} angle={0.5} penumbra={0.8} intensity={0.3} castShadow />
            </>
          )}

          {showGrid && <Grid infiniteGrid fadeDistance={50} cellSize={1} cellColor="#1e1b4b" sectionSize={5} sectionColor="#312e81" />}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[50, 50]} />
            <shadowMaterial opacity={0.3} />
          </mesh>

          <RuntimeStepper engineRef={engineRef} spritesRef={spritesRef} running={running} />

          {sprites.map((sprite) => (
            <Sprite3D key={sprite.id} sprite={sprite} engineRef={engineRef} running={running}
              selected={selectedSprite === sprite.id}
              onClick={() => handleClick3D(sprite.id)}
              transformMode={transformMode}
              showTransform={selectedSprite === sprite.id && !running}
              onTransformChange={handleTransform} />
          ))}

          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
          <Environment preset="night" />
          <fog attach="fog" args={["#0a0a1a", 30, 80]} />
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
  useFrame((_, delta) => {
    if (running && engineRef.current) stepRuntime(engineRef.current, spritesRef.current, Math.min(delta, 0.05));
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
