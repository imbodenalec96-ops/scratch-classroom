// STAR Program — barcode + refusal documentation system.
// All data lives in localStorage so it's offline-friendly and per-device.
// Keys mirror the original STAR_Scanner.html spec exactly.

export type Subject = "Math" | "Reading" | "Writing" | "Science" | "Social Studies" | "PE" | "Art" | "Library" | "Music";

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
    }
  | {
      id: string;
      type: "work-refusal-form" | "specials-refusal-form";
      name: string;
      studentName: string;
      createdDate: string;
    };

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
  status: "completed" | "in-progress" | "missing" | "excused";
  qMarks?: Record<string, "correct" | "wrong">;
  loggedAt: string;
}

export interface StarTrackerEntry {
  id: string;
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
  status: "assigned" | "completed" | "in-progress" | "missing" | "excused";
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
} as const;

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

// Defaults for the original STAR roster — only used if nothing else
// is loaded. The active app overrides these with the real classroom
// students at boot.
export const DEFAULT_STUDENTS: StarStudent[] = [
  { id: "STU-001", firstName: "Jaida",  lastName: "Thomas",     grade: "3rd", disability: "ASD"  },
  { id: "STU-002", firstName: "Ryan",   lastName: "Carter",     grade: "4th", disability: "EBD"  },
  { id: "STU-003", firstName: "Kaleb",  lastName: "Reed",       grade: "3rd", disability: "ADHD" },
  { id: "STU-004", firstName: "Zoey",   lastName: "Nguyen",     grade: "4th", disability: "ASD"  },
  { id: "STU-005", firstName: "Anna",   lastName: "Harris",     grade: "3rd", disability: "SLD"  },
  { id: "STU-006", firstName: "Aiden",  lastName: "Brooks",     grade: "5th", disability: "EBD"  },
  { id: "STU-007", firstName: "Rayden", lastName: "Flores",     grade: "4th", disability: "ADHD" },
  { id: "STU-008", firstName: "Ameer",  lastName: "Washington", grade: "3rd", disability: "ASD"  },
];

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
// so a freshly cleared scanner database stays usable.
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
  StarStore.setBcDB(bcDB);
  return bcDB;
}

// Barcode ID generators
export function nextBarcode(prefix: "WR" | "SP", existing: Record<string, BcEntry>): string {
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
