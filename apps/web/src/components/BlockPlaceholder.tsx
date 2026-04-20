import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
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
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`;
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

/**
 * Parse the generic block content_source shape — mirrors `parseBlockContent`
 * in TeacherSchedule.tsx. Kept local to avoid cross-importing a teacher
 * component into the student runtime bundle.
 *
 * Supports the `byDay` override shape: `{ Mon: { assignmentId, videoUrl, newsUrl } }`.
 */
type GenericBlockDay = {
  assignmentId?: string;
  videoUrl?: string;
  newsUrl?: string;
  byGrade?: Partial<Record<string, string>>; // grade number as string key → assignmentId
  byStudent?: Partial<Record<string, string>>; // user id → assignmentId (beats byGrade)
};
type GenericBlockContent = GenericBlockDay & { byDay?: Partial<Record<string, GenericBlockDay>> };

function sanitizeDay(raw: any): GenericBlockDay {
  const out: GenericBlockDay = {};
  if (raw && typeof raw === "object") {
    if (typeof raw.assignmentId === "string" && raw.assignmentId) out.assignmentId = raw.assignmentId;
    if (typeof raw.videoUrl === "string" && raw.videoUrl) out.videoUrl = raw.videoUrl;
    if (typeof raw.newsUrl === "string" && raw.newsUrl) out.newsUrl = raw.newsUrl;
    if (raw.byGrade && typeof raw.byGrade === "object") {
      const bg: Record<string, string> = {};
      for (const k of Object.keys(raw.byGrade)) {
        const v = (raw.byGrade as any)[k];
        if (typeof v === "string" && v) bg[k] = v;
      }
      if (Object.keys(bg).length) out.byGrade = bg;
    }
    if (raw.byStudent && typeof raw.byStudent === "object") {
      const bs: Record<string, string> = {};
      for (const k of Object.keys(raw.byStudent)) {
        const v = (raw.byStudent as any)[k];
        if (typeof v === "string" && v) bs[k] = v;
      }
      if (Object.keys(bs).length) out.byStudent = bs;
    }
  }
  return out;
}

function parseGenericBlockContent(raw: string | null | undefined): GenericBlockContent {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    const out: GenericBlockContent = sanitizeDay(p);
    if (p && typeof p.byDay === "object" && p.byDay) {
      const byDay: Partial<Record<string, GenericBlockDay>> = {};
      for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
        const day = sanitizeDay((p.byDay as any)[d]);
        if (Object.keys(day).length) byDay[d] = day;
      }
      if (Object.keys(byDay).length) out.byDay = byDay;
    }
    return out;
  } catch { return {}; }
}

const DAY_LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Merge root defaults with the per-day override for "today", then pick the
 * student's per-student or per-grade assignment when set.
 * Resolution order for assignmentId (first non-empty wins):
 *   1. byDay[today].byStudent[studentId]
 *   2. byDay[today].byGrade[studentGrade]
 *   3. byDay[today].assignmentId
 *   4. root.byStudent[studentId]
 *   5. root.byGrade[studentGrade]
 *   6. root.assignmentId
 */
function resolveBlockContentForToday(
  raw: string | null | undefined,
  studentGrade?: number | null,
  studentId?: string | null,
): GenericBlockDay {
  const parsed = parseGenericBlockContent(raw);
  const today = DAY_LETTERS[new Date().getDay()];
  const dayOverride = parsed.byDay?.[today] || {};
  const gradeKey = studentGrade != null ? String(studentGrade) : null;
  const resolvedAssignment =
    (studentId && dayOverride.byStudent?.[studentId]) ||
    (gradeKey && dayOverride.byGrade?.[gradeKey]) ||
    dayOverride.assignmentId ||
    (studentId && parsed.byStudent?.[studentId]) ||
    (gradeKey && parsed.byGrade?.[gradeKey]) ||
    parsed.assignmentId;
  return {
    assignmentId: resolvedAssignment,
    videoUrl: dayOverride.videoUrl ?? parsed.videoUrl,
    newsUrl: dayOverride.newsUrl ?? parsed.newsUrl,
  };
}

export function AssignmentTodayPage() {
  const { subject } = useParams<{ subject: string }>();
  const { user } = useAuth();

  const map: Record<string, { emoji: string; title: string }> = {
    sel:      { emoji: "💛", title: "SEL" },
    math:     { emoji: "🔢", title: "Math" },
    reading:  { emoji: "📖", title: "Reading" },
    writing:  { emoji: "✏️", title: "Writing" },
    spelling: { emoji: "🔤", title: "Spelling" },
  };
  const meta = (subject && map[subject]) || { emoji: "📘", title: subject || "Subject" };

  // Look up the student's class, then the active schedule block. If the
  // block's content_source nominates a specific assignment, we load it and
  // show that one instead of the generic "waiting for teacher" placeholder.
  const [classId, setClassId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    api.getClasses()
      .then((cs: any[]) => setClassId((cs || [])[0]?.id ?? null))
      .catch(() => setClassId(null));
  }, [user?.id]);

  // Find the schedule block whose subject matches the URL. A student can
  // navigate to /assignment/today/math at any time of day (e.g. during SEL),
  // so we CANNOT rely on useCurrentBlock here — it'd read whatever block is
  // currently ringing instead of the one the URL actually asked for.
  const [subjectBlock, setSubjectBlock] = useState<any>(null);
  useEffect(() => {
    if (!classId || !subject) { setSubjectBlock(null); return; }
    let cancelled = false;
    api.getClassSchedule(classId)
      .then((rows: any[]) => {
        if (cancelled) return;
        const match = (rows || []).find((b: any) =>
          (b.subject || "").toLowerCase() === subject.toLowerCase()
        ) || null;
        setSubjectBlock(match);
      })
      .catch(() => { if (!cancelled) setSubjectBlock(null); });
    return () => { cancelled = true; };
  }, [classId, subject]);

  // Per-student override (teacher-assigned in schedule editor) beats per-grade;
  // per-grade comes from users.specials_grade on /api/auth/me.
  const studentGrade = (user as any)?.specialsGrade ?? null;
  const studentId = user?.id ?? null;
  const blockContent = useMemo(
    () => resolveBlockContentForToday(subjectBlock?.content_source, studentGrade, studentId),
    [subjectBlock?.content_source, studentGrade, studentId],
  );

  // Teachers/admins previewing get a summary card (so they can see which
  // assignment is wired). Students auto-push below — but hooks must run in
  // the same order on every render, so declare them first.
  const [assignments, setAssignments] = useState<any[] | null>(null);
  useEffect(() => {
    if (!classId || !blockContent.assignmentId) { setAssignments(null); return; }
    let cancelled = false;
    api.getAssignments(classId)
      .then((rows: any[]) => { if (!cancelled) setAssignments(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setAssignments([]); });
    return () => { cancelled = true; };
  }, [classId, blockContent.assignmentId]);

  const selectedAssignment = useMemo(() => {
    if (!blockContent.assignmentId || !assignments) return null;
    return assignments.find((a: any) => a?.id === blockContent.assignmentId) || null;
  }, [blockContent.assignmentId, assignments]);

  // Students should never land on this page — the placeholder used to kick
  // them out of in-progress work when the block rolled over. Send them to
  // /assignments where their list + doer live.
  if (user?.role === "student") {
    return <Navigate to="/assignments" replace />;
  }

  if (selectedAssignment) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="text-7xl mb-5" aria-hidden>{meta.emoji}</div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-violet-400 mb-2">
          Today's {meta.title}
        </div>
        <h1 className="text-3xl font-extrabold mb-3 text-t1">{selectedAssignment.title}</h1>
        {selectedAssignment.description && (
          <p className="text-base text-t2 max-w-lg mb-6">{selectedAssignment.description}</p>
        )}
        <Link
          to={`/assignments?id=${encodeURIComponent(selectedAssignment.id)}`}
          className="rounded-2xl border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/15 px-6 py-3 text-sm font-bold text-violet-300 transition-colors"
        >
          Open assignment →
        </Link>
        <Link
          to="/"
          className="mt-6 text-sm font-semibold text-violet-400 hover:text-violet-300"
        >
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  return <BlockPlaceholder emoji={meta.emoji} title={`Today's ${meta.title}`} subtitle="No assignment is attached to this block yet. Ask your teacher to add one." />;
}

/**
 * VideoLearningPage — embeds the teacher's chosen YouTube video for this block
 * and (optionally) surfaces a linked assignment below it.
 */
export function VideoLearningPage() {
  const { user } = useAuth();
  const [classId, setClassId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    api.getClasses()
      .then((cs: any[]) => setClassId((cs || [])[0]?.id ?? null))
      .catch(() => setClassId(null));
  }, [user?.id]);
  const currentBlock = useCurrentBlock(classId);
  const studentGrade = (user as any)?.specialsGrade ?? null;
  const studentId = user?.id ?? null;
  const blockContent = useMemo(
    () => resolveBlockContentForToday(currentBlock?.content_source, studentGrade, studentId),
    [currentBlock?.content_source, studentGrade, studentId],
  );

  const [assignments, setAssignments] = useState<any[] | null>(null);
  useEffect(() => {
    if (!classId || !blockContent.assignmentId) { setAssignments(null); return; }
    let cancelled = false;
    api.getAssignments(classId)
      .then((rows: any[]) => { if (!cancelled) setAssignments(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setAssignments([]); });
    return () => { cancelled = true; };
  }, [classId, blockContent.assignmentId]);

  const linkedAssignment = useMemo(() => {
    if (!blockContent.assignmentId || !assignments) return null;
    return assignments.find((a: any) => a?.id === blockContent.assignmentId) || null;
  }, [blockContent.assignmentId, assignments]);

  const embedUrl = blockContent.videoUrl ? youtubeEmbedUrl(blockContent.videoUrl) : null;

  if (!embedUrl) {
    return <BlockPlaceholder emoji="📺" title="Video Learning" subtitle="A short lesson video is on its way." accent="rose" />;
  }

  return (
    <div className="min-h-[80vh] px-6 py-10 max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">📺</div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-rose-400 mb-1">Video Learning</div>
        {currentBlock?.label && <h1 className="text-2xl font-extrabold text-t1">{currentBlock.label}</h1>}
      </div>
      <div style={{ borderRadius: 16, overflow: "hidden", aspectRatio: "16/9", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", marginBottom: 24 }}>
        <iframe
          src={embedUrl}
          title="Video Learning"
          style={{ width: "100%", height: "100%", border: "none" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {linkedAssignment && (
        <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)" }}>
          <div className="text-xs font-bold uppercase tracking-[0.15em] text-rose-300 mb-1">Follow-up Assignment</div>
          <div className="text-lg font-bold text-t1 mb-2">{linkedAssignment.title}</div>
          {linkedAssignment.description && (
            <p className="text-sm text-t2 mb-4">{linkedAssignment.description}</p>
          )}
          <Link
            to="/assignments"
            className="inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #f43f5e, #be123c)" }}
          >
            Start assignment →
          </Link>
        </div>
      )}
      <div className="text-center mt-6">
        <Link to={user?.role === "student" ? "/student" : "/"} className="text-sm font-semibold text-rose-400 hover:text-rose-300">
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
