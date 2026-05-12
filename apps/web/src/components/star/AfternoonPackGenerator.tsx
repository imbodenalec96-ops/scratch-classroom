// Bulk assignment generator. Picks a subject + difficulty, loops over
// every roster student (or a chosen subset), and generates one fresh
// assignment per kid — each with its own barcode + lesson + question
// set. Then drops them into bcDB + asnTracker so scanning works the
// moment the worksheets come back graded.
//
// One Cmd+P button opens a single print window with all worksheets
// concatenated (each on its own page-break-after page). Optional
// answer key for the teacher prints as page 2 of each kid's packet.

import { useState } from "react";
import {
  StarStore, saveAll,
  type Subject, type StarStudent, type StarTrackerEntry, type BcEntry, type StarQuestion,
} from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, errorBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { pushBarcodeToServer } from "../../lib/star/barcodeRelay.ts";
import { buildLocalLesson, synthesizeChoicesForAll, type Lesson } from "./AssignmentGenerator.tsx";
import { Modal } from "./ui.tsx";

const SUBJECTS: Subject[] = ["Math", "Reading", "Writing", "Spelling", "Science", "Social Studies", "SEL"];
const Q_COUNTS = [5, 10, 15, 20];
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const GRADES = ["K", "1st", "2nd", "3rd", "4th", "5th"];

interface PerStudentOverride {
  grade?: string;        // overrides default if set
  subject?: Subject;     // overrides pack subject if set
  difficulty?: typeof DIFFICULTIES[number]; // overrides pack difficulty if set
  count?: number;        // overrides pack count if set
}

interface PackEntry {
  barcode: string;
  studentId: string;
  studentName: string;
  grade: string;
  questions: StarQuestion[];
  lesson: Lesson | null;
  name: string;
  subject: Subject;
}

interface BulkPackProps {
  /** Label prefix used in the default pack name + barcode pack name. Defaults to "Afternoon". */
  defaultLabel?: string;
  /** Default subject for new packs. Defaults to Math. */
  defaultSubject?: Subject;
}

export default function AfternoonPackGenerator({ defaultLabel = "Afternoon", defaultSubject = "Math" }: BulkPackProps = {}) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [subject, setSubject] = useState<Subject>(defaultSubject);
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>("Medium");
  const [packLabel, setPackLabel] = useState<string>(() => {
    const d = new Date();
    return `${defaultLabel} ${d.toLocaleDateString()}`;
  });
  // Answer key is intentionally NEVER printed — teacher uses the
  // gradebook to grade after scan, no paper key needed. Duplex
  // printers will fit two kids per sheet; no wasted paper.
  const [autoMatchGrade, setAutoMatchGrade] = useState(true);
  // Multiple-choice mode — when on, every question in the pack gets
  // 4 A/B/C/D bubble choices (real answer + 3 plausible distractors).
  const [mcqMode, setMcqMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(students.map((s) => s.id)));
  const [overrides, setOverrides] = useState<Record<string, PerStudentOverride>>({});
  const [editing, setEditing] = useState<PackEntry | null>(null);
  const [generated, setGenerated] = useState<PackEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const togglePick = (id: string) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const setOv = (id: string, patch: Partial<PerStudentOverride>) => {
    setOverrides((cur) => ({ ...cur, [id]: { ...(cur[id] || {}), ...patch } }));
  };

  const generatePack = async () => {
    if (picked.size === 0) { errorBeep(); return; }
    setBusy(true);
    try {
      const bcDB = StarStore.getBcDB();
      const tracker = StarStore.getAsnTrack();
      const asns = StarStore.getAsns();
      const now = new Date();
      const yy = String(now.getFullYear() % 100).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const datePart = `${yy}${mm}${dd}`;
      const subjPrefix = subject.slice(0, 2).toUpperCase();
      // Find next free sequence so back-to-back packs don't collide.
      let seq = 1;
      while (bcDB[`${subjPrefix}-${datePart}-${String(seq).padStart(3, "0")}`]) seq++;

      // Track topics used so each kid in this pack gets a DIFFERENT
      // story+questions even if they share a grade level. Keyed by
      // subject because "Maya's Garden" (Reading) shouldn't block
      // "Maya's Garden" if it ever appeared in another bank.
      const usedTitlesBySubject: Record<string, Set<string>> = {};
      const out: PackEntry[] = [];
      for (const s of students) {
        if (!picked.has(s.id)) continue;
        const ov = overrides[s.id] || {};
        const studentName = `${s.firstName} ${s.lastName}`.trim();
        // Per-student overrides win > pack default > roster grade > "3rd".
        const kidSubject: Subject = ov.subject || subject;
        const kidGrade = ov.grade || ((autoMatchGrade && s.grade) ? s.grade : (s.grade || "3rd"));
        const kidDifficulty = ov.difficulty || difficulty;
        const kidCount = ov.count || count;
        const exclude = (usedTitlesBySubject[kidSubject] ||= new Set<string>());
        const built = buildLocalLesson({
          subject: kidSubject, grade: kidGrade, count: kidCount,
          difficulty: kidDifficulty, goal: "",
          excludeTitles: exclude,
        });
        if (built.topicTitle) exclude.add(built.topicTitle);
        if (mcqMode) built.questions = synthesizeChoicesForAll(built.questions);
        // Keep the per-kid prefix consistent so different subjects in the
        // same pack don't collide on barcode IDs.
        const kidPrefix = kidSubject.slice(0, 2).toUpperCase();
        let barcode = `${kidPrefix}-${datePart}-${String(seq).padStart(3, "0")}`;
        while (bcDB[barcode]) { seq++; barcode = `${kidPrefix}-${datePart}-${String(seq).padStart(3, "0")}`; }
        seq++;
        const name = `${packLabel} · ${kidSubject} · ${s.firstName}`;
        const entry: BcEntry = {
          id: barcode, type: "assignment", name,
          subject: kidSubject, gradeLevel: kidGrade,
          studentName, studentId: s.id,
          week: undefined, day: undefined, goal: undefined,
          questions: built.questions, lesson: built.lesson,
          createdDate: now.toISOString(),
        };
        bcDB[barcode] = entry;
        const trk: StarTrackerEntry = {
          id: barcode, name, subject: kidSubject, gradeLevel: kidGrade,
          studentName, studentId: s.id,
          questions: built.questions, lesson: built.lesson,
          createdDate: now.toISOString(),
          status: "assigned", submissions: [],
        };
        tracker[barcode] = trk;
        asns.unshift({ id: barcode, name, subject: kidSubject, type: "Assignment", grade: kidGrade });
        out.push({
          barcode, studentId: s.id, studentName, grade: kidGrade,
          questions: built.questions, lesson: built.lesson, name, subject: kidSubject,
        });
      }
      try {
        saveAll({ bcDB, asnTracker: tracker, asns });
      } catch (e: any) {
        if (e?.quota) {
          const { getLocalStorageUsage, clearBehaviorPhotos, clearStudentPhotos } = await import("../../lib/star/storage.ts");
          const before = getLocalStorageUsage().totalKB;
          const ok = window.confirm(
            `Couldn't save the pack — local storage is full (${Math.round(before)} KB).\n\n` +
            `Free up space by removing saved photos? Behavior-report + worksheet snap photos take the most room. Grades and assignments stay.\n\nOK = clear photos and retry.`
          );
          if (!ok) throw e;
          clearBehaviorPhotos();
          clearStudentPhotos();
          saveAll({ bcDB, asnTracker: tracker, asns });
        } else {
          throw e;
        }
      }
      // Push every minted barcode to the server so other devices can scan it.
      for (const o of out) pushBarcodeToServer(bcDB[o.barcode]);
      successBeep();
      setGenerated(out);
    } catch (e: any) {
      errorBeep();
      alert(`Pack generation failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const printAll = () => {
    if (generated.length === 0) return;
    openBulkPrintWindow(generated, packLabel);
    loggedBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>

      {/* Form */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Field label="Pack label">
          <input value={packLabel} onChange={(e) => setPackLabel(e.target.value)} style={inp()} />
        </Field>
        <Field label="Subject">
          <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} style={inp()}>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Questions each">
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={inp()}>
            {Q_COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Difficulty">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)} style={inp()}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", gap: 14, fontSize: 12, opacity: 0.85, marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={autoMatchGrade} onChange={(e) => setAutoMatchGrade(e.target.checked)} />
          Use each kid's actual grade level (recommended)
        </label>
        <label style={{
          display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
          padding: "4px 10px", borderRadius: 8,
          background: mcqMode
            ? "linear-gradient(135deg, rgba(16,185,129,0.20), rgba(99,102,241,0.10))"
            : "rgba(255,255,255,0.04)",
          border: `1px solid ${mcqMode ? "rgba(16,185,129,0.50)" : "rgba(255,255,255,0.10)"}`,
          color: mcqMode ? "#bbf7d0" : "rgba(245,241,232,0.85)",
          fontWeight: 700,
        }}>
          <input
            type="checkbox" checked={mcqMode}
            onChange={(e) => setMcqMode(e.target.checked)}
            style={{ accentColor: "#a855f7" }}
          />
          🅰️ Multiple choice (A/B/C/D)
        </label>
      </div>

      {/* Student picker — per-kid grade + subject overrides. */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55 }}>
            Students ({picked.size} of {students.length}) — override per-kid below
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPicked(new Set(students.map((s) => s.id)))} style={ghost()}>All</button>
            <button onClick={() => setPicked(new Set())} style={ghost()}>None</button>
            <button onClick={() => setOverrides({})} style={ghost()}>Reset overrides</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {students.map((s) => {
            const sel = picked.has(s.id);
            const ov = overrides[s.id] || {};
            const effGrade = ov.grade || ((autoMatchGrade && s.grade) ? s.grade : (s.grade || "3rd"));
            const effSubject: Subject = ov.subject || subject;
            const effDifficulty = ov.difficulty || difficulty;
            const effCount = ov.count || count;
            return (
              <div key={s.id} style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(120px,1fr) repeat(4, minmax(90px, 1fr))",
                gap: 6, alignItems: "center",
                padding: "8px 10px", borderRadius: 8,
                background: sel ? "rgba(99,102,241,0.10)" : "rgba(255,255,255,0.03)",
                border: sel ? "1px solid rgba(251,191,36,0.40)" : "1px solid rgba(255,255,255,0.08)",
                opacity: sel ? 1 : 0.55,
              }}>
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => togglePick(s.id)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.firstName} {s.lastName}
                  {s.grade && <span style={{ opacity: 0.5, fontWeight: 500, marginLeft: 6 }}>roster: {s.grade}</span>}
                </div>
                <select disabled={!sel} value={effGrade} onChange={(e) => setOv(s.id, { grade: e.target.value })} style={smallInp()}>
                  {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
                </select>
                <select disabled={!sel} value={effSubject} onChange={(e) => setOv(s.id, { subject: e.target.value as Subject })} style={smallInp()}>
                  {SUBJECTS.map((sj) => <option key={sj} value={sj}>{sj}</option>)}
                </select>
                <select disabled={!sel} value={effDifficulty} onChange={(e) => setOv(s.id, { difficulty: e.target.value as any })} style={smallInp()}>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select disabled={!sel} value={effCount} onChange={(e) => setOv(s.id, { count: Number(e.target.value) })} style={smallInp()}>
                  {Q_COUNTS.map((c) => <option key={c} value={c}>{c}q</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={generatePack} disabled={busy || picked.size === 0} style={primary()}>
          {busy ? "Generating…" : `✨ Generate Pack (${picked.size})`}
        </button>
      </div>

      {editing && (
        <EditEntryModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            // Persist edits to bcDB + tracker, then refresh local list.
            const bcDB = StarStore.getBcDB();
            const tr = StarStore.getAsnTrack();
            const e = bcDB[updated.barcode];
            if (e && e.type === "assignment") {
              bcDB[updated.barcode] = {
                ...e,
                name: updated.name,
                gradeLevel: updated.grade,
                subject: updated.subject,
                questions: updated.questions,
                lesson: updated.lesson,
              };
            }
            const t = tr[updated.barcode];
            if (t) {
              tr[updated.barcode] = {
                ...t,
                name: updated.name,
                gradeLevel: updated.grade,
                subject: updated.subject,
                questions: updated.questions,
                lesson: updated.lesson,
              };
            }
            saveAll({ bcDB, asnTracker: tr });
            pushBarcodeToServer(bcDB[updated.barcode]);
            setGenerated((cur) => cur.map((p) => (p.barcode === updated.barcode ? updated : p)));
            setEditing(null);
          }}
        />
      )}

      {generated.length > 0 && (
        <div style={{
          marginTop: 16, padding: 14, borderRadius: 12,
          background: "rgba(16,185,129,0.10)",
          border: "1px solid rgba(16,185,129,0.40)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                ✅ Pack created
              </div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {generated.length} worksheet{generated.length === 1 ? "" : "s"} · ready to print
              </div>
            </div>
            <button onClick={printAll} style={primary()}>🖨 Print pack (1× Cmd+P)</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, maxHeight: 320, overflow: "auto" }}>
            {generated.map((p) => (
              <div key={p.barcode} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: 6,
                background: "rgba(0,0,0,0.30)",
                fontSize: 12,
              }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <b>{p.studentName}</b> · {p.grade} · {p.subject} · {p.questions.length}q
                </span>
                <button onClick={() => setEditing(p)} style={{
                  padding: "4px 8px", borderRadius: 4,
                  background: "rgba(255,255,255,0.06)", color: "white",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>✏️ Edit</button>
                <span style={{ fontFamily: "Menlo, monospace", color: "#fde68a", fontSize: 11 }}>{p.barcode}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── edit modal — change name / lesson / questions / answers ── */

function EditEntryModal({ entry, onClose, onSave }: {
  entry: PackEntry;
  onClose: () => void;
  onSave: (e: PackEntry) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [grade, setGrade] = useState(entry.grade);
  const [subject, setSubject] = useState<Subject>(entry.subject);
  const [lessonTitle, setLessonTitle] = useState(entry.lesson?.title || "");
  const [lessonIntro, setLessonIntro] = useState(entry.lesson?.intro || "");
  const [lessonBody, setLessonBody] = useState((entry.lesson as any)?.body || "");
  const [questions, setQuestions] = useState<StarQuestion[]>(() => entry.questions.map((q) => ({ ...q })));

  const setQ = (i: number, patch: Partial<StarQuestion>) => {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };
  const addQ = () => {
    setQuestions((qs) => [...qs, { num: qs.length + 1, text: "", answer: "" }]);
  };
  const removeQ = (i: number) => {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i).map((q, idx) => ({ ...q, num: idx + 1 })));
  };

  const save = () => {
    const lesson: Lesson | null = (lessonTitle || lessonBody || lessonIntro)
      ? { title: lessonTitle, intro: lessonIntro, body: lessonBody, keyPoints: entry.lesson?.keyPoints || [], workedExample: entry.lesson?.workedExample, vocab: entry.lesson?.vocab }
      : null;
    onSave({
      ...entry,
      name, grade, subject,
      lesson,
      questions: questions.filter((q) => q.text.trim()).map((q, i) => ({ ...q, num: i + 1 })),
    });
  };

  return (
    <Modal
      onClose={onClose}
      kicker={`✏️ Edit · ${entry.studentName}`}
      title={<span style={{ fontFamily: "Menlo, monospace", color: "#fde68a", fontSize: 18 }}>{entry.barcode}</span>}
      width={800}
    >

        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", gap: 8, marginBottom: 12 }}>
          <Field label="Assignment name">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inp()} />
          </Field>
          <Field label="Grade">
            <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inp()}>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Subject">
            <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} style={inp()}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Lesson title">
          <input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} style={inp()} />
        </Field>
        <Field label="Lesson intro (1-2 sentences)">
          <input value={lessonIntro} onChange={(e) => setLessonIntro(e.target.value)} style={inp()} />
        </Field>
        <Field label="Lesson body (story / explanation that contains every answer)">
          <textarea value={lessonBody} onChange={(e) => setLessonBody(e.target.value)} rows={5} style={{ ...inp(), resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
        </Field>

        <div style={{ marginTop: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55 }}>
            Questions ({questions.length})
          </div>
          <button onClick={addQ} style={ghost()}>+ Add question</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {questions.map((q, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "32px 2fr 1fr auto", gap: 6, alignItems: "center",
              padding: "6px 8px", borderRadius: 6,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 800, textAlign: "center" }}>{i + 1}.</span>
              <input value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="Question text" style={inp()} />
              <input value={q.answer} onChange={(e) => setQ(i, { answer: e.target.value })} placeholder="Answer" style={{ ...inp(), color: "#86efac", fontWeight: 700 }} />
              <button onClick={() => removeQ(i)} style={{
                padding: "6px 8px", borderRadius: 6,
                background: "rgba(239,68,68,0.10)", color: "#fca5a5",
                border: "1px solid rgba(239,68,68,0.40)",
                cursor: "pointer", fontSize: 11,
              }}>🗑</button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={ghost()}>Cancel</button>
          <button onClick={save} style={primary()}>💾 Save changes</button>
        </div>
    </Modal>
  );
}

/* ── single-print bulk window ─────────────────────────────────── */

function openBulkPrintWindow(pack: PackEntry[], packLabel: string) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;

  const renderOne = (p: PackEntry) => {
    const barcodeSvg = bc128svg(p.barcode, 0, 80, true, 2.0);
    const lessonAny: any = p.lesson;
    const vocabCards = p.lesson?.vocab?.length ? `
      <div style="margin-top:12px;padding:10px 12px;background:#F0FFF4;border:1px solid #16A34A;border-radius:6px">
        <div style="font-size:10px;font-weight:800;color:#16A34A;text-transform:uppercase;margin-bottom:8px;letter-spacing:.08em">📖 Vocabulary</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">
          ${p.lesson.vocab.map((v) => `
            <div style="background:white;border-radius:5px;padding:6px 8px;border:1px solid #BBF7D0">
              <div style="font-weight:800;font-size:12px;color:#002855">${escapeHtml(v.term)}</div>
              <div style="font-size:11.5px;color:#374151;margin-top:2px">${escapeHtml(v.definition)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    ` : "";

    const keyPointsBox = p.lesson?.keyPoints?.length ? `
      <div style="margin-bottom:10px;background:white;border-radius:6px;padding:8px 12px;border:1px solid #BFDBFE">
        <div style="font-size:10px;font-weight:800;color:#002855;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">⭐ Key Points</div>
        ${p.lesson.keyPoints.map((kp) => `<div style="display:flex;gap:6px;margin-bottom:4px;font-size:12.5px;color:#374151"><span style="color:#1B5EA8;font-weight:700">•</span>${escapeHtml(kp)}</div>`).join("")}
      </div>
    ` : "";

    const lessonHtml = p.lesson ? `
      <div style="background:#F0F6FF;border:2px solid #1B5EA8;border-radius:8px;padding:14px 16px;margin-bottom:16px">
        <div style="background:#002855;color:#F0A500;font-size:11px;font-weight:800;padding:5px 10px;border-radius:4px;margin-bottom:10px;display:inline-block;letter-spacing:.08em">📚 LESSON — READ THIS FIRST</div>
        <div style="font-size:15px;font-weight:800;color:#002855;margin-bottom:8px">${escapeHtml(p.lesson.title)}</div>
        ${p.lesson.intro ? `<div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:10px">${escapeHtml(p.lesson.intro)}</div>` : ""}
        ${lessonAny.body ? `<div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:10px;white-space:pre-wrap">${escapeHtml(String(lessonAny.body))}</div>` : ""}
        ${keyPointsBox}
        ${vocabCards}
      </div>
    ` : "";

    const qHtml = p.questions.map((q) => {
      const hasChoices = Array.isArray(q.choices) && q.choices.length >= 2;
      if (hasChoices) {
        const bubbles = q.choices!.map((c, i) => {
          const letter = String.fromCharCode(65 + i);
          return `<div style="font-size:13px;display:flex;gap:8px;align-items:flex-start;color:#222">
            <span style="border:1.5px solid #555;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0">${letter}</span>
            <span>${escapeHtml(c)}</span>
          </div>`;
        }).join("");
        return `
          <div style="margin-bottom:14px;page-break-inside:avoid">
            <div style="font-size:14px"><b>${q.num}.</b> ${escapeHtml(q.text)}</div>
            <div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px 24px">${bubbles}</div>
          </div>
        `;
      }
      return `
        <div style="margin-bottom:14px;page-break-inside:avoid">
          <div style="font-size:14px"><b>${q.num}.</b> ${escapeHtml(q.text)}</div>
          <div style="border-bottom:1.5px solid #444;height:32px;margin-top:6px"></div>
        </div>
      `;
    }).join("");

    return `
      <div class="page">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#555">📝 Student Worksheet</div>
            <div style="font-size:22px;font-weight:800;margin-top:2px">${escapeHtml(p.name)}</div>
            <div style="font-size:13px;color:#555;margin-top:4px">
              Student: <b>${escapeHtml(p.studentName)}</b> · Grade: ${escapeHtml(p.grade)}
            </div>
          </div>
          <div style="text-align:right">${barcodeSvg}</div>
        </div>
        ${lessonHtml}
        ${qHtml}
      </div>
    `;
  };

  // Duplex printing puts two pages per sheet automatically. To keep
  // each kid on their own sheet (worksheet on front, blank-ish on
  // back), we insert one padding page between kids. The padding
  // page has NO kid-specific branding — just enough neutral ink so
  // the printer doesn't "skip blank pages" and collapse it. Same
  // neutral page used for every kid so no one sees "AIDEN" on the
  // back of someone else's work.
  // Simple: one page per kid in order. No back-of-sheet padding.
  // If the teacher wants every kid on their own physical sheet
  // under duplex printing, she picks "Single-sided" in the print
  // dialog. Forcing blank backs from the app was generating real
  // printed "Back of sheet" pages.
  const pages: string[] = [];
  for (const p of pack) {
    pages.push(renderOne(p));
  }

  w.document.write(`<!doctype html><html><head><title>${escapeHtml(packLabel)}</title>
    <style>
      @media print {
        @page { size: letter; margin: 0.5in; }
        .page { page-break-after: always; break-after: page; }
        .page:last-child { page-break-after: auto; break-after: auto; }
      }
      body { font-family: -apple-system, sans-serif; color: #111; padding: 16px; }
      .page { box-sizing: border-box; }
    </style>
  </head><body>
    ${pages.join("")}
    <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
  </body></html>`);
  w.document.close();
}

/* ── styled helpers ─────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 10px", borderRadius: 8,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, outline: "none",
    boxSizing: "border-box",
  };
}
function primary(): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: "linear-gradient(135deg, #6366f1, #b23a48)",
    color: "white", border: "none", fontWeight: 800, cursor: "pointer", fontSize: 14,
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "6px 10px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
  };
}
function smallInp(): React.CSSProperties {
  return {
    padding: "6px 8px", borderRadius: 6,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(255,255,255,0.10)",
    fontSize: 12, outline: "none", boxSizing: "border-box", width: "100%",
  };
}
function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
