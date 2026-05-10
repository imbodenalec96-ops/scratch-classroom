// Multiple-choice quiz generator. Two modes:
//   • <QuizGenerator />          — single-student personal quiz
//   • <QuizPackGenerator />      — bulk class quiz (one quiz per kid,
//                                  printed in a single PDF)
//
// Each quiz mints a barcode + tracker row so scanning works through the
// existing GradebookModal. Questions carry MCQ choices[] so the
// gradebook renders an A/B/C/D picker per question.

import { useMemo, useState } from "react";
import {
  StarStore, saveAll, nextBarcode,
  type StarStudent, type Subject, type StarQuestion, type BcEntry, type StarTrackerEntry,
} from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, errorBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { pushBarcodeToServer } from "../../lib/star/barcodeRelay.ts";

const SUBJECTS: Subject[] = ["Math", "Reading", "Spelling", "Science", "Social Studies"];
const COUNTS = [5, 10, 15, 20];
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
type Difficulty = typeof DIFFICULTIES[number];
const GRADES = ["K", "1st", "2nd", "3rd", "4th", "5th"];

interface QuizSlice {
  barcode: string;
  studentId: string;
  studentName: string;
  grade: string;
  subject: Subject;
  questions: StarQuestion[];
  name: string;
}

/* ── PUBLIC: single-student quiz ─────────────────────────────────── */

export default function QuizGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [studentId, setStudentId] = useState<string>("");
  const [subject, setSubject] = useState<Subject>("Math");
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [grade, setGrade] = useState<string>("3rd");
  const [created, setCreated] = useState<QuizSlice | null>(null);

  const create = () => {
    if (!studentId) { errorBeep(); return; }
    const s = students.find((x) => x.id === studentId);
    if (!s) { errorBeep(); return; }
    const useGrade = s.grade || grade;
    const studentName = `${s.firstName} ${s.lastName}`.trim();
    // BUG FIX (was passing fresh copies to saveAll → mutation lost):
    // grab bcDB + tracker ONCE, mutate them, then persist the same refs.
    const bcDB = StarStore.getBcDB();
    const tracker = StarStore.getAsnTrack();
    const slice = mintQuizSlice({
      bcDB, tracker,
      subject, count, difficulty, grade: useGrade,
      studentId, studentName,
    });
    saveAll({ bcDB, asnTracker: tracker });
    pushBarcodeToServer(bcDB[slice.barcode]);
    successBeep();
    setCreated(slice);
  };

  const print = () => {
    if (!created) return;
    openQuizPrintWindow([created]);
    loggedBeep();
  };

  const sel = students.find((s) => s.id === studentId);

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10,
      }}>
        <Field label="Student">
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={inp()}>
            <option value="">— Pick a student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName} {s.grade ? `(${s.grade})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject">
          <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} style={inp()}>
            {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Questions">
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={inp()}>
            {COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Difficulty">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} style={inp()}>
            {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label={sel?.grade ? `Grade (locked: ${sel.grade})` : "Grade"}>
          <select
            value={sel?.grade || grade}
            onChange={(e) => setGrade(e.target.value)}
            disabled={!!sel?.grade}
            style={{ ...inp(), opacity: sel?.grade ? 0.6 : 1 }}
          >
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button onClick={create} disabled={!studentId} style={primaryBtn(!studentId)}>
          ✨ Make Quiz
        </button>
      </div>

      {created && <QuizPreviewCard quiz={created} onPrint={print} />}
    </div>
  );
}

/* ── PUBLIC: bulk class quiz pack ────────────────────────────────── */

export function QuizPackGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [subject, setSubject] = useState<Subject>("Math");
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [autoMatchGrade, setAutoMatchGrade] = useState(true);
  const [defaultGrade, setDefaultGrade] = useState("3rd");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(students.map((s) => s.id)));
  const [packLabel, setPackLabel] = useState<string>(() => `Quiz ${new Date().toLocaleDateString()}`);
  const [generated, setGenerated] = useState<QuizSlice[]>([]);
  const [busy, setBusy] = useState(false);

  const togglePick = (id: string) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const generate = () => {
    if (picked.size === 0) { errorBeep(); return; }
    setBusy(true);
    try {
      const bcDB = StarStore.getBcDB();
      const tracker = StarStore.getAsnTrack();
      const slices: QuizSlice[] = [];
      for (const s of students) {
        if (!picked.has(s.id)) continue;
        const useGrade = autoMatchGrade ? (s.grade || defaultGrade) : defaultGrade;
        const slice = mintQuizSlice({
          bcDB, tracker,
          subject, count, difficulty, grade: useGrade,
          studentId: s.id, studentName: `${s.firstName} ${s.lastName}`.trim(),
          packLabel,
        });
        slices.push(slice);
      }
      saveAll({ bcDB, asnTracker: tracker });
      // Push each new barcode to the server so other devices can scan it.
      for (const sl of slices) pushBarcodeToServer(bcDB[sl.barcode]);
      successBeep();
      setGenerated(slices);
    } finally {
      setBusy(false);
    }
  };

  const printAll = () => {
    if (generated.length === 0) return;
    openQuizPrintWindow(generated);
    loggedBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
      }}>
        <Field label="Pack name">
          <input value={packLabel} onChange={(e) => setPackLabel(e.target.value)} style={inp()} />
        </Field>
        <Field label="Subject">
          <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} style={inp()}>
            {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Questions">
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={inp()}>
            {COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Difficulty">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} style={inp()}>
            {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label={autoMatchGrade ? "Default (uses kid's grade if set)" : "Force grade for all"}>
          <select value={defaultGrade} onChange={(e) => setDefaultGrade(e.target.value)} style={inp()}>
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
      </div>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6, color: "rgba(196,181,253,0.75)", fontSize: 12, fontWeight: 700 }}>
        <input type="checkbox" checked={autoMatchGrade} onChange={(e) => setAutoMatchGrade(e.target.checked)} />
        Auto-match each kid's grade if it's set in Settings
      </label>

      <div style={{ marginTop: 14, marginBottom: 10, fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)" }}>
        Students · {picked.size}/{students.length}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 8,
      }}>
        {students.map((s) => {
          const on = picked.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => togglePick(s.id)}
              aria-pressed={on}
              style={{
                padding: "10px 12px", borderRadius: 12,
                background: on
                  ? "linear-gradient(135deg, rgba(168,85,247,0.30), rgba(236,72,153,0.10))"
                  : "rgba(168,85,247,0.04)",
                border: on
                  ? "1px solid rgba(236,72,153,0.45)"
                  : "1px solid rgba(168,85,247,0.18)",
                color: "#fce7f3", cursor: "pointer", textAlign: "left",
                fontSize: 13, fontWeight: 700,
                touchAction: "manipulation",
              }}
            >
              {s.firstName}
              {s.grade && <div style={{ fontSize: 10, color: "rgba(196,181,253,0.55)", fontWeight: 600 }}>{s.grade}</div>}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <button onClick={generate} disabled={busy || picked.size === 0} style={primaryBtn(busy || picked.size === 0)}>
          {busy ? "Building…" : `✨ Build ${picked.size} Quiz${picked.size === 1 ? "" : "zes"}`}
        </button>
        <button onClick={printAll} disabled={generated.length === 0} style={ghostBtn(generated.length === 0)}>
          🖨 Print Pack
        </button>
      </div>

      {generated.length > 0 && (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {generated.map((q) => <QuizMiniRow key={q.barcode} quiz={q} />)}
        </div>
      )}
    </div>
  );
}

/* ── shared bits ─────────────────────────────────────────────────── */

function QuizPreviewCard({ quiz, onPrint }: { quiz: QuizSlice; onPrint: () => void }) {
  return (
    <div style={{
      marginTop: 14, padding: 14, borderRadius: 14,
      background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
      border: "1px solid rgba(168,85,247,0.30)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "#f9a8d4" }}>
            Quiz · {quiz.subject} · {quiz.questions.length} questions
          </div>
          <div style={{ fontFamily: "Menlo, monospace", fontWeight: 800, fontSize: 18, color: "#fce7f3" }}>{quiz.barcode}</div>
          <div style={{ fontSize: 12, color: "rgba(196,181,253,0.75)", marginTop: 2, fontWeight: 600 }}>For {quiz.studentName} · {quiz.grade}</div>
        </div>
        <button onClick={onPrint} style={ghostBtn(false)}>🖨 Print quiz</button>
      </div>
      <div style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: bc128svg(quiz.barcode, 0, 70, true, 2.0) }} />
    </div>
  );
}

function QuizMiniRow({ quiz }: { quiz: QuizSlice }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 12px", borderRadius: 10,
      background: "rgba(168,85,247,0.06)",
      border: "1px solid rgba(168,85,247,0.20)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 14, color: "white", flexShrink: 0,
        }}>{quiz.studentName.charAt(0).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fce7f3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {quiz.studentName}
          </div>
          <div style={{ fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600, fontFamily: "Menlo, monospace" }}>
            {quiz.barcode} · {quiz.questions.length}q
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    background: "rgba(10,4,20,0.45)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 14, outline: "none", fontWeight: 600,
    boxSizing: "border-box",
  };
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 18px", borderRadius: 12,
    background: disabled
      ? "rgba(168,85,247,0.18)"
      : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    color: "white", border: "none", fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
    boxShadow: disabled ? "none" : "0 8px 22px -6px rgba(168,85,247,0.55)",
    touchAction: "manipulation",
  };
}

function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 16px", borderRadius: 12,
    background: "rgba(168,85,247,0.06)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.30)",
    fontWeight: 800, fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    touchAction: "manipulation",
  };
}

/* ── core: mint a quiz slice (questions + barcode + tracker) ─────── */

function mintQuizSlice(args: {
  bcDB: Record<string, BcEntry>;
  tracker: Record<string, StarTrackerEntry>;
  subject: Subject;
  count: number;
  difficulty: Difficulty;
  grade: string;
  studentId: string;
  studentName: string;
  packLabel?: string;
}): QuizSlice {
  const { bcDB, tracker, subject, count, difficulty, grade, studentId, studentName, packLabel } = args;
  const questions = generateQuiz({ subject, count, difficulty, grade });
  const barcode = nextBarcode("QZ", bcDB);
  const name = packLabel
    ? `${packLabel} — ${studentName}`
    : `${subject} Quiz — ${studentName}`;
  const entry: BcEntry = {
    id: barcode, type: "assignment",
    name, subject, gradeLevel: grade,
    studentName, studentId,
    questions, lesson: null,
    createdDate: new Date().toISOString(),
  };
  bcDB[barcode] = entry;
  tracker[barcode] = {
    id: barcode, name, subject, gradeLevel: grade,
    studentName, studentId,
    questions, lesson: null,
    createdDate: new Date().toISOString(),
    status: "assigned", submissions: [],
  } as StarTrackerEntry;
  return { barcode, studentId, studentName, grade, subject, questions, name };
}

/* ── question pools (MCQ) ────────────────────────────────────────── */

function generateQuiz({ subject, count, difficulty, grade }: { subject: Subject; count: number; difficulty: Difficulty; grade: string }): StarQuestion[] {
  const pool = pools(subject, difficulty, grade);
  const shuffled = shuffle(pool).slice(0, count);
  return shuffled.map((q, i) => ({
    num: i + 1,
    text: q.text,
    answer: q.answer,
    choices: shuffle([q.answer, ...q.distractors]).slice(0, 4),
  }));
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface RawQ { text: string; answer: string; distractors: string[]; }

function pools(subject: Subject, difficulty: Difficulty, grade: string): RawQ[] {
  const gradeNum = grade === "K" ? 0 : Number(grade.replace(/\D/g, "")) || 3;
  if (subject === "Math") return mathPool(difficulty, gradeNum);
  if (subject === "Reading") return readingPool();
  if (subject === "Spelling") return spellingPool();
  if (subject === "Science") return sciencePool();
  if (subject === "Social Studies") return socialPool();
  return mathPool(difficulty, gradeNum);
}

function mathPool(difficulty: Difficulty, gradeNum: number): RawQ[] {
  const out: RawQ[] = [];
  const max = difficulty === "Easy" ? Math.max(10, gradeNum * 5)
            : difficulty === "Medium" ? Math.max(20, gradeNum * 10)
            : Math.max(50, gradeNum * 20);
  const ops: Array<"+" | "-" | "×" | "÷"> = gradeNum <= 1
    ? ["+", "-"]
    : gradeNum <= 3 ? ["+", "-", "×"]
    : ["+", "-", "×", "÷"];
  for (let i = 0; i < 50; i++) {
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a = 1 + Math.floor(Math.random() * max);
    let b = 1 + Math.floor(Math.random() * max);
    if (op === "-" && b > a) [a, b] = [b, a];
    if (op === "÷") { const m = b; b = m === 0 ? 1 : m; a = b * (1 + Math.floor(Math.random() * max)); }
    let answer: number;
    switch (op) {
      case "+": answer = a + b; break;
      case "-": answer = a - b; break;
      case "×": answer = a * b; break;
      case "÷": answer = Math.floor(a / b); break;
    }
    const text = `What is ${a} ${op} ${b}?`;
    const ansStr = String(answer);
    const distractors = uniq([
      String(answer + 1),
      String(Math.max(0, answer - 1)),
      String(answer + 2),
      String(Math.max(0, answer - 2)),
      String(answer + (op === "×" ? a : 5)),
    ].filter((d) => d !== ansStr)).slice(0, 3);
    out.push({ text, answer: ansStr, distractors });
  }
  return out;
}

function readingPool(): RawQ[] {
  return [
    { text: "Which word means the same as 'happy'?", answer: "joyful", distractors: ["sad", "angry", "tired"] },
    { text: "What is the opposite of 'big'?", answer: "small", distractors: ["tall", "wide", "loud"] },
    { text: "Which is a noun?", answer: "dog", distractors: ["run", "quickly", "blue"] },
    { text: "Which word is a verb?", answer: "jump", distractors: ["chair", "happy", "red"] },
    { text: "What sound does 'ph' make in 'phone'?", answer: "f", distractors: ["p", "h", "b"] },
    { text: "Which is a complete sentence?", answer: "The cat ran fast.", distractors: ["Ran fast.", "The cat", "Cat the ran"] },
    { text: "What's the plural of 'mouse'?", answer: "mice", distractors: ["mouses", "mouse", "mices"] },
    { text: "Which word rhymes with 'cat'?", answer: "bat", distractors: ["dog", "fish", "tree"] },
    { text: "Pick the synonym for 'fast'.", answer: "quick", distractors: ["slow", "tired", "loud"] },
    { text: "Pick the antonym for 'hot'.", answer: "cold", distractors: ["warm", "spicy", "wet"] },
    { text: "Which sentence is in the past tense?", answer: "She walked home.", distractors: ["She walks home.", "She is walking home.", "She will walk home."] },
    { text: "What's the main idea about?", answer: "the most important point", distractors: ["a small detail", "the title", "the page number"] },
    { text: "What punctuation ends a question?", answer: "?", distractors: [".", "!", ","] },
    { text: "Which is a proper noun?", answer: "Paris", distractors: ["city", "country", "river"] },
    { text: "What's an adjective?", answer: "describes a noun", distractors: ["an action word", "a person", "a number"] },
    { text: "'Bright' means…", answer: "shining", distractors: ["dark", "heavy", "loud"] },
    { text: "Pick the correct spelling.", answer: "because", distractors: ["becuase", "becouse", "becasue"] },
    { text: "Which is a contraction?", answer: "don't", distractors: ["does", "doing", "didn"] },
    { text: "What does 'enormous' mean?", answer: "very big", distractors: ["very small", "very fast", "very loud"] },
    { text: "Which is a compound word?", answer: "sunshine", distractors: ["happy", "running", "between"] },
    { text: "Pick a homophone for 'their'.", answer: "there", distractors: ["here", "those", "them"] },
    { text: "Which word means 'a place to live'?", answer: "home", distractors: ["car", "school", "park"] },
    { text: "What does 'gigantic' mean?", answer: "huge", distractors: ["tiny", "fast", "fragile"] },
  ];
}

function spellingPool(): RawQ[] {
  const cases: Array<[string, string[]]> = [
    ["beautiful", ["beautifull", "beutiful", "beautyful"]],
    ["because",   ["becuase", "becouse", "becasue"]],
    ["friend",    ["freind", "frend", "frieend"]],
    ["library",   ["libary", "librery", "librarry"]],
    ["separate",  ["seperate", "separete", "seperete"]],
    ["happened",  ["happend", "hapened", "happend"]],
    ["receive",   ["recieve", "receeve", "receve"]],
    ["necessary", ["nesecary", "necesary", "neccesary"]],
    ["definitely",["definately", "definitly", "defenitely"]],
    ["weird",     ["wierd", "weard", "wired"]],
    ["beginning", ["begining", "beggining", "beggining"]],
    ["different", ["diffrent", "diferent", "differnt"]],
    ["interesting",["intresting", "interasting", "interestng"]],
    ["Wednesday", ["Wensday", "Wendesday", "Wednsday"]],
    ["February",  ["Febuary", "Feburary", "Februery"]],
    ["which",     ["wich", "whitch", "whish"]],
    ["their",     ["thier", "they're", "ther"]],
    ["through",   ["thru", "throug", "thorough"]],
    ["enough",    ["enuf", "enought", "enouf"]],
    ["beautiful", ["beutiful", "beautyful", "beautifull"]],
  ];
  return cases.map(([correct, wrong]) => ({
    text: `Which is the correct spelling?`,
    answer: correct,
    distractors: wrong,
  }));
}

function sciencePool(): RawQ[] {
  return [
    { text: "What's the closest star to Earth?", answer: "the Sun", distractors: ["the Moon", "Mars", "Jupiter"] },
    { text: "How many planets are in our solar system?", answer: "8", distractors: ["7", "9", "10"] },
    { text: "What gas do plants take in?", answer: "carbon dioxide", distractors: ["oxygen", "nitrogen", "helium"] },
    { text: "What's water made of?", answer: "hydrogen and oxygen", distractors: ["carbon and oxygen", "nitrogen and helium", "iron and water"] },
    { text: "What animals lay eggs?", answer: "birds", distractors: ["dogs", "cats", "horses"] },
    { text: "How many legs does a spider have?", answer: "8", distractors: ["6", "4", "10"] },
    { text: "What's the biggest planet?", answer: "Jupiter", distractors: ["Saturn", "Earth", "Mars"] },
    { text: "What pulls things toward Earth?", answer: "gravity", distractors: ["magnetism", "wind", "heat"] },
    { text: "What do bees make?", answer: "honey", distractors: ["milk", "silk", "bread"] },
    { text: "What's the hardest natural substance?", answer: "diamond", distractors: ["gold", "iron", "glass"] },
    { text: "Which season comes after winter?", answer: "spring", distractors: ["summer", "fall", "autumn"] },
    { text: "What organ pumps blood?", answer: "heart", distractors: ["lungs", "brain", "liver"] },
    { text: "Where do fish live?", answer: "water", distractors: ["land", "trees", "sky"] },
    { text: "What part of a plant grows underground?", answer: "roots", distractors: ["leaves", "flowers", "stem"] },
    { text: "How does a butterfly start?", answer: "as an egg", distractors: ["as a fish", "as a bird", "as a frog"] },
    { text: "What freezes into ice?", answer: "water", distractors: ["sand", "metal", "wood"] },
    { text: "What organ do you breathe with?", answer: "lungs", distractors: ["stomach", "heart", "brain"] },
    { text: "What's the Earth's natural satellite?", answer: "the Moon", distractors: ["the Sun", "Mars", "a comet"] },
  ];
}

function socialPool(): RawQ[] {
  return [
    { text: "Who was the first U.S. President?", answer: "George Washington", distractors: ["Abraham Lincoln", "Thomas Jefferson", "John Adams"] },
    { text: "What's the capital of the United States?", answer: "Washington, D.C.", distractors: ["New York", "Los Angeles", "Chicago"] },
    { text: "How many states are in the U.S.?", answer: "50", distractors: ["48", "52", "49"] },
    { text: "What ocean is on the U.S. east coast?", answer: "Atlantic", distractors: ["Pacific", "Indian", "Arctic"] },
    { text: "What document declared U.S. independence?", answer: "Declaration of Independence", distractors: ["Constitution", "Bill of Rights", "Magna Carta"] },
    { text: "Who wrote the Declaration of Independence?", answer: "Thomas Jefferson", distractors: ["George Washington", "Benjamin Franklin", "James Madison"] },
    { text: "What continent is the U.S. on?", answer: "North America", distractors: ["South America", "Europe", "Asia"] },
    { text: "What flag color stands for bravery (in the U.S.)?", answer: "red", distractors: ["white", "blue", "gold"] },
    { text: "Who freed the enslaved people in the U.S.?", answer: "Abraham Lincoln", distractors: ["George Washington", "Thomas Jefferson", "James Madison"] },
    { text: "What's the largest U.S. state by area?", answer: "Alaska", distractors: ["Texas", "California", "Montana"] },
    { text: "What body of water borders Florida on the east?", answer: "Atlantic Ocean", distractors: ["Pacific Ocean", "Gulf of Mexico", "Lake Michigan"] },
    { text: "What holiday is celebrated July 4th?", answer: "Independence Day", distractors: ["Memorial Day", "Labor Day", "Thanksgiving"] },
    { text: "Who was the 16th U.S. President?", answer: "Abraham Lincoln", distractors: ["George Washington", "Theodore Roosevelt", "Benjamin Franklin"] },
    { text: "What's the longest river in the U.S.?", answer: "Missouri", distractors: ["Mississippi", "Colorado", "Hudson"] },
    { text: "What's a community helper?", answer: "police officer", distractors: ["movie star", "athlete", "musician"] },
    { text: "What direction does the sun rise?", answer: "east", distractors: ["west", "north", "south"] },
  ];
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/* ── print ───────────────────────────────────────────────────────── */

function openQuizPrintWindow(slices: QuizSlice[]) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const css = `
    @media print { @page { size: letter; margin: 0.55in; } .page-break { page-break-after: always; } }
    body { font-family: -apple-system, sans-serif; color: #111; padding: 16px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #555; margin-bottom: 14px; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #ede9fe; color: #6d28d9; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
    .question { padding: 10px 0; border-bottom: 1px dashed #ccc; }
    .question .q-num { display: inline-block; width: 22px; height: 22px; border-radius: 50%; background: #6d28d9; color: white; text-align: center; line-height: 22px; font-weight: 800; font-size: 12px; margin-right: 8px; }
    .question .q-text { font-size: 14px; font-weight: 600; }
    .choices { margin: 8px 0 0 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
    .choice { display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .bubble { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #444; border-radius: 50%; flex-shrink: 0; }
    .barcode-strip { text-align: right; }
  `;
  const slicesHtml = slices.map((slice, idx) => {
    const barcodeSvg = bc128svg(slice.barcode, 0, 70, true, 1.8);
    const today = new Date().toLocaleDateString();
    const qHtml = slice.questions.map((q) => {
      const choices = q.choices || [q.answer];
      return `
        <div class="question">
          <div><span class="q-num">${q.num}</span><span class="q-text">${escapeHtml(q.text)}</span></div>
          <div class="choices">
            ${choices.map((c, i) => `
              <div class="choice"><span class="bubble"></span><b>${String.fromCharCode(65 + i)}.</b> ${escapeHtml(c)}</div>
            `).join("")}
          </div>
        </div>`;
    }).join("");
    const isLast = idx === slices.length - 1;
    return `
      <section style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <h1>📝 ${escapeHtml(slice.subject)} Quiz</h1>
            <div class="meta">
              <span class="pill">${escapeHtml(slice.grade)}</span> ·
              For <b>${escapeHtml(slice.studentName)}</b> · ${today}
            </div>
            <div style="font-size:11px;color:#666;margin-bottom:8px">Bubble in your answer for each question.</div>
          </div>
          <div class="barcode-strip">${barcodeSvg}</div>
        </div>
        ${qHtml}
      </section>
      ${isLast ? "" : '<div class="page-break"></div>'}
    `;
  }).join("");

  const html = `<!doctype html><html><head><title>Quiz Pack</title><style>${css}</style></head>
    <body>${slicesHtml}<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),200))</script></body></html>`;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
