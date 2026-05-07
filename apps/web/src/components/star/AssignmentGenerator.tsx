// Assignment generator. Builds a STAR assignment via OpenRouter AI
// (or a local fallback lesson) and registers it into bcDB so the
// scanner can pull up the gradebook for it later.

import { useState } from "react";
import {
  StarStore, saveAll,
  type Subject, type StarQuestion, type StarTrackerEntry, type BcEntry,
} from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, errorBeep, loggedBeep } from "../../lib/star/sounds.ts";

const SUBJECTS: Subject[] = ["Math", "Reading", "Writing", "Science", "Social Studies"];
const GRADES = ["K", "1st", "2nd", "3rd", "4th", "5th"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const Q_COUNTS = [5, 10, 15, 20];
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;

interface Lesson {
  title: string;
  intro: string;
  body?: string;
  keyPoints: string[];
  workedExample?: { problem: string; solution: string };
  vocab?: { term: string; definition: string }[];
}

export default function AssignmentGenerator({ onCreated }: { onCreated?: (id: string) => void }) {
  const [studentName, setStudentName] = useState("");
  const [subject, setSubject] = useState<Subject>("Math");
  const [grade, setGrade] = useState("3rd");
  const [week, setWeek] = useState("1");
  const [day, setDay] = useState("Monday");
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>("Medium");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; questions: StarQuestion[]; lesson: Lesson } | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const apiKey = StarStore.getApiKey();
      const model = StarStore.getAiModel() || "openrouter/auto";
      let questions: StarQuestion[] | null = null;
      let lesson: Lesson | null = null;

      if (apiKey) {
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content: "You are an expert special-education teacher creating short, scaffolded worksheets. ALWAYS reply with raw JSON only. No markdown, no fences, no commentary.",
                },
                {
                  role: "user",
                  content: buildPrompt({ subject, grade, count, difficulty, goal, studentName }),
                },
              ],
              temperature: 0.6,
            }),
          });
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content || "";
          const parsed = safeParseJSON(content);
          if (parsed?.questions && Array.isArray(parsed.questions)) {
            questions = parsed.questions.map((q: any, i: number) => ({
              num: i + 1,
              text: String(q.text || q.question || `Question ${i + 1}`),
              answer: String(q.answer || ""),
            }));
            lesson = parsed.lesson || null;
          }
        } catch {
          // fall through to local
        }
      }

      if (!questions) {
        const local = buildLocalLesson({ subject, grade, count, difficulty, goal });
        questions = local.questions;
        lesson = local.lesson;
      }

      // Build barcode ID
      const now = new Date();
      const yy = String(now.getFullYear() % 100).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const subjPrefix = subject.slice(0, 2).toUpperCase();
      const bcDB = StarStore.getBcDB();
      let n = 1;
      let id = "";
      while (true) {
        id = `${subjPrefix}-${yy}${mm}${dd}-${String(n).padStart(3, "0")}`;
        if (!bcDB[id]) break;
        n++;
      }

      const name = `${subject} · ${grade} · Week ${week} ${day}`;
      const tracker = StarStore.getAsnTrack();
      const entry: BcEntry = {
        id, type: "assignment", name, subject, gradeLevel: grade,
        studentName: studentName || undefined, week, day, goal: goal || undefined,
        questions: questions!, lesson, createdDate: now.toISOString(),
      };
      bcDB[id] = entry;

      const trk: StarTrackerEntry = {
        id, name, subject, gradeLevel: grade,
        studentName: studentName || undefined, week, day, goal: goal || undefined,
        questions: questions!, lesson, createdDate: now.toISOString(),
        status: "assigned", submissions: [],
      };
      tracker[id] = trk;

      // Also drop into star_a so the assignment list stays in sync.
      const asns = StarStore.getAsns();
      asns.unshift({ id, name, subject, type: "Assignment", grade });

      saveAll({ bcDB, asnTracker: tracker, asns });
      successBeep();
      setCreated({ id, questions: questions!, lesson: lesson! });
      onCreated?.(id);
    } catch (e) {
      console.error(e);
      errorBeep();
      alert("Something went wrong generating the assignment.");
    } finally {
      setBusy(false);
    }
  };

  const printAssignment = () => {
    if (!created) return;
    const bc = StarStore.getBcDB()[created.id];
    if (!bc || bc.type !== "assignment") return;
    openPrintWindow(bc, created.questions, created.lesson, false);
    loggedBeep();
  };
  const printAnswerKey = () => {
    if (!created) return;
    const bc = StarStore.getBcDB()[created.id];
    if (!bc || bc.type !== "assignment") return;
    openPrintWindow(bc, created.questions, created.lesson, true);
    loggedBeep();
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14, padding: 16, color: "#f5f1e8",
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
        ✨ Build a STAR Assignment
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Student (optional)">
          <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="e.g. Ryan Carter" style={inp()} />
        </Field>
        <Field label="IEP Goal (optional)">
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. multi-digit subtraction with regrouping" style={inp()} />
        </Field>

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

        <Field label="Week #">
          <input value={week} onChange={(e) => setWeek(e.target.value)} style={inp()} />
        </Field>
        <Field label="Day">
          <select value={day} onChange={(e) => setDay(e.target.value)} style={inp()}>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>

        <Field label="Number of Questions">
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {StarStore.getApiKey() ? "🤖 OpenRouter AI key set" : "💡 No AI key — will use local generator"}
        </div>
        <button onClick={generate} disabled={busy} style={primaryBtn()}>
          {busy ? "Generating…" : "✨ Generate Assignment"}
        </button>
      </div>

      {created && (
        <div style={{
          marginTop: 16, padding: 14, borderRadius: 12,
          background: "rgba(16,185,129,0.10)",
          border: "1px solid rgba(16,185,129,0.40)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                Assignment created
              </div>
              <div style={{ fontFamily: "Menlo, monospace", fontWeight: 800, fontSize: 18, color: "#fde68a" }}>{created.id}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                {created.questions.length} questions · scan barcode anytime to grade
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={printAssignment} style={ghostBtn()}>🖨 Student Copy</button>
              <button onClick={printAnswerKey} style={ghostBtn()}>🔑 Answer Key</button>
            </div>
          </div>
          <div style={{ marginTop: 12 }}
            dangerouslySetInnerHTML={{ __html: bc128svg(created.id, 0, 70, true, 2.0) }}
          />
        </div>
      )}
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────── */

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
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13, outline: "none",
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
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 13,
  };
}

function gradeMathScope(grade: string): string {
  const g = (grade || "").toUpperCase();
  if (g === "K" || g === "KG") return "Kindergarten: ONLY addition within 5 (e.g., 2+3, 4+1). No subtraction, no multiplication, no division. Use objects and finger counting.";
  if (g.startsWith("1")) return "1st grade: addition and subtraction within 20 ONLY. NO multiplication. NO division. NO 2-digit operations.";
  if (g.startsWith("2")) return "2nd grade: addition and subtraction within 100 ONLY. ABSOLUTELY NO multiplication and NO division — those start in 3rd grade. Skip counting (2s, 5s, 10s) is okay.";
  if (g.startsWith("3")) return "3rd grade: addition/subtraction within 1000, AND beginning multiplication facts ×0 through ×10. Light division as the inverse of multiplication. NO long division, NO multi-digit multiplication.";
  if (g.startsWith("4")) return "4th grade: multi-digit addition/subtraction, multiplication facts to ×12, 2-digit × 1-digit multiplication, simple division with whole-number quotients. Beginning fractions.";
  return "5th grade: all four operations with larger numbers, multi-digit multiplication, long division with whole-number quotients, fractions with same denominator.";
}

function buildPrompt(opts: { subject: Subject; grade: string; count: number; difficulty: string; goal: string; studentName: string }) {
  const subjectGuidance: Record<string, string> = {
    "Social Studies":
      "Write the lesson as a SHORT NARRATIVE STORY (5–9 kid-friendly sentences) that names every fact a student needs. Example: \"Long ago, the United States needed a way to vote on big choices. The men who wrote the Constitution met in Philadelphia in 1787. They decided every state would send people called representatives to Washington, D.C. The President leads the country. Today the President lives in the White House…\" Then every question should be answered by a sentence in the story.",
    "Science":
      "Write the lesson as a SHORT EXPLANATION + EXAMPLE (5–9 sentences) that names every fact. Example: \"Plants are living things that make their own food. They use three things: sunlight, water, and soil. The leaves take in sunlight. The roots take in water. This whole process is called photosynthesis.\" Every question must be answerable from the explanation.",
    "Reading":
      "Write the lesson as a SHORT STORY OR PASSAGE (5–9 sentences) at the student's grade level. Then every comprehension question is answered by a sentence in the passage.",
    "Writing":
      "Write the lesson as a CLEAR RULE + 1 WORKED EXAMPLE (3–6 sentences). Each question gives a prompt and the answer field shows a model sentence/short response.",
    "Math":
      `Write the lesson as the RULE STATED PLAINLY + 1 WORKED EXAMPLE end-to-end. Example: "To add fractions with the same denominator, just add the top numbers. The bottom number stays the same. Example: 2/5 + 1/5 = 3/5." Every question is a problem that uses the same rule; answers must be exact. STRICT GRADE SCOPE: ${gradeMathScope(opts.grade)} Do NOT introduce operations above the listed grade. A 2nd grader does NOT do multiplication.`,
    "PE": "Write the lesson as a short story about exercise/teamwork (4–6 sentences) with clear facts. Questions test recall.",
    "Art": "Write the lesson as a short story about an art technique or famous artist (4–6 sentences). Questions test recall.",
    "Music": "Write the lesson as a short story about music basics (4–6 sentences). Questions test recall.",
    "Library": "Write the lesson as a short story about a book topic (4–6 sentences). Questions test recall.",
  };
  const guidance = subjectGuidance[opts.subject] || subjectGuidance["Reading"];

  return `You are a special-education teacher building a SELF-CONTAINED ${opts.subject} worksheet for a ${opts.grade}-grade student${opts.studentName ? ` named ${opts.studentName}` : ""}.
${opts.goal ? `IEP / topic focus: ${opts.goal}\n` : ""}

CRITICAL RULES:
1. The "lesson" must teach EVERYTHING the student needs to answer every question — no outside knowledge.
2. ${guidance}
3. Use kid-friendly vocabulary appropriate for ${opts.grade} grade. Difficulty: ${opts.difficulty}.
4. Aim for the EASIER end of grade level — confidence-building, not challenging.
5. Every "answer" field must be the exact correct answer that can be found in the lesson.body.
6. Generate exactly ${opts.count} questions.

Return ONLY raw JSON in this exact shape (no markdown, no fences):
{
  "lesson": {
    "title": "Catchy student-friendly title",
    "intro": "1-sentence what we're learning today",
    "body": "5-9 sentence STORY/PASSAGE that contains every answer (this is the most important field)",
    "keyPoints": ["3-5 short bullet recap points pulled from the body"],
    "workedExample": { "problem": "(optional) one example problem", "solution": "the answer" },
    "vocab": [{ "term": "key word", "definition": "kid-friendly meaning" }]
  },
  "questions": [
    { "text": "Question that's answered in the body above", "answer": "Exact answer from the body" }
  ]
}`;
}

function safeParseJSON(s: string): any | null {
  try { return JSON.parse(s); } catch {}
  // strip code fences
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

// Topic banks. Each topic carries a self-contained passage that holds
// every answer, plus a question/answer pair list. The generator picks
// a topic (preferring one matched by the IEP-goal text) and returns
// `count` questions. This is the no-API-key fallback — the AI prompt
// produces fresher content when a key is set.
interface LocalTopic {
  title: string;
  intro: string;
  body: string;
  qa: { text: string; answer: string }[];
  keyPoints?: string[];
  vocab?: { term: string; definition: string }[];
  // Grade scope: 0 = Kindergarten, 1..5 = 1st..5th. A topic is "in scope"
  // for the picked grade if gradeMin <= g <= gradeMax. If unset, the
  // topic is treated as 3rd–5th (the original default).
  gradeMin?: number;
  gradeMax?: number;
}

function gradeNum(grade: string): number {
  const g = (grade || "").trim().toUpperCase();
  if (g === "K" || g === "KG" || g === "KINDERGARTEN") return 0;
  const n = parseInt(g, 10);
  return Number.isFinite(n) ? n : 3;
}

const SOCIAL_STUDIES_TOPICS: LocalTopic[] = [
  // ── K–1 ──────────────────────────────────────────────────
  {
    title: "Community Helpers",
    intro: "Today we will learn about people who help us.",
    body: "Community helpers are people who help us in our town. A teacher helps us learn. A doctor helps us when we are sick. A firefighter helps put out fires and keeps us safe. A police officer helps keep our town safe. A mail carrier brings letters to our home. We can thank our community helpers for the work they do.",
    qa: [
      { text: "Who helps us learn?", answer: "A teacher" },
      { text: "Who helps us when we are sick?", answer: "A doctor" },
      { text: "Who puts out fires?", answer: "A firefighter" },
      { text: "Who keeps our town safe?", answer: "A police officer" },
      { text: "Who brings letters to our home?", answer: "A mail carrier" },
      { text: "What is a community helper?", answer: "A person who helps us in our town" },
      { text: "Should we thank community helpers?", answer: "Yes" },
    ],
    keyPoints: ["Helpers help our town", "Teachers, doctors, firefighters, police, mail carriers"],
    gradeMin: 0, gradeMax: 1,
  },
  {
    title: "My Family",
    intro: "Families are the people who love us.",
    body: "A family is a group of people who love each other. Some families are big and some families are small. A mom and a dad are parents. Children are sons and daughters. Brothers and sisters are siblings. Grandparents are the parents of your parents. We help our family by being kind and listening.",
    qa: [
      { text: "What is a family?", answer: "A group of people who love each other" },
      { text: "What are mom and dad called?", answer: "Parents" },
      { text: "What are brothers and sisters called?", answer: "Siblings" },
      { text: "Who are the parents of your parents?", answer: "Grandparents" },
      { text: "How can we help our family?", answer: "By being kind and listening" },
    ],
    gradeMin: 0, gradeMax: 1,
  },
  // ── 2nd ──────────────────────────────────────────────────
  {
    title: "Maps and Globes",
    intro: "Maps and globes help us see where places are.",
    body: "A map is a flat picture of a place. A globe is a round model of the Earth. Maps and globes help us find places. The Earth has seven continents: North America, South America, Africa, Europe, Asia, Australia, and Antarctica. The Earth has five oceans: the Pacific, Atlantic, Indian, Arctic, and Southern. We live on the continent of North America. The United States is a country in North America.",
    qa: [
      { text: "What is a map?", answer: "A flat picture of a place" },
      { text: "What is a globe?", answer: "A round model of the Earth" },
      { text: "How many continents are there?", answer: "Seven" },
      { text: "How many oceans are there?", answer: "Five" },
      { text: "On which continent do we live?", answer: "North America" },
      { text: "Name one ocean.", answer: "Pacific" },
      { text: "Is the United States a country?", answer: "Yes" },
    ],
    keyPoints: ["Map = flat picture", "Globe = round Earth", "7 continents, 5 oceans"],
    gradeMin: 1, gradeMax: 3,
  },
  // ── 3rd–5th ──────────────────────────────────────────────
  {
    title: "American Symbols",
    intro: "Today we'll learn what some of America's symbols stand for.",
    body: "The United States has special symbols that stand for the country. The American flag has 13 stripes — one for each of the first 13 states — and 50 white stars on a blue square — one for each state today. The colors mean something too: red stands for bravery, white for peace, and blue for justice. The bald eagle is the national bird. It was chosen because it is strong, free, and lives only in North America. The Statue of Liberty stands in New York Harbor and welcomes new people to America. The Liberty Bell is in Philadelphia and rang to celebrate freedom.",
    qa: [
      { text: "How many stripes does the American flag have?", answer: "13" },
      { text: "How many stars are on the American flag?", answer: "50" },
      { text: "What does each star stand for?", answer: "A state" },
      { text: "What is the national bird?", answer: "The bald eagle" },
      { text: "Which color on the flag stands for bravery?", answer: "Red" },
      { text: "What does the color white stand for?", answer: "Peace" },
      { text: "What does the color blue stand for?", answer: "Justice" },
      { text: "Where is the Statue of Liberty?", answer: "New York Harbor" },
      { text: "Where is the Liberty Bell?", answer: "Philadelphia" },
      { text: "Why was the bald eagle chosen?", answer: "It is strong and free" },
    ],
    keyPoints: ["13 stripes = first 13 states", "50 stars = 50 states today", "Eagle = strong + free"],
    gradeMin: 2, gradeMax: 5,
  },
  {
    title: "Branches of Government",
    intro: "The U.S. government has three branches that work together.",
    body: "The United States government has three branches. The first branch is the Legislative branch — it is called Congress, and Congress writes the laws. Congress has two parts: the Senate and the House of Representatives. The second branch is the Executive branch. The President leads this branch and signs laws. The President lives in the White House in Washington, D.C. The third branch is the Judicial branch. Judges work in this branch, and the highest court is the Supreme Court. The Supreme Court has nine judges called Justices. Each branch checks the others so no one branch has too much power.",
    qa: [
      { text: "How many branches of government are there?", answer: "Three" },
      { text: "What does Congress do?", answer: "Writes the laws" },
      { text: "Which branch does the President lead?", answer: "Executive" },
      { text: "Where does the President live?", answer: "The White House" },
      { text: "What is the highest court?", answer: "The Supreme Court" },
      { text: "How many Justices are on the Supreme Court?", answer: "Nine" },
      { text: "Which branch has judges?", answer: "Judicial" },
      { text: "What are the two parts of Congress?", answer: "The Senate and the House of Representatives" },
      { text: "Which branch writes laws?", answer: "Legislative" },
      { text: "Why do the branches check each other?", answer: "So no branch has too much power" },
    ],
    keyPoints: ["Legislative = makes laws", "Executive = President signs laws", "Judicial = judges decide cases"],
    gradeMin: 4, gradeMax: 5,
  },
  {
    title: "The Thirteen Colonies",
    intro: "Long ago, America began as 13 small colonies along the East Coast.",
    body: "Before the United States was a country, it was 13 colonies belonging to England. The colonies were on the East Coast of North America. Some of the colonies were Massachusetts, Virginia, New York, and Georgia. The first colony settled was Virginia in 1607 at Jamestown. The Pilgrims came to Massachusetts in 1620 on a ship called the Mayflower. The colonists wanted to be free from England's king. In 1776, the colonies wrote the Declaration of Independence and became the United States of America. The man who wrote most of the Declaration was Thomas Jefferson. The first President was George Washington.",
    qa: [
      { text: "How many colonies were there?", answer: "13" },
      { text: "Which country owned the colonies?", answer: "England" },
      { text: "What was the first colony?", answer: "Virginia" },
      { text: "What ship did the Pilgrims sail on?", answer: "The Mayflower" },
      { text: "When did the Pilgrims arrive?", answer: "1620" },
      { text: "When was the Declaration of Independence written?", answer: "1776" },
      { text: "Who wrote most of the Declaration of Independence?", answer: "Thomas Jefferson" },
      { text: "Who was the first President?", answer: "George Washington" },
      { text: "On which coast were the colonies?", answer: "The East Coast" },
      { text: "What did the colonists want?", answer: "To be free from England's king" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
];

const SCIENCE_TOPICS: LocalTopic[] = [
  // ── K–1 ──────────────────────────────────────────────────
  {
    title: "Living and Non-Living",
    intro: "Some things are alive and some things are not.",
    body: "Living things grow and need food and water. A dog is a living thing. A tree is a living thing. A person is a living thing. Non-living things do not grow. A rock is non-living. A toy is non-living. A book is non-living. Living things move and change. Non-living things stay the same.",
    qa: [
      { text: "Do living things grow?", answer: "Yes" },
      { text: "Is a dog living or non-living?", answer: "Living" },
      { text: "Is a rock living or non-living?", answer: "Non-living" },
      { text: "Is a tree living?", answer: "Yes" },
      { text: "What do living things need?", answer: "Food and water" },
      { text: "Is a toy living?", answer: "No" },
    ],
    gradeMin: 0, gradeMax: 1,
  },
  {
    title: "The Five Senses",
    intro: "We use our five senses to learn about the world.",
    body: "We have five senses. We use our EYES to see. We use our EARS to hear. We use our NOSE to smell. We use our TONGUE to taste. We use our SKIN to touch and feel. The five senses help us understand the world around us.",
    qa: [
      { text: "How many senses do we have?", answer: "Five" },
      { text: "What do we use to see?", answer: "Our eyes" },
      { text: "What do we use to hear?", answer: "Our ears" },
      { text: "What do we use to smell?", answer: "Our nose" },
      { text: "What do we use to taste?", answer: "Our tongue" },
      { text: "What do we use to touch?", answer: "Our skin" },
    ],
    gradeMin: 0, gradeMax: 2,
  },
  {
    title: "How Plants Grow",
    intro: "Plants are living things — let's learn what they need to grow.",
    body: "Plants are living things that make their own food. They need three things to grow: sunlight, water, and soil. The leaves of a plant catch sunlight. The roots of a plant pull water and nutrients from the soil. When a plant uses sunlight, water, and a gas called carbon dioxide, it makes its own food. This whole process is called photosynthesis. The food the plant makes is a kind of sugar. Plants give off oxygen, which is the gas people and animals need to breathe. So plants help us live, and we help plants by giving them water and sunlight.",
    qa: [
      { text: "What three things do plants need to grow?", answer: "Sunlight, water, and soil" },
      { text: "What part of a plant catches sunlight?", answer: "The leaves" },
      { text: "What part of a plant takes in water?", answer: "The roots" },
      { text: "What is the process of plants making food called?", answer: "Photosynthesis" },
      { text: "What gas do plants give off?", answer: "Oxygen" },
      { text: "What kind of food do plants make?", answer: "Sugar" },
      { text: "What gas do plants take in?", answer: "Carbon dioxide" },
      { text: "Are plants living things?", answer: "Yes" },
      { text: "How can people help plants?", answer: "By giving them water and sunlight" },
      { text: "What do plants give us that we need to breathe?", answer: "Oxygen" },
    ],
    vocab: [
      { term: "photosynthesis", definition: "How plants use sunlight to make food" },
      { term: "roots", definition: "The part of a plant that goes into the soil" },
    ],
  },
  {
    title: "The Water Cycle",
    intro: "Water moves around our planet in a never-ending cycle.",
    body: "Water on Earth keeps moving in a pattern called the water cycle. First, the sun heats water in lakes, rivers, and oceans. The water turns into a gas called water vapor. This step is called evaporation. The water vapor rises high in the sky and cools down. When it cools, it turns back into tiny water drops that form clouds. This step is called condensation. When the clouds get too heavy, the water falls back down as rain or snow. This step is called precipitation. The water then collects in rivers and oceans, and the whole cycle starts again.",
    qa: [
      { text: "What is it called when water turns into a gas?", answer: "Evaporation" },
      { text: "What heats up water in the water cycle?", answer: "The sun" },
      { text: "What is water vapor?", answer: "Water that has turned into a gas" },
      { text: "What forms when water vapor cools?", answer: "Clouds" },
      { text: "What is it called when water vapor turns back to liquid?", answer: "Condensation" },
      { text: "What is it called when water falls from clouds?", answer: "Precipitation" },
      { text: "What are two examples of precipitation?", answer: "Rain and snow" },
      { text: "Where does water collect after it falls?", answer: "Rivers and oceans" },
      { text: "Does the water cycle ever stop?", answer: "No" },
      { text: "What is the whole pattern called?", answer: "The water cycle" },
    ],
  },
  {
    title: "States of Matter",
    intro: "Everything around us is made of matter, and matter has states.",
    body: "Matter is anything that takes up space. Matter has three main states: solid, liquid, and gas. A solid keeps its shape — like a rock or an ice cube. A liquid takes the shape of its container — like water in a cup. A gas spreads out to fill its space — like air in a balloon. Matter can change from one state to another. When ice gets warm, it melts into water. When water gets very hot, it turns into a gas called steam. When steam cools, it turns back into water. Water freezes back into ice when it gets very cold.",
    qa: [
      { text: "What is matter?", answer: "Anything that takes up space" },
      { text: "What are the three main states of matter?", answer: "Solid, liquid, and gas" },
      { text: "Which state keeps its shape?", answer: "Solid" },
      { text: "Which state takes the shape of its container?", answer: "Liquid" },
      { text: "Which state spreads out to fill its space?", answer: "Gas" },
      { text: "What happens when ice gets warm?", answer: "It melts into water" },
      { text: "What is steam?", answer: "Water as a gas" },
      { text: "What happens when water gets very cold?", answer: "It freezes into ice" },
      { text: "Give one example of a solid.", answer: "A rock" },
      { text: "Give one example of a gas.", answer: "Air" },
    ],
  },
];

const READING_TOPICS: LocalTopic[] = [
  {
    title: "Maya's Garden",
    intro: "Read the passage carefully — every answer is in the story.",
    body: "Maya planted a garden in her backyard last spring. She planted three things: red tomatoes, sweet carrots, and tall sunflowers. Every morning before school, Maya watered her garden with a small green watering can. Her dog Buddy followed her around but was not allowed to dig. After two months, Maya's tomatoes turned bright red. The sunflowers grew taller than Maya. Maya picked the carrots and gave one to her grandmother, who said it was the best carrot she had ever tasted.",
    qa: [
      { text: "Whose garden is in the story?", answer: "Maya's" },
      { text: "What three things did Maya plant?", answer: "Tomatoes, carrots, and sunflowers" },
      { text: "What color is Maya's watering can?", answer: "Green" },
      { text: "What is the name of Maya's dog?", answer: "Buddy" },
      { text: "What was Buddy not allowed to do?", answer: "Dig" },
      { text: "When did Maya water the garden?", answer: "Every morning before school" },
      { text: "Who did Maya give a carrot to?", answer: "Her grandmother" },
      { text: "How tall did the sunflowers grow?", answer: "Taller than Maya" },
      { text: "What color did the tomatoes turn?", answer: "Bright red" },
      { text: "What did Grandmother say about the carrot?", answer: "It was the best carrot she had ever tasted" },
    ],
  },
  {
    title: "The Lost Backpack",
    intro: "Read carefully and find clues in the story.",
    body: "Liam left his blue backpack on the bus on Monday. Inside the backpack were his math book, a green pencil case, and his lunchbox. The bus driver, Mr. Park, found the backpack at the end of the day. He brought it to the school office. The next morning, Liam went to the office and got his backpack back. Liam thanked Mr. Park and promised to be more careful. The school secretary gave Liam a sticker for being polite.",
    qa: [
      { text: "What is the boy's name?", answer: "Liam" },
      { text: "What color is the backpack?", answer: "Blue" },
      { text: "Where did Liam leave the backpack?", answer: "On the bus" },
      { text: "On what day did this happen?", answer: "Monday" },
      { text: "Who found the backpack?", answer: "Mr. Park" },
      { text: "Where did Mr. Park bring the backpack?", answer: "The school office" },
      { text: "What was inside the backpack?", answer: "A math book, a green pencil case, and a lunchbox" },
      { text: "What did Liam promise?", answer: "To be more careful" },
      { text: "Who gave Liam a sticker?", answer: "The school secretary" },
      { text: "Why did Liam get a sticker?", answer: "For being polite" },
    ],
  },
];

const WRITING_TOPICS: LocalTopic[] = [
  {
    title: "Writing Complete Sentences",
    intro: "A complete sentence has a subject and a verb.",
    body: "Every complete sentence needs two parts. The first part is the SUBJECT — who or what the sentence is about. The second part is the VERB — what the subject does. A complete sentence also starts with a capital letter and ends with a period, question mark, or exclamation mark. \"The dog runs.\" is a complete sentence: \"the dog\" is the subject and \"runs\" is the verb. \"Runs fast\" is NOT a complete sentence because it has no subject.",
    qa: [
      { text: "What two parts does every complete sentence need?", answer: "A subject and a verb" },
      { text: "What does the subject tell?", answer: "Who or what the sentence is about" },
      { text: "What does the verb tell?", answer: "What the subject does" },
      { text: "What letter must a sentence start with?", answer: "A capital letter" },
      { text: "Name one mark a sentence can end with.", answer: "A period" },
      { text: "Is 'Runs fast' a complete sentence?", answer: "No" },
      { text: "Why is 'Runs fast' not a complete sentence?", answer: "It has no subject" },
      { text: "In 'The dog runs.' what is the subject?", answer: "The dog" },
      { text: "In 'The dog runs.' what is the verb?", answer: "runs" },
      { text: "Name another end mark besides a period.", answer: "Question mark" },
    ],
  },
];

// Grade → which math operations are appropriate, and the number range
// each one should stay within. Pulled from common elementary scope &
// sequence: K and 1st never multiply, 2nd is +/− to 100 with skip counting,
// 3rd introduces basic multiplication facts (×0–10), 4th adds simple
// division and 2-digit × 1-digit, 5th allows larger numbers + light division.
interface GradeMath {
  ops: Array<"+" | "-" | "×" | "÷">;
  // Per-op number bounds: [maxA, maxB]
  range: Partial<Record<"+" | "-" | "×" | "÷", [number, number]>>;
  intro: string;
  body: string;
  keyPoints: string[];
  workedExample: { problem: string; solution: string };
}

function gradeKey(grade: string): "K" | "1" | "2" | "3" | "4" | "5" {
  const g = (grade || "").trim().toUpperCase();
  if (g === "K" || g === "KG" || g === "KINDERGARTEN") return "K";
  const n = parseInt(g, 10);
  if (n === 1) return "1";
  if (n === 2) return "2";
  if (n === 3) return "3";
  if (n === 4) return "4";
  return "5";
}

const GRADE_MATH: Record<"K" | "1" | "2" | "3" | "4" | "5", GradeMath> = {
  K: {
    ops: ["+"],
    range: { "+": [5, 5] },
    intro: "Today we are adding small numbers. We add when we put things together.",
    body: "When we ADD, we put two groups together to find how many in all. The symbol + means add. Example: 2 + 3. We can count: 1, 2 … then keep going 3, 4, 5. So 2 + 3 = 5. Try counting on your fingers if you need help.",
    keyPoints: ["+ means add", "Count to find the total", "You can use your fingers"],
    workedExample: { problem: "2 + 3 = ?", solution: "5" },
  },
  "1": {
    ops: ["+", "-"],
    range: { "+": [10, 10], "-": [10, 5] },
    intro: "Today we are adding and subtracting up to 20.",
    body: "When we ADD (+), we put two numbers together. Example: 6 + 4 = 10. When we SUBTRACT (−), we take one number away. Example: 8 − 3 = 5. We can count up for adding and count back for subtracting.",
    keyPoints: ["+ means put together", "− means take away", "Add by counting up, subtract by counting back"],
    workedExample: { problem: "6 + 4 = ?", solution: "10" },
  },
  "2": {
    ops: ["+", "-"],
    range: { "+": [50, 50], "-": [50, 30] },
    intro: "Today we are adding and subtracting numbers up to 100. (No multiplication yet — that starts in 3rd grade.)",
    body: "When we ADD (+), we put numbers together. Example: 23 + 14 = 37. When we SUBTRACT (−), we take one number from another. Example: 50 − 18 = 32. For 2-digit numbers, line up the ones place and the tens place. Add or subtract the ones first, then the tens.",
    keyPoints: ["Line up the ones and tens", "Ones place first, then tens", "+ adds, − takes away"],
    workedExample: { problem: "23 + 14 = ?", solution: "37" },
  },
  "3": {
    ops: ["+", "-", "×"],
    range: { "+": [100, 100], "-": [100, 50], "×": [10, 10] },
    intro: "Today we are practicing addition, subtraction, and beginning multiplication facts (×0 to ×10).",
    body: "When we MULTIPLY (×), we add a number to itself in equal groups. Example: 4 × 3 means 3 groups of 4, or 4 + 4 + 4 = 12. When we ADD (+), we put numbers together: 45 + 27 = 72. When we SUBTRACT (−), we take one away: 80 − 35 = 45. The × symbol means \"groups of\" or \"times.\"",
    keyPoints: ["× means groups of", "3 × 4 = 4 + 4 + 4 = 12", "Multiplication is fast adding"],
    workedExample: { problem: "4 × 3 = ?", solution: "12" },
  },
  "4": {
    ops: ["+", "-", "×", "÷"],
    range: { "+": [500, 500], "-": [500, 200], "×": [12, 9], "÷": [99, 9] },
    intro: "Today we are practicing addition, subtraction, multiplication facts, and beginning division.",
    body: "When we MULTIPLY (×), we count equal groups: 7 × 8 = 56. When we DIVIDE (÷), we split into equal groups: 56 ÷ 8 = 7. Multiplication and division are opposite operations — if 7 × 8 = 56, then 56 ÷ 8 = 7. We also keep practicing larger addition and subtraction.",
    keyPoints: ["× and ÷ are opposites", "If 7×8=56 then 56÷8=7", "Bigger numbers — line them up"],
    workedExample: { problem: "56 ÷ 8 = ?", solution: "7" },
  },
  "5": {
    ops: ["+", "-", "×", "÷"],
    range: { "+": [1000, 1000], "-": [1000, 500], "×": [25, 12], "÷": [144, 12] },
    intro: "Today we are practicing all four operations with larger numbers.",
    body: "All four operations are tools for solving problems. ADDITION (+) puts amounts together. SUBTRACTION (−) finds the difference. MULTIPLICATION (×) is fast adding of equal groups. DIVISION (÷) splits into equal groups. Multiplication and division are opposites — and so are addition and subtraction. Read carefully and pick the right operation.",
    keyPoints: ["+ and − are opposites", "× and ÷ are opposites", "Pick the right operation"],
    workedExample: { problem: "12 × 11 = ?", solution: "132" },
  },
};

function buildMathLesson(opts: { subject: Subject; grade: string; count: number; difficulty: string; goal: string }): { questions: StarQuestion[]; lesson: Lesson } {
  const g = gradeKey(opts.grade);
  const cfg = GRADE_MATH[g];

  // Honor difficulty by scaling up or down WITHIN the grade band — never
  // crossing into operations the student hasn't learned yet.
  const scale = opts.difficulty === "Easy" ? 0.5 : opts.difficulty === "Hard" ? 1.0 : 0.75;

  const questions: StarQuestion[] = [];
  for (let i = 0; i < opts.count; i++) {
    const op = cfg.ops[i % cfg.ops.length];
    const [maxA, maxB] = cfg.range[op]!;
    let a = Math.max(1, Math.floor(Math.random() * Math.ceil(maxA * scale)) + 1);
    let b = Math.max(1, Math.floor(Math.random() * Math.ceil(maxB * scale)) + 1);

    let ans: number;
    let text: string;
    if (op === "+") {
      ans = a + b;
      text = `${a} + ${b} = ?`;
    } else if (op === "-") {
      // Always positive result for elementary
      if (b > a) [a, b] = [b, a];
      ans = a - b;
      text = `${a} − ${b} = ?`;
    } else if (op === "×") {
      ans = a * b;
      text = `${a} × ${b} = ?`;
    } else {
      // Division: pick a clean problem so the answer is a whole number
      const divisor = Math.max(2, b);
      const quotient = Math.max(1, Math.floor(Math.random() * Math.ceil(maxA / divisor)) + 1);
      const dividend = divisor * quotient;
      ans = quotient;
      text = `${dividend} ÷ ${divisor} = ?`;
    }
    questions.push({ num: i + 1, text, answer: String(ans) });
  }

  return {
    questions,
    lesson: {
      title: `Math — ${opts.grade} Grade`,
      intro: opts.goal ? `Today we're practicing ${opts.goal}.` : cfg.intro,
      body: cfg.body,
      keyPoints: cfg.keyPoints,
      workedExample: cfg.workedExample,
    },
  };
}

function pickTopic(bank: LocalTopic[], goal: string): LocalTopic {
  if (goal) {
    const g = goal.toLowerCase();
    const matched = bank.find((t) => t.title.toLowerCase().includes(g) || t.body.toLowerCase().includes(g));
    if (matched) return matched;
  }
  return bank[Math.floor(Math.random() * bank.length)];
}

function buildLocalLesson(opts: { subject: Subject; grade: string; count: number; difficulty: string; goal: string }): { questions: StarQuestion[]; lesson: Lesson } {
  const { subject, count, difficulty, goal } = opts;

  // Math is procedural — generate fresh problems, but the operations and
  // number ranges have to follow the student's actual grade level. A 2nd
  // grader does NOT do multiplication; a kindergartener does NOT subtract
  // past 10. Multiplication starts in 3rd; multi-digit multiplication and
  // long division in 4th–5th.
  if (subject === "Math") {
    return buildMathLesson(opts);
  }

  const bank: LocalTopic[] =
    subject === "Social Studies" ? SOCIAL_STUDIES_TOPICS :
    subject === "Science"        ? SCIENCE_TOPICS :
    subject === "Reading"        ? READING_TOPICS :
    subject === "Writing"        ? WRITING_TOPICS :
    /* Art / Music / Library / PE */ READING_TOPICS;

  const topic = pickTopic(bank, goal);

  // Shuffle a copy of the q/a pairs so retakes feel different, then take `count`.
  const pool = [...topic.qa].sort(() => Math.random() - 0.5);
  const questions: StarQuestion[] = Array.from({ length: count }, (_, i) => {
    const q = pool[i % pool.length];
    return { num: i + 1, text: q.text, answer: q.answer };
  });

  const lesson: Lesson = {
    title: topic.title,
    intro: topic.intro,
    body: topic.body,
    keyPoints: topic.keyPoints || [],
    vocab: topic.vocab,
  };

  return { questions, lesson };
}

function openPrintWindow(bc: BcEntry & { type: "assignment" }, questions: StarQuestion[], lesson: Lesson | null, isKey: boolean) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const barcodeSvg = bc128svg(bc.id, 0, 80, true, 2.0);
  const studentName = bc.studentName || "______________________";
  const head = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#555">${isKey ? "📑 Teacher Answer Key" : "📝 Student Worksheet"}</div>
        <div style="font-size:22px;font-weight:800;margin-top:2px">${escapeHtml(bc.name)}</div>
        <div style="font-size:13px;color:#555;margin-top:4px">
          Student: <b>${escapeHtml(studentName)}</b> · Grade: ${escapeHtml(bc.gradeLevel || "")}
          · ${bc.week ? "Week " + escapeHtml(bc.week) + " · " : ""}${escapeHtml(bc.day || "")}
        </div>
        ${bc.goal ? `<div style="font-size:12px;color:#555;margin-top:4px">IEP Goal: ${escapeHtml(bc.goal)}</div>` : ""}
      </div>
      <div style="text-align:right">${barcodeSvg}</div>
    </div>
  `;

  const lessonAny: any = lesson;
  const lessonHtml = lesson ? `
    <div style="border:1px solid #ddd;border-radius:8px;padding:12px 14px;margin-bottom:14px;background:#fafafa">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px">📖 ${escapeHtml(lesson.title)}</div>
      ${lesson.intro ? `<div style="font-size:13px;margin-bottom:8px">${escapeHtml(lesson.intro)}</div>` : ""}
      ${lessonAny.body ? `<div style="font-size:13px;margin-bottom:8px;line-height:1.55;white-space:pre-wrap">${escapeHtml(String(lessonAny.body))}</div>` : ""}
      ${lesson.keyPoints?.length ? `<ul style="margin:0 0 8px 18px;padding:0;font-size:13px">${lesson.keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}
      ${lesson.workedExample ? `<div style="font-size:13px;margin-top:6px"><b>Example:</b> ${escapeHtml(lesson.workedExample.problem)} → <span style="color:#16a34a;font-weight:700">${escapeHtml(lesson.workedExample.solution)}</span></div>` : ""}
      ${lesson.vocab?.length ? `<div style="font-size:13px;margin-top:6px"><b>Vocab:</b> ${lesson.vocab.map((v) => `<span style="margin-right:10px"><b>${escapeHtml(v.term)}</b>: ${escapeHtml(v.definition)}</span>`).join("")}</div>` : ""}
    </div>
  ` : "";

  const qHtml = questions.map((q) => `
    <div style="margin-bottom:14px;page-break-inside:avoid">
      <div style="font-size:14px"><b>${q.num}.</b> ${escapeHtml(q.text)}</div>
      ${isKey
        ? `<div style="font-size:13px;color:#16a34a;font-weight:700;margin-top:4px;font-family:Menlo,monospace">✓ ${escapeHtml(q.answer)}</div>`
        : `<div style="border-bottom:1px solid #999;height:32px;margin-top:6px"></div>`}
    </div>
  `).join("");

  w.document.write(`<!doctype html><html><head><title>${escapeHtml(bc.name)} ${isKey ? "(Key)" : ""}</title>
    <style>
      @media print { @page { size: letter; margin: 0.5in; } }
      body { font-family: -apple-system, sans-serif; color: #111; padding: 16px; }
    </style>
  </head><body>${head}${lessonHtml}<div>${qHtml}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));</script>
  </body></html>`);
  w.document.close();
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
