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
import RefusalModal from "./RefusalModal.tsx";
import GradebookModal from "./GradebookModal.tsx";
import PassModal from "./PassModal.tsx";

interface ScanState {
  refusal?: { barcode: string; type: "Work Refusal" | "Specials Refusal" };
  gradebook?: { barcode: string };
  pass?: { barcode: string; passKind: "Bathroom" | "Water" | "Break" };
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
      const bcDB = StarStore.getBcDB();
      const entry: BcEntry | undefined = bcDB[v];
      if (entry) {
        successBeep();
        if (entry.type === "assignment") {
          setScan({ gradebook: { barcode: v } });
        } else if (entry.type === "work-refusal-form") {
          setScan({ refusal: { barcode: v, type: "Work Refusal" } });
        } else if (entry.type === "specials-refusal-form") {
          setScan({ refusal: { barcode: v, type: "Specials Refusal" } });
        } else if (entry.type === "pass-action") {
          setScan({ pass: { barcode: v, passKind: entry.passKind } });
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
    </>
  );
}
