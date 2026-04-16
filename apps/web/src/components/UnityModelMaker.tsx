import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

/* ── Types ── */
interface Voxel { x: number; y: number; z: number; color: string }

const GRID = 12;          // 12×12×12 grid
const VSIZE = 0.9;        // voxel visual size
const PALETTE = [
  "#ef4444","#f97316","#f59e0b","#84cc16","#22c55e","#14b8a6",
  "#06b6d4","#3b82f6","#6366f1","#a855f7","#ec4899","#ffffff",
  "#94a3b8","#64748b","#1e293b","#a78bfa",
];

declare global {
  interface Window {
    __unityStage?: { send: (obj: string, method: string, param: string) => void };
  }
}

interface Props { onClose: () => void }

export default function UnityModelMaker({ onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef(0);
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const voxelsRef = useRef<Voxel[]>([]);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const camAngleRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, dist: 14 });

  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [color, setColor] = useState("#6366f1");
  const [tool, setTool] = useState<"place" | "remove">("place");
  const [layer, setLayer] = useState(0);
  const [spawned, setSpawned] = useState(false);
  const [modelName, setModelName] = useState("My Model");

  /* ── Three.js setup ── */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07071a);
    scene.fog = new THREE.FogExp2(0x07071a, 0.045);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0x6366f1, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 5);
    dir.castShadow = true;
    scene.add(dir);
    scene.add(new THREE.PointLight(0x22d3ee, 0.8, 30).position.set(-6, 3, -4) && new THREE.PointLight(0x22d3ee, 0.8, 30));

    // Grid floor
    const grid = new THREE.GridHelper(GRID, GRID, 0x2e1065, 0x1a103a);
    grid.position.set(GRID / 2 - 0.5, -0.5, GRID / 2 - 0.5);
    scene.add(grid);

    // Layer highlight plane
    const layerGeo = new THREE.PlaneGeometry(GRID, GRID);
    const layerMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
    const layerPlane = new THREE.Mesh(layerGeo, layerMat);
    layerPlane.rotation.x = -Math.PI / 2;
    layerPlane.position.set(GRID / 2 - 0.5, 0, GRID / 2 - 0.5);
    layerPlane.name = "layerPlane";
    scene.add(layerPlane);

    updateCamera();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!el) return;
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  function updateCamera() {
    const { theta, phi, dist } = camAngleRef.current;
    const cx = GRID / 2, cy = GRID / 4, cz = GRID / 2;
    const cam = cameraRef.current;
    if (!cam) return;
    cam.position.set(
      cx + dist * Math.sin(phi) * Math.cos(theta),
      cy + dist * Math.cos(phi),
      cz + dist * Math.sin(phi) * Math.sin(theta)
    );
    cam.lookAt(cx, cy, cz);
  }

  /* ── Voxel mesh sync ── */
  const syncMesh = useCallback((v: Voxel) => {
    const key = `${v.x},${v.y},${v.z}`;
    if (meshMapRef.current.has(key)) return;
    const scene = sceneRef.current!;
    const geo = new THREE.BoxGeometry(VSIZE, VSIZE, VSIZE);
    const mat = new THREE.MeshPhongMaterial({ color: v.color, emissive: v.color, emissiveIntensity: 0.15, shininess: 60 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(v.x, v.y, v.z);
    mesh.castShadow = true;
    scene.add(mesh);
    meshMapRef.current.set(key, mesh);
  }, []);

  const removeMesh = useCallback((v: Voxel) => {
    const key = `${v.x},${v.y},${v.z}`;
    const mesh = meshMapRef.current.get(key);
    if (mesh) { sceneRef.current?.remove(mesh); meshMapRef.current.delete(key); }
  }, []);

  /* ── Layer plane Y sync ── */
  useEffect(() => {
    const plane = sceneRef.current?.getObjectByName("layerPlane");
    if (plane) plane.position.y = layer;
  }, [layer]);

  /* ── Canvas click → place/remove voxel ── */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) return;
    const el = mountRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!el || !renderer || !camera || !scene) return;

    const rect = el.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);

    // Cast against layer plane for placement, or against existing voxels for removal
    const layerPlane = scene.getObjectByName("layerPlane") as THREE.Mesh;

    if (tool === "place") {
      const hits = raycaster.intersectObject(layerPlane);
      if (hits.length > 0) {
        const p = hits[0].point;
        const gx = Math.round(p.x), gy = layer, gz = Math.round(p.z);
        if (gx >= 0 && gx < GRID && gz >= 0 && gz < GRID) {
          const key = `${gx},${gy},${gz}`;
          if (!meshMapRef.current.has(key)) {
            const v: Voxel = { x: gx, y: gy, z: gz, color };
            voxelsRef.current = [...voxelsRef.current, v];
            setVoxels([...voxelsRef.current]);
            syncMesh(v);
          }
        }
      }
    } else {
      // Remove: raycast against voxel meshes
      const voxelMeshes = Array.from(meshMapRef.current.values());
      const hits = raycaster.intersectObjects(voxelMeshes);
      if (hits.length > 0) {
        const mesh = hits[0].object as THREE.Mesh;
        const p = mesh.position;
        const toRemove = voxelsRef.current.find(v => v.x === Math.round(p.x) && v.y === Math.round(p.y) && v.z === Math.round(p.z));
        if (toRemove) {
          removeMesh(toRemove);
          voxelsRef.current = voxelsRef.current.filter(v => !(v.x === toRemove.x && v.y === toRemove.y && v.z === toRemove.z));
          setVoxels([...voxelsRef.current]);
        }
      }
    }
  }, [tool, color, layer, syncMesh, removeMesh]);

  /* ── Mouse orbit ── */
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 1 && e.button !== 2) return;
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    camAngleRef.current.theta -= dx * 0.01;
    camAngleRef.current.phi = Math.max(0.3, Math.min(Math.PI / 2 - 0.05, camAngleRef.current.phi + dy * 0.01));
    updateCamera();
  };
  const onMouseUp = () => { isDraggingRef.current = false; };
  const onWheel = (e: React.WheelEvent) => {
    camAngleRef.current.dist = Math.max(5, Math.min(28, camAngleRef.current.dist + e.deltaY * 0.02));
    updateCamera();
  };

  /* ── Clear ── */
  const clearAll = () => {
    voxelsRef.current.forEach(v => removeMesh(v));
    voxelsRef.current = [];
    setVoxels([]);
    setSpawned(false);
  };

  /* ── Spawn in Unity stage ── */
  const spawnInStage = () => {
    if (voxelsRef.current.length === 0) return;
    window.__unityStage?.send("BlockController", "SpawnModel", JSON.stringify({
      name: modelName,
      voxels: voxelsRef.current,
    }));
    setSpawned(true);
    setTimeout(() => setSpawned(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}>
      <div className="relative flex flex-col rounded-2xl overflow-hidden" style={{ width: "min(95vw, 900px)", height: "min(90vh, 640px)", background: "#08081f", border: "1px solid rgba(34,211,238,0.3)", boxShadow: "0 40px 80px rgba(34,211,238,0.15)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ background: "rgba(34,211,238,0.08)", borderBottom: "1px solid rgba(34,211,238,0.15)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-cyan-400" style={{ boxShadow: "0 0 6px #22d3ee" }} />
            <span className="text-sm font-bold" style={{ color: "#22d3ee" }}>3D Model Maker</span>
            <span className="text-xs text-white/30">Click grid to place • Middle/right drag to orbit • Scroll to zoom</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all text-lg leading-none">×</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* 3D viewport */}
          <div
            ref={mountRef}
            className="flex-1 min-w-0 cursor-crosshair"
            onClick={handleCanvasClick}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onContextMenu={e => e.preventDefault()}
          />

          {/* Sidebar */}
          <div className="w-52 flex-shrink-0 flex flex-col gap-3 p-3 overflow-y-auto" style={{ background: "rgba(0,0,0,0.4)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>

            {/* Model name */}
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Model Name</div>
              <input
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            {/* Tool */}
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Tool</div>
              <div className="flex gap-1">
                {(["place", "remove"] as const).map(t => (
                  <button key={t} onClick={() => setTool(t)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
                    style={{ background: tool === t ? (t === "remove" ? "rgba(239,68,68,0.3)" : "rgba(99,102,241,0.3)") : "rgba(255,255,255,0.05)", color: tool === t ? (t === "remove" ? "#fca5a5" : "#a5b4fc") : "rgba(255,255,255,0.4)", border: `1px solid ${tool === t ? (t === "remove" ? "rgba(239,68,68,0.4)" : "rgba(99,102,241,0.4)") : "transparent"}` }}>
                    {t === "place" ? "✚ Place" : "✕ Erase"}
                  </button>
                ))}
              </div>
            </div>

            {/* Layer (Y height) */}
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Layer Y: {layer}</div>
              <input type="range" min={0} max={GRID - 1} value={layer} onChange={e => setLayer(Number(e.target.value))}
                className="w-full accent-cyan-400" />
              <div className="flex justify-between text-[9px] text-white/20 mt-0.5">
                <span>0 (ground)</span><span>{GRID - 1} (top)</span>
              </div>
            </div>

            {/* Color palette */}
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">Color</div>
              <div className="grid grid-cols-4 gap-1">
                {PALETTE.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className="w-full aspect-square rounded-md transition-all"
                    style={{ background: c, boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none", transform: color === c ? "scale(1.15)" : "scale(1)" }}
                  />
                ))}
              </div>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-full mt-2 h-7 rounded-lg cursor-pointer border border-white/10 bg-transparent" />
            </div>

            {/* Stats */}
            <div className="text-[10px] text-white/25 space-y-0.5">
              <div>{voxels.length} voxel{voxels.length !== 1 ? "s" : ""} placed</div>
              <div>Grid: {GRID}×{GRID}×{GRID}</div>
            </div>

            {/* Actions */}
            <div className="mt-auto space-y-2">
              <button
                onClick={spawnInStage}
                disabled={voxels.length === 0}
                className="w-full py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-30"
                style={{ background: spawned ? "rgba(34,197,94,0.3)" : "rgba(34,211,238,0.2)", color: spawned ? "#4ade80" : "#22d3ee", border: `1px solid ${spawned ? "rgba(34,197,94,0.4)" : "rgba(34,211,238,0.3)"}` }}
              >
                {spawned ? "✓ Spawned!" : "🎮 Spawn in Stage"}
              </button>
              <button
                onClick={clearAll}
                className="w-full py-2 rounded-xl text-xs font-medium text-white/30 hover:text-red-400 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.06)" }}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 text-[10px] text-white/20 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          Left-click to place/erase • Middle or right-click drag to orbit camera • Scroll wheel to zoom • Change Layer Y to build upward
        </div>
      </div>
    </div>
  );
}
