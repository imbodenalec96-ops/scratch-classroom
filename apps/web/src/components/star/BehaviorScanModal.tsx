// Behavior Incident Report — opens when a BH-{defId} barcode is
// scanned. Pick the kid, then fill out a full ABC-style report
// (antecedent / behavior / response / outcome) with optional
// severity, points, parent-notify, follow-up, and witnesses.
//
// Two save paths:
//   • "Quick log" — just student + behavior, no detail (for fast logs
//     during a calm-down where you can't write a full report yet).
//   • "Save full report" — saves all fields. Print button generates
//     a single-incident PDF for IEP team / admin documentation.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  StarStore,
  type StarStudent, type BehaviorDef, type BehaviorEvent, type BehaviorTemplate,
} from "../../lib/star/storage.ts";
import { api } from "../../lib/api.ts";
import { successBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";

interface Props {
  defId: string;
  onClose: () => void;
  /** Pre-pick a student (e.g. when the scan came from a folder label
   *  context). Omit to show the picker. */
  prePickedStudentId?: string;
  /** Force the full report form regardless of the behavior's tone.
   *  Used when the teacher explicitly clicks "Write a full report"
   *  from the folder modal. Default false: only challenge-tone
   *  behaviors open the form; positive/neutral auto-quick-log. */
  forceFullReport?: boolean;
}

const TONE_COLOR: Record<BehaviorDef["tone"], string> = {
  positive:  "#10b981",
  neutral:   "#3b82f6",
  challenge: "#f59e0b",
};

const LOCATIONS = ["Classroom", "Hallway", "Specials", "Cafeteria", "Recess", "Bathroom", "Office", "Other"];

const DEFAULT_REPORTER_KEY = "star_behavior_reporter_name";

export default function BehaviorScanModal({ defId, onClose, prePickedStudentId, forceFullReport }: Props) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [defs] = useState<BehaviorDef[]>(() => StarStore.getBehaviorDefs());
  const def = useMemo(() => defs.find((d) => d.id === defId), [defs, defId]);

  // The full ABC report only makes sense for "challenge" behaviors
  // — that's when teachers need to document antecedent / response /
  // outcome / severity etc. Positive + neutral behaviors auto-
  // quick-log instead. Override with forceFullReport from the
  // folder modal's "Write a full report" button.
  const isReportable = forceFullReport || def?.tone === "challenge";

  // Pick step → form step. If the behavior isn't reportable AND a
  // student is already pre-picked, we'll quick-log + close in an
  // effect below so the teacher doesn't get a useless empty form.
  const [studentId, setStudentId] = useState<string>(prePickedStudentId || (def?.scope === "student" && def.studentId ? def.studentId : ""));
  const [stage, setStage] = useState<"pick" | "form">(
    studentId && isReportable ? "form" : "pick"
  );

  // Form fields
  const [whenLocal, setWhenLocal] = useState<string>(() => {
    const d = new Date();
    // datetime-local needs YYYY-MM-DDTHH:MM in local time
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [location, setLocation] = useState<string>("Classroom");
  const [durationMin, setDurationMin] = useState<string>("");
  const [antecedent, setAntecedent] = useState<string>("");
  const [behaviorDetail, setBehaviorDetail] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5 | 0>(0);  // 0 = not set
  const [pointsDelta, setPointsDelta] = useState<number>(0);
  const [parentNotified, setParentNotified] = useState<boolean>(false);
  const [parentNotifyMethod, setParentNotifyMethod] = useState<NonNullable<BehaviorEvent["parentNotifyMethod"]>>("classdojo");
  const [followUp, setFollowUp] = useState<string>("");
  const [witnesses, setWitnesses] = useState<string>("");
  const [reporterName, setReporterName] = useState<string>(() => {
    try { return localStorage.getItem(DEFAULT_REPORTER_KEY) || ""; } catch { return ""; }
  });
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("");
  const [templates, setTemplates] = useState<BehaviorTemplate[]>(() => StarStore.getBehaviorTemplates());
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  // Quick-log time picker — defaults to "now" but can be back-
  // dated. Used by the pick-stage tile-tap so the actual incident
  // time is recorded, not the time the teacher got around to
  // tapping the chip. Synced with the form's whenLocal so going
  // pick → form preserves the chosen time.
  const [quickWhenLocal, setQuickWhenLocal] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [quickShiftMin, setQuickShiftMin] = useState<number>(0);  // for the -5/-10/-15 quick-shift chips
  const computeQuickTs = () => {
    const base = quickWhenLocal ? new Date(quickWhenLocal) : new Date();
    if (quickShiftMin) base.setMinutes(base.getMinutes() - quickShiftMin);
    return base.toISOString();
  };

  const [photoPath, setPhotoPath] = useState<string>("");
  const [photoUploading, setPhotoUploading] = useState(false);

  // Reads + downscales a photo, then uploads to Supabase Storage so
  // it lives outside localStorage (which previously filled up and
  // silently dropped saves). We keep a downsized preview as a data
  // URL just for the modal's local preview, but persistence on the
  // event uses `photoPath` (the bucket path) — readers convert it
  // back to a public URL on demand.
  const onPhotoSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const max = 640;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        setPhotoDataUrl(dataUrl); // local preview only
        setPhotoPath("");
        setPhotoUploading(true);
        try {
          const { uploadPhotoFromDataUrl } = await import("../../lib/star/supabase.ts");
          const result = await uploadPhotoFromDataUrl(dataUrl, `bh-${Date.now()}`);
          if (result) {
            setPhotoPath(result.path);
            // Replace local preview with the bucket URL so the
            // saved event references the small remote URL instead
            // of carrying the full base64 around.
            setPhotoDataUrl(result.publicUrl);
          }
        } catch (e: any) {
          console.warn("[behavior photo upload]", e?.message || e);
        } finally {
          setPhotoUploading(false);
        }
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  };

  const insertTemplate = (t: BehaviorTemplate) => {
    const append = (cur: string) => (cur.trim() ? cur.trim() + " " + t.body : t.body);
    if (t.field === "antecedent") setAntecedent((cur) => append(cur));
    else if (t.field === "response") setResponse((cur) => append(cur));
    else if (t.field === "outcome") setOutcome((cur) => append(cur));
  };

  const saveAsTemplate = (field: BehaviorTemplate["field"], body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const label = window.prompt(`Short label for this ${field} template?`, trimmed.slice(0, 28));
    if (!label) return;
    const t: BehaviorTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: label.trim(), field, body: trimmed,
      createdDate: new Date().toISOString(),
    };
    StarStore.addBehaviorTemplate(t);
    setTemplates(StarStore.getBehaviorTemplates());
  };

  const removeTemplate = (id: string) => {
    if (!window.confirm("Delete this template?")) return;
    StarStore.removeBehaviorTemplate(id);
    setTemplates(StarStore.getBehaviorTemplates());
  };

  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [savedEvent, setSavedEvent] = useState<BehaviorEvent | null>(null);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-quick-log + close when a non-reportable behavior (positive
  // / neutral) is opened with a kid already pre-picked. Uses "now"
  // since there's no chance to set the time when auto-logging.
  useEffect(() => {
    if (!def || isReportable) return;
    if (!prePickedStudentId) return;
    StarStore.recordBehavior(def.id, prePickedStudentId);
    successBeep();
    loggedBeep();
    setTimeout(() => onClose(), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for STU-{id} barcode scans on the keyboard. Hand-scanners
  // type the code character-by-character then press Enter — same as
  // the global scanner. We capture STU- specifically so the teacher
  // can scan a folder label here to pick the kid without tapping.
  // Active in BOTH stages: pick stage advances to the form, form
  // stage swaps the picked kid to the scanned one.
  const stuBufRef = useRef<string>("");
  const stuTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const flush = () => {
      const v = stuBufRef.current.toUpperCase();
      stuBufRef.current = "";
      const m = /^STU-(.+)$/.exec(v);
      if (!m) return;
      const sidLower = m[1].toLowerCase();
      // Case-insensitive roster match — UUIDs may be mixed case.
      const matched = students.find((s) => s.id.toLowerCase() === sidLower);
      if (!matched) {
        showFlash("err", "Scanned student isn't on the roster");
        return;
      }
      // Per-kid behaviors: only allow scanning that one student.
      if (def?.scope === "student" && def.studentId && def.studentId.toLowerCase() !== sidLower) {
        showFlash("err", "This behavior is locked to a different student");
        return;
      }
      setStudentId(matched.id);
      setStage("form");
      successBeep();
      showFlash("ok", `Picked ${matched.firstName || "kid"} via scan`);
    };
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in form fields.
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      if (e.key === "Enter") {
        if (stuBufRef.current.length > 2) {
          if (stuTimerRef.current) { window.clearTimeout(stuTimerRef.current); stuTimerRef.current = null; }
          flush();
        }
        return;
      }
      // Ignore non-character keys
      if (e.key.length !== 1) return;
      stuBufRef.current += e.key;
      if (stuTimerRef.current) window.clearTimeout(stuTimerRef.current);
      stuTimerRef.current = window.setTimeout(() => {
        if (stuBufRef.current.length > 2) flush();
        else stuBufRef.current = "";
      }, 100);
    };
    // Paste handler — Cmd+V'd STU-{id} also picks the kid.
    function onPaste(e: ClipboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      const text = (e.clipboardData?.getData("text") || "").trim().toUpperCase();
      const m = /^STU-(.+)$/.exec(text);
      if (!m) return;
      e.preventDefault();
      stuBufRef.current = text;
      flush();
    }

    window.addEventListener("keypress", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keypress", onKey);
      window.removeEventListener("paste", onPaste);
      if (stuTimerRef.current) window.clearTimeout(stuTimerRef.current);
    };
  }, [def, students]);

  const showFlash = (kind: "ok" | "err", text: string, ms = 2200) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), ms);
  };

  const student = students.find((s) => s.id === studentId);

  const quickLog = (sid: string) => {
    if (!def) return;
    const ts = computeQuickTs();
    StarStore.recordBehavior(def.id, sid, undefined, ts);
    loggedBeep();
    successBeep();
    const stu = students.find((s) => s.id === sid);
    const tShort = new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    showFlash("ok", `Logged at ${tShort} · ${def.emoji} ${def.label} for ${stu?.firstName || "kid"}`);
    setTimeout(() => onClose(), 700);
  };

  const saveFullReport = async () => {
    if (!def || !studentId) return;
    setBusy(true);
    try {
      // Build the event from form fields.
      const ts = whenLocal ? new Date(whenLocal).toISOString() : new Date().toISOString();
      const dateOnly = ts.slice(0, 10);
      const dur = Number(durationMin);
      const { event } = StarStore.recordBehaviorReport({
        defId: def.id,
        studentId,
        ts,
        date: dateOnly,
        location: location.trim() || undefined,
        durationMin: Number.isFinite(dur) && dur > 0 ? dur : undefined,
        antecedent: antecedent.trim() || undefined,
        behaviorDetail: behaviorDetail.trim() || undefined,
        response: response.trim() || undefined,
        outcome: outcome.trim() || undefined,
        severity: severity === 0 ? undefined : severity,
        pointsDelta: pointsDelta || undefined,
        parentNotified: parentNotified || undefined,
        parentNotifyMethod: parentNotified ? parentNotifyMethod : undefined,
        followUp: followUp.trim() || undefined,
        witnesses: witnesses.trim() || undefined,
        reporterName: reporterName.trim() || undefined,
        // Prefer the bucket path — keeps localStorage small. The
        // public URL is reconstructed at read time via Supabase
        // Storage.getPublicUrl().
        photoPath: photoPath || undefined,
        // Only persist the raw data URL when the upload failed, so
        // the photo isn't lost. The sync layer skips this field —
        // local-only fallback.
        photoDataUrl: photoPath ? undefined : (photoDataUrl || undefined),
      });
      // Persist reporter name for next time.
      try { if (reporterName.trim()) localStorage.setItem(DEFAULT_REPORTER_KEY, reporterName.trim()); } catch {}
      // Side-effect: award points if the form set any.
      if (pointsDelta !== 0) {
        try { await api.addPoints(studentId, pointsDelta); } catch {}
      }
      loggedBeep();
      setSavedEvent(event);
      showFlash("ok", `Report saved for ${student?.firstName || "kid"}`, 4000);
    } catch (e: any) {
      errorBeep();
      showFlash("err", `Failed: ${e?.message || "couldn't save"}`);
    } finally {
      setBusy(false);
    }
  };

  const printReport = () => {
    if (!savedEvent || !def || !student) return;
    openIncidentPrintWindow(student, def, savedEvent);
  };

  if (!def) {
    return (
      <Backdrop onClose={onClose}>
        <div style={panel()}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fce7f3", marginBottom: 8 }}>Behavior not found</h1>
          <p style={{ color: "rgba(196,181,253,0.65)", marginBottom: 12 }}>
            That barcode doesn't match any behavior definition. Open <b>/star → 📈 Behavior</b> to add it.
          </p>
          <button onClick={onClose} style={primary(false)}>Close</button>
        </div>
      </Backdrop>
    );
  }

  const c = TONE_COLOR[def.tone];

  // ── PICK STAGE ────────────────────────────────────────────────
  if (stage === "pick") {
    const eligible = def.scope === "student" && def.studentId
      ? students.filter((s) => s.id === def.studentId)
      : students;
    return (
      <Backdrop onClose={onClose}>
        <div style={panel()}>
          <Header def={def} onClose={onClose} />
          {flash && <Flash flash={flash} />}
          <div style={{
            padding: "10px 14px", borderRadius: 10, marginBottom: 12,
            background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
            border: "1.5px dashed rgba(168,85,247,0.45)",
            fontSize: 12, color: "#fce7f3", fontWeight: 700, lineHeight: 1.5,
          }}>
            🔍 <b style={{ color: "#f9a8d4" }}>Scan a folder label</b> (the kid's STU- barcode) to pick that student instantly — fastest way. Or tap a tile below.
          </div>
          {/* When-did-this-happen picker — applies to quick-log
              taps. Defaults to now; the chips quickly back-date by
              5/10/15 minutes for the common "I'm logging this a
              few minutes after it happened" case. */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center",
            padding: "8px 12px", borderRadius: 10, marginBottom: 10,
            background: "rgba(168,85,247,0.06)",
            border: "1px solid rgba(168,85,247,0.30)",
          }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 4 }}>
                ⏰ When did this happen?
              </div>
              <input
                type="datetime-local"
                value={quickWhenLocal}
                onChange={(e) => { setQuickWhenLocal(e.target.value); setQuickShiftMin(0); }}
                style={{
                  padding: "7px 10px", borderRadius: 8,
                  background: "rgba(0,0,0,0.30)", color: "white",
                  border: "1px solid rgba(168,85,247,0.25)",
                  fontSize: 13, outline: "none", fontFamily: "Menlo, monospace",
                  width: "100%", maxWidth: 260, boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)" }}>
                Backdate
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 5, 10, 15].map((m) => (
                  <button
                    key={m}
                    onClick={() => setQuickShiftMin(m)}
                    style={{
                      padding: "5px 8px", borderRadius: 6,
                      background: quickShiftMin === m ? "rgba(168,85,247,0.30)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${quickShiftMin === m ? "rgba(168,85,247,0.55)" : "rgba(255,255,255,0.10)"}`,
                      color: quickShiftMin === m ? "#f9a8d4" : "rgba(245,241,232,0.65)",
                      fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "Menlo, monospace",
                    }}
                  >{m === 0 ? "now" : `−${m}m`}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 8 }}>
            {isReportable
              ? `Pick a kid · single-tap = quick log · "+" = full ABC report`
              : `Pick a kid · single-tap to log this ${def.tone} behavior`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
            {eligible.map((s) => (
              <div key={s.id} style={{ position: "relative" }}>
                <button
                  onClick={() => quickLog(s.id)}
                  style={{
                    width: "100%", padding: "12px 8px", borderRadius: 12,
                    background: "linear-gradient(180deg, rgba(168,85,247,0.10) 0%, rgba(99,102,241,0.05) 100%)",
                    border: "1px solid rgba(168,85,247,0.30)",
                    color: "#fce7f3", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    touchAction: "manipulation",
                  }}
                  title="Tap to log instantly · use + to write a full report"
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 900, color: "white",
                  }}>{(s.firstName || "?")[0].toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{s.firstName}</div>
                </button>
                {isReportable && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setStudentId(s.id); setStage("form"); }}
                    style={{
                      position: "absolute", top: 4, right: 4,
                      width: 24, height: 24, borderRadius: 6,
                      background: `${c}33`, border: `1px solid ${c}77`,
                      color: c, fontSize: 13, fontWeight: 900, cursor: "pointer",
                    }}
                    aria-label="Open full report form"
                    title="Write a full incident report"
                  >+</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Backdrop>
    );
  }

  // ── FORM STAGE ────────────────────────────────────────────────
  return (
    <Backdrop onClose={onClose}>
      <div style={panel()}>
        <Header def={def} onClose={onClose} />

        {/* Student banner */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
          borderRadius: 12, marginBottom: 12,
          background: "rgba(168,85,247,0.08)",
          border: "1px solid rgba(168,85,247,0.30)",
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900, color: "white", flexShrink: 0,
          }}>{(student?.firstName || "?")[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)" }}>
              Incident report for
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fce7f3" }}>
              {student?.firstName} {student?.lastName}{student?.grade ? <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.65, marginLeft: 6 }}>· {student.grade}</span> : null}
            </div>
          </div>
          {!prePickedStudentId && (
            <button onClick={() => setStage("pick")} style={ghost()}>← Change kid</button>
          )}
        </div>

        {flash && <Flash flash={flash} />}

        {savedEvent ? (
          <Saved
            student={student!}
            def={def}
            onPrint={printReport}
            onCloseModal={onClose}
            onAnotherForKid={() => { setSavedEvent(null); }}
          />
        ) : (
          <>
            {/* When + Where + Duration */}
            <Row>
              <Field label="When">
                <input type="datetime-local" value={whenLocal} onChange={(e) => setWhenLocal(e.target.value)} style={inp()} />
              </Field>
              <Field label="Where">
                <select value={location} onChange={(e) => setLocation(e.target.value)} style={inp()}>
                  {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Duration (min)">
                <input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="optional" style={inp()} />
              </Field>
            </Row>

            <FieldWithTemplates
              label="A · Antecedent — what happened RIGHT BEFORE"
              field="antecedent"
              value={antecedent}
              onChange={setAntecedent}
              placeholder="e.g. Asked to put away iPad before transitioning to math"
              templates={templates.filter((t) => t.field === "antecedent")}
              onTemplate={insertTemplate}
              onSaveAsTemplate={() => saveAsTemplate("antecedent", antecedent)}
              onRemoveTemplate={removeTemplate}
            />
            <Field label="B · Behavior — what the kid actually did">
              <textarea value={behaviorDetail} onChange={(e) => setBehaviorDetail(e.target.value)} rows={3} placeholder="Describe the behavior in observable terms (what you'd write in an IEP — what you saw + heard, not what you guessed)" style={ta()} />
            </Field>
            <FieldWithTemplates
              label="C · Consequence — what I tried + how it ended"
              field="response"
              value={response}
              onChange={setResponse}
              placeholder="Strategies you used. e.g. Offered a 5-min break, used calm voice, gave 2 choices…"
              templates={templates.filter((t) => t.field === "response")}
              onTemplate={insertTemplate}
              onSaveAsTemplate={() => saveAsTemplate("response", response)}
              onRemoveTemplate={removeTemplate}
            />
            <FieldWithTemplates
              label="Outcome / where the kid landed"
              field="outcome"
              value={outcome}
              onChange={setOutcome}
              placeholder="e.g. Returned to math after 8 min, completed 3 of 5 problems"
              templates={templates.filter((t) => t.field === "outcome")}
              onTemplate={insertTemplate}
              onSaveAsTemplate={() => saveAsTemplate("outcome", outcome)}
              onRemoveTemplate={removeTemplate}
              rows={2}
            />

            {/* Severity 1-5 */}
            <Field label="Severity">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { n: 1, label: "1 · Mild reminder" },
                  { n: 2, label: "2 · Brief" },
                  { n: 3, label: "3 · Moderate" },
                  { n: 4, label: "4 · Disruptive" },
                  { n: 5, label: "5 · Crisis" },
                ].map((opt) => (
                  <button key={opt.n} onClick={() => setSeverity(severity === opt.n ? 0 : opt.n as any)} style={{
                    padding: "8px 12px", borderRadius: 999,
                    background: severity === opt.n ? `${c}30` : "rgba(255,255,255,0.04)",
                    border: severity === opt.n ? `1.5px solid ${c}` : "1px solid rgba(255,255,255,0.10)",
                    color: severity === opt.n ? c : "rgba(245,241,232,0.65)",
                    fontSize: 12, fontWeight: 800, cursor: "pointer",
                  }}>{opt.label}</button>
                ))}
              </div>
            </Field>

            {/* Points */}
            <Field label="Points (optional)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[-5, -1, 0, 1, 2, 5].map((n) => (
                  <button key={n} onClick={() => setPointsDelta(n)} style={{
                    padding: "8px 14px", borderRadius: 8, fontFamily: "Menlo, monospace",
                    background: pointsDelta === n
                      ? (n > 0 ? "rgba(16,185,129,0.30)" : n < 0 ? "rgba(239,68,68,0.30)" : "rgba(168,85,247,0.30)")
                      : "rgba(255,255,255,0.04)",
                    border: pointsDelta === n
                      ? `1.5px solid ${n > 0 ? "#10b981" : n < 0 ? "#ef4444" : "#a855f7"}`
                      : "1px solid rgba(255,255,255,0.10)",
                    color: pointsDelta === n
                      ? (n > 0 ? "#bbf7d0" : n < 0 ? "#fca5a5" : "#f9a8d4")
                      : "rgba(245,241,232,0.85)",
                    fontSize: 13, fontWeight: 800, cursor: "pointer",
                  }}>{n === 0 ? "no change" : n > 0 ? `+${n}` : n}</button>
                ))}
              </div>
            </Field>

            {/* Parent notified */}
            <Field label="Parent notified?">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#fce7f3", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={parentNotified} onChange={(e) => setParentNotified(e.target.checked)} style={{ accentColor: "#a855f7" }} />
                  Yes
                </label>
                {parentNotified && (
                  <select value={parentNotifyMethod} onChange={(e) => setParentNotifyMethod(e.target.value as any)} style={inp()}>
                    <option value="classdojo">via ClassDojo</option>
                    <option value="phone">Phone</option>
                    <option value="email">Email</option>
                    <option value="in-person">In person</option>
                  </select>
                )}
              </div>
            </Field>

            <Field label="Follow-up needed (optional)">
              <textarea value={followUp} onChange={(e) => setFollowUp(e.target.value)} rows={2} placeholder="Anything still owed — counselor referral, BIP review, parent meeting, etc." style={ta()} />
            </Field>

            <Row>
              <Field label="Witnesses (optional)">
                <input value={witnesses} onChange={(e) => setWitnesses(e.target.value)} placeholder="Other staff / kids present" style={inp()} />
              </Field>
              <Field label="Reporter (your name)">
                <input value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="Mrs. Imboden" style={inp()} />
              </Field>
            </Row>

            {/* Photo attachment — opens the camera on iPad / phone */}
            <Field label="Photo (optional) — refused work / damaged item / calm-corner usage">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPhotoSelected(f);
                    if (photoInputRef.current) photoInputRef.current.value = "";
                  }}
                />
                <button
                  onClick={() => photoInputRef.current?.click()}
                  style={{
                    padding: "9px 14px", borderRadius: 8,
                    background: "rgba(168,85,247,0.15)",
                    border: "1px solid rgba(168,85,247,0.40)",
                    color: "#fce7f3", fontWeight: 800, fontSize: 13, cursor: "pointer",
                    flex: 1, textAlign: "left",
                  }}
                >📷 {photoUploading ? "Uploading…" : photoDataUrl ? "Replace photo" : "Add a photo"}</button>
                {photoDataUrl && (
                  <button
                    onClick={() => { setPhotoDataUrl(""); setPhotoPath(""); }}
                    style={{
                      padding: "9px 14px", borderRadius: 8,
                      background: "rgba(239,68,68,0.15)",
                      border: "1px solid rgba(239,68,68,0.45)",
                      color: "#fca5a5", fontWeight: 800, fontSize: 13, cursor: "pointer",
                    }}
                  >✕ Remove</button>
                )}
              </div>
              {photoDataUrl && (
                <div style={{ marginTop: 8, padding: 6, borderRadius: 8, background: "rgba(0,0,0,0.30)", border: "1px solid rgba(168,85,247,0.30)" }}>
                  <img src={photoDataUrl} alt="" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 4, display: "block", margin: "0 auto" }} />
                </div>
              )}
            </Field>

            <div style={{
              display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16,
              borderTop: "1px solid rgba(168,85,247,0.20)", paddingTop: 12,
            }}>
              <button
                onClick={() => quickLog(studentId)}
                disabled={busy}
                style={ghost()}
                title="Log without filling anything else out"
              >⚡ Quick log only</button>
              <button onClick={saveFullReport} disabled={busy} style={primary(busy)}>
                {busy ? "Saving…" : "💾 Save full report"}
              </button>
            </div>
          </>
        )}
      </div>
    </Backdrop>
  );
}

function Saved({ student, def, onPrint, onCloseModal, onAnotherForKid }: {
  student: StarStudent; def: BehaviorDef;
  onPrint: () => void; onCloseModal: () => void; onAnotherForKid: () => void;
}) {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: "rgba(16,185,129,0.10)",
      border: "1.5px solid rgba(16,185,129,0.45)",
      color: "#bbf7d0", marginTop: 8,
    }}>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>
        ✅ Report saved
      </div>
      <div style={{ fontSize: 13, marginBottom: 12, color: "#dcfce7" }}>
        {def.emoji} {def.label} · for <b>{student.firstName} {student.lastName}</b> · stored locally and visible in /star → 📈 Behavior.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button onClick={onPrint} style={primary(false)}>🖨 Print this report</button>
        <button onClick={onAnotherForKid} style={ghost()}>+ Another for this kid</button>
        <button onClick={onCloseModal} style={ghost()}>Done</button>
      </div>
    </div>
  );
}

function Header({ def, onClose }: { def: BehaviorDef; onClose: () => void }) {
  const c = TONE_COLOR[def.tone];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      borderRadius: 12, marginBottom: 12,
      background: `${c}1a`,
      border: `1.5px solid ${c}77`,
    }}>
      <div style={{ fontSize: 32, lineHeight: 1 }}>{def.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: c }}>
          📈 Behavior incident report
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fce7f3" }}>{def.label}</div>
      </div>
      <button onClick={onClose} aria-label="Close" style={closeBtn()}>✕</button>
    </div>
  );
}

function Flash({ flash }: { flash: { kind: "ok" | "err"; text: string } }) {
  return (
    <div role="status" aria-live="polite" style={{
      padding: "10px 14px", borderRadius: 10, marginBottom: 12,
      background: flash.kind === "ok" ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)",
      border: `1px solid ${flash.kind === "ok" ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"}`,
      color: flash.kind === "ok" ? "#bbf7d0" : "#fca5a5",
      fontWeight: 800, fontSize: 13, textAlign: "center",
    }}>{flash.text}</div>
  );
}

/* ── single-incident print template ─────────────────────────────── */

// Mirrors the layout of a standard district behavior incident form so
// it can be dropped into a kid's working folder or attached to an FBA
// without looking like a classroom printout. Serif type, plain B&W
// with a single navy accent, tabular fact sheet, FERPA confidentiality
// footer, and three signature lines (reporter, administrator, parent
// acknowledgment).
export function openIncidentPrintWindow(student: StarStudent, def: BehaviorDef, e: BehaviorEvent) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const dt = new Date(e.ts);
  const reportTs = new Date();
  const dateLabel  = dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const dowLabel   = dt.toLocaleDateString("en-US", { weekday: "long" });
  const timeLabel  = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const reportDate = reportTs.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const reportTime = reportTs.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Stable, human-readable case number that's reproducible from the
  // entry id (so duplicate prints reference the same case).
  const caseNo = (e.id || "").replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase().padStart(8, "0");
  const caseLabel = `BIR-${dt.getUTCFullYear()}-${caseNo}`;

  const sevLabel = (n?: number) =>
    !n ? "—" : ["", "Level 1 — Minor (verbal redirection)", "Level 2 — Brief disruption", "Level 3 — Moderate disruption", "Level 4 — Significant disruption", "Level 5 — Crisis / safety risk"][n];
  const toneLabel = def.tone === "positive" ? "Positive recognition" : def.tone === "challenge" ? "Challenging behavior" : "Neutral observation";
  const yn = (v?: boolean) => (v ? "Yes" : "No");
  const orDash = (s?: string) => (s && s.trim() ? escapeHtml(s) : `<span class="empty">Not recorded</span>`);
  const factRow = (label: string, value: string) => `
    <tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;

  const html = `<!doctype html><html><head><title>Behavior Incident Report — ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)} — ${dateLabel}</title>
    <style>
      @media print {
        @page { size: letter; margin: 0.7in 0.6in 0.65in 0.6in; }
        .no-print { display: none !important; }
        body { background: white !important; }
      }
      :root { --ink: #111; --rule: #222; --accent: #1e3a8a; --muted: #555; --soft: #f6f7fa; }
      * { box-sizing: border-box; }
      body { font-family: "Georgia", "Times New Roman", Times, serif; color: var(--ink); margin: 0; padding: 0; line-height: 1.45; background: #e9ecef; }
      .toolbar { padding: 10px 24px; background: #1e3a8a; color: white; display: flex; justify-content: space-between; align-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-weight: 700; font-size: 13px; }
      .toolbar button { padding: 7px 14px; border-radius: 4px; border: 1px solid #ffffff; background: white; color: #1e3a8a; font-weight: 700; cursor: pointer; font-size: 12px; }
      .sheet { background: white; max-width: 7.4in; margin: 18px auto; padding: 0.4in 0.5in; border: 1px solid #cbd5e1; }
      @media print { .sheet { margin: 0; max-width: none; border: none; padding: 0; } }

      /* ── Letterhead ────────────────────────────────────────── */
      .letterhead { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: flex-end; border-bottom: 3px double var(--accent); padding-bottom: 10px; margin-bottom: 14px; }
      .lh-school { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.16em; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; }
      .lh-title { font-size: 22px; font-weight: 700; color: var(--accent); letter-spacing: 0.02em; margin-top: 4px; }
      .lh-sub { font-size: 11px; color: var(--muted); margin-top: 3px; font-style: italic; }
      .lh-meta { text-align: right; font-size: 10.5px; color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      .lh-meta div + div { margin-top: 2px; }
      .lh-meta b { color: var(--accent); letter-spacing: 0.04em; text-transform: uppercase; font-size: 9.5px; display: block; margin-bottom: 1px; }

      /* ── Section headings ──────────────────────────────────── */
      h2.sec { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); border-bottom: 1px solid var(--rule); padding: 10px 0 4px; margin: 14px 0 8px; }
      h2.sec .roman { font-family: "Georgia", serif; font-weight: 700; letter-spacing: 0.04em; margin-right: 8px; }

      /* ── Fact table ────────────────────────────────────────── */
      table.facts { width: 100%; border-collapse: collapse; font-size: 11.5px; }
      table.facts th, table.facts td { border: 1px solid var(--rule); padding: 5px 8px; text-align: left; vertical-align: top; }
      table.facts th { background: var(--soft); width: 28%; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); }
      table.facts td { font-family: "Georgia", serif; }

      /* ── ABC narrative ─────────────────────────────────────── */
      .abc-block { border: 1px solid var(--rule); padding: 10px 12px; margin-bottom: 8px; background: white; page-break-inside: avoid; }
      .abc-label { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 10px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
      .abc-body { font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; min-height: 32px; }
      .empty { color: #9aa0a6; font-style: italic; }

      /* ── Signature block ───────────────────────────────────── */
      .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px 32px; margin-top: 12px; }
      .sign-cell { border-top: 1.5px solid var(--rule); padding-top: 4px; }
      .sign-label { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
      .sign-printed { font-size: 11.5px; margin-top: 1px; color: var(--ink); min-height: 18px; }
      .sign-date { font-size: 10px; color: var(--muted); margin-top: 1px; }

      /* ── Photo evidence ────────────────────────────────────── */
      .photo-frame { border: 1px solid var(--rule); padding: 8px; background: white; text-align: center; }
      .photo-frame img { max-width: 100%; max-height: 2.6in; display: block; margin: 0 auto; }
      .photo-cap { font-size: 9.5px; color: var(--muted); margin-top: 4px; font-style: italic; }

      /* ── Footer / confidentiality ──────────────────────────── */
      .footnote { margin-top: 18px; padding-top: 8px; border-top: 1px solid #aaa; font-size: 8.5px; color: var(--muted); font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.55; }
      .footnote b { color: var(--accent); }
    </style></head><body>
    <div class="toolbar no-print">
      <div>Behavior Incident Report · Case ${escapeHtml(caseLabel)}</div>
      <button onclick="window.print()">Print</button>
    </div>
    <section class="sheet">

      <header class="letterhead">
        <div>
          <div class="lh-school">STAR Room · Special Education Services</div>
          <div class="lh-title">Behavior Incident Report</div>
          <div class="lh-sub">Confidential student record — for school use only</div>
        </div>
        <div class="lh-meta">
          <div><b>Case No.</b>${escapeHtml(caseLabel)}</div>
          <div><b>Report Generated</b>${escapeHtml(reportDate)} · ${escapeHtml(reportTime)}</div>
        </div>
      </header>

      <h2 class="sec"><span class="roman">I.</span>Student Information</h2>
      <table class="facts">
        ${factRow("Student name", `${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}`)}
        ${factRow("Grade level", student.grade ? `Grade ${escapeHtml(student.grade)}` : "—")}
        ${factRow("Classroom", "STAR Room — Mrs. Imboden")}
        ${factRow("IEP / 504 on file", student.iep ? "Yes (IEP)" : "—")}
      </table>

      <h2 class="sec"><span class="roman">II.</span>Incident Summary</h2>
      <table class="facts">
        ${factRow("Date of incident", `${escapeHtml(dowLabel)}, ${escapeHtml(dateLabel)}`)}
        ${factRow("Time of incident", escapeHtml(timeLabel))}
        ${factRow("Location", e.location ? escapeHtml(e.location) : "—")}
        ${factRow("Duration", e.durationMin ? `${e.durationMin} minute${e.durationMin === 1 ? "" : "s"}` : "—")}
        ${factRow("Behavior category", `${escapeHtml(toneLabel)} · ${escapeHtml(def.label)}`)}
        ${factRow("Severity rating", escapeHtml(sevLabel(e.severity)))}
        ${factRow("Behavior points adjustment", typeof e.pointsDelta === "number" ? (e.pointsDelta > 0 ? `+${e.pointsDelta}` : String(e.pointsDelta)) : "—")}
        ${factRow("Witnesses present", e.witnesses ? escapeHtml(e.witnesses) : "None reported")}
      </table>

      <h2 class="sec"><span class="roman">III.</span>Antecedent — Behavior — Consequence (ABC) Analysis</h2>
      <div class="abc-block">
        <div class="abc-label">A · Antecedent — Conditions and events immediately preceding the behavior</div>
        <div class="abc-body">${orDash(e.antecedent)}</div>
      </div>
      <div class="abc-block">
        <div class="abc-label">B · Behavior — Observable actions of the student</div>
        <div class="abc-body">${orDash(e.behaviorDetail)}</div>
      </div>
      <div class="abc-block">
        <div class="abc-label">C · Consequence / Staff response — Intervention used and student's response</div>
        <div class="abc-body">${orDash(e.response)}</div>
      </div>
      <div class="abc-block">
        <div class="abc-label">Outcome / Resolution — How the incident concluded; student's location and state at close</div>
        <div class="abc-body">${orDash(e.outcome)}</div>
      </div>

      <h2 class="sec"><span class="roman">IV.</span>Parent / Guardian Notification</h2>
      <table class="facts">
        ${factRow("Parent contacted", yn(!!e.parentNotified))}
        ${factRow("Method of contact", e.parentNotified && e.parentNotifyMethod ? escapeHtml(String(e.parentNotifyMethod)) : "—")}
        ${factRow("Date of contact", e.parentNotified ? `${escapeHtml(dateLabel)}` : "—")}
      </table>

      <h2 class="sec"><span class="roman">V.</span>Follow-Up Plan</h2>
      <div class="abc-block">
        <div class="abc-body">${orDash(e.followUp)}</div>
      </div>

      ${(e.photoDataUrl || (e as any).photoPath) ? `<h2 class="sec"><span class="roman">VI.</span>Photographic Evidence</h2>
        <div class="photo-frame">
          <img src="${escapeHtml(e.photoDataUrl || "")}" alt="Photographic evidence attached to case ${escapeHtml(caseLabel)}" />
          <div class="photo-cap">Attached to Case ${escapeHtml(caseLabel)} · ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}</div>
        </div>` : ""}

      <h2 class="sec"><span class="roman">${(e.photoDataUrl || (e as any).photoPath) ? "VII." : "VI."}</span>Signatures</h2>
      <div class="sign-grid">
        <div class="sign-cell">
          <div class="sign-label">Reporting staff member</div>
          <div class="sign-printed">${e.reporterName ? escapeHtml(e.reporterName) : "&nbsp;"}</div>
          <div class="sign-date">Signature / Date: ____________________________</div>
        </div>
        <div class="sign-cell">
          <div class="sign-label">Building administrator / Case manager</div>
          <div class="sign-printed">&nbsp;</div>
          <div class="sign-date">Signature / Date: ____________________________</div>
        </div>
        <div class="sign-cell">
          <div class="sign-label">Parent / Guardian — acknowledgment of receipt</div>
          <div class="sign-printed">&nbsp;</div>
          <div class="sign-date">Signature / Date: ____________________________</div>
        </div>
        <div class="sign-cell">
          <div class="sign-label">Special education team lead (if applicable)</div>
          <div class="sign-printed">&nbsp;</div>
          <div class="sign-date">Signature / Date: ____________________________</div>
        </div>
      </div>

      <div class="footnote">
        <b>CONFIDENTIAL — STUDENT EDUCATION RECORD.</b> This document contains personally identifiable
        information protected under the Family Educational Rights and Privacy Act (FERPA, 20 U.S.C.
        § 1232g) and applicable state student-records law. Distribution is limited to school personnel
        with a legitimate educational interest and to the student's parent or legal guardian.
        Unauthorized disclosure is prohibited.
        &nbsp;·&nbsp; Case ${escapeHtml(caseLabel)} &nbsp;·&nbsp; Record id ${escapeHtml(e.id)}
      </div>
    </section>
    <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250))</script>
  </body></html>`;
  w.document.write(html);
  w.document.close();
}

/* ── tiny UI helpers ────────────────────────────────────────────── */

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, backdropFilter: "blur(4px)",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 760 }}>
        {children}
      </div>
    </div>
  );
}
function panel(): React.CSSProperties {
  return {
    background: "radial-gradient(900px 600px at 0% 0%, rgba(168,85,247,0.16) 0%, transparent 55%), radial-gradient(700px 500px at 100% 100%, rgba(236,72,153,0.14) 0%, transparent 55%), linear-gradient(180deg, #1a0f2e 0%, #0a0414 100%)",
    border: "1px solid rgba(168,85,247,0.30)",
    borderRadius: 22,
    padding: 22,
    color: "#f5f1e8",
    maxHeight: "92vh",
    overflow: "auto",
    boxShadow: "0 28px 72px -10px rgba(168,85,247,0.45)",
  };
}
function closeBtn(): React.CSSProperties {
  return {
    width: 40, height: 40, borderRadius: "50%",
    background: "rgba(168,85,247,0.10)", border: "1px solid rgba(168,85,247,0.30)",
    color: "#fce7f3", fontSize: 16, fontWeight: 700, cursor: "pointer",
    flexShrink: 0,
  };
}
function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: disabled ? "rgba(168,85,247,0.18)" : "linear-gradient(135deg, #6366f1, #a855f7, #ec4899)",
    color: "white", border: "none", fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
  };
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 10px", borderRadius: 8,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 13, outline: "none",
    boxSizing: "border-box",
  };
}
function ta(): React.CSSProperties {
  return {
    ...inp(),
    padding: "10px 12px",
    fontFamily: "inherit",
    resize: "vertical",
  } as React.CSSProperties;
}

function FieldWithTemplates({ label, field, value, onChange, placeholder, templates, onTemplate, onSaveAsTemplate, onRemoveTemplate, rows = 3 }: {
  label: string;
  field: BehaviorTemplate["field"];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  templates: BehaviorTemplate[];
  onTemplate: (t: BehaviorTemplate) => void;
  onSaveAsTemplate: () => void;
  onRemoveTemplate: (id: string) => void;
  rows?: number;
}) {
  void field;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)" }}>
          {label}
        </div>
        {value.trim().length > 8 && (
          <button
            onClick={onSaveAsTemplate}
            title="Save the current text as a reusable template"
            style={{
              padding: "3px 8px", borderRadius: 6,
              background: "rgba(168,85,247,0.10)",
              border: "1px solid rgba(168,85,247,0.30)",
              color: "#f9a8d4", fontSize: 10, fontWeight: 800, cursor: "pointer",
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >+ Save as template</button>
        )}
      </div>
      {templates.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {templates.map((t) => (
            <span key={t.id} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 4px 4px 10px", borderRadius: 999,
              background: "rgba(168,85,247,0.10)",
              border: "1px solid rgba(168,85,247,0.30)",
              fontSize: 11, fontWeight: 700, color: "#fce7f3",
            }}>
              <button
                onClick={() => onTemplate(t)}
                title={t.body}
                style={{
                  background: "transparent", border: "none", color: "inherit",
                  font: "inherit", cursor: "pointer", padding: 0,
                }}
              >📋 {t.label}</button>
              <button
                onClick={() => onRemoveTemplate(t.id)}
                title="Delete this template"
                style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: "rgba(239,68,68,0.10)",
                  border: "1px solid rgba(239,68,68,0.30)",
                  color: "#fca5a5", fontSize: 10, fontWeight: 800,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  marginLeft: 2,
                }}
              >✕</button>
            </span>
          ))}
        </div>
      )}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={ta()} />
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 8 }}>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
