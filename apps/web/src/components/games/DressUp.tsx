import React, { useRef, useEffect, useState } from "react";

// Avatar creator — pick skin, hair, eyes, mouth, outfit, accessory
// Pure canvas rendering, no external assets

const W = 340, H = 460;

const SKIN_TONES = ["#fde68a","#fed7aa","#fca5a5","#d97706","#92400e","#78350f","#fef3c7","#bfdbfe"];
const HAIR_COLORS = ["#1e293b","#92400e","#d97706","#dc2626","#7c3aed","#0284c7","#ec4899","#f9a8d4","#ffffff","#fbbf24"];
const EYE_COLORS  = ["#1e293b","#0284c7","#059669","#92400e","#7c3aed","#dc2626"];
const OUTFITS = [
  { label: "🩵 Blue Tee",   body: "#bfdbfe", collar: "#93c5fd" },
  { label: "❤️ Red Dress",  body: "#fca5a5", collar: "#f87171" },
  { label: "💛 Yellow",     body: "#fef08a", collar: "#fde68a" },
  { label: "💜 Hoodie",     body: "#e9d5ff", collar: "#c4b5fd" },
  { label: "🟢 Green Tee",  body: "#bbf7d0", collar: "#86efac" },
  { label: "🖤 Black Tee",  body: "#334155", collar: "#1e293b" },
];
const HAIR_STYLES = ["Short","Long","Curly","Ponytail","Bun","Spiky","Bob","None"];
const MOUTH_STYLES = ["😊 Smile","😁 Big Smile","😐 Neutral","🙂 Slight","😏 Smirk"];
const ACCESSORIES = ["None","👑 Crown","🎩 Hat","🌸 Flower","⭐ Star","🎀 Bow","🕶️ Glasses"];
const BACKGROUNDS = ["#fdf4ff","#eff6ff","#f0fdf4","#fef9ee","#fce7f3","#e0f2fe","#fafafa"];

type Config = {
  skin: number; hairColor: number; hairStyle: number;
  eyeColor: number; mouth: number; outfit: number;
  accessory: number; bg: number;
};

function drawAvatar(ctx: CanvasRenderingContext2D, cfg: Config) {
  const { skin, hairColor, hairStyle, eyeColor, mouth, outfit, bg } = cfg;
  const skinC = SKIN_TONES[skin], hairC = HAIR_COLORS[hairColor];
  const eyeC = EYE_COLORS[eyeColor];
  const outfitCfg = OUTFITS[outfit];

  // Background
  ctx.fillStyle = BACKGROUNDS[cfg.bg]; ctx.fillRect(0, 0, W, H);

  // Body / outfit
  ctx.fillStyle = outfitCfg.body;
  ctx.beginPath(); ctx.roundRect(W/2 - 50, 280, 100, 120, [12, 12, 0, 0]); ctx.fill();
  // Collar
  ctx.fillStyle = outfitCfg.collar;
  ctx.beginPath(); ctx.moveTo(W/2 - 18, 282); ctx.lineTo(W/2, 310); ctx.lineTo(W/2 + 18, 282); ctx.fill();

  // Arms
  ctx.fillStyle = skinC;
  ctx.beginPath(); ctx.roundRect(W/2 - 80, 285, 30, 80, 15); ctx.fill();
  ctx.beginPath(); ctx.roundRect(W/2 + 50, 285, 30, 80, 15); ctx.fill();

  // Neck
  ctx.fillStyle = skinC; ctx.fillRect(W/2 - 14, 250, 28, 36);

  // Head
  ctx.fillStyle = skinC;
  ctx.beginPath(); ctx.ellipse(W/2, 200, 72, 80, 0, 0, Math.PI * 2); ctx.fill();

  // Hair back (behind head for long/curly)
  if (hairStyle !== 7) {
    ctx.fillStyle = hairC;
    if (hairStyle === 1 || hairStyle === 2 || hairStyle === 6) {
      // Long or bob — hair falls behind
      ctx.beginPath(); ctx.ellipse(W/2, 215, 78, 90, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (hairStyle === 2) {
      // Curly — wider
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(W/2 + Math.cos(a)*62, 190 + Math.sin(a)*68, 22, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Head on top of hair (redraw)
    ctx.fillStyle = skinC; ctx.beginPath(); ctx.ellipse(W/2, 200, 70, 78, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.ellipse(W/2 - 24, 188, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W/2 + 24, 188, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = eyeC;
  ctx.beginPath(); ctx.arc(W/2 - 22, 190, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W/2 + 26, 190, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(W/2 - 21, 190, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W/2 + 27, 190, 4, 0, Math.PI * 2); ctx.fill();
  // Shine
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(W/2 - 19, 187, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W/2 + 29, 187, 2, 0, Math.PI * 2); ctx.fill();

  // Nose
  ctx.fillStyle = skinC === "#78350f" || skinC === "#92400e" ? "#6b3a1f" : "#d97706" + "90";
  ctx.beginPath(); ctx.arc(W/2, 210, 4, 0, Math.PI); ctx.fill();

  // Mouth
  ctx.strokeStyle = "#92400e"; ctx.lineWidth = 2;
  if (mouth === 0) { ctx.beginPath(); ctx.arc(W/2, 224, 16, 0.1, Math.PI - 0.1); ctx.stroke(); }
  else if (mouth === 1) {
    ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.arc(W/2, 225, 18, 0, Math.PI); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(W/2, 230, 12, 6, 0, 0, Math.PI); ctx.fill();
  }
  else if (mouth === 2) { ctx.beginPath(); ctx.moveTo(W/2-12, 228); ctx.lineTo(W/2+12, 228); ctx.stroke(); }
  else if (mouth === 3) { ctx.beginPath(); ctx.arc(W/2, 226, 10, 0.3, Math.PI - 0.3); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(W/2+4, 228, 10, Math.PI, 0.1, true); ctx.stroke(); }

  // Cheeks
  ctx.fillStyle = "#fca5a5" + "80";
  ctx.beginPath(); ctx.ellipse(W/2 - 48, 215, 18, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W/2 + 48, 215, 18, 10, 0, 0, Math.PI * 2); ctx.fill();

  // Hair front / top
  if (hairStyle !== 7) {
    ctx.fillStyle = hairC;
    if (hairStyle === 0) { ctx.beginPath(); ctx.ellipse(W/2, 135, 72, 32, 0, Math.PI, 0); ctx.fill(); }
    else if (hairStyle === 3) { // Ponytail
      ctx.beginPath(); ctx.ellipse(W/2, 135, 72, 28, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(W/2 + 68, 180, 14, 50, 0.3, 0, Math.PI * 2); ctx.fill();
    }
    else if (hairStyle === 4) { // Bun
      ctx.beginPath(); ctx.ellipse(W/2, 135, 68, 26, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(W/2, 125, 26, 0, Math.PI * 2); ctx.fill();
    }
    else if (hairStyle === 5) { // Spiky
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(W/2 + i*28, 155); ctx.lineTo(W/2 + i*28 + 10, 100); ctx.lineTo(W/2 + i*28 + 20, 155); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(W/2, 155, 72, 20, 0, Math.PI, 0); ctx.fill();
    }
    else { ctx.beginPath(); ctx.ellipse(W/2, 135, 72, 28, 0, Math.PI, 0); ctx.fill(); }
  }

  // Accessory
  const acc = cfg.accessory;
  ctx.font = "36px serif"; ctx.textAlign = "center";
  if (acc === 1) ctx.fillText("👑", W/2, 130);
  else if (acc === 2) ctx.fillText("🎩", W/2, 125);
  else if (acc === 3) ctx.fillText("🌸", W/2 + 62, 145);
  else if (acc === 4) ctx.fillText("⭐", W/2, 118);
  else if (acc === 5) ctx.fillText("🎀", W/2 + 65, 150);
  else if (acc === 6) ctx.fillText("🕶️", W/2, 200);
  ctx.textAlign = "left";
}

function Swatch({ colors, selected, onSelect, size = 28 }: { colors: string[]; selected: number; onSelect: (i: number) => void; size?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {colors.map((c, i) => (
        <button key={i} onClick={() => onSelect(i)} style={{ width: size, height: size, borderRadius: 6, background: c, border: i === selected ? "3px solid #7c3aed" : "3px solid transparent", boxShadow: i === selected ? "0 0 0 2px #fff, 0 0 0 4px #7c3aed" : "0 1px 3px #0003", touchAction: "manipulation" }} />
      ))}
    </div>
  );
}

function Pills({ options, selected, onSelect }: { options: string[]; selected: number; onSelect: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {options.map((o, i) => (
        <button key={i} onClick={() => onSelect(i)}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${i === selected ? "bg-purple-500 text-white border-purple-400" : "bg-white text-gray-600 border-gray-200"}`}
          style={{ touchAction: "manipulation" }}>{o}</button>
      ))}
    </div>
  );
}

export default function DressUp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cfg, setCfg] = useState<Config>({ skin: 0, hairColor: 0, hairStyle: 0, eyeColor: 0, mouth: 0, outfit: 0, accessory: 0, bg: 0 });
  const [tab, setTab] = useState(0);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    drawAvatar(ctx, cfg);
  }, [cfg]);

  const set = (key: keyof Config) => (val: number) => setCfg(c => ({ ...c, [key]: val }));

  const tabs = [
    { label: "🎨 Skin", content: <Swatch colors={SKIN_TONES} selected={cfg.skin} onSelect={set("skin")} /> },
    { label: "💇 Hair", content: <><Swatch colors={HAIR_COLORS} selected={cfg.hairColor} onSelect={set("hairColor")} /><div className="mt-2"><Pills options={HAIR_STYLES} selected={cfg.hairStyle} onSelect={set("hairStyle")} /></div></> },
    { label: "👀 Eyes", content: <Swatch colors={EYE_COLORS} selected={cfg.eyeColor} onSelect={set("eyeColor")} size={32} /> },
    { label: "👄 Mouth", content: <Pills options={MOUTH_STYLES} selected={cfg.mouth} onSelect={set("mouth")} /> },
    { label: "👗 Outfit", content: <Pills options={OUTFITS.map(o => o.label)} selected={cfg.outfit} onSelect={set("outfit")} /> },
    { label: "✨ Extra", content: <><Pills options={ACCESSORIES} selected={cfg.accessory} onSelect={set("accessory")} /><div className="mt-2"><Swatch colors={BACKGROUNDS} selected={cfg.bg} onSelect={set("bg")} /></div></> },
  ];

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#fdf4ff" }}>
      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border-4 border-purple-200 max-w-full" style={{ maxHeight: 280, objectFit: "contain" }} />

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 justify-center">
        {tabs.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${i === tab ? "bg-purple-500 text-white border-purple-400" : "bg-white text-purple-600 border-purple-200"}`}
            style={{ touchAction: "manipulation" }}>{t.label}</button>
        ))}
      </div>

      <div className="w-full max-w-sm p-3 bg-white rounded-2xl border-2 border-purple-100">
        {tabs[tab].content}
      </div>
    </div>
  );
}
