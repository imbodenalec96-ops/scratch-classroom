import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";

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
