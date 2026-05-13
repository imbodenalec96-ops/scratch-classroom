// Pull STAR submissions for the active class from the server and
// merge them into the local asnTrack store. The server is the source
// of truth — local cache exists only to keep the UI fast. Every
// device that runs this gets the same view of grades.
//
// Used by:
//   - ClassroomBoard mount + 60s poll (already)
//   - /star page mount + 30s poll (so snapshot, gradebook, reports
//     all see grades saved on any device)
//
// Tries the authed endpoint first (teacher token = full data) and
// falls back to the public read-only mirror so the iPad / projector
// / Chromebook still hydrate without a login.

import { StarStore } from "./storage.ts";
import { api } from "../api.ts";

export async function hydrateStarSubmissions(classId: string): Promise<{ pulled: number }> {
  let list: any[] | null = null;
  try {
    const r = await api.starSubmissionsList(classId);
    list = r?.submissions || [];
  } catch (e: any) {
    if (e?.status === 401 || /token|auth/i.test(String(e?.message || ""))) {
      try {
        const r = await api.starSubmissionsPublic(classId);
        list = r?.submissions || [];
      } catch {}
    }
  }
  if (!list) return { pulled: 0 };
  const track = StarStore.getAsnTrack();
  const byBarcode: Record<string, any[]> = {};
  for (const row of list) {
    const k = String(row.barcode || "").toUpperCase();
    if (!k) continue;
    (byBarcode[k] ||= []).push(row);
  }
  let pulled = 0;
  for (const barcode in byBarcode) {
    const rows = byBarcode[barcode];
    if (!track[barcode]) {
      track[barcode] = {
        id: barcode,
        name: barcode,
        subject: "Other" as any,
        gradeLevel: "",
        questions: [],
        createdDate: new Date().toISOString(),
        status: "assigned",
        submissions: [],
      };
    }
    // Keep ONE submission per (student_id) per assignment — the most
    // recent. This mirrors the server's PRIMARY KEY (class_id,
    // barcode, student_id) UPSERT and stops re-grades from doubling
    // up locally.
    const existing = track[barcode].submissions || [];
    const latestByStudent: Record<string, any> = {};
    for (const sub of existing) {
      const key = String(sub.studentId || "");
      if (!key) continue;
      const ts = Date.parse(sub.loggedAt || sub.completedDate || "") || 0;
      const prior = latestByStudent[key];
      const priorTs = prior ? (Date.parse(prior.loggedAt || prior.completedDate || "") || 0) : -1;
      if (!prior || ts >= priorTs) latestByStudent[key] = sub;
    }
    for (const row of rows) {
      const sub = {
        studentId: row.student_id,
        studentName: row.student_name || "",
        completedDate: row.completed_date || "",
        score: row.score ?? 0,
        maxScore: row.max_score ?? 0,
        pct: row.pct ?? 0,
        letterGrade: row.letter_grade || "",
        status: row.status || "completed",
        loggedAt: row.logged_at || new Date().toISOString(),
      };
      const key = String(sub.studentId);
      const ts = Date.parse(sub.loggedAt || sub.completedDate || "") || 0;
      const prior = latestByStudent[key];
      const priorTs = prior ? (Date.parse(prior.loggedAt || prior.completedDate || "") || 0) : -1;
      if (!prior || ts > priorTs) {
        latestByStudent[key] = sub;
        pulled += 1;
      }
    }
    track[barcode].submissions = Object.values(latestByStudent) as any;
  }
  try {
    StarStore.setAsnTrack(track);
  } catch {
    // Quota — caller's storage is full. The data is already on the
    // server, so this is a soft failure. StarBackupPanel has the
    // "Free up storage" button as the manual remedy.
  }
  return { pulled };
}
