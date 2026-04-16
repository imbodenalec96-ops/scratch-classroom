import React, { useEffect, useState } from "react";
import { getSocket } from "../lib/ws.ts";
import { useAuth } from "../lib/auth.tsx";

interface VideoState {
  videoId: string;
  title: string;
  classId: string;
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  // Already just an ID
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * VideoOverlay – mounts globally in Layout.
 * Students see a full-screen YouTube lockdown when teacher broadcasts class:video.
 * Teacher/admin are never locked; they see nothing.
 */
export default function VideoOverlay() {
  const { user } = useAuth();
  const [video, setVideo] = useState<VideoState | null>(null);

  useEffect(() => {
    // Only lock down students
    if (!user || user.role !== "student") return;

    const socket = getSocket();

    const onVideo = (data: any) => {
      const id = extractYouTubeId(data.url || data.videoId || "");
      if (id) setVideo({ videoId: id, title: data.title || "Class Video", classId: data.classId });
    };
    const onStop = () => setVideo(null);

    socket.on("class:video", onVideo);
    socket.on("class:video:stop", onStop);
    return () => {
      socket.off("class:video", onVideo);
      socket.off("class:video:stop", onStop);
    };
  }, [user]);

  if (!video) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#000",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Header bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        background: "rgba(0,0,0,0.85)",
        borderBottom: "1px solid rgba(139,92,246,0.4)",
        padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#a78bfa", boxShadow: "0 0 8px #a78bfa",
          animation: "pulse 2s infinite",
        }} />
        <span style={{ color: "#a78bfa", fontWeight: 700, fontSize: 14, letterSpacing: "0.02em" }}>
          📺 Class Video — {video.title}
        </span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginLeft: "auto" }}>
          Your teacher has shared a video. Stay focused!
        </span>
      </div>

      {/* YouTube embed */}
      <div style={{
        width: "min(900px, 96vw)",
        aspectRatio: "16/9",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 0 60px rgba(139,92,246,0.3)",
        border: "1px solid rgba(139,92,246,0.3)",
        marginTop: 56,
      }}>
        <iframe
          src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0&modestbranding=1`}
          style={{ width: "100%", height: "100%", border: "none" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={video.title}
        />
      </div>

      {/* Footer */}
      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginTop: 16 }}>
        Your teacher will return you to BlockForge when the video is done.
      </div>
    </div>
  );
}
