import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Maximize2, Minimize2, ExternalLink } from "lucide-react";
import { api } from "../lib/api.ts";

export default function WebsiteViewer() {
  const { websiteId } = useParams<{ websiteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPwa = typeof navigator !== "undefined" && Boolean((navigator as any).standalone);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      await document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    if (!websiteId) return;
    api.getMyWebsite(websiteId)
      .then(data => {
        setSite(data);
        if (isPwa && data?.url) {
          // In PWA mode navigate directly — no iframe blocking issues, history preserved
          window.location.href = data.url;
        }
      })
      .catch((e: any) => {
        const status = e?.status ?? e?.response?.status;
        setErr(status === 404
          ? "This website isn't unlocked for you yet. Ask your teacher to grant you access."
          : "Something went wrong loading this site. Try refreshing or go back.");
      });
  }, [websiteId]);

  // When a site refuses to be embedded, auto-open it in a new tab immediately
  // so the student lands on the actual site without seeing a lock screen.
  const openDirectly = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setIframeBlocked(true);
  }, []);

  const handleIframeLoad = useCallback(() => {
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    try {
      const doc = iframeRef.current?.contentDocument;
      // If we can read contentDocument.URL and it's blank/error, the iframe was blocked
      if (!doc || doc.location.href === "about:blank") {
        if (site?.url) openDirectly(site.url);
      }
    } catch {
      // SecurityError = cross-origin content loaded fine — do nothing
    }
  }, [site, openDirectly]);

  useEffect(() => {
    if (!site || isPwa) return;
    // Fallback: if nothing loads in 3s, auto-open in new tab
    blockTimerRef.current = setTimeout(() => {
      if (iframeRef.current) {
        try {
          const doc = iframeRef.current.contentDocument;
          // If contentDocument is accessible and blank, it was blocked
          if (!doc || doc.location.href === "about:blank") {
            openDirectly(site.url);
          }
        } catch {
          // Cross-origin means it DID load — don't open new tab
        }
      }
    }, 3000);
    return () => { if (blockTimerRef.current) clearTimeout(blockTimerRef.current); };
  }, [site, isPwa, openDirectly]);

  if (err) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: "var(--bg)" }}>
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold mb-2 text-t1">Not available</h1>
        <p className="text-sm max-w-sm text-t3 mb-6">{err}</p>
        <button onClick={() => navigate("/student")} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold">
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!site || isPwa) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-t3">{isPwa ? "Opening…" : "Loading…"}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <Link to="/websites" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-t2 text-sm font-medium">
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-t1 truncate">{site.title}</div>
        </div>
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-t2 text-sm font-medium"
          title="Open in new tab"
        >
          <ExternalLink size={16} /> Open
        </a>
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-t2 text-sm font-medium"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Iframe */}
      <div className="flex-1 relative bg-white">
        {iframeBlocked && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 text-center p-8"
            style={{ background: "var(--bg)" }}
          >
            <div className="text-5xl">🔒</div>
            <div className="font-bold text-t1 text-lg">{site.title} can't be previewed here</div>
            <div className="text-t3 text-sm max-w-xs">
              This site blocks embedding for security. Tap below to open it directly.
            </div>
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm"
            >
              <ExternalLink size={16} /> Open {site.title}
            </a>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={site.url}
          title={site.title}
          className="w-full h-full border-0"
          onLoad={handleIframeLoad}
          allow="accelerometer; camera; encrypted-media; fullscreen; gamepad; geolocation; gyroscope; microphone; payment"
        />
      </div>
    </div>
  );
}
