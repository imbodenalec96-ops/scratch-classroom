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

// Matches every assignment barcode shape we mint: a 2-letter subject
// prefix (e.g. MA / RE / SC / SO / SE / WR / SP / AR / MU / LI / PE)
// followed by YYMMDD-NNN. The previous whitelist only had QZ/AS/WR/SP
// so SEL ("SE"), Social Studies ("SO"), Science ("SC"), Reading
// ("RE"), and Math ("MA") barcodes silently skipped the server push —
// the iPad / projector then couldn't find them.
// Matches both the legacy short format (e.g. "MA-260513-005") and the
// new student-tagged format that includes a 2-5 letter kid abbreviation
// in the second segment (e.g. "MA-AID-260513-005"). Either gets pushed
// to the relay so cross-device scans resolve.
const PREFIXES_TO_PUSH = /^[A-Z]{2,3}(-[A-Z]{2,5})?-\d{6}-\d{2,4}$/i;

/** Push a freshly-minted barcode to the server so other devices can
 *  scan it. Silent on error — scanning still works on the local
 *  device. When the active class id isn't set yet (the page-load
 *  race), the entry stays in localStorage and pushAllLocalBarcodes
 *  on the next /star mount will pick it up. */
export function pushBarcodeToServer(entry: BcEntry | undefined | null): void {
  if (!entry || !entry.id) return;
  if (!PREFIXES_TO_PUSH.test(entry.id)) return;
  const classId = getActiveClassId();
  if (!classId) return;
  api.starBarcodePost(classId, entry.id, entry).catch((e) => {
    console.warn("[STAR barcode relay] push failed:", e?.message || e);
  });
}

/** One-shot catch-up sync. Looks through localStorage bcDB for every
 *  QZ-/AS-/WR-/SP- prefixed entry and pushes it to the server. The
 *  server endpoint upserts on conflict so this is idempotent — safe
 *  to run on every /star mount.
 *
 *  This fixes the most common "I made an assignment today but the
 *  iPad can't find it" case: the original push silently skipped
 *  because the active class id hadn't been set yet during creation.
 */
export async function pushAllLocalBarcodes(): Promise<{ pushed: number; skipped: number; failed: number }> {
  const classId = getActiveClassId();
  if (!classId) return { pushed: 0, skipped: 0, failed: 0 };
  const bcDB = StarStore.getBcDB();
  const candidates = Object.values(bcDB).filter((e) => e && PREFIXES_TO_PUSH.test(e.id));
  let pushed = 0;
  let failed = 0;
  // Sequential to avoid blasting the API with 100 parallel POSTs
  // on a fresh sync. The upsert is cheap.
  for (const entry of candidates) {
    try {
      await api.starBarcodePost(classId, entry.id, entry);
      pushed += 1;
    } catch (e: any) {
      console.warn("[STAR barcode relay] catch-up push failed for", entry.id, e?.message || e);
      failed += 1;
    }
  }
  return { pushed, skipped: 0, failed };
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
  // Try the class-scoped (authed) endpoint first when we have a class
  // id — it's the same data but scoped, and any auth-only deploys keep
  // working. If anything goes wrong (no class id, no auth, 404, etc.)
  // fall through to the public global lookup so phones that have never
  // logged in can still resolve a freshly-minted worksheet barcode.
  if (classId) {
    try {
      const res = await api.starBarcodeGet(classId, barcode);
      const entry = res?.payload as BcEntry;
      if (entry && entry.id) {
        return await cacheAndReturn(entry);
      }
    } catch {}
  }
  try {
    const res = await api.starBarcodePublicLookup(barcode);
    const entry = res?.payload as BcEntry;
    if (!entry || !entry.id) return null;
    // Side-effect: if the public lookup told us which class this
    // barcode belongs to and we don't have one set yet, adopt it so
    // future calls hit the fast authed path.
    if (res.class_id && !getActiveClassId()) {
      try {
        const { setActiveClassId } = await import("./boardEvents.ts");
        setActiveClassId(res.class_id);
      } catch {}
    }
    return await cacheAndReturn(entry);
  } catch {
    return null;
  }
}

async function cacheAndReturn(entry: BcEntry): Promise<BcEntry | null> {
  try {
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
