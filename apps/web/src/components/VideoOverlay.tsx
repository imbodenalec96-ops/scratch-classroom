import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getSocket } from "../lib/ws.ts";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { studentVideoStore } from "../lib/studentVideoStore.ts";

// iOS Safari cannot autoplay YouTube iframes even when muted.
// The ONLY fix: synchronous iframe.src assignment inside a user gesture handler.
const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

interface VideoState { videoId: string; title: string; classId: string; }

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function ytSrc(videoId: string, muted: boolean, autoplay = true): string {
  const origin = encodeURIComponent(window.location.origin);
  return `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&origin=${origin}&playsinline=1&rel=0&modestbranding=1${autoplay ? "&autoplay=1" : ""}${muted ? "&mute=1" : ""}`;
}

function sendYT(iframe: HTMLIFrameElement | null, func: string) {
  iframe?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
}

export default function VideoOverlay() {
  const { user } = useAuth();
  const [video, setVideo] = useState<VideoState | null>(null);
  const [muted, setMuted] = useState(true);
  const [iosReady, setIosReady] = useState(false); // true once iOS user has tapped play
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const classIdsRef = useRef<string[]>([]);

  const cmdVideo = useSyncExternalStore(
    studentVideoStore.subscribe,
    studentVideoStore.getSnapshot,
    studentVideoStore.getSnapshot,
  );

  // Load class IDs and join socket rooms
  useEffect(() => {
    if (!user || user.role !== "student") return;
    let cancelled = false;
    (async () => {
      try {
        const classes = await api.getClasses();
        if (!cancelled) {
          const ids = (classes || []).map((c: any) => c.id).filter(Boolean);
          classIdsRef.current = ids;
          const socket = getSocket();
          ids.forEach((id: string) => socket.emit("join:class", id));
        }
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
    return () => { socket.off("class:video", onVideo); socket.off("class:video:stop", onStop); };
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
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; return ""; };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      const blocked = ["Escape", "F5", "F11", "Tab"];
      const metaBlocked = ["r", "w", "t", "n", "l", "d", "ArrowLeft", "ArrowRight", "[", "]"];
      if (blocked.includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
      if ((e.metaKey || e.ctrlKey) && metaBlocked.includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
      if (e.altKey && ["ArrowLeft", "ArrowRight", "F4"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
    };
    const lockHistory = () => window.history.pushState(null, "", window.location.href);
    lockHistory();
    const onPopState = () => lockHistory();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("popstate", onPopState);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("popstate", onPopState);
      document.body.style.overflow = prev;
    };
  }, [anyActive, user]);

  const activeVideoId = cmdVideo.videoId || video?.videoId || null;
  const activeTitle = video?.title || (cmdVideo.videoId ? "Class Video" : "");

  // Reset on each new video
  useEffect(() => {
    if (!activeVideoId) return;
    setMuted(true);
    setIosReady(false);
  }, [activeVideoId]);

  // Non-iOS: load muted, then unmute via postMessage once player signals ready.
  // We listen to ALL window messages (YouTube may send from sub-frames).
  // 3s fallback fires unMute regardless.
  useEffect(() => {
    if (!activeVideoId || isIOS) return;
    let done = false;
    const doUnmute = () => {
      if (done) return;
      done = true;
      sendYT(iframeRef.current, "unMute");
      sendYT(iframeRef.current, "playVideo");
      setMuted(false);
    };
    const onMsg = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.event === "onReady" || d?.event === "infoDelivery") doUnmute();
      } catch {}
    };
    window.addEventListener("message", onMsg);
    const t = setTimeout(doUnmute, 3000);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(t); done = true; };
  }, [activeVideoId]);

  // iOS: synchronous iframe.src inside gesture is the only way to autoplay
  const handleIOSTap = useCallback(() => {
    if (!activeVideoId || !iframeRef.current) return;
    iframeRef.current.src = ytSrc(activeVideoId, false, true); // unmuted, inside gesture
    setIosReady(true);
    setMuted(false);
  }, [activeVideoId]);

  const toggleMute = useCallback(() => {
    sendYT(iframeRef.current, muted ? "unMute" : "mute");
    setMuted(m => !m);
  }, [muted]);

  if (!activeVideoId || user?.role !== "student") return null;

  // iOS loads a thumbnail-only src until tapped; non-iOS loads muted autoplay
  const iframeSrc = isIOS
    ? (iosReady ? ytSrc(activeVideoId, false, true) : ytSrc(activeVideoId, false, false))
    : ytSrc(activeVideoId, true, true);

  return createPortal(
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", inset: 0, zIndex: 2147483647, background: "#000",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      touchAction: "none", userSelect: "none",
    }} onContextMenu={(e) => e.preventDefault()}>

      {/* Header */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 2,
        background: "rgba(0,0,0,0.9)", borderBottom: "1px solid rgba(239,68,68,0.4)",
        padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 8px #ef4444", flexShrink: 0 }} />
          <span style={{ color: "#fca5a5", fontWeight: 700, fontSize: 13 }}>🔒 {activeTitle || "Class Video"}</span>
        </div>
        <button onClick={toggleMute} style={{
          background: muted ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.08)",
          border: `1px solid ${muted ? "rgba(234,179,8,0.5)" : "rgba(255,255,255,0.15)"}`,
          color: muted ? "#fbbf24" : "rgba(255,255,255,0.7)",
          borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontSize: 12, flexShrink: 0,
        }}>{muted ? "🔇 Unmute" : "🔊 Mute"}</button>
      </div>

      {/* Video */}
      <div style={{ position: "absolute", top: 48, left: 0, right: 0, bottom: 32, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
        <div style={{
          position: "relative", width: "100%", height: "100%",
          maxWidth: "calc((100vh - 92px) * 16 / 9)", maxHeight: "calc((100vw - 24px) * 9 / 16)",
          aspectRatio: "16/9", boxShadow: "0 0 60px rgba(0,0,0,0.8)", borderRadius: 8, overflow: "hidden",
        }}>
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            title={activeTitle}
          />
          {/* iOS tap-to-play: sits over the loaded (paused) iframe */}
          {isIOS && !iosReady && (
            <div onClick={handleIOSTap} style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.55)", cursor: "pointer", WebkitTapHighlightColor: "transparent",
            }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: "rgba(255,255,255,0.15)", border: "3px solid rgba(255,255,255,0.8)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg viewBox="0 0 24 24" fill="white" width={36} height={36}><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 20px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
        Your teacher will return you to BlockForge when the video ends.
      </div>
    </div>,
    document.body
  );
}
