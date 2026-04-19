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

/**
 * Mount in Layout / PublicLayout for authenticated students. Fires once per
 * block transition. `enabled` lets the caller gate on `user?.role === 'student'`.
 */
export function useBlockAutoNav(enabled: boolean, classId: string | null | undefined): void {
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
  }, [enabled, current?.id, navigate]);
}
