/**
 * useBlockAutoNav — auto-navigate a student when the schedule block changes.
 *
 * Pairs with `useCurrentBlock`: detects the transition from one block to the
 * next, maps the new block's subject to a route, and pushes the student there.
 *
 * Belt-and-suspenders design:
 * - **Client-side only.** The teacher still fully owns the student with the
 *   NAVIGATE command; the bell just nudges everyone to the right place when
 *   nobody's driving.
 * - **Teacher-override grace window.** If a teacher pushed the student via
 *   the NAVIGATE command in the last 5 minutes, we DON'T auto-nav — we assume
 *   they're deliberately elsewhere. The NAVIGATE handlers stamp
 *   `localStorage["blockforge:teacher-nav-at"]` each time one fires.
 * - **Role-gated.** Only students auto-nav. Teachers/admins browse freely.
 * - **Idempotent.** We track the last block.id we navigated for so re-renders,
 *   re-focus, or manual back-nav don't fight the hook.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentBlock, type ScheduleBlock } from "./useCurrentBlock.ts";
import { chooseBreak, isOnBreak } from "./breakSystem.ts";
import { isAccessAllowed } from "./workUnlock.ts";

const TEACHER_NAV_KEY = "blockforge:teacher-nav-at";
const TEACHER_NAV_GRACE_MS = 5 * 60 * 1000;

/** Stamp called by NAVIGATE command handlers so auto-nav backs off. */
export function markTeacherNav(): void {
  try { localStorage.setItem(TEACHER_NAV_KEY, String(Date.now())); } catch {}
}

/** True if a teacher NAVIGATE landed within the 5-minute grace window. Exported
 * so other hooks (e.g. `useBlockLockdown`) can honor the same override. */
export function teacherRecentlyPushed(): boolean {
  try {
    const raw = localStorage.getItem(TEACHER_NAV_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < TEACHER_NAV_GRACE_MS;
  } catch { return false; }
}

/**
 * Does this block have any teacher-set content for a student? Returns false
 * when the `content_source` is empty / missing — in that case we DON'T want
 * to force-navigate kids to a placeholder page. Academic blocks only; breaks
 * and coding_art_gym follow their own rules.
 *
 * "Has content" = any of: assignmentId, videoUrl, newsUrl, assignmentUrl
 * (SEL), or a per-day / per-grade / per-student override that covers this
 * kid. Cheap shallow check — deep resolver lives in BlockPlaceholder.
 */
export function blockHasContent(block: ScheduleBlock, studentId?: string | null, grade?: number | null): boolean {
  const raw = block.content_source;
  if (!raw) return false;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return false;
    // Root-level assignment / media on the block itself.
    if (p.assignmentId || p.videoUrl || p.newsUrl || p.assignmentUrl) return true;
    // Per-student override for THIS student.
    if (studentId && p.byStudent && typeof p.byStudent === "object" && p.byStudent[studentId]) return true;
    // Per-grade override for THIS student.
    if (grade != null && p.byGrade && typeof p.byGrade === "object" && p.byGrade[String(grade)]) return true;
    // Per-day override covering today.
    if (p.byDay && typeof p.byDay === "object") {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const today = dayNames[new Date().getDay()];
      const day = (p.byDay as any)[today];
      if (day && typeof day === "object") {
        if (day.assignmentId || day.videoUrl || day.newsUrl) return true;
        if (studentId && day.byStudent && day.byStudent[studentId]) return true;
        if (grade != null && day.byGrade && day.byGrade[String(grade)]) return true;
      }
    }
    return false;
  } catch { return false; }
}

/** Map a block subject (from the schedule table) to the URL we should push. */
export function subjectToRoute(block: ScheduleBlock): string | null {
  const s = (block.subject || "").toLowerCase();
  // Any break — recess, lunch, calm_down, general break — handled specially
  // by the caller (we trigger the break UI, not a nav).
  if (block.is_break) return "/student";
  switch (s) {
    case "daily_news":      return "/daily-news";
    case "sel":             return "/assignment/today/sel";
    case "math":            return "/assignment/today/math";
    case "reading":         return "/assignment/today/reading";
    case "writing":         return "/assignment/today/writing";
    case "spelling":        return "/assignment/today/spelling";
    case "review":          return "/student";
    case "extra_review":    return "/student";
    case "cashout":         return "/cashout";
    case "video_learning":  return "/video-learning";
    case "ted_talk":        return "/ted-talk";
    case "coding_art_gym":  return "/student"; // free-time unlock below
    case "dismissal":       return "/dismissal";
    default:                return null;
  }
}

const ACADEMIC_SUBJECTS = new Set([
  "math", "reading", "writing", "spelling", "sel", "daily_news",
  "review", "extra_review", "video_learning", "ted_talk",
]);

/**
 * Mount in Layout / PublicLayout for authenticated students. Fires once per
 * block transition. `enabled` lets the caller gate on `user?.role === 'student'`.
 */
export function useBlockAutoNav(
  enabled: boolean,
  classId: string | null | undefined,
  studentId?: string | null,
  grade?: number | null,
): void {
  const navigate = useNavigate();
  const current = useCurrentBlock(enabled ? classId : null);
  const lastBlockIdRef = useRef<string | null>(null);
  // Remember the block we auto-navigated for across remounts in the same tab.
  // Without this, navigating away (e.g. back to /student) and re-mounting the
  // layout would re-fire the auto-nav for the same current block.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("blockforge:last-auto-nav-block");
      if (saved) lastBlockIdRef.current = saved;
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!current) return;
    if (lastBlockIdRef.current === current.id) return;

    // Teacher override — don't auto-nav while the student is parked where the
    // teacher put them. The boundary will still fire on the NEXT block change
    // once the 5-minute window lapses.
    if (teacherRecentlyPushed()) {
      lastBlockIdRef.current = current.id;
      try { sessionStorage.setItem("blockforge:last-auto-nav-block", current.id); } catch {}
      return;
    }

    lastBlockIdRef.current = current.id;
    try { sessionStorage.setItem("blockforge:last-auto-nav-block", current.id); } catch {}

    // Student already has free time (completed work / teacher-granted) — leave
    // them wherever they are; don't interrupt with a block transition push.
    if (isAccessAllowed()) return;

    // Academic block with no content set → don't pull the student away from
    // what they're doing. Only push when there's something to show them.
    const subj = (current.subject || "").toLowerCase();
    if (!current.is_break && ACADEMIC_SUBJECTS.has(subj) && !blockHasContent(current, studentId, grade)) return;

    // Break blocks → trigger the scheduled break UI (10-min timer) and land
    // them on /student where BreakChoiceModal + break banner live.
    if (current.is_break) {
      if (!isOnBreak()) {
        try { chooseBreak(); } catch {}
      }
      navigate("/student");
      return;
    }

    // coding_art_gym → drop them on the dashboard. Layout handles the
    // conditional unlock (free if work done, lockdown on assignments if not).
    if ((current.subject || "").toLowerCase() === "coding_art_gym") {
      navigate("/student");
      return;
    }

    const route = subjectToRoute(current);
    if (route) navigate(route);
  }, [enabled, current?.id, navigate, studentId, grade]);
}
