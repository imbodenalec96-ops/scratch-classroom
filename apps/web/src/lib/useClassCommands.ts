/**
 * useClassCommands — GoGuardian-style classroom control for students.
 *
 * Polls the classroom-state endpoint every 4 seconds. When the teacher
 * locks screens, students get a full-screen overlay within 4s. When the
 * teacher sends a NAVIGATE or KICK command, the student's browser routes
 * immediately. MESSAGE commands show a dismissable overlay.
 *
 * Works entirely via HTTP polling — no WebSocket required (Vercel-safe).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api.ts";

// Module-level cache so multiple hook instances share the same class IDs
let _cachedClassIds: string[] = [];
let _cacheExpiry = 0;
let _inflight: Promise<string[]> | null = null;

async function getMyClassIds(): Promise<string[]> {
  if (_cachedClassIds.length > 0 && Date.now() < _cacheExpiry) return _cachedClassIds;
  if (_inflight) return _inflight;
  _inflight = api
    .getClasses()
    .then((classes: any[]) => {
      _cachedClassIds = classes.map((c: any) => c.id);
      _cacheExpiry = Date.now() + 5 * 60 * 1000; // 5 min TTL
      return _cachedClassIds;
    })
    .catch(() => _cachedClassIds)
    .finally(() => { _inflight = null; });
  return _inflight;
}

export interface ClassroomState {
  isLocked: boolean;
  lockMessage: string;
  lockedBy: string;
  pendingMessage: string | null;
}

export function useClassCommands(enabled = true): ClassroomState & { dismissMessage: () => void } {
  const navigate = useNavigate();
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const [lockedBy, setLockedBy] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Track latest command timestamp to avoid re-executing old commands
  const lastCmdAtRef = useRef(new Date(0).toISOString());
  const dismissMessage = useCallback(() => setPendingMessage(null), []);

  useEffect(() => {
    if (!enabled) return; // Teachers/admins: no-op
    let cancelled = false;

    async function poll() {
      const ids = await getMyClassIds();
      if (cancelled || ids.length === 0) return;

      // Poll the primary class (first in list); if multi-class, worst case is
      // 4s delay for subsequent classes — acceptable tradeoff to avoid N requests
      const classId = ids[0];

      try {
        const data = await api.getClassroomState(classId, lastCmdAtRef.current);
        if (cancelled) return;

        setIsLocked(data.isLocked ?? false);
        setLockMessage(data.lockMessage ?? "");
        setLockedBy(data.lockedBy ?? "");

        // Process commands (only new ones — since lastCmdAt)
        for (const cmd of data.commands ?? []) {
          if (cmd.createdAt > lastCmdAtRef.current) {
            lastCmdAtRef.current = cmd.createdAt;
          }
          switch (cmd.type) {
            case "NAVIGATE":
              if (cmd.payload) navigate(cmd.payload);
              break;
            case "KICK":
              navigate(cmd.payload || "/student");
              break;
            case "MESSAGE":
              setPendingMessage(cmd.payload || "");
              // Auto-dismiss after 15s
              setTimeout(() => setPendingMessage(null), 15_000);
              break;
          }
        }
      } catch { /* network failure — keep previous state */ }
    }

    poll();
    const iv = setInterval(poll, 4_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [navigate]);

  return { isLocked, lockMessage, lockedBy, pendingMessage, dismissMessage };
}
