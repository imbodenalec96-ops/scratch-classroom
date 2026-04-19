import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useCurrentBlock } from "../lib/useCurrentBlock.ts";
import { api } from "../lib/api.ts";

// Minimal placeholder for schedule-triggered routes that don't yet have
// a full implementation. Shows the block label + emoji + friendly CTA.
// Swap any of these for a real component later without touching the
// auto-nav mapping in `useBlockAutoNav`.

interface Props {
  emoji: string;
  title: string;
  subtitle?: string;
  accent?: string; // tailwind color name stem, e.g. "violet"
}

export default function BlockPlaceholder({ emoji, title, subtitle, accent = "violet" }: Props) {
  const { user } = useAuth();
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="text-7xl mb-5" aria-hidden>{emoji}</div>
      <h1 className="text-3xl font-extrabold mb-2 text-t1">{title}</h1>
      {subtitle && <p className="text-base text-t3 max-w-md mb-8">{subtitle}</p>}
      <div className={`rounded-2xl border border-${accent}-500/20 bg-${accent}-500/5 px-6 py-4 max-w-md`}>
        <p className="text-sm text-t2">
          👋 Waiting for your teacher to start this block. Sit tight!
        </p>
      </div>
      <Link
        to={user?.role === "student" ? "/student" : "/"}
        className="mt-8 text-sm font-semibold text-violet-400 hover:text-violet-300"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}

// Pre-baked page variants so App.tsx stays tidy.
export const DailyNewsPage = () => <BlockPlaceholder emoji="📰" title="Daily News" subtitle="Today's news segment." accent="sky" />;
export const VideoLearningPage = () => <BlockPlaceholder emoji="📺" title="Video Learning" subtitle="A short lesson video is on its way." accent="rose" />;
export const TedTalkPage = () => <BlockPlaceholder emoji="🎙️" title="TED Talk" subtitle="Big ideas, short talks." accent="amber" />;
export const DismissalPage = () => <BlockPlaceholder emoji="👋" title="See you tomorrow!" subtitle="Great job today. Pack up and have a good afternoon." accent="emerald" />;
export const CashoutPage = () => <BlockPlaceholder emoji="💰" title="Cashout" subtitle="Time to spend your class coins." accent="amber" />;

function parseSelContent(raw: string | null | undefined): { videoUrl?: string; assignmentUrl?: string } | null {
  if (!raw) return null;
  try { const p = JSON.parse(raw); return (p.videoUrl || p.assignmentUrl) ? p : null; }
  catch { return null; }
}

function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const id = u.hostname.includes("youtu.be")
        ? u.pathname.slice(1).split("?")[0]
        : u.searchParams.get("v") ?? u.pathname.split("/").pop();
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    }
  } catch {}
  return null;
}

export function SELPage() {
  const { user } = useAuth();
  const [classId, setClassId] = useState<string | null>(null);

  useEffect(() => {
    api.getClasses()
      .then((cs: any[]) => setClassId((cs || [])[0]?.id ?? null))
      .catch(() => {});
  }, [user?.id]);

  const currentBlock = useCurrentBlock(classId);
  const content = useMemo(() => parseSelContent(currentBlock?.content_source), [currentBlock?.content_source]);

  if (!content) {
    return <BlockPlaceholder emoji="💛" title="Today's SEL" subtitle="Your teacher will push today's activity in a moment." accent="amber" />;
  }

  const embedUrl = content.videoUrl ? (youtubeEmbedUrl(content.videoUrl) ?? content.videoUrl) : null;

  return (
    <div className="min-h-[80vh] flex flex-col items-center px-4 py-10 gap-6">
      <div className="text-center">
        <div className="text-5xl mb-3">💛</div>
        <h1 className="text-3xl font-extrabold text-t1">Today's SEL</h1>
      </div>
      {embedUrl && (
        <div className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-xl" style={{ aspectRatio: "16/9" }}>
          <iframe
            src={embedUrl}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="SEL Video"
          />
        </div>
      )}
      {content.assignmentUrl && (
        <a
          href={content.assignmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-base inline-flex items-center gap-2 shadow-lg"
        >
          📋 Open Today's Assignment
        </a>
      )}
      <Link to={user?.role === "student" ? "/student" : "/"} className="mt-2 text-sm font-semibold text-violet-400 hover:text-violet-300">
        ← Back to dashboard
      </Link>
    </div>
  );
}

export function AssignmentTodayPage() {
  const { subject } = useParams<{ subject: string }>();
  const map: Record<string, { emoji: string; title: string }> = {
    sel:      { emoji: "💛", title: "SEL" },
    math:     { emoji: "🔢", title: "Math" },
    reading:  { emoji: "📖", title: "Reading" },
    writing:  { emoji: "✏️", title: "Writing" },
    spelling: { emoji: "🔤", title: "Spelling" },
  };
  const meta = (subject && map[subject]) || { emoji: "📘", title: subject || "Subject" };
  return <BlockPlaceholder emoji={meta.emoji} title={`Today's ${meta.title}`} subtitle="Your teacher will push today's assignment in a moment." />;
}
