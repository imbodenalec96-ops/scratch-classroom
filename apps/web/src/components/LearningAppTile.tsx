import React from "react";
import { Link } from "react-router-dom";

// Calm, high-saturation-but-gentle palette inspired by Clever's launcher.
// Each entry: { bg, iconBg, accent } — iconBg is for the emoji badge plate.
const PALETTE = [
  { bg: "linear-gradient(145deg, #efe7ff 0%, #e4d7ff 100%)", iconBg: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)", accent: "#6d28d9" }, // lavender
  { bg: "linear-gradient(145deg, #e4f5e1 0%, #d1ecd0 100%)", iconBg: "linear-gradient(135deg, #4ade80 0%, #22c55e 100%)", accent: "#166534" }, // sage
  { bg: "linear-gradient(145deg, #fff4d6 0%, #fde8a6 100%)", iconBg: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)", accent: "#92400e" }, // honey
  { bg: "linear-gradient(145deg, #dceeff 0%, #bfdcff 100%)", iconBg: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)", accent: "#1e40af" }, // sky
  { bg: "linear-gradient(145deg, #ffe0db 0%, #ffc9bf 100%)", iconBg: "linear-gradient(135deg, #fb7185 0%, #ef4444 100%)", accent: "#9f1239" }, // coral
  { bg: "linear-gradient(145deg, #fff1e0 0%, #ffe0bf 100%)", iconBg: "linear-gradient(135deg, #fcd34d 0%, #fb923c 100%)", accent: "#9a3412" }, // cream
];

const DARK_PALETTE = [
  { bg: "linear-gradient(145deg, rgba(167,139,250,0.18) 0%, rgba(139,92,246,0.12) 100%)", iconBg: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)", accent: "#c4b5fd" },
  { bg: "linear-gradient(145deg, rgba(74,222,128,0.16) 0%, rgba(34,197,94,0.10) 100%)", iconBg: "linear-gradient(135deg, #4ade80 0%, #22c55e 100%)", accent: "#86efac" },
  { bg: "linear-gradient(145deg, rgba(251,191,36,0.18) 0%, rgba(245,158,11,0.12) 100%)", iconBg: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)", accent: "#fcd34d" },
  { bg: "linear-gradient(145deg, rgba(96,165,250,0.18) 0%, rgba(59,130,246,0.12) 100%)", iconBg: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)", accent: "#93c5fd" },
  { bg: "linear-gradient(145deg, rgba(251,113,133,0.18) 0%, rgba(239,68,68,0.12) 100%)", iconBg: "linear-gradient(135deg, #fb7185 0%, #ef4444 100%)", accent: "#fda4af" },
  { bg: "linear-gradient(145deg, rgba(252,211,77,0.18) 0%, rgba(251,146,60,0.12) 100%)", iconBg: "linear-gradient(135deg, #fcd34d 0%, #fb923c 100%)", accent: "#fdba74" },
];

// Pick palette slot deterministically from the website id (so a given app
// keeps its color between renders and across sessions).
function paletteFor(id: string, dk: boolean) {
  const p = dk ? DARK_PALETTE : PALETTE;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return p[Math.abs(h) % p.length];
}

// Infer a default emoji from the category string when the teacher hasn't
// picked one explicitly. Keep the checks fuzzy — teachers type freely.
export function inferCategoryIcon(category?: string | null): string {
  const c = String(category || "").toLowerCase();
  if (!c) return "🌐";
  if (/game|arcade|play/.test(c)) return "🎮";
  if (/read|book|story|libr/.test(c)) return "📚";
  if (/math|number|calc/.test(c)) return "🧮";
  if (/writ|spell|word|gramm/.test(c)) return "✏️";
  if (/art|draw|paint|music|creat/.test(c)) return "🎨";
  if (/sci|bio|chem|physic|space|nature/.test(c)) return "🔬";
  if (/typ|keyboard/.test(c)) return "⌨️";
  if (/code|program/.test(c)) return "💻";
  if (/brain|puzzle|logic|think|learn/.test(c)) return "🧠";
  if (/video|movie|watch/.test(c)) return "🎬";
  return "🌐";
}

export type LearningAppData = {
  id: string;
  title: string;
  url?: string;
  category?: string | null;
  thumbnail_url?: string | null;
  icon_emoji?: string | null;
};

export function LearningAppTile({
  app,
  dk,
  onClick,
  asLink = true,
  footer,
}: {
  app: LearningAppData;
  dk: boolean;
  onClick?: () => void;
  asLink?: boolean;
  footer?: React.ReactNode;
}) {
  const pal = paletteFor(app.id, dk);
  const emoji = app.icon_emoji || inferCategoryIcon(app.category);

  const content = (
    <>
      <div
        className="flex items-center justify-center rounded-2xl shadow-lg shrink-0"
        style={{
          width: 64, height: 64,
          background: pal.iconBg,
          boxShadow: dk ? "0 6px 18px rgba(0,0,0,0.35)" : "0 6px 14px rgba(0,0,0,0.12)",
          fontSize: 32,
          lineHeight: 1,
        }}
      >
        {app.thumbnail_url ? (
          <img src={app.thumbnail_url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 16 }} />
        ) : (
          <span aria-hidden>{emoji}</span>
        )}
      </div>
      <div className="mt-3 text-center w-full px-2">
        <div
          className="text-sm font-extrabold leading-tight"
          style={{
            color: dk ? "rgba(255,255,255,0.95)" : "#1f2937",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as any,
            overflow: "hidden",
          }}
        >
          {app.title}
        </div>
        {app.category && (
          <div
            className="inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              background: dk ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)",
              color: pal.accent,
              letterSpacing: "0.06em",
            }}
          >
            {app.category}
          </div>
        )}
      </div>
    </>
  );

  const style: React.CSSProperties = {
    height: 180,
    borderRadius: 16,
    background: pal.bg,
    border: dk ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.04)",
    boxShadow: dk ? "0 4px 12px rgba(0,0,0,0.25)" : "0 4px 12px rgba(17,24,39,0.06)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    textDecoration: "none",
    cursor: "pointer",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    position: "relative",
  };

  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transform = "translateY(-3px) scale(1.02)";
    el.style.boxShadow = dk ? "0 10px 28px rgba(0,0,0,0.45)" : "0 12px 28px rgba(17,24,39,0.14)";
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transform = "";
    el.style.boxShadow = style.boxShadow as string;
  };

  if (asLink && app.id) {
    return (
      <Link to={`/app/${app.id}`} style={style} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick}>
        {content}
        {footer}
      </Link>
    );
  }
  return (
    <div style={style} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick} role="button" tabIndex={0}>
      {content}
      {footer}
    </div>
  );
}

export function LearningAppGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}
