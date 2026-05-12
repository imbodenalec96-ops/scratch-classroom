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

  // Reads + downscales a photo for storage. Big files in localStorage
  // crash localStorage quickly, so we cap to ~640px on the long side
  // and convert to JPEG ~0.75 quality (~80–150 KB typical).
  const onPhotoSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 640;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        setPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.75));
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
  // / neutral) is opened with a kid already pre-picked. There's no
  // form to fill in those cases — just log and dismiss.
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
    StarStore.recordBehavior(def.id, sid);
    loggedBeep();
    successBeep();
    const stu = students.find((s) => s.id === sid);
    showFlash("ok", `Quick log saved · ${def.emoji} ${def.label} for ${stu?.firstName || "kid"}`);
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
        photoDataUrl: photoDataUrl || undefined,
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
                >📷 {photoDataUrl ? "Replace photo" : "Add a photo"}</button>
                {photoDataUrl && (
                  <button
                    onClick={() => setPhotoDataUrl("")}
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

function openIncidentPrintWindow(student: StarStudent, def: BehaviorDef, e: BehaviorEvent) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const dt = new Date(e.ts);
  const dateLabel = dt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeLabel = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const tone = def.tone === "positive" ? "#10b981" : def.tone === "challenge" ? "#f59e0b" : "#3b82f6";
  const sevLabel = (n?: number) => n
    ? ["", "Mild reminder", "Brief", "Moderate", "Disruptive", "Crisis"][n]
    : "—";

  const html = `<!doctype html><html><head><title>Behavior Incident — ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)} — ${dateLabel}</title>
    <style>
      @media print { @page { size: letter; margin: 0.55in; } .no-print { display: none; } }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; padding: 0; margin: 0; line-height: 1.55; background: white; }
      .toolbar { padding: 12px 24px; background: #faf5ff; border-bottom: 1px solid #d8b4fe; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #4c1d95; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #6d28d9; background: #6d28d9; color: white; font-weight: 700; cursor: pointer; }
      .page { padding: 26px 32px; max-width: 720px; margin: 0 auto; }
      h1 { margin: 0 0 6px; font-size: 24px; letter-spacing: -0.02em; }
      .meta { font-size: 12px; color: #555; margin-bottom: 18px; }
      .hero { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 12px; background: linear-gradient(135deg, #faf5ff, #fdf2f8); border: 1.5px solid ${tone}; margin-bottom: 18px; }
      .hero .emoji { font-size: 38px; line-height: 1; }
      .hero .label { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${tone}; }
      .hero .name { font-size: 22px; font-weight: 900; color: #1f1235; margin-top: 2px; }
      h2 { font-size: 12px; margin: 18px 0 6px; letter-spacing: 0.10em; text-transform: uppercase; color: #4c1d95; border-bottom: 2px solid #ede9fe; padding-bottom: 4px; }
      .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
      .stat { padding: 8px 10px; border-radius: 8px; background: #faf5ff; border: 1px solid #d8b4fe; text-align: center; }
      .stat .n { font-size: 14px; font-weight: 900; color: #6d28d9; }
      .stat .l { font-size: 9px; font-weight: 800; color: #6d28d9; opacity: 0.75; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 2px; }
      .field { margin-bottom: 12px; }
      .field-label { font-size: 10px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: #6d28d9; margin-bottom: 4px; }
      .field-body { font-size: 13px; color: #1f1235; padding: 8px 10px; background: white; border: 1px solid #ede9fe; border-radius: 6px; min-height: 24px; white-space: pre-wrap; }
      .field-body.empty { color: #9ca3af; font-style: italic; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .footer { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .signlbl { font-size: 9px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: #555; }
      .signline { border-bottom: 1.5px solid #444; height: 30px; margin-top: 4px; }
      .footnote { margin-top: 14px; font-size: 9px; text-align: center; color: #888; }
    </style></head><body>
    <div class="toolbar no-print">
      <div>📈 Behavior Incident Report — ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>
    <section class="page">
      <h1>📈 Behavior Incident Report</h1>
      <div class="meta">${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}${e.location ? ` · ${escapeHtml(e.location)}` : ""}</div>

      <div class="hero">
        <div class="emoji">${escapeHtml(def.emoji)}</div>
        <div style="flex:1">
          <div class="label">${escapeHtml(def.tone.toUpperCase())} · ${escapeHtml(def.label)}</div>
          <div class="name">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}${student.grade ? ` · Grade ${escapeHtml(student.grade)}` : ""}</div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat"><div class="n">${e.severity ? sevLabel(e.severity) : "—"}</div><div class="l">Severity</div></div>
        <div class="stat"><div class="n">${e.durationMin ? `${e.durationMin} min` : "—"}</div><div class="l">Duration</div></div>
        <div class="stat"><div class="n">${typeof e.pointsDelta === "number" ? (e.pointsDelta > 0 ? `+${e.pointsDelta}` : e.pointsDelta) : "—"}</div><div class="l">Points</div></div>
        <div class="stat"><div class="n">${e.parentNotified ? "Yes" : "No"}</div><div class="l">Parent notified</div></div>
      </div>

      <h2>📍 ABC analysis</h2>
      <div class="field"><div class="field-label">Antecedent — what happened right before</div>
        <div class="field-body${e.antecedent ? "" : " empty"}">${e.antecedent ? escapeHtml(e.antecedent) : "Not recorded."}</div>
      </div>
      <div class="field"><div class="field-label">Behavior — what the student did</div>
        <div class="field-body${e.behaviorDetail ? "" : " empty"}">${e.behaviorDetail ? escapeHtml(e.behaviorDetail) : "Not recorded."}</div>
      </div>
      <div class="field"><div class="field-label">Consequence — what staff did + how it ended</div>
        <div class="field-body${e.response ? "" : " empty"}">${e.response ? escapeHtml(e.response) : "Not recorded."}</div>
      </div>
      <div class="field"><div class="field-label">Outcome / where the kid landed</div>
        <div class="field-body${e.outcome ? "" : " empty"}">${e.outcome ? escapeHtml(e.outcome) : "Not recorded."}</div>
      </div>

      ${e.parentNotified ? `<h2>📞 Parent contact</h2>
        <div class="field-body">Notified${e.parentNotifyMethod ? ` via <b>${escapeHtml(e.parentNotifyMethod)}</b>` : ""} on ${escapeHtml(dateLabel)}.</div>` : ""}

      ${e.followUp ? `<h2>🧭 Follow-up</h2>
        <div class="field-body">${escapeHtml(e.followUp)}</div>` : ""}

      ${e.witnesses ? `<h2>👀 Witnesses</h2><div class="field-body">${escapeHtml(e.witnesses)}</div>` : ""}

      ${e.photoDataUrl ? `<h2>📷 Photo evidence</h2>
        <div style="border: 1px solid #d8b4fe; border-radius: 8px; padding: 8px; background: #faf5ff; text-align: center;">
          <img src="${e.photoDataUrl}" alt="" style="max-width: 100%; max-height: 320px; border-radius: 6px;" />
        </div>` : ""}

      <div class="footer">
        <div>
          <div class="signlbl">Reporter signature</div>
          <div class="signline"></div>
          ${e.reporterName ? `<div class="signlbl" style="margin-top:4px;color:#1f1235">${escapeHtml(e.reporterName)}</div>` : ""}
        </div>
        <div>
          <div class="signlbl">Admin / case manager signature</div>
          <div class="signline"></div>
        </div>
      </div>

      <div class="footnote">Generated by STAR · single-incident report · entry id ${escapeHtml(e.id)}</div>
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
