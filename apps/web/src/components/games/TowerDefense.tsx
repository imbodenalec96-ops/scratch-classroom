import React, { useEffect, useRef, useState, useCallback } from "react";

// Tower Defense lite — 3 lanes, place towers to shoot enemies walking across
const W = 420, H = 380;
const LANES_Y = [100, 190, 280];
const TOWER_TYPES = [
  { id: "basic",  label: "🌻 Flower", cost: 30, range: 80,  dmg: 1,   rate: 60,  color: "#fbbf24" },
  { id: "strong", label: "🌺 Rose",   cost: 60, range: 100, dmg: 2.5, rate: 90,  color: "#f472b6" },
  { id: "fast",   label: "🌿 Vine",   cost: 45, range: 70,  dmg: 1.2, rate: 30,  color: "#4ade80" },
];
const ENEMY_TYPES = [
  { hp: 5,  spd: 0.8, reward: 10, emoji: "🐛", size: 18 },
  { hp: 12, spd: 0.5, reward: 20, emoji: "🐞", size: 20 },
  { hp: 25, spd: 0.4, reward: 40, emoji: "🐜", size: 22 },
];

type Tower = { x: number; y: number; lane: number; type: typeof TOWER_TYPES[0]; cooldown: number };
type Enemy = { id: number; x: number; lane: number; hp: number; maxHp: number; spd: number; reward: number; emoji: string; size: number; dmg: number };
type Bullet = { x: number; y: number; tx: number; ty: number; dmg: number; spd: number };

type State = {
  towers: Tower[]; enemies: Enemy[]; bullets: Bullet[];
  gold: number; lives: number; wave: number; waveTimer: number;
  enemyId: number; score: number; over: boolean; win: boolean;
  waveActive: boolean; spawnQueue: typeof ENEMY_TYPES[0][];
};

function initState(): State {
  return { towers: [], enemies: [], bullets: [], gold: 100, lives: 10, wave: 0,
    waveTimer: 0, enemyId: 0, score: 0, over: false, win: false, waveActive: false, spawnQueue: [] };
}

function makeWave(wave: number): typeof ENEMY_TYPES[0][] {
  const q: typeof ENEMY_TYPES[0][] = [];
  const count = 5 + wave * 3;
  for (let i = 0; i < count; i++) {
    const tier = Math.min(2, Math.floor(wave / 3) + (Math.random() < 0.3 ? 1 : 0));
    q.push(ENEMY_TYPES[Math.min(tier, 2)]);
  }
  return q;
}

export default function TowerDefense() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<State>(initState());
  const raf = useRef(0);
  const [ui, setUi] = useState({ gold: 100, lives: 10, wave: 0, score: 0, over: false, win: false, waveActive: false });
  const [selectedType, setSelectedType] = useState(TOWER_TYPES[0]);
  const spawnTimer = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;

    // Background — grass field
    ctx.fillStyle = "#dcfce7"; ctx.fillRect(0, 0, W, H);
    // Lane paths
    LANES_Y.forEach(ly => {
      ctx.fillStyle = "#d4a96820"; ctx.fillRect(0, ly - 24, W, 48);
      ctx.strokeStyle = "#a3e63540"; ctx.lineWidth = 1; ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); ctx.setLineDash([]);
    });
    // Goal zone
    ctx.fillStyle = "#fef9ee"; ctx.fillRect(W - 46, 0, 46, H);
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W - 46, 0); ctx.lineTo(W - 46, H); ctx.stroke();
    ctx.fillStyle = "#f59e0b"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
    ctx.fillText("BASE", W - 23, H / 2 - 6); ctx.fillText(`❤️ ${s.lives}`, W - 23, H / 2 + 12); ctx.textAlign = "left";

    // Towers
    s.towers.forEach(t => {
      // Range ring (faint)
      ctx.beginPath(); ctx.arc(t.x, t.y, t.type.range, 0, Math.PI * 2);
      ctx.fillStyle = t.type.color + "15"; ctx.fill();
      ctx.strokeStyle = t.type.color + "40"; ctx.lineWidth = 1; ctx.stroke();
      // Tower base
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(t.x - 18, t.y - 18, 36, 36, 8); ctx.fill();
      ctx.strokeStyle = t.type.color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.font = "22px serif"; ctx.textAlign = "center"; ctx.fillText(t.type.label.split(" ")[0], t.x, t.y + 8); ctx.textAlign = "left";
    });

    // Enemies
    s.enemies.forEach(en => {
      ctx.font = `${en.size}px serif`; ctx.textAlign = "center";
      ctx.fillText(en.emoji, en.x, LANES_Y[en.lane] + en.size * 0.4); ctx.textAlign = "left";
      // HP bar
      const bw = 32, bh = 5;
      ctx.fillStyle = "#1e293b"; ctx.fillRect(en.x - bw/2, LANES_Y[en.lane] - en.size * 0.5 - 10, bw, bh);
      ctx.fillStyle = en.hp / en.maxHp > 0.5 ? "#4ade80" : "#ef4444";
      ctx.fillRect(en.x - bw/2, LANES_Y[en.lane] - en.size * 0.5 - 10, bw * (en.hp / en.maxHp), bh);
    });

    // Bullets
    s.bullets.forEach(b => {
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
    });

    // HUD
    ctx.fillStyle = "#1e293b"; ctx.font = "bold 13px system-ui";
    ctx.fillText(`💰 ${s.gold}`, 10, 22);
    ctx.fillText(`🌊 Wave ${s.wave}`, 90, 22);
    ctx.fillText(`⭐ ${s.score}`, 200, 22);

    if (s.over || s.win) {
      ctx.fillStyle = "#0000009a"; ctx.fillRect(0, H/2 - 50, W, 100);
      ctx.fillStyle = "#fff"; ctx.font = "bold 24px system-ui"; ctx.textAlign = "center";
      ctx.fillText(s.win ? "🏆 You defended the base!" : "💥 Your base fell!", W/2, H/2 + 4);
      ctx.font = "14px system-ui"; ctx.fillText("Tap to restart", W/2, H/2 + 30); ctx.textAlign = "left";
    }
  }, []);

  const step = useCallback(() => {
    const s = st.current;
    if (!s.over && !s.win) {
      // Spawn enemies from queue
      if (s.spawnQueue.length > 0) {
        spawnTimer.current++;
        if (spawnTimer.current >= 60) {
          spawnTimer.current = 0;
          const type = s.spawnQueue.shift()!;
          const lane = Math.floor(Math.random() * 3);
          s.enemies.push({ id: s.enemyId++, x: -24, lane, hp: type.hp * (1 + s.wave * 0.1), maxHp: type.hp * (1 + s.wave * 0.1), spd: type.spd, reward: type.reward, emoji: type.emoji, size: type.size, dmg: 1 });
        }
        if (s.spawnQueue.length === 0) s.waveActive = true;
      }

      // Move enemies
      s.enemies = s.enemies.filter(en => {
        en.x += en.spd;
        if (en.x > W - 40) {
          s.lives -= en.dmg;
          if (s.lives <= 0) { s.over = true; setUi(u => ({ ...u, over: true })); }
          setUi(u => ({ ...u, lives: Math.max(0, s.lives) }));
          return false;
        }
        return true;
      });

      // Tower shoot
      s.towers.forEach(t => {
        t.cooldown--;
        if (t.cooldown <= 0) {
          const target = s.enemies.find(en => en.lane === t.lane && Math.abs(en.x - t.x) < t.type.range);
          if (target) {
            t.cooldown = t.type.rate;
            s.bullets.push({ x: t.x, y: LANES_Y[t.lane], tx: target.x, ty: LANES_Y[target.lane], dmg: t.type.dmg, spd: 6 });
          }
        }
      });

      // Move bullets
      s.bullets = s.bullets.filter(b => {
        const dx = b.tx - b.x, dy = b.ty - b.y;
        const d = Math.hypot(dx, dy);
        if (d < b.spd + 4) {
          // Hit — find closest enemy
          const en = s.enemies.find(e => Math.hypot(e.x - b.tx, LANES_Y[e.lane] - b.ty) < 28);
          if (en) { en.hp -= b.dmg; if (en.hp <= 0) { s.score += en.reward; s.gold += en.reward; setUi(u => ({ ...u, gold: s.gold, score: s.score })); en.hp = 0; } }
          return false;
        }
        b.x += (dx / d) * b.spd; b.y += (dy / d) * b.spd;
        b.tx += s.enemies.find(e => Math.hypot(e.x - b.tx, LANES_Y[e.lane] - b.ty) < 28)?.spd || 0;
        return true;
      });

      // Remove dead enemies
      s.enemies = s.enemies.filter(e => e.hp > 0);

      // Wave complete
      if (s.waveActive && s.enemies.length === 0 && s.spawnQueue.length === 0) {
        s.waveActive = false;
        if (s.wave >= 8) { s.win = true; setUi(u => ({ ...u, win: true })); }
        else setUi(u => ({ ...u, waveActive: false }));
      }
    }
    draw();
    raf.current = requestAnimationFrame(step);
  }, [draw]);

  useEffect(() => { raf.current = requestAnimationFrame(step); return () => cancelAnimationFrame(raf.current); }, [step]);

  const placeTower = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (st.current.over || st.current.win) { st.current = initState(); setUi({ gold: 100, lives: 10, wave: 0, score: 0, over: false, win: false, waveActive: false }); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);
    const s = st.current;
    if (s.gold < selectedType.cost) return;
    // Find nearest lane
    const lane = LANES_Y.reduce((best, ly, i) => Math.abs(my - ly) < Math.abs(my - LANES_Y[best]) ? i : best, 0);
    // Don't place on top of another tower
    if (s.towers.some(t => Math.abs(t.x - mx) < 36)) return;
    if (mx > W - 50 || mx < 10) return;
    s.towers.push({ x: mx, y: LANES_Y[lane], lane, type: selectedType, cooldown: 0 });
    s.gold -= selectedType.cost;
    setUi(u => ({ ...u, gold: s.gold }));
  };

  const sendWave = () => {
    const s = st.current;
    if (s.waveActive || s.spawnQueue.length > 0) return;
    s.wave++;
    s.spawnQueue = makeWave(s.wave);
    spawnTimer.current = 59;
    setUi(u => ({ ...u, wave: s.wave, waveActive: true }));
  };

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#f0fdf4" }}>
      {/* Tower picker */}
      <div className="flex gap-2 flex-wrap justify-center">
        {TOWER_TYPES.map(tt => (
          <button key={tt.id} onClick={() => setSelectedType(tt)}
            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${selectedType.id === tt.id ? "border-green-500 bg-green-100 text-green-800" : "border-green-200 bg-white text-gray-600"}`}
            style={{ touchAction: "manipulation" }}>
            <span>{tt.label}</span>
            <span className="text-yellow-600">💰{tt.cost}</span>
          </button>
        ))}
        <button onClick={sendWave} disabled={ui.waveActive || ui.over || ui.win}
          className="px-3 py-2 rounded-xl text-xs font-bold border-2 bg-red-500 text-white border-red-400 disabled:opacity-40"
          style={{ touchAction: "manipulation" }}>
          🌊 {ui.waveActive ? `Wave ${ui.wave} active` : `Send Wave ${ui.wave + 1}`}
        </button>
      </div>

      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border-2 border-green-200 max-w-full"
        style={{ cursor: "cell", touchAction: "none" }} onClick={placeTower} />

      <div className="flex gap-3 text-sm font-bold text-green-800">
        <span>💰 {ui.gold}</span><span>❤️ {ui.lives}</span><span>⭐ {ui.score}</span>
      </div>
      <p className="text-green-600/50 text-xs">Pick a tower · click lanes to place · send waves to start!</p>
    </div>
  );
}
