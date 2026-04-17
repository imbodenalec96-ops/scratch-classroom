/**
 * Global presence ping — works on every authenticated student page.
 *
 * Class IDs are fetched once per session and cached at module scope so
 * every page that calls usePresencePing() shares the same list without
 * extra API calls.
 */
import { useEffect, useRef } from "react";
import { api } from "./api.ts";

// Module-level cache
let _classIds: string[] = [];
let _fetchedAt = 0;
let _inflight: Promise<string[]> | null = null;

async function getMyClassIds(): Promise<string[]> {
  const TTL = 5 * 60 * 1000; // 5 minutes
  if (_classIds.length > 0 && Date.now() - _fetchedAt < TTL) return _classIds;
  if (_inflight) return _inflight;
  _inflight = api
    .getClasses()
    .then((classes) => {
      _classIds = classes.map((c: any) => c.id);
      _fetchedAt = Date.now();
      return _classIds;
    })
    .catch(() => _classIds)
    .finally(() => { _inflight = null; });
  return _inflight;
}

/**
 * Pings presence for all the student's classes every `intervalMs` ms.
 * Designed to be called on every student-facing page.
 *
 * @param activity  Human-readable string shown in teacher monitor
 * @param intervalMs  Default 20 000 ms — stays well inside 3-min server timeout
 */
export function usePresencePing(activity: string, intervalMs = 20_000) {
  const activityRef = useRef(activity);

  useEffect(() => {
    activityRef.current = activity;
    if (!activity) return; // skip if no activity label (user not ready)
    api.heartbeat(activity).catch(() => {});
    (async () => {
      const ids = await getMyClassIds();
      for (const id of ids) api.pingPresence(id, activity).catch(() => {});
    })();
  }, [activity]);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (!activityRef.current) return;
      api.heartbeat(activityRef.current).catch(() => {});
      const ids = await getMyClassIds();
      if (cancelled) return;
      for (const id of ids) {
        api.pingPresence(id, activityRef.current).catch(() => {});
      }
    }

    ping();
    const timer = setInterval(ping, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);
}

/** Infer a rich activity label from a React Router pathname */
export function activityFromPath(pathname: string): string {
  if (!pathname || pathname === '/') return "🏠 On dashboard";
  if (pathname === '/student') return "🏠 On dashboard";
  if (pathname === '/teacher') return "👨‍🏫 Teacher dashboard";
  if (pathname === '/admin') return "👩‍💼 Admin dashboard";
  if (pathname.startsWith('/lessons')) return "📖 Reading lessons";
  if (pathname.startsWith('/assignments')) return "✏️ Doing assignments";
  if (pathname.startsWith('/quizzes')) return "❓ Taking a quiz";
  if (pathname.startsWith('/grading')) return "📝 Grading work";
  if (pathname.startsWith('/arcade/play/')) {
    const game = pathname.split('/').pop() || '';
    const pretty = game.charAt(0).toUpperCase() + game.slice(1);
    return `🎮 Playing ${pretty}`;
  }
  if (pathname.startsWith('/arcade')) return "🎮 Browsing arcade";
  if (pathname.startsWith('/project/')) return "💻 Building a project";
  if (pathname.startsWith('/projects')) return "💻 Browsing projects";
  if (pathname.startsWith('/youtube')) return "📺 YouTube queue";
  if (pathname.startsWith('/monitor')) return "👀 On monitor";
  if (pathname.startsWith('/leaderboard')) return "🏆 Checking leaderboard";
  if (pathname.startsWith('/achievements')) return "🎖️ Viewing achievements";
  if (pathname.startsWith('/analytics')) return "📊 Viewing analytics";
  if (pathname.startsWith('/classes')) return "📚 Managing class";
  if (pathname.startsWith('/playground')) return "🎨 In the playground";
  return `🌐 ${pathname}`;
}
