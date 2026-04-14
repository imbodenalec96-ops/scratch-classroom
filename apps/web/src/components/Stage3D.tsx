import React, { useRef, Suspense, useState, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import type { Sprite, StageSettings, Light3D } from "@scratch/shared";

interface Props {
  sprites: Sprite[];
  stage: StageSettings;
  running: boolean;
  onSpriteMove?: (id: string, x: number, y: number) => void;
}

type TransformMode = "translate" | "rotate" | "scale";

export default function Stage3D({ sprites, stage, running, onSpriteMove }: Props) {
  const [selectedSprite, setSelectedSprite] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [showGrid, setShowGrid] = useState(true);

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-black" style={{ height: 360 }}>
      <Canvas
        camera={{
          position: [stage.camera?.x ?? 0, stage.camera?.y ?? 5, stage.camera?.z ?? 10],
          fov: stage.camera?.fov ?? 60,
        }}
        shadows
      >
        <Suspense fallback={<Html center><div className="text-white text-sm">Loading 3D...</div></Html>}>
          {/* Lighting */}
          <ambientLight intensity={0.3} />
          {(stage.lights || []).map((light, i) => (
            <SceneLight key={i} light={light} />
          ))}
          {(!stage.lights || stage.lights.length === 0) && (
            <>
              <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow shadow-mapSize={[1024, 1024]} />
              <pointLight position={[-5, 5, -5]} intensity={0.4} color="#8b5cf6" />
              <spotLight position={[0, 15, 0]} angle={0.5} penumbra={0.8} intensity={0.3} castShadow />
            </>
          )}

          {/* Ground */}
          {showGrid && <Grid infiniteGrid fadeDistance={50} cellSize={1} cellColor="#1e1b4b" sectionSize={5} sectionColor="#312e81" />}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[50, 50]} />
            <shadowMaterial opacity={0.3} />
          </mesh>

          {/* Sprites as 3D objects */}
          {sprites.map((sprite) => (
            <Sprite3D key={sprite.id} sprite={sprite} running={running}
              selected={selectedSprite === sprite.id}
              onClick={() => setSelectedSprite(sprite.id)} />
          ))}

          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
          <Environment preset="night" />
          <fog attach="fog" args={["#0a0a1a", 30, 80]} />
        </Suspense>
      </Canvas>

      {/* 3D toolbar */}
      <div className="absolute top-2 left-2 flex gap-1">
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
          }`}>
          Grid
        </button>
      </div>

      {/* Shape info */}
      {selectedSprite && (
        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70">
          {sprites.find(s => s.id === selectedSprite)?.name || "Object"} · {sprites.find(s => s.id === selectedSprite)?.shape3d || "box"}
        </div>
      )}
    </div>
  );
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

function Sprite3D({ sprite, running, selected, onClick }: {
  sprite: Sprite; running: boolean; selected: boolean; onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const rotSpeed = useRef(0);
  const [costumeTexture, setCostumeTexture] = useState<THREE.Texture | null>(null);

  // Load costume as texture
  React.useEffect(() => {
    const costume = sprite.costumes[sprite.costumeIndex];
    if (costume?.url) {
      const loader = new THREE.TextureLoader();
      loader.load(costume.url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setCostumeTexture(tex);
      });
    } else {
      setCostumeTexture(null);
    }
  }, [sprite.costumes, sprite.costumeIndex]);

  React.useEffect(() => {
    const turnBlock = sprite.blocks.find((b) => b.type === "motion_turnright" || b.type === "motion_turnleft");
    if (turnBlock) {
      const deg = Number(turnBlock.inputs.DEGREES?.value ?? 15);
      rotSpeed.current = (turnBlock.type === "motion_turnleft" ? -deg : deg) * 0.02;
    }
  }, [sprite.blocks]);

  useFrame((_, delta) => {
    if (!running || !meshRef.current) return;
    meshRef.current.rotation.y += rotSpeed.current * delta * 60;
    const moveBlock = sprite.blocks.find((b) => b.type === "motion_movesteps");
    if (moveBlock) {
      const steps = Number(moveBlock.inputs.STEPS?.value ?? 0) * 0.01;
      meshRef.current.position.x += Math.sin(meshRef.current.rotation.y) * steps * delta * 60;
      meshRef.current.position.z += Math.cos(meshRef.current.rotation.y) * steps * delta * 60;
    }
  });

  const palettes = [
    ["#8b5cf6", "#312e81"], ["#6366f1", "#1e1b4b"], ["#a78bfa", "#4c1d95"],
    ["#818cf8", "#3730a3"], ["#c084fc", "#581c87"], ["#7c3aed", "#2e1065"],
  ];
  const [mainColor, emissiveColor] = palettes[Math.abs(sprite.name.charCodeAt(0)) % palettes.length];

  return (
    <mesh ref={meshRef} position={[sprite.x / 40, 0.5, (sprite.z ?? sprite.y) / 40]}
      scale={sprite.scale} castShadow
      onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <ShapeGeometry shape={sprite.shape3d} />
      <meshStandardMaterial
        color={costumeTexture ? "#ffffff" : mainColor}
        map={costumeTexture}
        emissive={selected ? "#8b5cf6" : emissiveColor}
        emissiveIntensity={selected ? 0.4 : 0.05} roughness={0.3} metalness={0.1} />
      <Html distanceFactor={5} position={[0, 1, 0]} center>
        <div className="text-white text-[10px] bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-md whitespace-nowrap border border-white/10">
          {sprite.name}
        </div>
      </Html>
    </mesh>
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
          angle={light.angle ?? 0.5} penumbra={light.penumbra ?? 0.5} castShadow
          target-position={[light.targetX ?? 0, light.targetY ?? 0, light.targetZ ?? 0]} />
      );
    default:
      return null;
  }
}
