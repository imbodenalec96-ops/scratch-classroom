/**
 * useClassCommands — GoGuardian-style classroom control for students.
 *
 * Polls the classroom-state endpoint every 4 seconds. When the teacher
 * locks screens, students get a full-screen overlay within 4s.
 *
 * Safety nets baked in:
 * - Admins/teachers can never be locked (server-side + client-side)
 * - Locks older than 30 min auto-expire (server-side + client-side guard)
 * - Network/auth failures keep the student UNLOCKED (fail-open)
 * - A separate global heartbeat fires regardless of class membership
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api.ts";

const LOCK_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

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
      _cacheExpiry = Date.now() + 5 * 60 * 1000;
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
  /** True when teacher has focused this student → capture high-res previews */
  isFocused: boolean;
}

// Module-level flag for screenshot capture hook to read
let _focusedMode = false;
export function isScreenshotFocused(): boolean { return _focusedMode; }

export function useClassCommands(enabled = true): ClassroomState & { dismissMessage: () => void } {
  const navigate = useNavigate();
  const [isLocked, setIsLocked] = useState(false);
  const [studentLocked, setStudentLocked] = useState(false);
  const [studentLockMsg, setStudentLockMsg] = useState("");
  const [lockMessage, setLockMessage] = useState("");
  const [lockedBy, setLockedBy] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const lastCmdAtRef = useRef(new Date(0).toISOString());
  const dismissMessage = useCallback(() => setPendingMessage(null), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // Fire-and-forget global heartbeat every 10s — works even if no class
    const hb = () => { api.heartbeat().catch(() => {}); };
    hb();
    const hbInterval = setInterval(hb, 10_000);

    async function poll() {
      const ids = await getMyClassIds();
      if (cancelled || ids.length === 0) return;
      const classId = ids[0];

      try {
        const data = await api.getClassroomState(classId, lastCmdAtRef.current);
        if (cancelled) return;

        // CLIENT-SIDE SAFETY NET: ignore stale locks
        let isLockedSafe = !!data.isLocked;
        if (isLockedSafe && data.lockedAt) {
          const age = Date.now() - new Date(data.lockedAt).getTime();
          if (age > LOCK_MAX_AGE_MS) {
            console.warn(`Client: ignoring stale lock (age ${Math.round(age/60000)}min)`);
            isLockedSafe = false;
          }
        }

        setIsLocked(isLockedSafe);
        setLockMessage(data.lockMessage ?? "");
        setLockedBy(data.lockedBy ?? "");

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
              setTimeout(() => setPendingMessage(null), 15_000);
              break;
            case "LOCK":
              setStudentLocked(true);
              setStudentLockMsg(cmd.payload || "");
              break;
            case "UNLOCK":
              setStudentLocked(false);
              setStudentLockMsg("");
              break;
            case "FOCUS":
              _focusedMode = true;
              setIsFocused(true);
              break;
            case "UNFOCUS":
              _focusedMode = false;
              setIsFocused(false);
              break;
            case "GRANT_FREE_TIME":
              try {
                localStorage.setItem("workDoneDate", new Date().toISOString().slice(0, 10));
                setPendingMessage("🎁 Teacher granted you free time! Enjoy.");
                setTimeout(() => setPendingMessage(null), 8_000);
              } catch {}
              break;
            case "REVOKE_FREE_TIME":
              try {
                localStorage.removeItem("workDoneDate");
                setPendingMessage("⛔ Free time paused — back to work.");
                setTimeout(() => setPendingMessage(null), 8_000);
                navigate(cmd.payload || "/student");
              } catch {}
              break;
          }
        }
      } catch (err) {
        // Fail-open: on network errors, assume NOT locked
        console.warn('Classroom state poll failed:', err);
      }
    }

    poll();
    const iv = setInterval(poll, 4_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      clearInterval(hbInterval);
    };
  }, [navigate, enabled]);

  // OR class-wide lock with per-student lock — either triggers the overlay
  const effectiveLocked = isLocked || studentLocked;
  const effectiveMsg = studentLocked && studentLockMsg ? studentLockMsg : lockMessage;

  return {
    isLocked: effectiveLocked,
    lockMessage: effectiveMsg,
    lockedBy,
    pendingMessage,
    isFocused,
    dismissMessage,
  };
}
