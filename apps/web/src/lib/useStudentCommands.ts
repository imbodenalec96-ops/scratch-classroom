/**
 * useStudentCommands — per-student command pipe (skeleton).
 *
 * Foundation for the teacher-to-student action rebuild. Polls
 * GET /api/students/me/commands every 3s, dispatches each pending row to its
 * handler, then immediately POSTs /consume so we don't re-fire on the next tick.
 *
 * Design choices:
 * - **Handlers are passed in as a dispatch table, not hard-coded**, so Layout
 *   / StudentDashboard / VideoOverlay can each attach the handlers they own
 *   without this hook growing a god-switch of every command type.
 * - **Double-fire guard**: we mark command IDs as "in-flight consume" in a
 *   ref so a slow consume POST doesn't race with the next poll.
 * - **Fail-open**: poll/consume errors are logged but never throw — a student
 *   losing network briefly must not brick their UI.
 * - **Gated by `enabled`** (usually `user?.role === "student"`) so teacher/
 *   admin tabs don't spam the endpoint.
 *
 * NOTE: this hook is mounted but does not yet replace the existing
 * `useClassCommands` (class_commands polling). The two coexist during the
 * rewire — we migrate actions one at a time (Lock → Message → Grant/Revoke →
 * EndBreak → Broadcast) and retire `useClassCommands` once the last consumer
 * moves over.
 */
import { useEffect, useRef } from "react";
import { api } from "./api.ts";

export type StudentCommandType =
  | "LOCK"
  | "UNLOCK"
  | "MESSAGE"
  | "NAVIGATE"
  | "KICK"
  | "GRANT_FREETIME"
  | "REVOKE_FREETIME"
  | "END_BREAK"
  | "BROADCAST_VIDEO"
  | "END_BROADCAST";

export interface StudentCommandRow {
  id: string;
  command_type: string;
  payload: string;
  created_at: string;
}

export type StudentCommandHandler = (row: StudentCommandRow) => void | Promise<void>;

export interface StudentCommandHandlers {
  [commandType: string]: StudentCommandHandler;
}

const POLL_INTERVAL_MS = 3_000;

export function useStudentCommands(
  enabled: boolean,
  handlers: StudentCommandHandlers
): void {
  // Keep a live ref to the handlers so consumers don't need to memoize.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const inflightConsume = new Set<string>();

    async function tick() {
      let rows: StudentCommandRow[];
      try {
        rows = await api.getMyCommands();
      } catch (e) {
        // Network blips are expected — log once per minute at most, never throw.
        if (Math.random() < 0.02) console.warn("getMyCommands failed:", e);
        return;
      }
      if (cancelled) return;
      for (const row of rows) {
        if (inflightConsume.has(row.id)) continue;
        inflightConsume.add(row.id);
        // Fire handler first, then consume. If the handler throws we still
        // mark the row consumed so it doesn't re-fire forever — errors in a
        // single handler shouldn't block the pipe.
        Promise.resolve()
          .then(() => {
            const h = handlersRef.current[row.command_type];
            if (h) return h(row);
            // Unknown command type — log and drop so it doesn't re-fire.
            console.warn("No handler for command_type:", row.command_type, row);
          })
          .catch(err => console.error(`Command ${row.command_type} handler threw:`, err))
          .finally(() => {
            api.consumeMyCommand(row.id)
              .catch(err => console.warn("consume failed (will retry next poll):", err))
              .finally(() => { inflightConsume.delete(row.id); });
          });
      }
    }

    tick();
    const iv = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [enabled]);
}
