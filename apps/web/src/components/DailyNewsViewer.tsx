import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useCurrentBlock } from "../lib/useCurrentBlock.ts";

/** Mirror of the generic schedule-block content shape — local copy to avoid
 *  importing teacher-only code into the student bundle. Supports per-day
 *  newsUrl overrides (`byDay: { Mon: { newsUrl } }`). */
type NewsBlockDay = { newsUrl?: string };
const DAY_LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function resolveTodaysBlockNewsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    const today = DAY_LETTERS[new Date().getDay()];
    const dayVal: NewsBlockDay = (p?.byDay && typeof p.byDay === "object" && p.byDay[today]) || {};
    const url =
      (typeof dayVal.newsUrl === "string" && dayVal.newsUrl) ||
      (typeof p?.newsUrl === "string" && p.newsUrl) ||
      "";
    return url || null;
  } catch { return null; }
}

// URL → embeddable iframe URL (or image / youtube).
// Returns { kind, src } describing how to render it.
export function embedForUrl(url: string): { kind: "slides" | "doc" | "drive" | "youtube" | "pdf" | "image" | "iframe"; src: string } {
  const u = url.trim();
  // Google Slides
  const slides = u.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (slides) return { kind: "slides", src: `https://docs.google.com/presentation/d/${slides[1]}/embed?start=true&loop=true&delayms=5000` };
  // Google Docs
  const doc = u.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (doc) return { kind: "doc", src: `https://docs.google.com/document/d/${doc[1]}/preview` };
  // Drive file (video, PDF hosted on Drive, etc.)
  const drive = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (drive) return { kind: "drive", src: `https://drive.google.com/file/d/${drive[1]}/preview` };
  // YouTube
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
  if (yt) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` };
  // PDF (by extension)
  if (/\.pdf($|\?)/i.test(u)) return { kind: "pdf", src: u };
  // Image (by extension)
  if (/\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(u)) return { kind: "image", src: u };
  // Fallback: try to iframe it
  return { kind: "iframe", src: u };
}

export default function DailyNewsViewer() {
  const { user } = useAuth();
  const [classId, setClassId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Resolve the student's primary class.
  useEffect(() => {
    api.getClasses()
      .then((cs: any[]) => setClassId((cs || [])[0]?.id ?? null))
      .catch(() => setClassId(null));
  }, [user?.id]);

  // Fetch + auto-refresh every 15s until a URL is set (so the student's page
  // "catches up" the moment the teacher pastes the file URL upstairs).
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    const load = () => {
      api.getDailyNews(classId)
        .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
    };
    load();
    const iv = setInterval(() => { if (!data?.todays_file_url) load(); }, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [classId, data?.todays_file_url]);

  // If the active schedule block has a per-day newsUrl (or a root-level
  // default), prefer it over the legacy teacher-paste `todays_file_url`. The
  // schedule editor is the newer home for this content — the legacy flow
  // still works for teachers who haven't migrated.
  const currentBlock = useCurrentBlock(classId);
  const blockNewsUrl = useMemo(
    () => resolveTodaysBlockNewsUrl(currentBlock?.content_source),
    [currentBlock?.content_source]
  );

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-t3">Loading Daily News…</div>
    );
  }

  // Resolve the URL to show: schedule-block override wins, then the legacy
  // paste flow, then "nothing posted yet".
  const resolvedUrl = blockNewsUrl || data?.todays_file_url || null;
  const resolvedTitle = blockNewsUrl
    ? (data?.todays_file_title || "Daily News")
    : (data?.todays_file_title || "Daily News");
  const resolvedSetAt = blockNewsUrl ? null : data?.todays_file_set_at;

  if (!resolvedUrl) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
        <div className="text-7xl mb-5" aria-hidden>📰</div>
        <h1 className="text-3xl font-extrabold mb-2 text-t1">Daily News</h1>
        <p className="text-base text-t3 max-w-md mb-6">
          Today's news hasn't been posted yet. Check back in a minute — this page refreshes automatically.
        </p>
        <div className="flex items-center gap-2 text-xs text-t3">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Auto-refreshing every 15 seconds
        </div>
      </div>
    );
  }

  const embed = embedForUrl(resolvedUrl);

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="px-4 py-2 border-b flex items-center gap-3" style={{ borderColor: "var(--border, rgba(255,255,255,0.08))" }}>
        <span className="text-2xl" aria-hidden>📰</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-t1 truncate">{resolvedTitle}</div>
          <div className="text-xs text-t3 truncate">
            {blockNewsUrl
              ? "From today's schedule block"
              : `Posted ${resolvedSetAt ? new Date(resolvedSetAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "today"}`}
          </div>
        </div>
        {blockNewsUrl && (
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-2.5 py-1 rounded-md border"
            style={{ borderColor: "rgba(255,255,255,0.12)", color: "var(--t2)" }}
            title="Open in a new tab"
          >
            Open ↗
          </a>
        )}
      </div>
      <div className="flex-1 relative bg-white">
        {embed.kind === "image" ? (
          <img src={embed.src} alt={resolvedTitle} className="w-full h-full object-contain" />
        ) : (
          <iframe
            src={embed.src}
            title={resolvedTitle}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
          />
        )}
      </div>
      {embed.kind === "iframe" && (
        <div className="px-4 py-2 text-xs text-t3 border-t" style={{ borderColor: "var(--border, rgba(255,255,255,0.08))" }}>
          If this page doesn't load, ask your teacher — some sites can't be shown inside the app.
        </div>
      )}
    </div>
  );
}
