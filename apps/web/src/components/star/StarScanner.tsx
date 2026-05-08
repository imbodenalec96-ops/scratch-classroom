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
import RefusalModal from "./RefusalModal.tsx";
import GradebookModal from "./GradebookModal.tsx";
import PassModal from "./PassModal.tsx";
import StatusModal from "./StatusModal.tsx";

interface ScanState {
  refusal?: { barcode: string; type: "Work Refusal" | "Specials Refusal" };
  gradebook?: { barcode: string };
  pass?: { barcode: string; passKind: "Bathroom" | "Water" | "Break" };
  status?: { barcode: string; statusKind: "Absent" | "Skipped" | "Excused" | "Makeup" };
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

    function handleScan(v: string) {
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
        }
      } else {
        errorBeep();
        // Unknown — guess from prefix
        const type: "Work Refusal" | "Specials Refusal" = v.startsWith("SP-") ? "Specials Refusal" : "Work Refusal";
        setScan({ refusal: { barcode: v, type } });
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
    </>
  );
}
