// STAR Program hub. Tabs:
//   • Generator    — create assignments + refusal forms with barcodes
//   • Old work     — manually add a paper assignment so it can be graded
//   • Reports      — searchable + CSV-exportable logs
//   • Settings     — OpenRouter API key, model, students, quick templates
//
// Tip: scan a barcode anywhere in the app to pop the right modal.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, saveAll, rehydrateBcDB,
  type StarStudent, type StarTrackerEntry, type BcEntry, type Subject,
} from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, errorBeep } from "../../lib/star/sounds.ts";
import AssignmentGenerator from "./AssignmentGenerator.tsx";
import RefusalFormGenerator from "./RefusalFormGenerator.tsx";
import StarReports from "./StarReports.tsx";
import GradebookModal from "./GradebookModal.tsx";

type Tab = "generator" | "manual" | "reports" | "settings";

const SUBJECTS: Subject[] = ["Math","Reading","Writing","Science","Social Studies","PE","Art","Library","Music"];
const GRADES = ["K","1st","2nd","3rd","4th","5th"];

export default function StarPage() {
  const [tab, setTab] = useState<Tab>("generator");
  const [openGradebook, setOpenGradebook] = useState<string | null>(null);

  useEffect(() => { rehydrateBcDB(); }, []);

  return (
    <div style={{ padding: 22, color: "#f5f1e8", maxWidth: 1280, margin: "0 auto" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.55 }}>
          ⭐ STAR Program
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: "4px 0 6px" }}>
          Special-Ed Tracker, Assessment & Refusal Log
        </h1>
        <p style={{ opacity: 0.7, fontSize: 13, margin: 0 }}>
          Plug in a USB barcode scanner — scans pop the right modal anywhere in the app.
          Use the tabs below to mint new barcodes, log paper assignments, and review reports.
        </p>
      </header>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {([
          { id: "generator" as Tab, label: "✨ Generator" },
          { id: "manual"    as Tab, label: "📥 Add Old Work" },
          { id: "reports"   as Tab, label: "📊 Reports" },
          { id: "settings"  as Tab, label: "⚙️ Settings" },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 14px", borderRadius: 10,
            background: tab === t.id ? "linear-gradient(135deg,#6366f1,#b23a48)" : "rgba(255,255,255,0.05)",
            color: "white",
            border: tab === t.id ? "1px solid rgba(251,191,36,0.40)" : "1px solid rgba(255,255,255,0.12)",
            fontWeight: 700, cursor: "pointer", fontSize: 14,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "generator" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <AssignmentGenerator />
          <RefusalFormGenerator />
        </div>
      )}

      {tab === "manual" && <ManualAssignmentEntry onOpenGradebook={(id) => setOpenGradebook(id)} />}

      {tab === "reports"  && <StarReports />}

      {tab === "settings" && <SettingsPanel />}

      {openGradebook && (
        <GradebookModal barcode={openGradebook} onClose={() => setOpenGradebook(null)} />
      )}
    </div>
  );
}

/* ── manual entry — let teacher add an existing/old paper assignment ── */

function ManualAssignmentEntry({ onOpenGradebook }: { onOpenGradebook: (id: string) => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState<Subject>("Math");
  const [grade, setGrade] = useState("3rd");
  const [studentName, setStudentName] = useState("");
  const [week, setWeek] = useState("1");
  const [day, setDay] = useState("Monday");
  const [goal, setGoal] = useState("");
  const [maxScore, setMaxScore] = useState<number>(10);
  const [created, setCreated] = useState<{ id: string } | null>(null);

  // Existing assignments — quick list to grade more of
  const [tracker, setTracker] = useState<Record<string, StarTrackerEntry>>(() => StarStore.getAsnTrack());

  const create = () => {
    if (!name.trim()) { errorBeep(); return; }
    const bcDB = StarStore.getBcDB();
    const subjPrefix = subject.slice(0, 2).toUpperCase();
    const now = new Date();
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    let n = 1;
    let id = "";
    while (true) {
      id = `${subjPrefix}-${yy}${mm}${dd}-${String(n).padStart(3, "0")}`;
      if (!bcDB[id]) break;
      n++;
    }

    // Create empty placeholder questions so the gradebook math (score / max)
    // works without forcing per-question marking.
    const questions = Array.from({ length: maxScore }, (_, i) => ({
      num: i + 1, text: `Question ${i + 1}`, answer: "—",
    }));

    const entry: BcEntry = {
      id, type: "assignment", name, subject, gradeLevel: grade,
      studentName: studentName || undefined, week, day, goal: goal || undefined,
      questions, lesson: null, createdDate: now.toISOString(),
    };
    bcDB[id] = entry;

    const trk = StarStore.getAsnTrack();
    trk[id] = {
      id, name, subject, gradeLevel: grade,
      studentName: studentName || undefined, week, day, goal: goal || undefined,
      questions, lesson: null, createdDate: now.toISOString(),
      status: "assigned", submissions: [],
    };

    const asns = StarStore.getAsns();
    asns.unshift({ id, name, subject, type: "Assignment", grade });

    saveAll({ bcDB, asnTracker: trk, asns });
    successBeep();
    setTracker({ ...trk });
    setCreated({ id });
    setName("");
  };

  const print = (id: string) => {
    const w = window.open("", "_blank", "width=600,height=400");
    if (!w) return;
    const svg = bc128svg(id, 0, 90, true, 2.0);
    w.document.write(`<!doctype html><html><head><title>${id}</title>
      <style>body{font-family:-apple-system,sans-serif;padding:24px;text-align:center}</style>
      </head><body>
      <h2 style="margin:0 0 12px">${id}</h2>
      <div>${svg}</div>
      <div style="margin-top:8px;color:#666;font-size:12px">Tape this barcode to the paper — scan to grade.</div>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200))</script>
      </body></html>`);
    w.document.close();
  };

  const sorted = useMemo(() => Object.values(tracker).sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || "")), [tracker]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14, padding: 16, color: "#f5f1e8",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>📥 Add an Existing Paper Assignment</div>
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: -6, marginBottom: 12 }}>
          Use this for old worksheets that don't have a barcode yet. We'll mint one
          you can tape to the paper, then scan to pull up the gradebook.
        </p>

        <Field label="Assignment name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Multiplication WS p.12" style={inp()} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Subject">
            <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} style={inp()}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Grade">
            <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inp()}>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Student (optional)">
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} style={inp()} />
          </Field>
          <Field label="IEP Goal (optional)">
            <input value={goal} onChange={(e) => setGoal(e.target.value)} style={inp()} />
          </Field>
          <Field label="Week #">
            <input value={week} onChange={(e) => setWeek(e.target.value)} style={inp()} />
          </Field>
          <Field label="Day">
            <input value={day} onChange={(e) => setDay(e.target.value)} style={inp()} />
          </Field>
          <Field label="Total points">
            <input type="number" min={1} value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value) || 10)} style={inp()} />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={create} style={primaryBtn()}>📥 Mint Barcode</button>
        </div>

        {created && (
          <div style={{
            marginTop: 14, padding: 12, borderRadius: 10,
            background: "rgba(16,185,129,0.10)",
            border: "1px solid rgba(16,185,129,0.40)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: "Menlo, monospace", fontWeight: 800, fontSize: 16, color: "#fde68a" }}>{created.id}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => print(created.id)} style={ghostBtn()}>🖨 Print barcode</button>
                <button onClick={() => onOpenGradebook(created.id)} style={ghostBtn()}>✏️ Grade now</button>
              </div>
            </div>
            <div style={{ marginTop: 10 }}
              dangerouslySetInnerHTML={{ __html: bc128svg(created.id, 0, 70, true, 2.0) }}
            />
          </div>
        )}
      </div>

      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14, padding: 16, color: "#f5f1e8",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>🗂 Existing Assignments</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>Click any to open its gradebook.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 540, overflow: "auto" }}>
          {sorted.length === 0 ? (
            <div style={{ padding: 12, opacity: 0.6, fontSize: 13 }}>No assignments yet.</div>
          ) : sorted.map((a) => (
            <button key={a.id} onClick={() => onOpenGradebook(a.id)} style={{
              padding: "10px 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.04)", color: "white",
              border: "1px solid rgba(255,255,255,0.10)",
              cursor: "pointer", textAlign: "left",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                <div style={{ fontSize: 11, opacity: 0.65 }}>{a.subject} · {a.gradeLevel || "—"} · {a.submissions?.length || 0} graded</div>
              </div>
              <span style={{ fontFamily: "Menlo, monospace", fontSize: 11, color: "#fde68a", flexShrink: 0 }}>{a.id}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── settings — API key, students, templates ─────────────────────── */

function SettingsPanel() {
  const [apiKey, setApiKey] = useState(() => StarStore.getApiKey());
  const [model, setModel] = useState(() => StarStore.getAiModel() || "openrouter/auto");
  const [students, setStudents] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [tpls, setTpls] = useState<string[]>(() => StarStore.getTpls());
  const [savedFlash, setSavedFlash] = useState(false);

  const save = () => {
    StarStore.setApiKey(apiKey.trim());
    StarStore.setAiModel(model.trim() || "openrouter/auto");
    StarStore.setStudents(students);
    StarStore.setTpls(tpls.filter((t) => t.trim()));
    setSavedFlash(true);
    successBeep();
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const setStudent = (i: number, patch: Partial<StarStudent>) => {
    setStudents((arr) => arr.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const addStudent = () => {
    const id = `STU-${String(students.length + 1).padStart(3, "0")}`;
    setStudents((arr) => [...arr, { id, firstName: "", lastName: "", grade: "" }]);
  };
  const removeStudent = (i: number) => setStudents((arr) => arr.filter((_, idx) => idx !== i));

  const setTpl = (i: number, v: string) => setTpls((arr) => arr.map((t, idx) => idx === i ? v : t));
  const addTpl = () => setTpls((arr) => [...arr, ""]);
  const removeTpl = (i: number) => setTpls((arr) => arr.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14, padding: 16, color: "#f5f1e8",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>🤖 AI</div>
        <Field label="OpenRouter API Key">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-or-..." style={inp()} />
        </Field>
        <Field label="Model">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="openrouter/auto" style={inp()} />
        </Field>
        <p style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
          Stored locally only. The generator falls back to a built-in lesson if no key is set.
        </p>

        <div style={{ height: 18 }} />

        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>📝 Quick Note Templates</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tpls.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input value={t} onChange={(e) => setTpl(i, e.target.value)} style={inp()} />
              <button onClick={() => removeTpl(i)} style={ghostBtn()}>✕</button>
            </div>
          ))}
          <button onClick={addTpl} style={ghostBtn()}>+ Add template</button>
        </div>
      </div>

      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14, padding: 16, color: "#f5f1e8",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>👥 Students ({students.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflow: "auto" }}>
          {students.map((s, i) => (
            <div key={s.id} style={{
              display: "grid", gridTemplateColumns: "auto 1fr 1fr 80px auto",
              gap: 6, alignItems: "center",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: 6,
            }}>
              <span style={{ fontFamily: "Menlo, monospace", fontSize: 11, opacity: 0.7, padding: "0 4px" }}>{s.id}</span>
              <input value={s.firstName} onChange={(e) => setStudent(i, { firstName: e.target.value })} placeholder="First" style={inp()} />
              <input value={s.lastName}  onChange={(e) => setStudent(i, { lastName: e.target.value })}  placeholder="Last"  style={inp()} />
              <input value={s.grade || ""} onChange={(e) => setStudent(i, { grade: e.target.value })}   placeholder="Grade" style={inp()} />
              <button onClick={() => removeStudent(i)} style={ghostBtn()}>✕</button>
            </div>
          ))}
          <button onClick={addStudent} style={ghostBtn()}>+ Add student</button>
        </div>
      </div>

      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} style={{ ...primaryBtn(), background: savedFlash ? "#10b981" : "linear-gradient(135deg,#6366f1,#b23a48)" }}>
          {savedFlash ? "✓ Saved" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

/* ── shared bits ─────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
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
  };
}
function primaryBtn(): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: "linear-gradient(135deg, #6366f1, #b23a48)",
    color: "white", border: "none", fontWeight: 800, cursor: "pointer", fontSize: 14,
  };
}
function ghostBtn(): React.CSSProperties {
  return {
    padding: "6px 10px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
  };
}
