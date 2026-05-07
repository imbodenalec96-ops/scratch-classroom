// Lightweight pub/sub for STAR → ClassroomBoard popups.
//
// Producers (RefusalModal, GradebookModal) call `fireStarBoardEvent()`
// when something noteworthy happens. The event reaches:
//   • The same browser window (window CustomEvent)
//   • Other tabs / windows of the same origin (BroadcastChannel)
//
// Cross-device fanout (e.g. teacher's iPad → projector) would need a
// server-side relay; that's intentionally out of scope here. If both
// surfaces are on the same device or same browser, this just works.

export type StarBoardKind = "refusal" | "completion";

export interface StarBoardEvent {
  kind: StarBoardKind;
  studentName: string;
  studentId?: string;
  // For refusal: refusal type. For completion: assignment title.
  detail?: string;
  // For completion only: percentage and points awarded.
  pct?: number;
  letter?: string;
  pointsAwarded?: number;
  // Refusal type pill: "Work Refusal" | "Specials Refusal"
  refusalType?: string;
  ts: number;
}

const CHANNEL = "thign-star-board";

let bc: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (bc) return bc;
  try { bc = new BroadcastChannel(CHANNEL); } catch { /* old browsers */ }
  return bc;
}

export function fireStarBoardEvent(e: Omit<StarBoardEvent, "ts">) {
  const evt: StarBoardEvent = { ...e, ts: Date.now() };
  // Same window
  try { window.dispatchEvent(new CustomEvent("star-board-event", { detail: evt })); } catch {}
  // Other tabs / windows
  try { getChannel()?.postMessage(evt); } catch {}
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
