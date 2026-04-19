import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { api } from "../lib/api.ts";

// Embedded viewer for a single teacher-granted website.
// Uses a sandboxed iframe; many sites block framing via X-Frame-Options /
// CSP frame-ancestors — we can't detect that reliably cross-origin, so we
// show a friendly fallback after a short timeout if the iframe never fires
// its `load` event, and always expose an "Open in new tab" escape hatch.
export default function WebsiteViewer() {
  const { websiteId } = useParams<{ websiteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [maybeBlocked, setMaybeBlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      .then(setSite)
      .catch(() => setErr("This website isn't available. Ask your teacher to unlock it."));
  }, [websiteId]);

  // If the iframe doesn't fire `load` within ~6s, surface the fallback.
  // (Cross-origin framing blocks render as a blank frame with no load event.)
  useEffect(() => {
    if (!site || loaded) return;
    const t = setTimeout(() => setMaybeBlocked(true), 6000);
    return () => clearTimeout(t);
  }, [site, loaded]);

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

  if (!site) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-t3">Loading…</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <Link to="/student" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-t2 text-sm font-medium">
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-t1 truncate">{site.title}</div>
          <div className="text-xs text-t3 truncate">{site.url}</div>
        </div>
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-t2 text-sm font-medium"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {isFullscreen ? "Exit" : "Fullscreen"}
        </button>
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
        >
          <ExternalLink size={14} /> Open in new tab
        </a>
      </div>

      {/* Iframe + fallback overlay */}
      <div className="flex-1 relative bg-white">
        <iframe
          src={site.url}
          title={site.title}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          onLoad={() => { setLoaded(true); setMaybeBlocked(false); }}
        />
        {maybeBlocked && !loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--bg)]/95">
            <AlertTriangle size={48} className="text-amber-400 mb-4" />
            <h2 className="text-xl font-bold mb-2 text-t1">This site doesn't allow embedding</h2>
            <p className="text-sm max-w-md text-t3 mb-6">
              Some websites block being shown inside another page. You can still open it in a new tab,
              or ask your teacher to pick a different URL.
            </p>
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold inline-flex items-center gap-2"
            >
              <ExternalLink size={16} /> Open {site.title} in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
