import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

/* ── Types ── */
interface Voxel { x: number; y: number; z: number; color: string }
type Tool = "place" | "remove" | "fill" | "eyedrop";
type ModelType = "character" | "enemy" | "prop";
type EditorTab = "build" | "character";

interface CharParams {
  skinColor: string;
  hairColor: string;
  hairStyle: "none" | "short" | "long" | "mohawk" | "afro";
  eyeColor: string;
  topColor: string;
  bottomColor: string;
  shoeColor: string;
  headSize: number;    // 2-4
  bodyWidth: number;   // 2-4
  bodyHeight: number;  // 2-5
  armLength: number;   // 2-5
  legHeight: number;   // 2-6
  hasBeard: boolean;
  hasGlasses: boolean;
}

const DEFAULT_CHAR: CharParams = {
  skinColor: "#f5c5a3", hairColor: "#1f2937", hairStyle: "short",
  eyeColor: "#1e3a5f", topColor: "#ef4444", bottomColor: "#3b82f6",
  shoeColor: "#1f2937", headSize: 3, bodyWidth: 3, bodyHeight: 4,
  armLength: 3, legHeight: 4, hasBeard: false, hasGlasses: false,
};

function buildCharacterVoxels(p: CharParams): Voxel[] {
  const v: Voxel[] = [];
  const add = (x: number, y: number, z: number, color: string) => {
    if (x >= 0 && x < GRID && y >= 0 && y < GRID && z >= 0 && z < GRID) v.push({ x, y, z, color });
  };
  const cx = 8, cz = 8;

  // Shoes
  add(cx - 1, 0, cz - 1, p.shoeColor); add(cx - 1, 0, cz, p.shoeColor);
  add(cx + 1, 0, cz - 1, p.shoeColor); add(cx + 1, 0, cz, p.shoeColor);

  // Legs
  for (let y = 1; y <= p.legHeight; y++) {
    add(cx - 1, y, cz, p.bottomColor);
    add(cx + 1, y, cz, p.bottomColor);
  }

  // Body (torso)
  const bodyBase = p.legHeight + 1;
  for (let y = bodyBase; y < bodyBase + p.bodyHeight; y++) {
    for (let dx = -Math.floor(p.bodyWidth / 2); dx <= Math.floor(p.bodyWidth / 2); dx++) {
      add(cx + dx, y, cz, p.topColor);
    }
  }

  // Arms — hang from shoulders
  const shoulderY = bodyBase + p.bodyHeight - 1;
  const armX = Math.floor(p.bodyWidth / 2) + 1;
  for (let i = 0; i < p.armLength; i++) {
    add(cx - armX, shoulderY - i, cz, p.skinColor);
    add(cx + armX, shoulderY - i, cz, p.skinColor);
  }
  // Hands
  add(cx - armX, shoulderY - p.armLength, cz, p.skinColor);
  add(cx + armX, shoulderY - p.armLength, cz, p.skinColor);

  // Neck
  const neckY = bodyBase + p.bodyHeight;
  add(cx, neckY, cz, p.skinColor);

  // Head
  const headBase = neckY + 1;
  const hs = p.headSize;
  const hr = Math.floor(hs / 2);
  for (let dy = 0; dy < hs; dy++) {
    for (let dx = -hr; dx <= hr; dx++) {
      for (let dz = -hr; dz <= hr; dz++) {
        add(cx + dx, headBase + dy, cz + dz, p.skinColor);
      }
    }
  }

  // Eyes
  const eyeY = headBase + Math.floor(hs * 0.55);
  add(cx - 1, eyeY, cz - hr, p.eyeColor);
  add(cx + 1, eyeY, cz - hr, p.eyeColor);

  // Glasses
  if (p.hasGlasses) {
    add(cx - 1, eyeY, cz - hr - 1, "#06b6d4");
    add(cx + 1, eyeY, cz - hr - 1, "#06b6d4");
    add(cx, eyeY, cz - hr - 1, "#374151");
  }

  // Mouth/smile
  add(cx - 1, headBase + 1, cz - hr, "#c0392b");
  add(cx, headBase + 1, cz - hr, "#c0392b");
  add(cx + 1, headBase + 1, cz - hr, "#c0392b");

  // Beard
  if (p.hasBeard) {
    for (let dx = -hr; dx <= hr; dx++) {
      add(cx + dx, headBase, cz - hr, p.hairColor);
      add(cx + dx, headBase + 1, cz - hr, p.hairColor);
    }
  }

  // Hair
  const topY = headBase + hs;
  if (p.hairStyle === "short") {
    for (let dx = -hr; dx <= hr; dx++) add(cx + dx, topY, cz, p.hairColor);
    add(cx, topY, cz - 1, p.hairColor); add(cx, topY, cz + 1, p.hairColor);
  } else if (p.hairStyle === "long") {
    for (let dx = -hr; dx <= hr; dx++) {
      add(cx + dx, topY, cz, p.hairColor);
      add(cx + dx, topY, cz + 1, p.hairColor);
    }
    for (let dy = 0; dy < hs; dy++) {
      add(cx - hr, headBase + dy, cz + hr, p.hairColor);
      add(cx + hr, headBase + dy, cz + hr, p.hairColor);
    }
  } else if (p.hairStyle === "mohawk") {
    for (let dy = 0; dy < 3; dy++) add(cx, topY + dy, cz, p.hairColor);
  } else if (p.hairStyle === "afro") {
    for (let dx = -hr - 1; dx <= hr + 1; dx++) {
      for (let dz = -hr - 1; dz <= hr + 1; dz++) {
        if (Math.abs(dx) + Math.abs(dz) <= hr + 1) add(cx + dx, topY, cz + dz, p.hairColor);
      }
    }
    for (let dx = -hr; dx <= hr; dx++) add(cx + dx, topY + 1, cz, p.hairColor);
  }

  return v;
}

const GRID = 16;
const VSIZE = 0.88;

const PALETTE = [
  // Skin/body tones
  "#f5c5a3","#e8956d","#c67b4a","#8b5e3c",
  // Bright primaries
  "#ef4444","#f97316","#facc15","#84cc16",
  "#22c55e","#14b8a6","#06b6d4","#3b82f6",
  "#6366f1","#a855f7","#ec4899","#f43f5e",
  // Neutrals
  "#ffffff","#d1d5db","#6b7280","#374151",
  "#1f2937","#111827","#000000","#a78bfa",
  // Metal/special
  "#c0c0c0","#ffd700","#cd7f32","#4682b4",
  "#228b22","#8b0000","#ff69b4","#00ced1",
];

// Built-in model templates
const TEMPLATES: Record<string, { label: string; emoji: string; build: () => Voxel[] }> = {
  humanoid: {
    label: "Humanoid", emoji: "🧍",
    build: () => {
      const v: Voxel[] = [];
      const add = (x:number,y:number,z:number,color:string) => v.push({x,y,z,color});
      const cx=8,cz=8;
      // Legs
      for(let y=0;y<3;y++){add(cx-1,y,cz,"#3b82f6");add(cx+1,y,cz,"#3b82f6");}
      // Body
      for(let y=3;y<6;y++) for(let dx=-1;dx<=1;dx++) add(cx+dx,y,cz,"#ef4444");
      // Arms
      for(let y=3;y<6;y++){add(cx-2,y,cz,"#f5c5a3");add(cx+2,y,cz,"#f5c5a3");}
      // Head
      for(let dy=0;dy<2;dy++) for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) add(cx+dx,6+dy,cz+dz,"#f5c5a3");
      // Eyes
      add(cx-1,7,cz-1,"#1f2937");add(cx+1,7,cz-1,"#1f2937");
      return v;
    }
  },
  robot: {
    label: "Robot", emoji: "🤖",
    build: () => {
      const v: Voxel[] = []; const add=(x:number,y:number,z:number,c:string)=>v.push({x,y,z,color:c});
      const cx=8,cz=8;
      for(let y=0;y<2;y++){add(cx-1,y,cz,"#374151");add(cx+1,y,cz,"#374151");}
      for(let y=2;y<5;y++) for(let dx=-2;dx<=2;dx++) add(cx+dx,y,cz,"#6b7280");
      for(let y=2;y<5;y++){add(cx-3,y,cz,"#c0c0c0");add(cx+3,y,cz,"#c0c0c0");}
      for(let dy=0;dy<3;dy++) for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) add(cx+dx,5+dy,cz+dz,"#374151");
      add(cx-1,7,cz-1,"#06b6d4");add(cx+1,7,cz-1,"#06b6d4");
      add(cx,6,cz-1,"#ef4444");
      return v;
    }
  },
  sword: {
    label: "Sword", emoji: "⚔️",
    build: () => {
      const v: Voxel[] = []; const add=(x:number,y:number,z:number,c:string)=>v.push({x,y,z,color:c});
      const cx=8,cz=8;
      for(let y=0;y<2;y++) add(cx,y,cz,"#c67b4a");
      add(cx-1,2,cz,"#c0c0c0");add(cx+1,2,cz,"#c0c0c0");
      for(let y=3;y<10;y++) add(cx,y,cz,"#c0c0c0");
      add(cx,10,cz,"#ffd700");
      return v;
    }
  },
  tree: {
    label: "Tree", emoji: "🌲",
    build: () => {
      const v: Voxel[] = []; const add=(x:number,y:number,z:number,c:string)=>v.push({x,y,z,color:c});
      const cx=8,cz=8;
      for(let y=0;y<4;y++) add(cx,y,cz,"#8b5e3c");
      for(let r=2;r>=0;r--) {
        const y=4+(2-r);
        for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++) if(Math.abs(dx)+Math.abs(dz)<=r+1) add(cx+dx,y,cz+dz,"#22c55e");
      }
      return v;
    }
  },
  car: {
    label: "Car", emoji: "🚗",
    build: () => {
      const v: Voxel[] = []; const add=(x:number,y:number,z:number,c:string)=>v.push({x,y,z,color:c});
      const cx=8,cz=8;
      // Wheels
      [[cx-3,cz-2],[cx+3,cz-2],[cx-3,cz+2],[cx+3,cz+2]].forEach(([x,z])=>{add(x,0,z,"#1f2937");add(x,1,z,"#1f2937");});
      // Body
      for(let dx=-4;dx<=4;dx++) for(let dz=-1;dz<=1;dz++) {add(cx+dx,1,cz+dz,"#ef4444");add(cx+dx,2,cz+dz,"#ef4444");}
      // Cabin
      for(let dx=-2;dx<=2;dx++) for(let dz=-1;dz<=1;dz++) add(cx+dx,3,cz+dz,"#3b82f6");
      // Windows
      add(cx-1,3,cz-1,"#06b6d4");add(cx+1,3,cz-1,"#06b6d4");
      return v;
    }
  },
  alien: {
    label: "Alien", emoji: "👽",
    build: () => {
      const v: Voxel[] = []; const add=(x:number,y:number,z:number,c:string)=>v.push({x,y,z,color:c});
      const cx=8,cz=8;
      for(let y=0;y<3;y++){add(cx-1,y,cz,"#22c55e");add(cx+1,y,cz,"#22c55e");}
      for(let y=3;y<6;y++) for(let dx=-1;dx<=1;dx++) add(cx+dx,y,cz,"#14b8a6");
      for(let y=3;y<5;y++){add(cx-2,y,cz,"#14b8a6");add(cx+2,y,cz,"#14b8a6");}
      for(let dy=0;dy<3;dy++) for(let dx=-2;dx<=2;dx++) for(let dz=-1;dz<=0;dz++) if(Math.abs(dx)<=2-dy) add(cx+dx,6+dy,cz+dz,"#22c55e");
      add(cx-1,7,cz-1,"#000000");add(cx+1,7,cz-1,"#000000");
      add(cx-1,8,cz,"#a855f7");add(cx+1,8,cz,"#a855f7");
      return v;
    }
  },
};

declare global {
  interface Window {
    __unityStage?: { send: (obj: string, method: string, param: string) => void };
  }
}

interface Props { onClose: () => void }

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[9px] text-white/40 flex-shrink-0 w-14">{label}</span>
    <div className="flex-1">{children}</div>
  </div>
);

export default function UnityModelMaker({ onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef(0);
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const voxelsRef = useRef<Voxel[]>([]);
  const historyRef = useRef<Voxel[][]>([[]]);
  const histIdxRef = useRef(0);
  const isDraggingCamRef = useRef(false);
  const isPaintingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const camAngleRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, dist: 18 });
  const paintedThisStroke = useRef<Set<string>>(new Set());

  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [color, setColor] = useState("#ef4444");
  const [tool, setTool] = useState<Tool>("place");
  const [layer, setLayer] = useState(0);
  const [spawned, setSpawned] = useState(false);
  const [modelName, setModelName] = useState("My Model");
  const [modelType, setModelType] = useState<ModelType>("character");
  const [symmetry, setSymmetry] = useState(false);
  const [savedModels, setSavedModels] = useState<{name:string;voxels:Voxel[]}[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [notification, setNotification] = useState("");
  const [activeTab, setActiveTab] = useState<EditorTab>("character");
  const [charParams, setCharParams] = useState<CharParams>(DEFAULT_CHAR);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 2000);
  };

  const applyCharacter = useCallback((params: CharParams) => {
    const newVoxels = buildCharacterVoxels(params);
    voxelsRef.current.forEach(v => removeMesh(v));
    voxelsRef.current = newVoxels;
    setVoxels([...newVoxels]);
    newVoxels.forEach(v => syncMesh(v));
    pushHistory(newVoxels);
  // removeMesh/syncMesh/pushHistory are stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateChar = useCallback((patch: Partial<CharParams>) => {
    setCharParams(prev => {
      const next = { ...prev, ...patch };
      applyCharacter(next);
      return next;
    });
  }, [applyCharacter]);

  /* ── Load saved models from localStorage ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("modelmaker_saves");
      if (raw) setSavedModels(JSON.parse(raw));
    } catch {}
  }, []);

  /* ── Three.js setup ── */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07071a);
    scene.fog = new THREE.FogExp2(0x07071a, 0.025);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 300);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);

    // Lights
    const amb = new THREE.AmbientLight(0x6366f1, 0.5);
    scene.add(amb);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const fill = new THREE.PointLight(0x22d3ee, 0.7, 50);
    fill.position.set(-8, 4, -6);
    scene.add(fill);
    const rim = new THREE.PointLight(0xa78bfa, 0.5, 50);
    rim.position.set(10, 2, 10);
    scene.add(rim);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(GRID + 2, GRID + 2);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x0d0d2a, shininess: 20 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(GRID / 2 - 0.5, -0.51, GRID / 2 - 0.5);
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid
    const grid = new THREE.GridHelper(GRID, GRID, 0x1a1040, 0x110d30);
    grid.position.set(GRID / 2 - 0.5, -0.01, GRID / 2 - 0.5);
    scene.add(grid);

    // Layer highlight
    const lMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID, GRID),
      new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
    );
    lMesh.rotation.x = -Math.PI / 2;
    lMesh.position.set(GRID / 2 - 0.5, 0, GRID / 2 - 0.5);
    lMesh.name = "layerPlane";
    scene.add(lMesh);

    // Axis indicator (small RGB arrows at origin)
    const addArrow = (dir: THREE.Vector3, color: number) => {
      const arr = new THREE.ArrowHelper(dir.normalize(), new THREE.Vector3(0,-0.4,0), 1.5, color, 0.3, 0.15);
      scene.add(arr);
    };
    addArrow(new THREE.Vector3(1,0,0), 0xef4444);
    addArrow(new THREE.Vector3(0,1,0), 0x22c55e);
    addArrow(new THREE.Vector3(0,0,1), 0x3b82f6);

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
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-generate default character after scene is ready
  useEffect(() => {
    const timer = setTimeout(() => applyCharacter(DEFAULT_CHAR), 100);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateCamera() {
    const { theta, phi, dist } = camAngleRef.current;
    const cx = GRID / 2, cy = GRID / 3, cz = GRID / 2;
    const cam = cameraRef.current;
    if (!cam) return;
    cam.position.set(
      cx + dist * Math.sin(phi) * Math.cos(theta),
      cy + dist * Math.cos(phi),
      cz + dist * Math.sin(phi) * Math.sin(theta)
    );
    cam.lookAt(cx, cy, cz);
  }

  /* ── Mesh helpers ── */
  const syncMesh = useCallback((v: Voxel) => {
    const key = `${v.x},${v.y},${v.z}`;
    const old = meshMapRef.current.get(key);
    if (old) {
      (old.material as THREE.MeshPhongMaterial).color.set(v.color);
      (old.material as THREE.MeshPhongMaterial).emissive.set(v.color);
      return;
    }
    const mat = new THREE.MeshPhongMaterial({ color: v.color, emissive: v.color, emissiveIntensity: 0.12, shininess: 80 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(VSIZE, VSIZE, VSIZE), mat);
    mesh.position.set(v.x, v.y, v.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    sceneRef.current!.add(mesh);
    meshMapRef.current.set(key, mesh);
  }, []);

  const removeMesh = useCallback((v: Voxel) => {
    const key = `${v.x},${v.y},${v.z}`;
    const mesh = meshMapRef.current.get(key);
    if (mesh) { sceneRef.current?.remove(mesh); mesh.geometry.dispose(); meshMapRef.current.delete(key); }
  }, []);

  /* ── Undo / Redo ── */
  const pushHistory = useCallback((newVoxels: Voxel[]) => {
    const hist = historyRef.current.slice(0, histIdxRef.current + 1);
    hist.push(newVoxels.map(v => ({...v})));
    historyRef.current = hist.slice(-40);
    histIdxRef.current = historyRef.current.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    const snap = historyRef.current[histIdxRef.current].map(v => ({...v}));
    // Remove all current meshes
    voxelsRef.current.forEach(v => removeMesh(v));
    voxelsRef.current = snap;
    setVoxels([...snap]);
    snap.forEach(v => syncMesh(v));
  }, [removeMesh, syncMesh]);

  const redo = useCallback(() => {
    if (histIdxRef.current >= historyRef.current.length - 1) return;
    histIdxRef.current++;
    const snap = historyRef.current[histIdxRef.current].map(v => ({...v}));
    voxelsRef.current.forEach(v => removeMesh(v));
    voxelsRef.current = snap;
    setVoxels([...snap]);
    snap.forEach(v => syncMesh(v));
  }, [removeMesh, syncMesh]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target !== document.body && (e.target as HTMLElement).tagName !== "CANVAS") {
        if (e.target instanceof HTMLInputElement) return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  /* ── Layer plane Y ── */
  useEffect(() => {
    const plane = sceneRef.current?.getObjectByName("layerPlane");
    if (plane) plane.position.y = layer;
  }, [layer]);

  /* ── Raycasting helpers ── */
  const getRayHit = useCallback((clientX: number, clientY: number) => {
    const el = mountRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!el || !renderer || !camera || !scene) return null;

    const rect = el.getBoundingClientRect();
    const mx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(mx, my), camera);
    return { ray, scene };
  }, []);

  /* ── Place/remove voxel at point ── */
  const applyTool = useCallback((clientX: number, clientY: number, currentTool: Tool, currentColor: string, currentLayer: number) => {
    const hit = getRayHit(clientX, clientY);
    if (!hit) return;
    const { ray, scene } = hit;

    if (currentTool === "eyedrop") {
      const voxelMeshes = Array.from(meshMapRef.current.values());
      const hits = ray.intersectObjects(voxelMeshes);
      if (hits.length > 0) {
        const mat = (hits[0].object as THREE.Mesh).material as THREE.MeshPhongMaterial;
        const hex = "#" + mat.color.getHexString();
        setColor(hex);
        setTool("place");
      }
      return;
    }

    if (currentTool === "remove") {
      const voxelMeshes = Array.from(meshMapRef.current.values());
      const hits = ray.intersectObjects(voxelMeshes);
      if (hits.length > 0) {
        const mesh = hits[0].object as THREE.Mesh;
        const p = mesh.position;
        const toRemove = voxelsRef.current.find(v =>
          v.x === Math.round(p.x) && v.y === Math.round(p.y) && v.z === Math.round(p.z));
        if (toRemove) {
          const key = `${toRemove.x},${toRemove.y},${toRemove.z}`;
          if (paintedThisStroke.current.has(key)) return;
          paintedThisStroke.current.add(key);
          removeMesh(toRemove);
          if (symmetry) {
            const sx = GRID - 1 - toRemove.x;
            const symV = voxelsRef.current.find(v => v.x === sx && v.y === toRemove.y && v.z === toRemove.z);
            if (symV) removeMesh(symV);
            voxelsRef.current = voxelsRef.current.filter(v =>
              !(v.x === toRemove.x && v.y === toRemove.y && v.z === toRemove.z) &&
              !(v.x === sx && v.y === toRemove.y && v.z === toRemove.z));
          } else {
            voxelsRef.current = voxelsRef.current.filter(v =>
              !(v.x === toRemove.x && v.y === toRemove.y && v.z === toRemove.z));
          }
          setVoxels([...voxelsRef.current]);
        }
      }
      return;
    }

    if (currentTool === "fill") {
      // Flood fill on current layer
      const layerVoxels = new Set(
        voxelsRef.current.filter(v => v.y === currentLayer).map(v => `${v.x},${v.z}`)
      );
      // Find clicked cell
      const layerPlane = scene.getObjectByName("layerPlane") as THREE.Mesh;
      const hits = ray.intersectObject(layerPlane);
      if (!hits.length) return;
      const p = hits[0].point;
      const startX = Math.round(p.x), startZ = Math.round(p.z);
      if (startX < 0 || startX >= GRID || startZ < 0 || startZ >= GRID) return;
      const startKey = `${startX},${startZ}`;
      const targetOccupied = layerVoxels.has(startKey);
      // BFS
      const queue = [[startX, startZ]];
      const visited = new Set<string>();
      const toAdd: [number, number][] = [];
      while (queue.length > 0) {
        const [cx, cz] = queue.shift()!;
        const k = `${cx},${cz}`;
        if (visited.has(k) || cx < 0 || cx >= GRID || cz < 0 || cz >= GRID) continue;
        visited.add(k);
        if (layerVoxels.has(k) !== targetOccupied) continue;
        toAdd.push([cx, cz]);
        queue.push([cx+1,cz],[cx-1,cz],[cx,cz+1],[cx,cz-1]);
      }
      toAdd.forEach(([fx,fz]) => {
        const existing = voxelsRef.current.findIndex(v => v.x===fx && v.y===currentLayer && v.z===fz);
        if (targetOccupied && existing >= 0) {
          voxelsRef.current[existing].color = currentColor;
          syncMesh(voxelsRef.current[existing]);
        } else if (!targetOccupied && existing < 0) {
          const nv: Voxel = {x:fx,y:currentLayer,z:fz,color:currentColor};
          voxelsRef.current.push(nv);
          syncMesh(nv);
        }
      });
      setVoxels([...voxelsRef.current]);
      pushHistory(voxelsRef.current);
      return;
    }

    // Place tool
    if (currentTool === "place") {
      // Try hitting existing voxel face first (place adjacent)
      const voxelMeshes = Array.from(meshMapRef.current.values());
      let placed = false;
      const vHits = ray.intersectObjects(voxelMeshes);
      if (vHits.length > 0) {
        const h = vHits[0];
        const normal = h.face!.normal.clone().applyQuaternion(h.object.quaternion);
        const p = h.object.position;
        const nx = Math.round(p.x + normal.x);
        const ny = Math.round(p.y + normal.y);
        const nz = Math.round(p.z + normal.z);
        if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID && nz >= 0 && nz < GRID) {
          const key = `${nx},${ny},${nz}`;
          if (!meshMapRef.current.has(key) && !paintedThisStroke.current.has(key)) {
            paintedThisStroke.current.add(key);
            const nv: Voxel = { x: nx, y: ny, z: nz, color: currentColor };
            voxelsRef.current.push(nv);
            syncMesh(nv);
            if (symmetry) {
              const sx = GRID - 1 - nx;
              const sk = `${sx},${ny},${nz}`;
              if (!meshMapRef.current.has(sk)) {
                const sv: Voxel = { x: sx, y: ny, z: nz, color: currentColor };
                voxelsRef.current.push(sv);
                syncMesh(sv);
              }
            }
            placed = true;
          }
        }
      }
      if (!placed) {
        // Fall back: hit layer plane
        const layerPlane = scene.getObjectByName("layerPlane") as THREE.Mesh;
        const hits = ray.intersectObject(layerPlane);
        if (hits.length > 0) {
          const p = hits[0].point;
          const gx = Math.round(p.x), gy = currentLayer, gz = Math.round(p.z);
          if (gx >= 0 && gx < GRID && gz >= 0 && gz < GRID) {
            const key = `${gx},${gy},${gz}`;
            if (!meshMapRef.current.has(key) && !paintedThisStroke.current.has(key)) {
              paintedThisStroke.current.add(key);
              const nv: Voxel = { x: gx, y: gy, z: gz, color: currentColor };
              voxelsRef.current.push(nv);
              syncMesh(nv);
              if (symmetry) {
                const sx = GRID - 1 - gx;
                const sk = `${sx},${gy},${gz}`;
                if (!meshMapRef.current.has(sk)) {
                  const sv: Voxel = { x: sx, y: gy, z: gz, color: currentColor };
                  voxelsRef.current.push(sv);
                  syncMesh(sv);
                }
              }
            }
          }
        }
      }
      setVoxels([...voxelsRef.current]);
    }
  }, [getRayHit, syncMesh, removeMesh, symmetry, pushHistory]);

  /* ── Pointer handlers (unified mouse + touch + pencil) ── */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || (e.pointerType === "touch" && e.pressure === 0)) {
      // Middle/right = orbit
      isDraggingCamRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button === 0 || e.pointerType === "touch" || e.pointerType === "pen") {
      isPaintingRef.current = true;
      paintedThisStroke.current.clear();
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      applyTool(e.clientX, e.clientY, tool, color, layer);
    }
  }, [applyTool, tool, color, layer]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingCamRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      camAngleRef.current.theta -= dx * 0.008;
      camAngleRef.current.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.02, camAngleRef.current.phi + dy * 0.008));
      updateCamera();
    } else if (isPaintingRef.current && (tool === "place" || tool === "remove")) {
      applyTool(e.clientX, e.clientY, tool, color, layer);
    }
  }, [applyTool, tool, color, layer]);

  const onPointerUp = useCallback(() => {
    if (isPaintingRef.current && (tool === "place" || tool === "remove")) {
      pushHistory(voxelsRef.current);
    }
    isDraggingCamRef.current = false;
    isPaintingRef.current = false;
    paintedThisStroke.current.clear();
  }, [tool, pushHistory]);

  const onWheel = (e: React.WheelEvent) => {
    camAngleRef.current.dist = Math.max(6, Math.min(35, camAngleRef.current.dist + e.deltaY * 0.025));
    updateCamera();
  };

  /* ── Load template ── */
  const loadTemplate = useCallback((key: string) => {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    voxelsRef.current.forEach(v => removeMesh(v));
    const newVoxels = tpl.build();
    voxelsRef.current = newVoxels;
    setVoxels([...newVoxels]);
    newVoxels.forEach(v => syncMesh(v));
    pushHistory(newVoxels);
    notify(`Loaded: ${tpl.label}`);
  }, [removeMesh, syncMesh, pushHistory]);

  /* ── Clear ── */
  const clearAll = useCallback(() => {
    voxelsRef.current.forEach(v => removeMesh(v));
    voxelsRef.current = [];
    setVoxels([]);
    setSpawned(false);
    pushHistory([]);
  }, [removeMesh, pushHistory]);

  /* ── Save / Load ── */
  const saveModel = useCallback(() => {
    if (voxelsRef.current.length === 0) return;
    const entry = { name: modelName, voxels: [...voxelsRef.current] };
    const next = [...savedModels.filter(s => s.name !== modelName), entry];
    setSavedModels(next);
    try { localStorage.setItem("modelmaker_saves", JSON.stringify(next)); } catch {}
    notify("Saved!");
  }, [modelName, savedModels]);

  const loadSaved = useCallback((entry: {name:string;voxels:Voxel[]}) => {
    voxelsRef.current.forEach(v => removeMesh(v));
    voxelsRef.current = entry.voxels.map(v => ({...v}));
    setVoxels([...voxelsRef.current]);
    voxelsRef.current.forEach(v => syncMesh(v));
    setModelName(entry.name);
    pushHistory(voxelsRef.current);
    setShowSaved(false);
    notify(`Loaded: ${entry.name}`);
  }, [removeMesh, syncMesh, pushHistory]);

  const deleteSaved = useCallback((name: string) => {
    const next = savedModels.filter(s => s.name !== name);
    setSavedModels(next);
    try { localStorage.setItem("modelmaker_saves", JSON.stringify(next)); } catch {}
  }, [savedModels]);

  /* ── Export JSON ── */
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({name:modelName,type:modelType,voxels:voxelsRef.current},null,2)],{type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${modelName.replace(/\s+/g,"_")}.json`;
    a.click();
  };

  /* ── Spawn in stage ── */
  const spawnInStage = () => {
    if (voxelsRef.current.length === 0) return;
    window.__unityStage?.send("BlockController", "SpawnModel", JSON.stringify({
      name: modelName,
      type: modelType,
      voxels: voxelsRef.current,
    }));
    setSpawned(true);
    notify("Spawned in stage!");
    setTimeout(() => setSpawned(false), 2500);
  };

  const toolButtons: { id: Tool; icon: string; label: string; tip: string }[] = [
    { id: "place",   icon: "✚", label: "Place",    tip: "Click/drag to place voxels" },
    { id: "remove",  icon: "✕", label: "Erase",    tip: "Click/drag to erase voxels" },
    { id: "fill",    icon: "🪣", label: "Fill",     tip: "Flood-fill current layer" },
    { id: "eyedrop", icon: "💧", label: "Pick",     tip: "Pick color from a voxel" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(12px)" }}>
      <div className="relative flex flex-col rounded-2xl overflow-hidden"
        style={{ width: "min(96vw, 1060px)", height: "min(92vh, 700px)", background: "#06061a", border: "1px solid rgba(34,211,238,0.28)", boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 80px rgba(34,211,238,0.08)" }}>

        {/* Notification toast */}
        {notification && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full text-xs font-bold"
            style={{ background: "rgba(34,211,238,0.2)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.4)", pointerEvents: "none" }}>
            {notification}
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
          style={{ background: "rgba(34,211,238,0.07)", borderBottom: "1px solid rgba(34,211,238,0.14)" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400" style={{ boxShadow: "0 0 6px #22d3ee" }} />
            <span className="text-sm font-bold" style={{ color: "#22d3ee" }}>3D Model Maker</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
              {voxels.length} voxels
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={undo} title="Undo (Ctrl+Z)" className="w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>↩</button>
            <button onClick={redo} title="Redo (Ctrl+Y)" className="w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>↪</button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all text-lg leading-none">×</button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">

          {/* ── Left panel with tabs ── */}
          <div className="w-52 flex-shrink-0 flex flex-col"
            style={{ background: "rgba(0,0,0,0.35)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>

            {/* Tab bar */}
            <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {([["character","🧍 Character"] as const, ["build","🧱 Build"] as const]).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className="flex-1 py-2 text-[10px] font-bold transition-all"
                  style={{
                    background: activeTab===tab ? "rgba(99,102,241,0.25)" : "transparent",
                    color: activeTab===tab ? "#a5b4fc" : "rgba(255,255,255,0.3)",
                    borderBottom: activeTab===tab ? "2px solid #6366f1" : "2px solid transparent"
                  }}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">

              {/* ════ CHARACTER CREATOR TAB ════ */}
              {activeTab === "character" && (<>
                <div className="text-[9px] font-semibold text-white/30 uppercase tracking-wider">Character Creator</div>

                {/* Skin */}
                <Row label="Skin">
                  <input type="color" value={charParams.skinColor}
                    onChange={e => updateChar({ skinColor: e.target.value })}
                    className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent" />
                </Row>

                {/* Hair */}
                <Row label="Hair Color">
                  <input type="color" value={charParams.hairColor}
                    onChange={e => updateChar({ hairColor: e.target.value })}
                    className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent" />
                </Row>
                <Row label="Hair Style">
                  <select value={charParams.hairStyle}
                    onChange={e => updateChar({ hairStyle: e.target.value as CharParams["hairStyle"] })}
                    className="flex-1 text-[10px] rounded px-1 py-0.5 text-white"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    {["none","short","long","mohawk","afro"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Row>

                {/* Eyes */}
                <Row label="Eye Color">
                  <input type="color" value={charParams.eyeColor}
                    onChange={e => updateChar({ eyeColor: e.target.value })}
                    className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent" />
                </Row>

                {/* Outfit */}
                <Row label="Top Color">
                  <input type="color" value={charParams.topColor}
                    onChange={e => updateChar({ topColor: e.target.value })}
                    className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent" />
                </Row>
                <Row label="Pants Color">
                  <input type="color" value={charParams.bottomColor}
                    onChange={e => updateChar({ bottomColor: e.target.value })}
                    className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent" />
                </Row>
                <Row label="Shoes">
                  <input type="color" value={charParams.shoeColor}
                    onChange={e => updateChar({ shoeColor: e.target.value })}
                    className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent" />
                </Row>

                {/* Shape sliders */}
                <div className="pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-[9px] font-semibold text-white/25 uppercase tracking-wider mb-1.5">Body Shape</div>
                  {([
                    ["Head Size",   "headSize",   2, 4],
                    ["Body Width",  "bodyWidth",  2, 4],
                    ["Body Height", "bodyHeight", 2, 6],
                    ["Arm Length",  "armLength",  2, 5],
                    ["Leg Height",  "legHeight",  2, 6],
                  ] as [string, keyof CharParams, number, number][]).map(([lbl, key, mn, mx]) => (
                    <div key={key} className="mb-1.5">
                      <div className="flex justify-between text-[9px] text-white/30 mb-0.5">
                        <span>{lbl}</span><span>{charParams[key] as number}</span>
                      </div>
                      <input type="range" min={mn} max={mx} step={1}
                        value={charParams[key] as number}
                        onChange={e => updateChar({ [key]: Number(e.target.value) } as Partial<CharParams>)}
                        className="w-full accent-indigo-400" />
                    </div>
                  ))}
                </div>

                {/* Extras */}
                <div className="flex gap-2">
                  {([["hasBeard","🧔 Beard"],["hasGlasses","🕶 Glasses"]] as [keyof CharParams, string][]).map(([key, lbl]) => (
                    <button key={key} onClick={() => updateChar({ [key]: !charParams[key] } as Partial<CharParams>)}
                      className="flex-1 py-1 rounded text-[10px] font-semibold transition-all"
                      style={{
                        background: charParams[key] ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.05)",
                        color: charParams[key] ? "#a5b4fc" : "rgba(255,255,255,0.3)",
                        border: `1px solid ${charParams[key] ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"}`
                      }}>{lbl}</button>
                  ))}
                </div>

                {/* Presets */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} className="pt-2">
                  <div className="text-[9px] font-semibold text-white/25 uppercase tracking-wider mb-1.5">Quick Presets</div>
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      ["👦 Kid",    { skinColor:"#f5c5a3", topColor:"#3b82f6", bottomColor:"#1f2937", hairColor:"#8b5e3c", hairStyle:"short", legHeight:3, bodyHeight:3, headSize:3 }],
                      ["👧 Girl",   { skinColor:"#e8956d", topColor:"#ec4899", bottomColor:"#a855f7", hairColor:"#8b5e3c", hairStyle:"long",  legHeight:4, bodyHeight:3, headSize:3 }],
                      ["🧑 Teen",   { skinColor:"#c67b4a", topColor:"#22c55e", bottomColor:"#374151", hairColor:"#1f2937", hairStyle:"short", legHeight:5, bodyHeight:4, headSize:3 }],
                      ["🤖 Robot",  { skinColor:"#6b7280", topColor:"#374151", bottomColor:"#1f2937", hairColor:"#ef4444", hairStyle:"none",  legHeight:4, bodyHeight:5, headSize:4, eyeColor:"#06b6d4" }],
                      ["👽 Alien",  { skinColor:"#22c55e", topColor:"#14b8a6", bottomColor:"#0d9488", hairColor:"#a855f7", hairStyle:"mohawk",legHeight:4, bodyHeight:4, headSize:4, eyeColor:"#000000" }],
                      ["🦸 Hero",   { skinColor:"#f5c5a3", topColor:"#ef4444", bottomColor:"#1d4ed8", hairColor:"#ffd700", hairStyle:"short", legHeight:5, bodyHeight:5, headSize:3, hasGlasses:false }],
                    ] as [string, Partial<CharParams>][]).map(([lbl, patch]) => (
                      <button key={lbl} onClick={() => updateChar({ ...DEFAULT_CHAR, ...patch })}
                        className="py-1.5 rounded-lg text-[10px] font-semibold transition-all text-white/50 hover:text-white"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </>)}

              {/* ════ BUILD TAB ════ */}
              {activeTab === "build" && (<>
                {/* Model info */}
                <div>
                  <div className="text-[9px] font-semibold text-white/25 uppercase tracking-wider mb-1">Model Name</div>
                  <input value={modelName} onChange={e => setModelName(e.target.value)}
                    className="w-full rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
                {/* Model type */}
                <div>
                  <div className="text-[9px] font-semibold text-white/25 uppercase tracking-wider mb-1">Type</div>
                  <div className="flex flex-col gap-1">
                    {([["character","🧍","Character"],["enemy","👾","Enemy"],["prop","📦","Prop"]] as const).map(([t,ic,lb]) => (
                      <button key={t} onClick={() => setModelType(t as ModelType)}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all text-left"
                        style={{ background: modelType===t ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.04)", color: modelType===t ? "#a5b4fc" : "rgba(255,255,255,0.35)", border: `1px solid ${modelType===t ? "rgba(99,102,241,0.5)" : "transparent"}` }}>
                        <span>{ic}</span><span>{lb}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Tools */}
                <div>
                  <div className="text-[9px] font-semibold text-white/25 uppercase tracking-wider mb-1">Tool</div>
                  <div className="grid grid-cols-2 gap-1">
                    {toolButtons.map(tb => (
                      <button key={tb.id} onClick={() => setTool(tb.id)} title={tb.tip}
                        className="flex flex-col items-center py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                        style={{ background: tool===tb.id ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.04)", color: tool===tb.id ? "#a5b4fc" : "rgba(255,255,255,0.35)", border: `1px solid ${tool===tb.id ? "rgba(99,102,241,0.4)" : "transparent"}` }}>
                        <span className="text-base leading-none mb-0.5">{tb.icon}</span>
                        <span>{tb.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => setSymmetry(s => !s)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: symmetry ? "rgba(34,211,238,0.2)" : "rgba(255,255,255,0.04)", color: symmetry ? "#22d3ee" : "rgba(255,255,255,0.35)", border: `1px solid ${symmetry ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.06)"}` }}>
                  ⬡ Mirror X {symmetry ? "ON" : "OFF"}
                </button>
                <div>
                  <div className="text-[9px] font-semibold text-white/25 uppercase tracking-wider mb-1">Layer Y: {layer}</div>
                  <input type="range" min={0} max={GRID - 1} value={layer} onChange={e => setLayer(Number(e.target.value))} className="w-full accent-cyan-400" />
                </div>
                {/* Palette */}
                <div>
                  <div className="text-[9px] font-semibold text-white/25 uppercase tracking-wider mb-1.5">Color</div>
                  <div className="grid grid-cols-4 gap-1">
                    {PALETTE.map(c => (
                      <button key={c} onClick={() => { setColor(c); setTool("place"); }}
                        className="w-full aspect-square rounded-md transition-all"
                        style={{ background: c, boxShadow: color===c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none", transform: color===c ? "scale(1.2)" : "scale(1)" }} />
                    ))}
                  </div>
                  <input type="color" value={color} onChange={e => setColor(e.target.value)}
                    className="w-full mt-1.5 h-7 rounded-lg cursor-pointer border border-white/10 bg-transparent" />
                </div>
              </>)}

              {/* ════ ACTIONS (always shown) ════ */}
              <div className="space-y-1.5 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <button onClick={spawnInStage} disabled={voxels.length===0}
                  className="w-full py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-30"
                  style={{ background: spawned ? "rgba(34,197,94,0.3)" : "rgba(34,211,238,0.2)", color: spawned ? "#4ade80" : "#22d3ee", border: `1px solid ${spawned ? "rgba(34,197,94,0.4)" : "rgba(34,211,238,0.35)"}` }}>
                  {spawned ? "✓ Spawned!" : "🎮 Spawn in Stage"}
                </button>
                <div className="flex gap-1">
                  <button onClick={saveModel} disabled={voxels.length===0}
                    className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-30"
                    style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }}>
                    💾 Save
                  </button>
                  <button onClick={() => setShowSaved(s => !s)}
                    className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                    style={{ background: showSaved ? "rgba(167,139,250,0.25)" : "rgba(255,255,255,0.05)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.2)" }}>
                    📂 Load
                  </button>
                </div>
                <button onClick={exportJson} disabled={voxels.length===0}
                  className="w-full py-1.5 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-30"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  ⬇ Export JSON
                </button>
                <button onClick={clearAll}
                  className="w-full py-1.5 rounded-lg text-[10px] font-medium text-white/25 hover:text-red-400 transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  🗑 Clear All
                </button>
              </div>
            </div>
          </div>

          {/* ── 3D Viewport ── */}
          <div className="flex-1 min-w-0 relative">
            <div ref={mountRef} className="absolute inset-0"
              style={{ cursor: tool === "eyedrop" ? "crosshair" : tool === "fill" ? "cell" : "default", touchAction: "none", userSelect: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onWheel={onWheel}
              onContextMenu={e => { e.preventDefault(); isDraggingCamRef.current=true; lastMouseRef.current={x:e.clientX,y:e.clientY}; }}
            />

            {/* Saved models panel */}
            {showSaved && (
              <div className="absolute top-2 right-2 w-52 rounded-xl overflow-hidden z-20"
                style={{ background: "rgba(6,6,26,0.95)", border: "1px solid rgba(167,139,250,0.3)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                <div className="px-3 py-2 text-xs font-bold" style={{ color: "#a78bfa", borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
                  Saved Models {savedModels.length > 0 ? `(${savedModels.length})` : ""}
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {savedModels.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-white/25 text-center">No saved models yet</div>
                  ) : savedModels.map(s => (
                    <div key={s.name} className="flex items-center px-3 py-2 gap-2 hover:bg-white/5 transition-colors">
                      <button onClick={() => loadSaved(s)} className="flex-1 text-left text-xs text-white/60 hover:text-white truncate">{s.name}</button>
                      <span className="text-[9px] text-white/25">{s.voxels.length}v</span>
                      <button onClick={() => deleteSaved(s.name)} className="text-white/20 hover:text-red-400 text-sm leading-none">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Templates ── */}
          <div className="w-36 flex-shrink-0 flex flex-col gap-1.5 p-3 overflow-y-auto"
            style={{ background: "rgba(0,0,0,0.3)", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="text-[9px] font-semibold text-white/25 uppercase tracking-wider mb-0.5">Templates</div>
            {Object.entries(TEMPLATES).map(([key, tpl]) => (
              <button key={key} onClick={() => loadTemplate(key)}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-semibold transition-all"
                style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.07)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="rgba(99,102,241,0.2)"; (e.currentTarget as HTMLElement).style.color="#a5b4fc"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color="rgba(255,255,255,0.5)"; }}>
                <span className="text-xl leading-none">{tpl.emoji}</span>
                <span>{tpl.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-1.5 text-[9px] text-white/20 flex items-center gap-4 flex-shrink-0 flex-wrap"
          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <span>Left-click/drag → place/erase</span>
          <span>Right-click/drag → orbit camera</span>
          <span>Scroll → zoom</span>
          <span>Ctrl+Z / Ctrl+Y → undo / redo</span>
          <span>Mirror X = symmetry mode</span>
        </div>
      </div>
    </div>
  );
}
