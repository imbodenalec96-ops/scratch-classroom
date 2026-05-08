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
    return onStarBoardEvent((e) => {
      if (e.kind !== "scan-to-phone" || !e.barcode) return;
      const v = e.barcode.trim().toUpperCase();
      const bc = StarStore.getBcDB()[v];
      if (!bc) {
        // Phone hasn't synced this barcode yet — show the unknown step
        // with the relayed code preserved so user can hit Sync.
        setEntry(null);
        setCode(v);
        setStep("unknown");
        return;
      }
      if (bc.type !== "assignment") return;
      successBeep();
      setEntry(bc);
      setCode(v);
      // If the originating scan carried a student id, use it; else fall
      // back to the entry's assigned student; else require a manual pick.
      const sid = e.studentId || bc.studentId;
      if (sid) {
        setStudentId(sid);
        setStep("camera");
      } else {
        setStudentId("");
        setStep("pick-student");
      }
    });
  }, []);

  const onScan = (rawCode: string) => {
    const v = rawCode.trim().toUpperCase();
    if (!v) return;
    scanReceivedBeep();
    const bc = StarStore.getBcDB()[v];
    if (!bc) {
      errorBeep();
      setEntry(null);
      setCode(v);
      setStep("unknown");
      return;
    }
    if (bc.type !== "assignment") {
      errorBeep();
      setEntry(null);
      setCode(v);
      setStep("unknown");
      return;
    }
    successBeep();
    setEntry(bc);
    setCode(v);
    // Auto-fast-path when the assignment is already tagged to a student:
    // skip the picker and jump straight to the camera. The student grid
    // only appears for class-wide barcodes that have no assignee.
    if (bc.studentId) {
      setStudentId(bc.studentId);
      setStep("camera");
    } else {
      setStudentId("");
      setStep("pick-student");
    }
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
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0f172a 0%, #1e1b2e 100%)",
      color: "#f5f1e8", padding: 20,
      fontFamily: "'Inter', system-ui, sans-serif",
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
            padding: 22, borderRadius: 18,
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.40)",
            color: "#fca5a5",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
              ⚠️ Barcode not found
            </div>
            <div style={{ fontFamily: "Menlo, monospace", fontSize: 18, fontWeight: 700, color: "#fde68a", marginBottom: 12 }}>
              {code}
            </div>
            <div style={{ fontSize: 13, marginBottom: 16, color: "white", opacity: 0.85, lineHeight: 1.5 }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{
          width: 48, height: 48, borderRadius: 12,
          background: "linear-gradient(135deg, #6366f1, #b23a48)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, boxShadow: "0 8px 20px rgba(99,102,241,0.40)",
        }}>📷</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.6 }}>
            STAR · Phone Capture
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.01em" }}>
            Snap a worksheet
          </h1>
        </div>
        <button onClick={onSync} disabled={syncing} style={{
          padding: "8px 12px", borderRadius: 8,
          background: "rgba(99,102,241,0.20)", color: "white",
          border: "1px solid rgba(99,102,241,0.50)",
          fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
        }}>{syncing ? "…" : "🔄 Sync"}</button>
      </div>
      <div style={{
        marginBottom: 16, padding: "8px 12px", borderRadius: 8,
        background: bcdbSize === 0 ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${bcdbSize === 0 ? "rgba(239,68,68,0.40)" : "rgba(255,255,255,0.08)"}`,
        fontSize: 11, opacity: bcdbSize === 0 ? 1 : 0.7, color: bcdbSize === 0 ? "#fca5a5" : "white",
        fontFamily: "Menlo, monospace",
      }}>
        {bcdbSize === 0
          ? "⚠️ No barcodes on this phone yet — tap 🔄 Sync above to pull from the classroom."
          : `${bcdbSize} barcodes loaded`}
        {syncStatus && <div style={{ marginTop: 4 }}>{syncStatus}</div>}
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
      padding: 24, borderRadius: 18,
      background: "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(178,58,72,0.10) 100%)",
      border: "1px solid rgba(251,191,36,0.30)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>
        Step 1 — Scan or type the assignment barcode
      </div>
      <input
        ref={inputRef}
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === "Enter") onScan(code); }}
        placeholder="e.g. WR-260507-503"
        style={{
          width: "100%", padding: "16px 18px", borderRadius: 12,
          background: "rgba(0,0,0,0.45)", color: "white",
          border: "2px solid rgba(255,255,255,0.18)",
          fontFamily: "Menlo, monospace", fontSize: 22, fontWeight: 700,
          outline: "none", letterSpacing: "0.05em",
          boxSizing: "border-box",
        }}
      />
      <button onClick={() => onScan(code)} style={primary({ fullWidth: true, large: true })}>
        Scan →
      </button>
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 12 }}>
        💡 Use a USB scanner or the typing keyboard. Camera-based barcode scanning
        depends on your phone — type if it doesn't pick up the code.
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
      padding: 20, borderRadius: 18,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55 }}>
        Step 2 — Pick the student
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, margin: "4px 0 4px" }}>{entry.name}</div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14, fontFamily: "Menlo, monospace", color: "#fde68a" }}>
        {entry.id}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: 8, marginBottom: 14,
      }}>
        {students.map((s) => {
          const sel = studentId === s.id;
          return (
            <button key={s.id} onClick={() => setStudentId(s.id)} style={{
              padding: "12px 8px", borderRadius: 12,
              background: sel ? "linear-gradient(135deg, #b23a48, #d97706)" : "rgba(255,255,255,0.04)",
              border: sel ? "2px solid rgba(251,191,36,0.7)" : "1px solid rgba(255,255,255,0.10)",
              color: "white", cursor: "pointer", fontSize: 14, fontWeight: 700,
              minHeight: 64,
            }}>
              {s.firstName}
              {s.grade && <div style={{ fontSize: 10, opacity: 0.65, marginTop: 3 }}>{s.grade}</div>}
            </button>
          );
        })}
      </div>

      <input
        value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (e.g. front side, partial work)"
        style={{
          width: "100%", padding: "12px 14px", borderRadius: 10,
          background: "rgba(0,0,0,0.30)", color: "white",
          border: "1px solid rgba(255,255,255,0.12)",
          fontSize: 14, outline: "none",
          boxSizing: "border-box", marginBottom: 12,
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={ghost()}>← Back</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.55 }}>
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
      padding: 24, borderRadius: 18,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
        Camera opening…
      </div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 18 }}>
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
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 14 }}>
        Phone didn't pop the camera? Tap "Open camera again". Some browsers
        block auto-camera if you didn't tap something first.
      </div>
    </div>
  );
}

function SavedStep({ photo, onAnother, onDone }: { photo: StarPhoto; onAnother: () => void; onDone: () => void }) {
  return (
    <div style={{
      padding: 20, borderRadius: 18,
      background: "rgba(16,185,129,0.10)",
      border: "1px solid rgba(16,185,129,0.40)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#86efac" }}>
        ✅ Saved
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 12px" }}>
        Photo attached to {photo.studentName || "student"}
      </div>
      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
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

function primary(opts: { fullWidth?: boolean; large?: boolean } = {}): React.CSSProperties {
  return {
    width: opts.fullWidth ? "100%" : "auto",
    padding: opts.large ? "16px 18px" : "12px 16px",
    borderRadius: 12,
    background: "linear-gradient(135deg, #6366f1, #b23a48)",
    color: "white", border: "none",
    fontWeight: 800, fontSize: opts.large ? 18 : 15,
    cursor: "pointer",
    marginTop: 14,
    boxShadow: "0 8px 22px rgba(99,102,241,0.35)",
  };
}
function ghost(opts: { fullWidth?: boolean } = {}): React.CSSProperties {
  return {
    padding: "12px 16px", borderRadius: 10,
    background: "rgba(255,255,255,0.06)", color: "white",
    border: "1px solid rgba(255,255,255,0.18)",
    fontWeight: 700, cursor: "pointer", fontSize: 14,
    flexShrink: 0,
    width: opts.fullWidth ? "100%" : "auto",
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
