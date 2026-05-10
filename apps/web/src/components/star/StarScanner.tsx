// Global STAR barcode scanner. Mounts at the app root, listens to
// keypresses anywhere in the app, and routes scans to the right modal:
//
//   bcDB[barcode].type === 'assignment'           → GradebookModal
//   bcDB[barcode].type === 'work-refusal-form'    → RefusalModal pre-filled Work Refusal
//   bcDB[barcode].type === 'specials-refusal-form'→ RefusalModal pre-filled Specials Refusal
//   unknown barcode                               → RefusalModal guess by SP-/WR- prefix
//
// Skips capture when an input/textarea/select is focused so normal
// typing isn't intercepted. Auto-fires 80ms after the last char so
// scanners that don't emit Enter still work.

import { useEffect, useRef, useState } from "react";
import { StarStore, rehydrateBcDB, type BcEntry } from "../../lib/star/storage.ts";
import { scanReceivedBeep, successBeep, errorBeep } from "../../lib/star/sounds.ts";
import { fireStarBoardEvent } from "../../lib/star/boardEvents.ts";
import { lookupBarcodeOnServer } from "../../lib/star/barcodeRelay.ts";
import RefusalModal from "./RefusalModal.tsx";
import GradebookModal from "./GradebookModal.tsx";
import PassModal from "./PassModal.tsx";
import StatusModal from "./StatusModal.tsx";
import FreetimeModal from "./FreetimeModal.tsx";

interface ScanState {
  refusal?: { barcode: string; type: "Work Refusal" | "Specials Refusal" };
  gradebook?: { barcode: string };
  pass?: { barcode: string; passKind: "Bathroom" | "Water" | "Break" };
  status?: { barcode: string; statusKind: "Absent" | "Skipped" | "Excused" | "Makeup" };
  freetime?: { barcode: string; minutes: number };
  unknown?: { barcode: string };
}

export default function StarScanner() {
  const [scan, setScan] = useState<ScanState>({});
  const bufRef = useRef<string>("");
  const tmrRef = useRef<number | null>(null);

  useEffect(() => {
    // Rehydrate barcode DB on mount so freshly created assignments
    // from another tab are routable too.
    rehydrateBcDB();

    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const bcInput = document.getElementById("star-barcode-input");
      const inField =
        active &&
        active !== bcInput &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
      if (inField) return;
      if (!e.key) return;

      // Ignore modifier-only keys
      if (e.key.length > 1 && e.key !== "Enter") return;

      if (e.key === "Enter") {
        if (bufRef.current.length > 2) {
          const v = bufRef.current.toUpperCase();
          bufRef.current = "";
          if (tmrRef.current) { window.clearTimeout(tmrRef.current); tmrRef.current = null; }
          handleScan(v);
        }
        return;
      }

      bufRef.current += e.key;
      if (tmrRef.current) window.clearTimeout(tmrRef.current);
      tmrRef.current = window.setTimeout(() => {
        if (bufRef.current.length > 2) {
          const v = bufRef.current.toUpperCase();
          bufRef.current = "";
          handleScan(v);
        } else {
          bufRef.current = "";
        }
      }, 80);
    };

    async function handleScan(v: string) {
      scanReceivedBeep();
      // Always rehydrate so freshly-deployed seed barcodes (PASS-*, STATUS-*)
      // are guaranteed to be in the lookup, even if the user's bcDB
      // pre-dates the seed.
      rehydrateBcDB();
      const bcDB = StarStore.getBcDB();
      let entry: BcEntry | undefined = bcDB[v];
      // Last-resort prefix fallback for the well-known fixed barcodes
      // — covers cases where rehydrate hasn't yet written localStorage.
      if (!entry) {
        if (v === "STATUS-ABSENT")  entry = { id: v, type: "status-action", name: "🚫 Mark Absent",  statusKind: "Absent",  createdDate: new Date().toISOString() };
        if (v === "STATUS-SKIPPED") entry = { id: v, type: "status-action", name: "⏭ Mark Skipped", statusKind: "Skipped", createdDate: new Date().toISOString() };
        if (v === "STATUS-EXCUSED") entry = { id: v, type: "status-action", name: "🩹 Mark Excused", statusKind: "Excused", createdDate: new Date().toISOString() };
        if (v === "STATUS-MAKEUP")  entry = { id: v, type: "status-action", name: "🔁 Mark Makeup",  statusKind: "Makeup",  createdDate: new Date().toISOString() };
        if (v === "PASS-BATHROOM")  entry = { id: v, type: "pass-action",   name: "🚻 Bathroom Pass", passKind: "Bathroom", createdDate: new Date().toISOString() };
        if (v === "PASS-WATER")     entry = { id: v, type: "pass-action",   name: "💧 Water Break",   passKind: "Water",    createdDate: new Date().toISOString() };
        if (v === "PASS-BREAK")     entry = { id: v, type: "pass-action",   name: "🛋 Sensory Break", passKind: "Break",    createdDate: new Date().toISOString() };
        // FREETIME-{minutes} — synthesize from the prefix so a never-synced
        // device still routes correctly when scanning a printed sheet.
        const ftMatch = /^FREETIME-(\d+)$/i.exec(v);
        if (ftMatch) {
          const mins = Math.max(1, Math.min(120, Number(ftMatch[1]) || 10));
          entry = { id: v, type: "freetime-action", name: `🎮 Free Time · ${mins} min`, freetimeMinutes: mins, createdDate: new Date().toISOString() };
        }
      }
      if (entry) {
        successBeep();
        if (entry.type === "assignment") {
          // Tell any /star/phone tab (this device or another) to jump
          // straight to the camera step for this barcode + student.
          // Same-tab dispatch reaches the phone page if it's open here;
          // cross-device POST reaches it on a separate phone.
          fireStarBoardEvent({
            kind: "scan-to-phone",
            studentName: entry.studentName || "—",
            studentId: entry.studentId,
            barcode: v,
            detail: entry.name,
          });
          setScan({ gradebook: { barcode: v } });
        } else if (entry.type === "work-refusal-form") {
          setScan({ refusal: { barcode: v, type: "Work Refusal" } });
        } else if (entry.type === "specials-refusal-form") {
          setScan({ refusal: { barcode: v, type: "Specials Refusal" } });
        } else if (entry.type === "pass-action") {
          setScan({ pass: { barcode: v, passKind: entry.passKind } });
        } else if (entry.type === "status-action") {
          setScan({ status: { barcode: v, statusKind: entry.statusKind } });
        } else if (entry.type === "freetime-action") {
          setScan({ freetime: { barcode: v, minutes: entry.freetimeMinutes } });
        }
      } else {
        // Local miss → try the server lookup.
        let server = await lookupBarcodeOnServer(v);
        // Still missing? Run a full sync (which also pulls the relay
        // table) and retry once. Handles "barcode created seconds ago,
        // hadn't propagated yet" and "this device never synced".
        if (!server) {
          try {
            const { syncFromClassroom } = await import("../../lib/star/sync.ts");
            await syncFromClassroom();
            const refreshed = StarStore.getBcDB();
            if (refreshed[v]) {
              entry = refreshed[v];
            } else {
              server = await lookupBarcodeOnServer(v);
            }
          } catch {}
        }
        const final = entry || server || undefined;
        if (final) {
          successBeep();
          if (final.type === "assignment") {
            fireStarBoardEvent({
              kind: "scan-to-phone",
              studentName: final.studentName || "—",
              studentId: final.studentId,
              barcode: v,
              detail: final.name,
            });
            setScan({ gradebook: { barcode: v } });
          } else if (final.type === "work-refusal-form") {
            setScan({ refusal: { barcode: v, type: "Work Refusal" } });
          } else if (final.type === "specials-refusal-form") {
            setScan({ refusal: { barcode: v, type: "Specials Refusal" } });
          } else if (final.type === "pass-action") {
            setScan({ pass: { barcode: v, passKind: (final as any).passKind } });
          } else if (final.type === "status-action") {
            setScan({ status: { barcode: v, statusKind: (final as any).statusKind } });
          } else if (final.type === "freetime-action") {
            setScan({ freetime: { barcode: v, minutes: (final as any).freetimeMinutes } });
          }
          return;
        }
        errorBeep();
        setScan({ unknown: { barcode: v } });
      }
    }

    window.addEventListener("keypress", onKey);
    return () => {
      window.removeEventListener("keypress", onKey);
      if (tmrRef.current) window.clearTimeout(tmrRef.current);
    };
  }, []);

  return (
    <>
      {scan.refusal && (
        <RefusalModal
          barcode={scan.refusal.barcode}
          type={scan.refusal.type}
          onClose={() => setScan({})}
        />
      )}
      {scan.gradebook && (
        <GradebookModal
          barcode={scan.gradebook.barcode}
          onClose={() => setScan({})}
        />
      )}
      {scan.pass && (
        <PassModal
          passKind={scan.pass.passKind}
          onClose={() => setScan({})}
        />
      )}
      {scan.status && (
        <StatusModal
          statusKind={scan.status.statusKind}
          onClose={() => setScan({})}
        />
      )}
      {scan.freetime && (
        <FreetimeModal
          minutes={scan.freetime.minutes}
          onClose={() => setScan({})}
        />
      )}
      {scan.unknown && (
        <UnknownBarcodeOverlay
          barcode={scan.unknown.barcode}
          onClose={() => setScan({})}
          onForceRefusal={() => {
            const code = scan.unknown!.barcode;
            const type: "Work Refusal" | "Specials Refusal" = code.startsWith("SP-") ? "Specials Refusal" : "Work Refusal";
            setScan({ refusal: { barcode: code, type } });
          }}
          onRetry={async () => {
            const code = scan.unknown!.barcode;
            try {
              const { syncFromClassroom } = await import("../../lib/star/sync.ts");
              await syncFromClassroom();
            } catch {}
            const local = StarStore.getBcDB()[code];
            const found = local || (await lookupBarcodeOnServer(code));
            if (found) {
              successBeep();
              if (found.type === "assignment") {
                setScan({ gradebook: { barcode: code } });
              } else if (found.type === "work-refusal-form") {
                setScan({ refusal: { barcode: code, type: "Work Refusal" } });
              } else if (found.type === "specials-refusal-form") {
                setScan({ refusal: { barcode: code, type: "Specials Refusal" } });
              } else if (found.type === "pass-action") {
                setScan({ pass: { barcode: code, passKind: (found as any).passKind } });
              } else if (found.type === "status-action") {
                setScan({ status: { barcode: code, statusKind: (found as any).statusKind } });
              } else if (found.type === "freetime-action") {
                setScan({ freetime: { barcode: code, minutes: (found as any).freetimeMinutes } });
              }
            } else {
              errorBeep();
            }
          }}
        />
      )}
    </>
  );
}

/* ── unknown-barcode overlay ─────────────────────────────────────── */

function UnknownBarcodeOverlay({ barcode, onClose, onForceRefusal, onRetry }: {
  barcode: string;
  onClose: () => void;
  onForceRefusal: () => void;
  onRetry: () => Promise<void>;
}) {
  const guessRefusal = barcode.startsWith("WR-") || barcode.startsWith("SP-");
  const isLocallyMinted = /^(QZ|AS|WR|SP|MA|MO)-/i.test(barcode);
  const [retrying, setRetrying] = useState(false);
  const [retried, setRetried] = useState(false);
  const handleRetry = async () => {
    setRetrying(true);
    try { await onRetry(); }
    finally { setRetrying(false); setRetried(true); }
  };
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 800,
      background: "rgba(10,4,20,0.78)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "radial-gradient(700px 500px at 0% 0%, rgba(168,85,247,0.18) 0%, transparent 55%), linear-gradient(180deg, #1a0f2e 0%, #0a0414 100%)",
        border: "1px solid rgba(239,68,68,0.45)",
        borderRadius: 18, width: "min(540px, 96vw)", padding: 22, color: "#f5f1e8",
        boxShadow: "0 28px 64px -10px rgba(239,68,68,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "4px 12px", borderRadius: 999,
          background: "rgba(239,68,68,0.18)",
          border: "1px solid rgba(239,68,68,0.45)",
          fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase",
          color: "#fca5a5", marginBottom: 8,
        }}>⚠ Barcode Not Found</div>
        <div style={{
          fontFamily: "Menlo, monospace", fontSize: 22, fontWeight: 800,
          color: "#f9a8d4", marginBottom: 14, letterSpacing: "0.04em",
        }}>
          {barcode}
        </div>
        <div style={{ fontSize: 13, color: "rgba(245,241,232,0.85)", lineHeight: 1.55, marginBottom: 16 }}>
          {isLocallyMinted ? (
            <>This barcode was created on another device. The cross-device sync
            should have caught it — tap <b style={{ color: "#fce7f3" }}>🔄 Sync &amp; Retry</b> below
            to pull the latest from the server and try again.</>
          ) : (
            <>This barcode isn't in any STAR database. Either it was wiped, or it's
            a code from a different system.</>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isLocallyMinted && (
            <button onClick={handleRetry} disabled={retrying} style={{
              padding: "13px 18px", borderRadius: 12, border: "none",
              background: retrying
                ? "rgba(168,85,247,0.20)"
                : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
              color: "white", fontWeight: 900, fontSize: 14,
              cursor: retrying ? "wait" : "pointer",
              boxShadow: retrying ? "none" : "0 8px 22px -6px rgba(168,85,247,0.55)",
              touchAction: "manipulation",
            }}>
              {retrying ? "Syncing…" : retried ? "🔄 Sync &amp; Retry again" : "🔄 Sync &amp; Retry"}
            </button>
          )}
          <button onClick={onClose} style={{
            padding: "11px 16px", borderRadius: 12,
            background: "rgba(168,85,247,0.06)", color: "#fce7f3",
            border: "1px solid rgba(168,85,247,0.30)",
            fontWeight: 800, cursor: "pointer", fontSize: 14,
            touchAction: "manipulation",
          }}>OK — try another barcode</button>
          {guessRefusal && (
            <button onClick={onForceRefusal} style={{
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(168,85,247,0.04)", color: "rgba(196,181,253,0.75)",
              border: "1px dashed rgba(168,85,247,0.30)",
              fontWeight: 700, cursor: "pointer", fontSize: 12,
            }}>
              ↳ Open as a refusal log anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
