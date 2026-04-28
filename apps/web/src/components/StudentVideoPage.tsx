import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.ts";
import { isAccessAllowed } from "../lib/workUnlock.ts";

export default function StudentVideoPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<any[]>([]);
  const [playing, setPlaying] = useState<{ videoId: string; title: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(() => isAccessAllowed());

  // Re-check access every second so freetime grant appears without refresh
  useEffect(() => {
    const check = () => setUnlocked(isAccessAllowed());
    check();
    const iv = setInterval(check, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const vids = await api.getAllYouTubeLibrary().catch(() => [] as any[]);
        setVideos(vids);
      } finally { setLoading(false); }
    })();
  }, []);

  const ANIM = `
    @keyframes svpFade { from{opacity:0} to{opacity:1} }
    @keyframes svpUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
    @keyframes svpScale { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
    @keyframes svpSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  `;

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(135deg, #0b0520 0%, #14082e 40%, #0d1a3a 70%, #0a0520 100%)",
      color: "white",
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "0 0 60px",
    }}>
      <style>{ANIM}</style>

      {/* Header */}
      <div style={{
        padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.2)",
        backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => navigate("/student")}
          style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            color: "white", borderRadius: 10, padding: "8px 14px",
            cursor: "pointer", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            touchAction: "manipulation",
          }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>📺 Video Library</div>
          {videos.length > 0 && (
            <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1 }}>{videos.length} videos</div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 16px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
            <div style={{
              width: 36, height: 36,
              border: "3px solid rgba(139,92,246,0.3)",
              borderTopColor: "#8b5cf6",
              borderRadius: "50%",
              animation: "svpSpin 1s linear infinite",
            }} />
          </div>
        ) : videos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", animation: "svpFade 0.4s ease" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No videos yet</div>
            <div style={{ fontSize: 13, opacity: 0.45 }}>Check back later — your teacher will add videos here!</div>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
            animation: "svpUp 0.4s ease",
          }}>
            {videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => {
                  setPlaying({ videoId: v.video_id, title: v.title });
                  if (typeof window !== 'undefined') {
                    api.pickLibraryVideo(v.id, "student").catch(() => {});
                  }
                }}
                style={{
                  padding: 0, background: "none", border: "none", cursor: "pointer",
                  borderRadius: 14, overflow: "hidden",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  textAlign: "left",
                  animation: `svpUp 0.35s ease ${i * 0.04}s both`,
                  touchAction: "manipulation",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-4px) scale(1.02)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(139,92,246,0.35)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = "";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)";
                }}
              >
                {/* Thumbnail */}
                <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
                  <img
                    src={v.thumbnail_url || `https://img.youtube.com/vi/${v.video_id}/mqdefault.jpg`}
                    alt={v.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  {/* Play overlay */}
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0)",
                    transition: "background 0.2s",
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: "rgba(255,255,255,0.9)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                      opacity: 0.85,
                    }}>▶</div>
                  </div>
                  {/* Category badge */}
                  {v.category && (
                    <div style={{
                      position: "absolute", top: 8, left: 8,
                      fontSize: 9, fontWeight: 700,
                      padding: "3px 7px", borderRadius: 6,
                      background: "rgba(0,0,0,0.7)", color: "rgba(255,255,255,0.9)",
                      backdropFilter: "blur(4px)",
                      letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                      {v.category}
                    </div>
                  )}
                </div>
                {/* Title */}
                <div style={{
                  padding: "10px 12px 12px",
                  background: "rgba(255,255,255,0.06)",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)",
                    lineHeight: 1.35,
                    overflow: "hidden", display: "-webkit-box",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
                  }}>{v.title}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Video player overlay */}
      {playing && (
        <div
          onClick={() => setPlaying(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            backdropFilter: "blur(12px)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 20,
            animation: "svpFade 0.2s ease",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 900,
              animation: "svpScale 0.25s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            {/* Title + close */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, flex: 1, paddingRight: 12, color: "white" }}>
                {playing.title}
              </div>
              <button
                onClick={() => setPlaying(null)}
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
                  color: "white", cursor: "pointer", fontSize: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  touchAction: "manipulation",
                }}
              >✕</button>
            </div>
            {/* Video */}
            <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 16, overflow: "hidden" }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&disablekb=0&fs=1`}
                title={playing.title}
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; fullscreen"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
