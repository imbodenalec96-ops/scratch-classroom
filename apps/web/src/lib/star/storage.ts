// STAR Program — barcode + refusal documentation system.
// All data lives in localStorage so it's offline-friendly and per-device.
// Keys mirror the original STAR_Scanner.html spec exactly.

export type Subject = "Math" | "Reading" | "Writing" | "Spelling" | "Science" | "Social Studies" | "SEL" | "PE" | "Art" | "Library" | "Music";

export interface StarStudent {
  id: string;
  firstName: string;
  lastName: string;
  grade?: string;
  disability?: string;
  phone?: string;
  email?: string;
  iep?: string;
}

export interface StarQuestion {
  num: number;
  text: string;
  answer: string;
  // Multiple-choice quiz support — when present, the question is rendered
  // as an MCQ (A/B/C/D bubbles) in print + grading. `answer` then holds
  // the correct CHOICE TEXT (not the letter), so existing reveal logic
  // ("✓ {q.answer}") still surfaces the right thing.
  choices?: string[];
}

export interface StarAssignment {
  id: string;
  name: string;
  subject: Subject;
  type: "Work Refusal" | "Specials Refusal" | "Assignment";
  grade?: string;
}

export type BcEntry =
  | {
      id: string;
      type: "assignment";
      name: string;
      subject: Subject;
      gradeLevel: string;
      studentName?: string;
      week?: string;
      day?: string;
      goal?: string;
      questions: StarQuestion[];
      lesson?: any;
      createdDate: string;
      // Optional link back to the real classroom DB assignment id, so a
      // re-sync from the API won't double-create the STAR entry.
      sourceId?: string;
      // Optional assigned student id (real DB id) so the gradebook can
      // pre-select that student when this barcode is scanned.
      studentId?: string;
    }
  | {
      id: string;
      type: "work-refusal-form" | "specials-refusal-form";
      name: string;
      studentName: string;
      createdDate: string;
    }
  | {
      id: string;
      type: "pass-action";
      name: string;
      // Which kind of pass this barcode triggers.
      passKind: "Bathroom" | "Water" | "Break";
      createdDate: string;
    }
  | {
      id: string;
      type: "status-action";
      name: string;
      // Which assignment status this barcode applies when paired with
      // an assignment + student in the StatusModal.
      statusKind: "Absent" | "Skipped" | "Excused" | "Makeup";
      createdDate: string;
    };

export interface ActivePass {
  studentId: string;
  studentName: string;
  passKind: "Bathroom" | "Water" | "Break";
  startedAt: string; // ISO
}

export interface StarSubmission {
  studentId: string;
  studentName: string;
  completedDate: string;
  score: number;
  maxScore: number;
  pct: number;
  letterGrade: string;
  feedback?: string;
  timeSpent?: string;
  notes?: string;
  // "absent" + "skipped" are kept as distinct values so reports can
  // tell them apart; both count toward "not completed". Old data with
  // status="missing" still parses fine — we just don't write that anymore.
  status: "completed" | "in-progress" | "missing" | "absent" | "skipped" | "excused" | "makeup";
  qMarks?: Record<string, "correct" | "wrong">;
  loggedAt: string;
}

export interface StarTrackerEntry {
  id: string;
  name: string;
  subject: Subject;
  gradeLevel: string;
  studentName?: string;
  studentId?: string;
  week?: string;
  day?: string;
  goal?: string;
  questions: StarQuestion[];
  lesson?: any;
  createdDate: string;
  status: "assigned" | "completed" | "in-progress" | "missing" | "absent" | "skipped" | "excused" | "makeup";
  submissions: StarSubmission[];
}

export interface StarRefusalLog {
  id: number;
  num: number;
  barcode: string;
  date: string;
  time: string;
  student: string;
  studentId: string;
  type: "Work Refusal" | "Specials Refusal";
  subject?: string;
  task?: string;
  behaviors: string;
  interventions: string;
  actions: string;
  parent: string;
  admin: string;
  notes: string;
}

export interface StarRfgTrackerEntry {
  id: string;
  type: "work" | "specials";
  studentName: string;
  studentId: string;
  date: string;
  time: string;
  subject?: string;
  task?: string;
  behaviors: string;
  interventions: string;
  actions: string;
  parentContacted: string;
  adminNotified: string;
  status: "logged" | "pending" | "follow-up" | "resolved" | "escalated";
  followUp: string;
  resolution: string;
  notes: string;
  barcode: string;
  createdAt: string;
}

const KEYS = {
  s: "star_s",
  a: "star_a",
  bcdb: "star_bcdb",
  asntrack: "star_asntrack",
  rfgtrack: "star_rfgtrack",
  log: "star_l",
  apiKey: "star_api_key",
  aiModel: "star_ai_model",
  tpls: "star_tpls",
  pointsPerCompletion: "star_points_per_completion",
  activePasses: "star_active_passes",
  passLog: "star_pass_log",
  photos: "star_photos",
  templates: "star_templates",
} as const;

export interface StarTemplate {
  id: string;
  name: string;            // teacher-facing label, e.g. "Daily Math · 3rd"
  subject: Subject;
  grade: string;
  count: number;
  difficulty: "Easy" | "Medium" | "Hard";
  goal?: string;
  studentId?: string;       // optional default student
  studentName?: string;
  createdAt: string;
  // Bumped each time the template is used to "regenerate fresh content"
  // — handy for the teacher to see how many worksheets came from it.
  uses: number;
}

export interface StarPhoto {
  id: string;             // unique id for delete + key
  barcode: string;        // assignment / form this photo belongs to
  studentId?: string;
  studentName?: string;
  dataUrl: string;        // compressed jpeg base64
  ts: number;
  note?: string;
}

// LocalStorage with safe parse + default fallback
const ls = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : (parsed as T);
    } catch { return fallback; }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

export const DEFAULT_TPLS = [
  "Refused after 3 verbal prompts",
  "Task difficulty too high",
  "Student had difficult morning",
  "Preferred activity was removed prior",
  "Transition difficulty — needed extra time",
];

// Roster starts empty — the sync pulls the real classroom roster from
// the API on first /star visit. (Earlier versions seeded STU-001..STU-008
// placeholders; those get wiped the first time sync runs in replace mode.)
export const DEFAULT_STUDENTS: StarStudent[] = [];

// All 7 keys read/written through these helpers.
export const StarStore = {
  getStudents:   () => ls.get<StarStudent[]>(KEYS.s, DEFAULT_STUDENTS),
  setStudents:   (v: StarStudent[]) => ls.set(KEYS.s, v),
  getAsns:       () => ls.get<StarAssignment[]>(KEYS.a, []),
  setAsns:       (v: StarAssignment[]) => ls.set(KEYS.a, v),
  getBcDB:       () => ls.get<Record<string, BcEntry>>(KEYS.bcdb, {}),
  setBcDB:       (v: Record<string, BcEntry>) => ls.set(KEYS.bcdb, v),
  getAsnTrack:   () => ls.get<Record<string, StarTrackerEntry>>(KEYS.asntrack, {}),
  setAsnTrack:   (v: Record<string, StarTrackerEntry>) => ls.set(KEYS.asntrack, v),
  getRfgTrack:   () => ls.get<StarRfgTrackerEntry[]>(KEYS.rfgtrack, []),
  setRfgTrack:   (v: StarRfgTrackerEntry[]) => ls.set(KEYS.rfgtrack, v),
  getLog:        () => ls.get<StarRefusalLog[]>(KEYS.log, []),
  setLog:        (v: StarRefusalLog[]) => ls.set(KEYS.log, v),
  getApiKey:     () => ls.get<string>(KEYS.apiKey, ""),
  setApiKey:     (v: string) => ls.set(KEYS.apiKey, v),
  getAiModel:    () => ls.get<string>(KEYS.aiModel, "openrouter/auto"),
  setAiModel:    (v: string) => ls.set(KEYS.aiModel, v),
  getTpls:       () => ls.get<string[]>(KEYS.tpls, DEFAULT_TPLS),
  setTpls:       (v: string[]) => ls.set(KEYS.tpls, v),
  getPointsPerCompletion: () => ls.get<number>(KEYS.pointsPerCompletion, 5),
  setPointsPerCompletion: (v: number) => ls.set(KEYS.pointsPerCompletion, v),
  getTemplates: () => ls.get<StarTemplate[]>(KEYS.templates, []),
  setTemplates: (v: StarTemplate[]) => ls.set(KEYS.templates, v),
  addTemplate: (t: StarTemplate) => {
    const all = ls.get<StarTemplate[]>(KEYS.templates, []);
    all.unshift(t);
    ls.set(KEYS.templates, all.slice(0, 100));
  },
  bumpTemplate: (id: string) => {
    const all = ls.get<StarTemplate[]>(KEYS.templates, []);
    const i = all.findIndex((t) => t.id === id);
    if (i >= 0) { all[i].uses = (all[i].uses || 0) + 1; ls.set(KEYS.templates, all); }
  },
  deleteTemplate: (id: string) => {
    const all = ls.get<StarTemplate[]>(KEYS.templates, []).filter((t) => t.id !== id);
    ls.set(KEYS.templates, all);
  },
  // Wipe one assignment everywhere it lives — bcDB, asnTracker, asns.
  // Submissions on the tracker entry go with it. Caller is expected to
  // confirm with the teacher first.
  deleteAssignment: (id: string) => {
    const bcDB = ls.get<Record<string, BcEntry>>(KEYS.bcdb, {});
    delete bcDB[id];
    ls.set(KEYS.bcdb, bcDB);
    const trk = ls.get<Record<string, StarTrackerEntry>>(KEYS.asntrack, {});
    delete trk[id];
    ls.set(KEYS.asntrack, trk);
    const asns = ls.get<StarAssignment[]>(KEYS.a, []).filter((a) => a.id !== id);
    ls.set(KEYS.a, asns);
  },
  getActivePasses: () => ls.get<ActivePass[]>(KEYS.activePasses, []),
  setActivePasses: (v: ActivePass[]) => ls.set(KEYS.activePasses, v),
  getPassLog: () => ls.get<Array<ActivePass & { endedAt: string; elapsedSec: number }>>(KEYS.passLog, []),
  setPassLog: (v: Array<ActivePass & { endedAt: string; elapsedSec: number }>) => ls.set(KEYS.passLog, v),
  // Photos are keyed by barcode for fast lookup in the gradebook.
  getPhotos: () => ls.get<Record<string, StarPhoto[]>>(KEYS.photos, {}),
  setPhotos: (v: Record<string, StarPhoto[]>) => ls.set(KEYS.photos, v),
  addPhoto: (photo: StarPhoto) => {
    const all = ls.get<Record<string, StarPhoto[]>>(KEYS.photos, {});
    const list = all[photo.barcode] || [];
    list.unshift(photo);
    all[photo.barcode] = list;
    ls.set(KEYS.photos, all);
  },
  deletePhoto: (barcode: string, photoId: string) => {
    const all = ls.get<Record<string, StarPhoto[]>>(KEYS.photos, {});
    if (!all[barcode]) return;
    all[barcode] = all[barcode].filter((p) => p.id !== photoId);
    if (all[barcode].length === 0) delete all[barcode];
    ls.set(KEYS.photos, all);
  },
};

// Save EVERYTHING in one shot — matches the original spec's saveAll().
export function saveAll(state: {
  log?: StarRefusalLog[];
  students?: StarStudent[];
  asns?: StarAssignment[];
  bcDB?: Record<string, BcEntry>;
  asnTracker?: Record<string, StarTrackerEntry>;
  rfgTracker?: StarRfgTrackerEntry[];
  tpls?: string[];
}) {
  if (state.log)        StarStore.setLog(state.log);
  if (state.students)   StarStore.setStudents(state.students);
  if (state.asns)       StarStore.setAsns(state.asns);
  if (state.bcDB)       StarStore.setBcDB(state.bcDB);
  if (state.asnTracker) StarStore.setAsnTrack(state.asnTracker);
  if (state.rfgTracker) StarStore.setRfgTrack(state.rfgTracker);
  if (state.tpls)       StarStore.setTpls(state.tpls);
}

// Auto-register every assignment from star_a + star_asntrack into bcDB
// so a freshly cleared scanner database stays usable. Also seeds the
// fixed pass-action barcodes (Bathroom / Water / Break) so the printable
// scan sheet works out of the box.
const PASS_BARCODES: Array<{ id: string; passKind: "Bathroom" | "Water" | "Break"; name: string }> = [
  { id: "PASS-BATHROOM", passKind: "Bathroom", name: "🚻 Bathroom Pass" },
  { id: "PASS-WATER",    passKind: "Water",    name: "💧 Water Break" },
  { id: "PASS-BREAK",    passKind: "Break",    name: "🛋 Sensory Break" },
];

const STATUS_BARCODES: Array<{ id: string; statusKind: "Absent" | "Skipped" | "Excused" | "Makeup"; name: string }> = [
  { id: "STATUS-ABSENT",  statusKind: "Absent",  name: "🚫 Mark Absent" },
  { id: "STATUS-SKIPPED", statusKind: "Skipped", name: "⏭ Mark Skipped" },
  { id: "STATUS-EXCUSED", statusKind: "Excused", name: "🩹 Mark Excused" },
  { id: "STATUS-MAKEUP",  statusKind: "Makeup",  name: "🔁 Mark Makeup" },
];

export function rehydrateBcDB(): Record<string, BcEntry> {
  const bcDB = StarStore.getBcDB();
  const asnTrack = StarStore.getAsnTrack();
  for (const id in asnTrack) {
    if (!bcDB[id]) {
      const a = asnTrack[id];
      bcDB[id] = {
        id, type: "assignment",
        name: a.name, subject: a.subject, gradeLevel: a.gradeLevel,
        studentName: a.studentName, week: a.week, day: a.day,
        goal: a.goal, questions: a.questions, lesson: a.lesson,
        createdDate: a.createdDate,
      };
    }
  }
  for (const p of PASS_BARCODES) {
    if (!bcDB[p.id]) {
      bcDB[p.id] = { id: p.id, type: "pass-action", name: p.name, passKind: p.passKind, createdDate: new Date().toISOString() };
    }
  }
  for (const s of STATUS_BARCODES) {
    if (!bcDB[s.id]) {
      bcDB[s.id] = { id: s.id, type: "status-action", name: s.name, statusKind: s.statusKind, createdDate: new Date().toISOString() };
    }
  }
  StarStore.setBcDB(bcDB);
  return bcDB;
}

// Barcode ID generators
export function nextBarcode(prefix: "WR" | "SP" | "QZ" | "AS", existing: Record<string, BcEntry>): string {
  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const date = `${yy}${mm}${dd}`;
  const base = `${prefix}-${date}-`;
  let n = 1;
  while (existing[`${base}${String(n).padStart(3, "0")}`]) n++;
  return `${base}${String(n).padStart(3, "0")}`;
}

// Submissions with these statuses do NOT affect the student's grade
// average. They're tracked for record-keeping but not factored into
// percentage / letter grade rollups anywhere on the board, gradebook,
// or reports. "completed" + "in-progress" are the only counting states.
const NON_COUNTING: ReadonlySet<StarSubmission["status"]> = new Set([
  "absent", "skipped", "excused", "makeup", "missing",
]);
export function countsTowardGrade(s: { status: StarSubmission["status"] }): boolean {
  return !NON_COUNTING.has(s.status);
}

export function letterGrade(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

export function letterGradeColor(letter: string): string {
  return ({
    A: "#10b981",
    B: "#3b82f6",
    C: "#f59e0b",
    D: "#f97316",
    F: "#ef4444",
  } as Record<string, string>)[letter] || "#94a3b8";
}
