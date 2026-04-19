import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getSocket } from "../lib/ws.ts";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { studentVideoStore } from "../lib/studentVideoStore.ts";

// iOS Safari blocks autoplay in iframes that load without a prior user gesture.
// postMessage({ playVideo }) does NOT count — gesture context doesn't cross iframe
// boundaries. The only reliable approach: assign iframe.src SYNCHRONOUSLY inside
// the click handler, which iOS treats as user-initiated.
const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

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

function buildSrc(videoId: string, autoplay: boolean): string {
  const base = `https://www.youtube-nocookie.com/embed/${videoId}`;
  const p = `modestbranding=1&rel=0&fs=0&iv_load_policy=3&disablekb=1&playsinline=1${autoplay ? "&autoplay=1" : ""}`;
  return `${base}?${p}`;
}

export default function VideoOverlay() {
  const { user } = useAuth();
  const [video, setVideo] = useState<VideoState | null>(null);
  // iosStarted: true once the student has tapped. Tracks whether the iframe
  // has been given an autoplay src by handleIOSTap.
  const [iosStarted, setIosStarted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const classIdsRef = useRef<string[]>([]);

  const cmdVideo = useSyncExternalStore(
    studentVideoStore.subscribe,
    studentVideoStore.getSnapshot,
    studentVideoStore.getSnapshot,
  );

  // Load class memberships for HTTP poll
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

  // WebSocket listeners
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

  // HTTP poll fallback
  useEffect(() => {
    if (!user || user.role !== "student") return;
    let alive = true;
    const poll = async () => {
      try {
        const ids = classIdsRef.current;
        if (!ids.length) return;
        for (const cid of ids) {
          const row = await api.getClassVideo(cid).catch(() => null);
          if (!alive) return;
          if (row?.video_id) {
            setVideo({ videoId: row.video_id, title: row.video_title || "Class Video", classId: cid });
            return;
          }
        }
        setVideo(null);
      } catch {}
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  // Lockdown side-effects
  const anyActive = !!(cmdVideo.videoId || video);
  useEffect(() => {
    if (!anyActive || user?.role !== "student") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Your teacher is broadcasting a video.";
      return e.returnValue;
    };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); };
    const onKeyDown = (e: KeyboardEvent) => {
      const blocked = ["Escape", "F5", "F11", "Tab"];
      const metaBlocked = ["r", "w", "t", "n", "l", "d", "ArrowLeft", "ArrowRight", "[", "]"];
      if (blocked.includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
      if ((e.metaKey || e.ctrlKey) && metaBlocked.includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "F4")) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    const lockHistory = () => window.history.pushState(null, "", window.location.href);
    lockHistory();
    const onPopState = () => lockHistory();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("popstate", onPopState);
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

  const activeVideoId = cmdVideo.videoId || video?.videoId || null;
  const activeTitle = video?.title || (cmdVideo.videoId ? "Class Video" : "");

  // When a new broadcast starts (videoId changes), reset iOS tap state and
  // blank the iframe so the tap-to-play screen reappears for the new video.
  useEffect(() => {
    if (!isIOS) return;
    setIosStarted(false);
    if (iframeRef.current) iframeRef.current.src = "about:blank";
  }, [activeVideoId]);

  // iOS tap handler: assign iframe.src SYNCHRONOUSLY within the gesture.
  // This is the only approach that satisfies Safari's autoplay policy —
  // postMessage and state-triggered re-renders both happen too late.
  const handleIOSTap = useCallback(() => {
    if (!activeVideoId || !iframeRef.current) return;
    const autoplaySrc = buildSrc(activeVideoId, true);
    iframeRef.current.src = autoplaySrc; // ← synchronous DOM write, inside gesture
    setIosStarted(true);                  // ← async state update keeps React in sync
  }, [activeVideoId]);

  if (!activeVideoId || user?.role !== "student") return null;

  // iOS: start with blank so the iframe doesn't load before the user taps.
  // After tap, React re-renders with the autoplay src (matching what we already
  // set via the ref), so React won't overwrite the playing video.
  const iframeSrc = isIOS
    ? (iosStarted ? buildSrc(activeVideoId, true) : "about:blank")
    : buildSrc(activeVideoId, true);

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

      {/* 16:9 letterboxed iframe */}
      <div style={{
        position: "absolute",
        top: 48, left: 0, right: 0, bottom: 32,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 12,
      }}>
        <div style={{
          position: "relative",
          width: "100%", height: "100%",
          maxWidth: "calc((100vh - 92px) * 16 / 9)",
          maxHeight: "calc((100vw - 24px) * 9 / 16)",
          aspectRatio: "16/9",
          boxShadow: "0 0 60px rgba(0,0,0,0.8)",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            title={activeTitle}
          />

          {/* iOS: full-screen tap-to-play overlay until the student taps */}
          {isIOS && !iosStarted && (
            <div
              onClick={handleIOSTap}
              style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0.82)",
                cursor: "pointer", gap: 20,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <div style={{
                width: 88, height: 88, borderRadius: "50%",
                background: "rgba(255,255,255,0.12)",
                border: "3px solid rgba(255,255,255,0.7)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg viewBox="0 0 24 24" fill="white" width={40} height={40}>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
                  Tap to watch
                </div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                  Your teacher is showing a video
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "8px 20px", textAlign: "center",
        color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: "0.04em",
      }}>
        Your teacher will return you to BlockForge when the video ends.
      </div>
    </div>,
    document.body
  );
}
