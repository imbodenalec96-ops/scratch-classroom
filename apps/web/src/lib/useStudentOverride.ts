/**
 * useStudentOverride — polls the server for the signed-in student's active
 * schedule override (teacher pulled them off their current block). Returns
 * `null` when no override is active, or the row `{ destination_label,
 * destination, ends_at, reason, ... }` when one is.
 *
 * Polls every 15s. The backend computes active-ness server-side so drift is
 * bounded by the poll interval.
 */
import { useEffect, useState } from "react";
import { api } from "./api.ts";

export interface StudentOverride {
  id: string;
  student_id: string;
  class_id: string;
  original_block_id: string | null;
  destination: string;
  destination_label: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export function useStudentOverride(enabled: boolean, studentId: string | null | undefined): StudentOverride | null {
  const [override, setOverride] = useState<StudentOverride | null>(null);

  useEffect(() => {
    if (!enabled || !studentId) { setOverride(null); return; }
    let cancelled = false;
    const load = () => {
      api.getMyActiveOverride(studentId)
        .then((row) => { if (!cancelled) setOverride(row || null); })
        .catch(() => { if (!cancelled) setOverride(null); });
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [enabled, studentId]);

  return override;
}
