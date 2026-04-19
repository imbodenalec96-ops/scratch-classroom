import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { api } from "../lib/api.ts";

export default function WebsiteViewer() {
  const { websiteId } = useParams<{ websiteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<any>(null);
  const [err, setErr] = useState<string>("");
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
      .catch((e: any) => {
        const status = e?.status ?? e?.response?.status;
        setErr(status === 404
          ? "This website isn't unlocked for you yet. Ask your teacher to grant you access."
          : "Something went wrong loading this site. Try refreshing or go back.");
      });
  }, [websiteId]);

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
        <Link to="/websites" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-t2 text-sm font-medium">
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-t1 truncate">{site.title}</div>
        </div>
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-t2 text-sm font-medium"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {isFullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>

      {/* Iframe */}
      <div className="flex-1 relative bg-white">
        <iframe
          src={site.url}
          title={site.title}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
