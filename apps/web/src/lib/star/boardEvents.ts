// Lightweight pub/sub for STAR → ClassroomBoard popups.
//
// Producers (RefusalModal, GradebookModal) call `fireStarBoardEvent()`
// when something noteworthy happens. The event reaches:
//   • The same browser window (window CustomEvent — instant)
//   • Other tabs / windows of the same origin (BroadcastChannel)
//   • The classroom board on a separate device, via the server relay
//     (POST /api/classes/:classId/star-events — board polls every 1s)

import { api } from "../api.ts";

export type StarBoardKind = "refusal" | "completion" | "pass-out" | "pass-in" | "scan-to-phone" | "photo-saved";

export interface StarBoardEvent {
  // Random id per event — used to dedupe the cross-device server poll
  // from the local broadcast on the same device.
  uuid: string;
  kind: StarBoardKind;
  studentName: string;
  studentId?: string;
  // For refusal: refusal type. For completion: assignment title.
  // For pass-*: pass kind (Bathroom / Water / Break).
  detail?: string;
  // For completion only: percentage and points awarded.
  pct?: number;
  letter?: string;
  pointsAwarded?: number;
  // Refusal type pill: "Work Refusal" | "Specials Refusal"
  refusalType?: string;
  // For pass-in: how long they were gone, in seconds.
  elapsedSec?: number;
  // For scan-to-phone: the assignment barcode the phone should open camera for.
  barcode?: string;
  // For photo-saved: full photo record so other devices can ingest it.
  photo?: {
    id: string;
    barcode: string;
    studentId?: string;
    studentName?: string;
    dataUrl: string;
    note?: string;
    ts: number;
  };
  ts: number;
}

// Tracks uuids we already saw locally — so the cross-device poll
// doesn't re-show events fired from this same browser.
const seenLocally = new Set<string>();
export function markSeenLocally(uuid: string) {
  seenLocally.add(uuid);
  // GC after a couple of minutes
  setTimeout(() => seenLocally.delete(uuid), 120_000);
}
export function wasSeenLocally(uuid: string): boolean {
  return seenLocally.has(uuid);
}

// Set by StarPage on mount once we know which class id we're in. The
// board reads it back to know what to poll. Stored in localStorage so
// the projector tab knows the same thing.
const CLASS_KEY = "star_active_class_id";
export function setActiveClassId(id: string | null) {
  try {
    if (id) localStorage.setItem(CLASS_KEY, id);
    else localStorage.removeItem(CLASS_KEY);
  } catch {}
}
export function getActiveClassId(): string | null {
  try { return localStorage.getItem(CLASS_KEY); } catch { return null; }
}

const CHANNEL = "thign-star-board";

let bc: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (bc) return bc;
  try { bc = new BroadcastChannel(CHANNEL); } catch { /* old browsers */ }
  return bc;
}

export function fireStarBoardEvent(e: Omit<StarBoardEvent, "ts" | "uuid"> & { uuid?: string }) {
  const uuid = e.uuid || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  const evt: StarBoardEvent = { ...e, uuid, ts: Date.now() };
  markSeenLocally(uuid);
  // Same window
  try { window.dispatchEvent(new CustomEvent("star-board-event", { detail: evt })); } catch {}
  // Other tabs / windows on the same device
  try { getChannel()?.postMessage(evt); } catch {}
  // Cross-device: forward to the server relay so the projector can poll.
  // Best-effort — if we don't know the class or the network's down, the
  // local listeners still got the event.
  const classId = getActiveClassId();
  if (classId) {
    api.starEventPost(classId, evt.kind, evt).catch(() => {});
  }
}

export function onStarBoardEvent(handler: (e: StarBoardEvent) => void): () => void {
  const winListener = (e: Event) => handler((e as CustomEvent<StarBoardEvent>).detail);
  window.addEventListener("star-board-event", winListener);
  const ch = getChannel();
  const chListener = (m: MessageEvent<StarBoardEvent>) => handler(m.data);
  ch?.addEventListener("message", chListener);
  return () => {
    window.removeEventListener("star-board-event", winListener);
    ch?.removeEventListener("message", chListener);
  };
}
