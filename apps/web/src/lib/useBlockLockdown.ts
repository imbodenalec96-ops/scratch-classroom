/**
 * useBlockLockdown — keep a student pinned to the current schedule block's
 * assigned route for the duration of that block.
 *
 * Where `useBlockAutoNav` is the *initial push* at a block boundary (the
 * teacher-run equivalent of a bell ringing), this hook is the *enforcement*:
 * if the student backs out, opens another tab, or clicks a stray link, we
 * redirect them back to where they should be. Every pathname change AND every
 * block change re-runs the check.
 *
 * Exceptions — the student is free to leave the block's route when:
 *   1. `isAccessAllowed()` → true. Covers teacher-granted free time, teacher
 *      work-free day, student finished all work, or an active break window.
 *   2. Current block has `is_break` → dashboard + break UI are fair game.
 *   3. Current block is `coding_art_gym` → dashboard is fair game (the block
 *      itself is the "free choice" block; Layout.tsx handles the
 *      work-done-or-not nuance separately).
 *   4. There is no active block right now (before/after school, gap periods).
 *   5. A teacher pushed the student via NAVIGATE in the last 5 minutes
 *      (shared with useBlockAutoNav via `teacherRecentlyPushed`).
 *   6. Non-student roles (admin/teacher) — they browse freely; caller gates
 *      by passing `enabled={user?.role === 'student'}`.
 *
 * Allowed routes for a given block:
 *   - Anything starting with `subjectToRoute(block)` (and that exact path).
 *   - `/student` and `/` are treated as allowed fallbacks while data loads
 *     or during transient renders — matches the grace the takeover redirect
 *     in Layout already gives.
 */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  subjectToRoute,
  teacherRecentlyPushed,
  blockHasContent,
} from "./useBlockAutoNav.ts";
import { useCurrentBlock } from "./useCurrentBlock.ts";
import { isAccessAllowed } from "./workUnlock.ts";

const ACADEMIC_SUBJECTS = new Set([
  "math", "reading", "writing", "spelling", "sel", "daily_news",
  "review", "extra_review", "video_learning", "ted_talk",
]);

export function useBlockLockdown(
  enabled: boolean,
  classId: string | null | undefined,
  studentId?: string | null,
  grade?: number | null,
): void {
  const navigate = useNavigate();
  const location = useLocation();
  const current = useCurrentBlock(enabled ? classId : null);

  useEffect(() => {
    if (!enabled) return;
    // Exception 4 — no active block → no lockdown.
    if (!current) return;
    // Exception 5 — teacher override grace window.
    if (teacherRecentlyPushed()) return;
    // Exception 1 — free-time / work-done / break unlock.
    if (isAccessAllowed()) return;
    // Exception 2 — break blocks grant dashboard + break UI.
    if (current.is_break) return;
    // Exception 3 — coding/art/gym is the free-choice block.
    if ((current.subject || "").toLowerCase() === "coding_art_gym") return;
    // No content set for this student on this block → no lockdown.
    const subj = (current.subject || "").toLowerCase();
    if (ACADEMIC_SUBJECTS.has(subj) && !blockHasContent(current, studentId, grade)) return;

    const target = subjectToRoute(current);
    if (!target) return; // Unknown subject mapping → don't trap them.

    const p = location.pathname;
    // A path "belongs" to the block if it's the exact target, a sub-route
    // (e.g. /assignment/today/math/foo), or the bare dashboard/root while
    // the real route loads. Matches Layout.tsx's existing takeover check so
    // the two guards never fight each other.
    const belongs =
      p === target ||
      p === "/student" ||
      p === "/" ||
      p.startsWith(target + "/");
    if (belongs) return;

    navigate(target, { replace: true });
  }, [enabled, current?.id, location.pathname, navigate, studentId, grade]);
}
