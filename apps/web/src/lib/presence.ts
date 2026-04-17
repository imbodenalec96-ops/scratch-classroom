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
  // Keep latest activity in a ref so the interval always reads current value
  const activityRef = useRef(activity);
  useEffect(() => { activityRef.current = activity; }, [activity]);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      const ids = await getMyClassIds();
      if (cancelled) return;
      for (const id of ids) {
        api.pingPresence(id, activityRef.current).catch(() => {});
      }
    }

    ping(); // immediate first ping
    const timer = setInterval(ping, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]); // activity changes are handled via ref — no restart needed
}
