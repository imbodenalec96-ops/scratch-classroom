import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getSocket } from "../lib/ws.ts";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { studentVideoStore } from "../lib/studentVideoStore.ts";

interface VideoState {
  videoId: string;
  title: string;
  classId: string;
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * Feature 34 — Fullscreen YouTube broadcast lockdown for students.
 *   • Students: full viewport takeover. No navigation, no right-click,
 *     no keyboard shortcuts, beforeunload warning. Ends only when teacher
 *     clears the broadcast.
 *   • Teachers / admins: exempt — their own UI stays fully usable.
 *   • Primary signal: WebSocket class:video / class:video:stop.
 *   • Fallback: HTTP poll every 3s against /classes/:id/video.
 */
export default function VideoOverlay() {
  const { user } = useAuth();
  const [video, setVideo] = useState<VideoState | null>(null);
  const classIdsRef = useRef<string[]>([]);
  // New student_commands pipe is authoritative when present — dispatched by
  // Layout/PublicLayout into this module-level store. Coexists with the
  // existing socket+poll path so reloads mid-broadcast still recover.
  const cmdVideo = useSyncExternalStore(
    studentVideoStore.subscribe,
    studentVideoStore.getSnapshot,
    studentVideoStore.getSnapshot,
  );

  // Load the student's class memberships so we know which class_video rows to poll.
  useEffect(() => {
    if (!user || user.role !== "student") return;
    let cancelled = false;
    (async () => {
      try {
        const classes = await api.getClasses();
        if (!cancelled) classIdsRef.current = (classes || []).map((c: any) => c.id).filter(Boolean);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Socket listeners
  useEffect(() => {
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

  // HTTP poll fallback — primary signal when socket isn't attached or fires late.
  useEffect(() => {
    if (!user || user.role !== "student") return;
    let alive = true;
    const poll = async () => {
      try {
        const ids = classIdsRef.current;
        if (!ids.length) return;
        // Check each class; if any has an active broadcast, show it.
        for (const cid of ids) {
          const row = await api.getClassVideo(cid).catch(() => null);
          if (!alive) return;
          if (row && row.video_id) {
            setVideo({ videoId: row.video_id, title: row.video_title || "Class Video", classId: cid });
            return;
          }
        }
        // No active broadcast found for any class
        setVideo(null);
      } catch {}
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  // Lockdown side-effects while broadcast is active (students only)
  const anyActive = !!(cmdVideo.videoId || video);
  useEffect(() => {
    if (!anyActive || user?.role !== "student") return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Your teacher is broadcasting a video. Leaving will disconnect you.";
      return e.returnValue;
    };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); };
    const onKeyDown = (e: KeyboardEvent) => {
      // Swallow common escape/navigation shortcuts.
      const blockedKeys = ["Escape", "F5", "F11", "Tab"];
      const blockedMetaKeys = ["r", "w", "t", "n", "l", "d", "ArrowLeft", "ArrowRight", "[", "]"];
      if (blockedKeys.includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
      if ((e.metaKey || e.ctrlKey) && blockedMetaKeys.includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
      // Alt+Left (history back) and Alt+F4
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "F4")) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    // History lock — re-push state if the browser tries to pop.
    const lockHistory = () => window.history.pushState(null, "", window.location.href);
    lockHistory();
    const onPopState = () => lockHistory();

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("popstate", onPopState);

    // Lock document scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("popstate", onPopState);
      document.body.style.overflow = prevOverflow;
    };
  }, [anyActive, user]);

  // Merge: student_commands pipe wins when set; fall back to the legacy
  // socket/poll `video` state otherwise. An explicit END_BROADCAST clears
  // cmdVideo.videoId so the overlay tears down regardless of the slower
  // class_video DELETE propagation.
  const activeVideoId = cmdVideo.videoId || video?.videoId || null;
  const activeTitle = (video?.title) || (cmdVideo.videoId ? "Class Video" : "");
  if (!activeVideoId || user?.role !== "student") return null;

  // Privacy-enhanced embed + full lockdown params
  const src = `https://www.youtube-nocookie.com/embed/${activeVideoId}?autoplay=1&modestbranding=1&rel=0&fs=0&iv_load_policy=3&disablekb=1&playsinline=1`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 2147483647,
        background: "#000",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        touchAction: "none", userSelect: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        background: "rgba(0,0,0,0.9)",
        borderBottom: "1px solid rgba(239,68,68,0.4)",
        padding: "10px 20px",
        display: "flex", alignItems: "center", gap: 12,
        zIndex: 1,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#ef4444", boxShadow: "0 0 8px #ef4444",
          animation: "pulse 2s infinite",
        }} />
        <span style={{ color: "#fca5a5", fontWeight: 700, fontSize: 13, letterSpacing: "0.02em" }}>
          🔒 Broadcast by your teacher — {activeTitle || "Class Video"}
        </span>
      </div>

      {/* Full-viewport 16:9 letterboxed iframe */}
      <div style={{
        position: "absolute",
        top: 48, left: 0, right: 0, bottom: 32,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 12,
      }}>
        <div style={{
          width: "100%", height: "100%",
          maxWidth: "calc((100vh - 92px) * 16 / 9)",
          maxHeight: "calc((100vw - 24px) * 9 / 16)",
          aspectRatio: "16/9",
          boxShadow: "0 0 60px rgba(0,0,0,0.8)",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <iframe
            src={src}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            title={activeTitle}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "8px 20px",
        textAlign: "center",
        color: "rgba(255,255,255,0.4)", fontSize: 11,
        letterSpacing: "0.04em",
      }}>
        Your teacher will return you to BlockForge when the video ends.
      </div>
    </div>,
    document.body
  );
}
