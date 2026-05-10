// Cross-device persistence for locally-minted STAR barcodes (QZ-, AS-,
// WR-, SP-, and any future custom barcodes). The default flow stores
// these in localStorage only — fine for one device, broken when the
// teacher creates on the iPad and tries to scan on the projector.
//
// This module pushes new barcodes to the server (best-effort, fire and
// forget — UI never blocks on it) and pulls them back during sync /
// scanner fallback. Server table: `star_barcodes` (per-class).

import { api } from "../api.ts";
import { StarStore, type BcEntry, type StarTrackerEntry } from "./storage.ts";
import { getActiveClassId } from "./boardEvents.ts";

const PREFIXES_TO_PUSH = /^(QZ|AS|WR|SP)-/i;

/** Push a freshly-minted barcode to the server so other devices can
 *  scan it. Silent on error — scanning still works on the local device. */
export function pushBarcodeToServer(entry: BcEntry | undefined | null): void {
  if (!entry || !entry.id) return;
  if (!PREFIXES_TO_PUSH.test(entry.id)) return;
  const classId = getActiveClassId();
  if (!classId) return;
  api.starBarcodePost(classId, entry.id, entry).catch((e) => {
    console.warn("[STAR barcode relay] push failed:", e?.message || e);
  });
}

/** Pull every persisted barcode for the active class and merge into
 *  the local bcDB. Called by syncFromClassroom. Returns the count of
 *  newly-added barcodes. */
export async function pullBarcodesFromServer(): Promise<number> {
  const classId = getActiveClassId();
  if (!classId) return 0;
  try {
    const res = await api.starBarcodesList(classId);
    const incoming = Array.isArray(res?.barcodes) ? res.barcodes : [];
    if (incoming.length === 0) return 0;
    const bcDB = StarStore.getBcDB();
    const tracker = StarStore.getAsnTrack();
    let added = 0;
    for (const row of incoming) {
      const entry = row.payload as BcEntry;
      if (!entry || !entry.id) continue;
      if (!PREFIXES_TO_PUSH.test(entry.id)) continue;
      // Only add if not already present locally — avoids overwriting
      // any local edits (e.g. a teacher who tweaked questions).
      if (!bcDB[entry.id]) {
        bcDB[entry.id] = entry;
        added++;
      }
      // Mirror onto tracker if missing too, so the gradebook works.
      if (entry.type === "assignment" && !tracker[entry.id]) {
        const t: StarTrackerEntry = {
          id: entry.id,
          name: entry.name,
          subject: entry.subject,
          gradeLevel: entry.gradeLevel,
          studentName: entry.studentName,
          studentId: entry.studentId,
          questions: entry.questions || [],
          lesson: entry.lesson,
          createdDate: entry.createdDate,
          status: "assigned",
          submissions: [],
          iepGoalId: (entry as any).iepGoalId,
          iepGoalArea: (entry as any).iepGoalArea,
          iepGoalText: (entry as any).iepGoalText,
        };
        tracker[entry.id] = t;
      }
    }
    if (added > 0) {
      StarStore.setBcDB(bcDB);
      StarStore.setAsnTrack(tracker);
    }
    return added;
  } catch (e: any) {
    console.warn("[STAR barcode relay] pull failed:", e?.message || e);
    return 0;
  }
}

/** Last-resort lookup when the local bcDB doesn't have a scanned
 *  barcode. Returns the entry if the server has one, else null.
 *  On hit, also writes it to local storage so subsequent scans hit
 *  the cache. */
export async function lookupBarcodeOnServer(barcode: string): Promise<BcEntry | null> {
  const classId = getActiveClassId();
  if (!classId) return null;
  try {
    const res = await api.starBarcodeGet(classId, barcode);
    const entry = res?.payload as BcEntry;
    if (!entry || !entry.id) return null;
    const bcDB = StarStore.getBcDB();
    bcDB[entry.id] = entry;
    StarStore.setBcDB(bcDB);
    if (entry.type === "assignment") {
      const tracker = StarStore.getAsnTrack();
      if (!tracker[entry.id]) {
        tracker[entry.id] = {
          id: entry.id,
          name: entry.name,
          subject: entry.subject,
          gradeLevel: entry.gradeLevel,
          studentName: entry.studentName,
          studentId: entry.studentId,
          questions: entry.questions || [],
          lesson: entry.lesson,
          createdDate: entry.createdDate,
          status: "assigned",
          submissions: [],
          iepGoalId: (entry as any).iepGoalId,
          iepGoalArea: (entry as any).iepGoalArea,
          iepGoalText: (entry as any).iepGoalText,
        };
        StarStore.setAsnTrack(tracker);
      }
    }
    return entry;
  } catch {
    return null;
  }
}
