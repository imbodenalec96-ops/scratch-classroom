// Phone-optimized capture page. Open this on a phone, type or scan
// a barcode, and the native camera auto-opens to photograph the
// student's completed worksheet. The photo gets compressed to ~800px
// JPEG (so localStorage doesn't blow up) and attached to the
// assignment under the chosen student.
//
// Designed for fast classroom use: huge buttons, autofocused inputs,
// camera fires automatically as soon as a known barcode lands.

import { useEffect, useRef, useState } from "react";
import {
  StarStore, rehydrateBcDB,
  type BcEntry, type StarStudent, type StarPhoto,
} from "../../lib/star/storage.ts";
import { successBeep, errorBeep, scanReceivedBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { syncFromClassroom } from "../../lib/star/sync.ts";
import { lookupBarcodeOnServer } from "../../lib/star/barcodeRelay.ts";
import { onStarBoardEvent, getActiveClassId, setActiveClassId } from "../../lib/star/boardEvents.ts";
import { api } from "../../lib/api.ts";

type Step = "scan" | "pick-student" | "camera" | "saved" | "unknown";

export default function StarPhonePage() {
  const [code, setCode] = useState("");
  const [entry, setEntry] = useState<BcEntry | null>(null);
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [studentId, setStudentId] = useState<string>("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>("scan");
  const [savedPhoto, setSavedPhoto] = useState<StarPhoto | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [bcdbSize, setBcdbSize] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refreshCounts = () => setBcdbSize(Object.keys(StarStore.getBcDB()).length);

  const runSync = async () => {
    setSyncing(true);
    try {
      const r = await syncFromClassroom();
      setSyncStatus(r.message);
      refreshCounts();
    } catch (e: any) {
      setSyncStatus(`Sync failed: ${e?.message || e}`);
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync on first mount so the phone's bcDB pulls fresh classroom
  // assignments from the API (without this the phone's localStorage is
  // empty and every scan returns "barcode not found").
  useEffect(() => {
    rehydrateBcDB();
    refreshCounts();
    runSync();
    // Also make sure the cross-device relay's class id is set on this
    // phone so it polls for incoming "scan-to-phone" events from the
    // computer/iPad. App.tsx already does this, but on slow loads it
    // races; setting it here too is safe + idempotent.
    api.getClasses().then((cs: any[]) => {
      if (Array.isArray(cs) && cs[0]?.id && !getActiveClassId()) setActiveClassId(cs[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for "scan-to-phone" events from the computer / iPad. Whenever
  // a teacher scans an assignment somewhere, the phone auto-jumps to the
  // camera step for that barcode + pre-selects the assigned student.
  useEffect(() => {
    return onStarBoardEvent(async (e) => {
      if (e.kind !== "scan-to-phone" || !e.barcode) return;
      const v = e.barcode.trim().toUpperCase();
      rehydrateBcDB();
      let bc = StarStore.getBcDB()[v] as BcEntry | undefined;
      if (!bc) {
        try { const r = await lookupBarcodeOnServer(v); if (r) bc = r; } catch {}
      }
      if (!bc) {
        try { await syncFromClassroom(); bc = StarStore.getBcDB()[v] as BcEntry | undefined; } catch {}
        refreshCounts();
      }
      if (!bc) {
        setEntry(null);
        setCode(v);
        setStep("unknown");
        return;
      }
      if (bc.type !== "assignment") return;
      successBeep();
      setEntry(bc);
      setCode(v);
      const sid = e.studentId || (bc as any).studentId;
      if (sid) {
        setStudentId(sid);
        setStep("camera");
      } else {
        setStudentId("");
        setStep("pick-student");
      }
    });
  }, []);

  const acceptAssignment = (bc: BcEntry & { type: "assignment" }, v: string) => {
    successBeep();
    setEntry(bc);
    setCode(v);
    // Auto-fast-path when the assignment is already tagged to a student:
    // skip the picker and jump straight to the camera. The student grid
    // only appears for class-wide barcodes that have no assignee.
    if ((bc as any).studentId) {
      setStudentId((bc as any).studentId);
      setStep("camera");
    } else {
      setStudentId("");
      setStep("pick-student");
    }
  };

  const onScan = async (rawCode: string) => {
    const v = rawCode.trim().toUpperCase();
    if (!v) return;
    scanReceivedBeep();
    // 1. Local bcDB — fast path. Rehydrate first so any newly-seeded
    //    barcodes baked into the bundle are available even if this
    //    phone's localStorage pre-dates them.
    rehydrateBcDB();
    let bc = StarStore.getBcDB()[v] as BcEntry | undefined;
    // 2. Server-side fallback — when the assignment was minted on the
    //    laptop and pushed via the relay, the phone may not have synced
    //    it yet. Look it up live before declaring it unknown. This
    //    mirrors what the desktop scanner does.
    if (!bc) {
      try {
        const remote = await lookupBarcodeOnServer(v);
        if (remote) bc = remote;
      } catch {}
    }
    // 3. Last-ditch — auto-trigger a full sync, then re-check. Helps
    //    when the active class id wasn't set yet on initial mount.
    if (!bc) {
      try {
        await syncFromClassroom();
        bc = StarStore.getBcDB()[v] as BcEntry | undefined;
      } catch {}
      refreshCounts();
    }
    if (!bc) {
      errorBeep();
      setEntry(null);
      setCode(v);
      setStep("unknown");
      return;
    }
    if (bc.type !== "assignment") {
      // Non-assignment barcodes (movement, freetime, supply, timer, pass)
      // belong on the projector / iPad scanner, not the phone-camera flow.
      errorBeep();
      setEntry(null);
      setCode(v);
      setStep("unknown");
      return;
    }
    acceptAssignment(bc as any, v);
  };

  const openCamera = () => {
    if (!studentId) { errorBeep(); alert("Pick a student first."); return; }
    setStep("camera");
  };

  // When the camera step becomes active, auto-fire the file input so the
  // phone's native camera opens without an extra tap. Works on iOS Safari
  // + Android Chrome because we're inside the click stack from the
  // student-grid tap (or the scan handler chain).
  useEffect(() => {
    if (step === "camera") {
      const t = window.setTimeout(() => fileRef.current?.click(), 80);
      return () => window.clearTimeout(t);
    }
  }, [step]);

  const skipPhoto = () => {
    // Just bail out and reset for the next scan — no photo saved.
    reset();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) { setStep("pick-student"); return; }
    if (!entry) return;
    try {
      const dataUrl = await compressImage(file, 800, 0.78);
      const stu = students.find((x) => x.id === studentId);
      const photo: StarPhoto = {
        id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        barcode: entry.id,
        studentId,
        studentName: stu ? `${stu.firstName} ${stu.lastName}`.trim() : undefined,
        dataUrl,
        ts: Date.now(),
        note,
      };
      StarStore.addPhoto(photo);
      // Relay to other devices (computer's gradebook will show it).
      try {
        const { fireStarBoardEvent } = await import("../../lib/star/boardEvents.ts");
        fireStarBoardEvent({
          kind: "photo-saved",
          studentName: photo.studentName || "—",
          studentId: photo.studentId,
          barcode: entry.id,
          photo: {
            id: photo.id, barcode: entry.id,
            studentId: photo.studentId, studentName: photo.studentName,
            dataUrl: photo.dataUrl, note: photo.note, ts: photo.ts,
          },
        });
      } catch {}
      loggedBeep();
      setSavedPhoto(photo);
      setStep("saved");
    } catch (err: any) {
      errorBeep();
      alert(`Couldn't save photo: ${err?.message || err}`);
      setStep("pick-student");
    }
  };

  const reset = () => {
    setCode("");
    setEntry(null);
    setStudentId("");
    setNote("");
    setSavedPhoto(null);
    setStep("scan");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "radial-gradient(1200px 900px at 0% 0%, rgba(168,85,247,0.22) 0%, transparent 55%), radial-gradient(1000px 800px at 100% 100%, rgba(236,72,153,0.20) 0%, transparent 55%), radial-gradient(800px 600px at 50% 0%, rgba(99,102,241,0.16) 0%, transparent 60%), radial-gradient(ellipse at center, #1a0f2e 0%, #0a0414 100%)",
      color: "#f5f1e8",
      padding: "max(env(safe-area-inset-top), 16px) max(env(safe-area-inset-right), 16px) max(env(safe-area-inset-bottom), 24px) max(env(safe-area-inset-left), 16px)",
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitTextSizeAdjust: "100%",
    }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <Header bcdbSize={bcdbSize} syncing={syncing} onSync={runSync} syncStatus={syncStatus} />

        {/* Hidden file input — fires when openCamera() runs. capture="environment"
            tells iOS/Android to use the back camera. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFile}
          style={{ display: "none" }}
        />

        {step === "scan" && (
          <ScanStep code={code} setCode={setCode} onScan={onScan} inputRef={inputRef} />
        )}

        {step === "unknown" && (
          <div style={{
            padding: 24, borderRadius: 18,
            background: "linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(236,72,153,0.10) 100%)",
            border: "1px solid rgba(239,68,68,0.45)",
            color: "#fecaca",
            boxShadow: "0 12px 32px -10px rgba(239,68,68,0.40), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase", marginBottom: 8, color: "#fca5a5" }}>
              ⚠ Barcode not found
            </div>
            <div style={{
              fontFamily: "Menlo, monospace", fontSize: 20, fontWeight: 800,
              color: "#f9a8d4", marginBottom: 14, letterSpacing: "0.04em",
            }}>
              {code}
            </div>
            <div style={{ fontSize: 13, marginBottom: 16, color: "rgba(245,241,232,0.85)", lineHeight: 1.5, fontWeight: 500 }}>
              This phone has <b>{bcdbSize}</b> barcode{bcdbSize === 1 ? "" : "s"}.
              If the barcode lives on your computer but isn't here, hit Sync to pull
              the classroom roster + assignments. (STAR-locally-generated barcodes
              don't sync — open them on the same device they were created on.)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={runSync} disabled={syncing} style={primary({ fullWidth: true, large: true })}>
                {syncing ? "Syncing…" : "🔄 Sync from Classroom"}
              </button>
              <button onClick={reset} style={ghost({ fullWidth: true })}>← Try another barcode</button>
            </div>
          </div>
        )}

        {step === "pick-student" && entry && entry.type === "assignment" && (
          <PickStudentStep
            entry={entry}
            students={students}
            studentId={studentId}
            // Picking a student auto-advances to the camera — one tap,
            // not two. Note can still be added on the saved screen later.
            setStudentId={(id) => { setStudentId(id); setStep("camera"); }}
            note={note}
            setNote={setNote}
            onCancel={reset}
          />
        )}

        {step === "camera" && entry && entry.type === "assignment" && (
          <CameraStep
            entry={entry}
            studentName={(students.find((x) => x.id === studentId) || { firstName: "" } as any).firstName}
            onRetry={() => fileRef.current?.click()}
            onSkip={skipPhoto}
          />
        )}

        {step === "saved" && savedPhoto && (
          <SavedStep
            photo={savedPhoto}
            onAnother={() => { setStep("camera"); setTimeout(() => fileRef.current?.click(), 120); }}
            onDone={reset}
          />
        )}
      </div>
    </div>
  );
}

/* ── steps ──────────────────────────────────────────────────────── */

function Header({ bcdbSize, syncing, onSync, syncStatus }: {
  bcdbSize: number; syncing: boolean; onSync: () => void; syncStatus: string;
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span style={{
          width: 52, height: 52, borderRadius: 14,
          background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, boxShadow: "0 12px 28px -8px rgba(168,85,247,0.55)",
        }}>📷</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)" }}>
            STAR · Phone Capture
          </div>
          <h1 style={{
            fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.025em",
            background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 40%, #f9a8d4 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Snap a worksheet
          </h1>
        </div>
        <button onClick={onSync} disabled={syncing} style={{
          padding: "9px 14px", borderRadius: 999,
          background: "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(99,102,241,0.15))",
          color: "#fce7f3",
          border: "1px solid rgba(168,85,247,0.45)",
          fontWeight: 800, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: "0 0 12px rgba(168,85,247,0.25)",
        }}>{syncing ? "…" : "🔄 Sync"}</button>
      </div>
      <div style={{
        marginBottom: 18, padding: "9px 14px", borderRadius: 12,
        background: bcdbSize === 0
          ? "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(236,72,153,0.10))"
          : "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
        border: `1px solid ${bcdbSize === 0 ? "rgba(239,68,68,0.40)" : "rgba(168,85,247,0.20)"}`,
        fontSize: 11, color: bcdbSize === 0 ? "#fecaca" : "#c4b5fd",
        fontFamily: "Menlo, monospace", fontWeight: 700,
      }}>
        {bcdbSize === 0
          ? "⚠️ No barcodes on this phone yet — tap 🔄 Sync above to pull from the classroom."
          : `${bcdbSize} barcodes loaded`}
        {syncStatus && <div style={{ marginTop: 4, opacity: 0.85 }}>{syncStatus}</div>}
      </div>
    </>
  );
}

function ScanStep({ code, setCode, onScan, inputRef }: {
  code: string; setCode: (v: string) => void;
  onScan: (v: string) => void;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  return (
    <div style={{
      padding: 22, borderRadius: 20,
      background: "linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(236,72,153,0.10) 50%, rgba(99,102,241,0.14) 100%)",
      border: "1px solid rgba(168,85,247,0.35)",
      boxShadow: "0 12px 32px -10px rgba(168,85,247,0.40), inset 0 1px 0 rgba(255,255,255,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 24, borderRadius: 8,
          background: "linear-gradient(135deg, #ec4899, #a855f7)", color: "white",
          fontSize: 11, fontWeight: 900, letterSpacing: "0.04em",
          boxShadow: "0 0 12px rgba(168,85,247,0.45)",
        }}>1</span>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
          color: "#f9a8d4",
        }}>Scan or type the barcode</span>
      </div>
      <label htmlFor="phone-barcode" style={{ position: "absolute", left: -9999, top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        Assignment barcode
      </label>
      <input
        id="phone-barcode"
        ref={inputRef}
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === "Enter") onScan(code); }}
        placeholder="WR-260507-503"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        style={{
          width: "100%", padding: "16px 18px",
          minHeight: 56,
          borderRadius: 14,
          background: "rgba(10,4,20,0.60)", color: "#fce7f3",
          border: "2px solid rgba(168,85,247,0.35)",
          fontFamily: "Menlo, monospace",
          fontSize: 18, fontWeight: 800,
          outline: "none", letterSpacing: "0.05em",
          boxSizing: "border-box",
          touchAction: "manipulation",
        }}
      />
      <button
        onClick={() => onScan(code)}
        disabled={!code.trim()}
        style={primary({ fullWidth: true, large: true, disabled: !code.trim() })}
      >
        Scan →
      </button>
      <div style={{ fontSize: 12, color: "rgba(196,181,253,0.60)", marginTop: 14, fontWeight: 600, lineHeight: 1.5 }}>
        💡 Tip: a USB scanner types the barcode + presses Enter on its own.
        Or just type it — fully OK.
      </div>
    </div>
  );
}

function PickStudentStep({ entry, students, studentId, setStudentId, note, setNote, onCancel }: {
  entry: BcEntry & { type: "assignment" };
  students: StarStudent[];
  studentId: string;
  setStudentId: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      padding: 22, borderRadius: 18,
      background: "linear-gradient(180deg, rgba(168,85,247,0.08) 0%, rgba(99,102,241,0.04) 100%)",
      border: "1px solid rgba(168,85,247,0.20)",
      boxShadow: "0 12px 32px -12px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase", color: "#c4b5fd" }}>
        Step 2 · Pick the student
      </div>
      <div style={{
        fontSize: 22, fontWeight: 900, margin: "6px 0 4px", letterSpacing: "-0.02em",
        background: "linear-gradient(135deg, #f5f1e8 0%, #f9a8d4 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
      }}>{entry.name}</div>
      <div style={{
        fontSize: 12, marginBottom: 16,
        fontFamily: "Menlo, monospace", color: "#f9a8d4", fontWeight: 700,
        letterSpacing: "0.04em",
      }}>
        {entry.id}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
        gap: 10, marginBottom: 14,
      }}>
        {students.map((s) => {
          const sel = studentId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setStudentId(s.id)}
              aria-pressed={sel}
              style={{
                padding: "14px 10px", borderRadius: 14,
                background: sel
                  ? "linear-gradient(135deg, #ec4899 0%, #a855f7 100%)"
                  : "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.04))",
                border: sel
                  ? "2px solid rgba(236,72,153,0.70)"
                  : "1px solid rgba(168,85,247,0.20)",
                color: "white", cursor: "pointer",
                fontSize: 16, fontWeight: 800,
                minHeight: 72,
                boxShadow: sel ? "0 8px 22px -6px rgba(236,72,153,0.55)" : undefined,
                letterSpacing: "-0.005em",
                touchAction: "manipulation",
                transition: "transform 150ms cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              {s.firstName}
              {s.grade && <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4, fontWeight: 700 }}>{s.grade}</div>}
            </button>
          );
        })}
      </div>

      <label htmlFor="phone-note" style={{
        display: "block", fontSize: 11, fontWeight: 800,
        letterSpacing: "0.18em", textTransform: "uppercase",
        color: "rgba(196,181,253,0.65)", marginBottom: 6,
      }}>Note (optional)</label>
      <input
        id="phone-note"
        value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. front side, partial work"
        style={{
          width: "100%", padding: "14px 16px",
          minHeight: 52, borderRadius: 12,
          background: "rgba(10,4,20,0.45)", color: "#fce7f3",
          border: "1px solid rgba(168,85,247,0.25)",
          fontSize: 16, outline: "none", fontWeight: 600,
          boxSizing: "border-box", marginBottom: 12,
          touchAction: "manipulation",
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={ghost()}>← Back</button>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "rgba(196,181,253,0.55)", fontWeight: 600 }}>
        💡 Tap a student — camera opens automatically.
      </div>
    </div>
  );
}

function CameraStep({ entry, studentName, onRetry, onSkip }: {
  entry: BcEntry & { type: "assignment" };
  studentName?: string;
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    <div style={{
      padding: 26, borderRadius: 18,
      background: "linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(236,72,153,0.06) 50%, rgba(99,102,241,0.10) 100%)",
      border: "1px solid rgba(168,85,247,0.30)",
      textAlign: "center",
      boxShadow: "0 12px 32px -10px rgba(168,85,247,0.40), inset 0 1px 0 rgba(255,255,255,0.05)",
    }}>
      <div style={{ fontSize: 42, marginBottom: 10, filter: "drop-shadow(0 0 12px rgba(236,72,153,0.45))" }}>📷</div>
      <div style={{
        fontSize: 20, fontWeight: 900, marginBottom: 5, letterSpacing: "-0.02em",
        background: "linear-gradient(135deg, #f5f1e8 0%, #f9a8d4 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
      }}>
        Camera opening…
      </div>
      <div style={{ fontSize: 13, color: "rgba(196,181,253,0.75)", marginBottom: 20, fontWeight: 600 }}>
        {studentName || "Student"} · {entry.name}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={onRetry} style={primary({ fullWidth: true })}>
          📷 Open camera again
        </button>
        <button onClick={onSkip} style={ghost({ fullWidth: true })}>
          Skip photo — back to scan
        </button>
      </div>
      <div style={{ fontSize: 11, color: "rgba(196,181,253,0.55)", marginTop: 14, fontWeight: 600 }}>
        Phone didn't pop the camera? Tap "Open camera again". Some browsers
        block auto-camera if you didn't tap something first.
      </div>
    </div>
  );
}

function SavedStep({ photo, onAnother, onDone }: { photo: StarPhoto; onAnother: () => void; onDone: () => void }) {
  return (
    <div style={{
      padding: 22, borderRadius: 18,
      background: "linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(168,85,247,0.10) 100%)",
      border: "1px solid rgba(16,185,129,0.45)",
      boxShadow: "0 12px 32px -12px rgba(16,185,129,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "4px 12px", borderRadius: 999,
        background: "rgba(16,185,129,0.20)",
        border: "1px solid rgba(16,185,129,0.45)",
        fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
        color: "#86efac",
      }}>
        ✓ Saved
      </div>
      <div style={{
        fontSize: 19, fontWeight: 900, margin: "8px 0 14px", letterSpacing: "-0.02em",
        background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
      }}>
        Photo attached to {photo.studentName || "student"}
      </div>
      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(168,85,247,0.30)", boxShadow: "0 8px 24px -10px rgba(168,85,247,0.30)" }}>
        <img src={photo.dataUrl} alt="" style={{ width: "100%", display: "block" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={onDone} style={ghost()}>Done — scan another</button>
        <button onClick={onAnother} style={primary({ fullWidth: true })}>
          📷 Take another photo
        </button>
      </div>
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────── */

function primary(opts: { fullWidth?: boolean; large?: boolean; disabled?: boolean } = {}): React.CSSProperties {
  return {
    width: opts.fullWidth ? "100%" : "auto",
    padding: opts.large ? "18px 22px" : "14px 18px",
    minHeight: opts.large ? 56 : 48,
    borderRadius: 14,
    background: opts.disabled
      ? "rgba(168,85,247,0.18)"
      : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    color: "white", border: "none",
    fontWeight: 900, fontSize: opts.large ? 18 : 16,
    cursor: opts.disabled ? "not-allowed" : "pointer",
    opacity: opts.disabled ? 0.55 : 1,
    marginTop: 14,
    letterSpacing: "-0.005em",
    boxShadow: opts.disabled ? "none" : "0 12px 28px -8px rgba(168,85,247,0.55)",
    touchAction: "manipulation",
  };
}
function ghost(opts: { fullWidth?: boolean } = {}): React.CSSProperties {
  return {
    padding: "14px 18px", borderRadius: 12,
    minHeight: 48,
    background: "rgba(168,85,247,0.06)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.30)",
    fontWeight: 800, cursor: "pointer", fontSize: 16,
    flexShrink: 0,
    width: opts.fullWidth ? "100%" : "auto",
    touchAction: "manipulation",
  };
}

// Compress an image File down to a max-side dimension and return a JPEG
// data URL. Keeps localStorage usage manageable (~50-150 KB per photo
// at maxSide=800 / quality=0.78 vs 5+ MB of raw camera output).
function compressImage(file: File, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth  * ratio);
        const h = Math.round(img.naturalHeight * ratio);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas context unavailable")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image failed to load")); };
    img.src = url;
  });
}
