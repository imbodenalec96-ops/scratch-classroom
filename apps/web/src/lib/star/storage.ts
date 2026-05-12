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
  // Free-text quick reference for substitute teachers — triggers,
  // calming strategies, what works, what doesn't. Printed in the
  // Sub Plans packet beneath the kid's IEP cliff notes.
  subNotes?: string;
  // Optional parent contact for the Snapshot share line.
  parentName?: string;
  parentEmail?: string;
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
      // Optional IEP goal targeting — when set, GradebookModal
      // auto-logs an IepLogEntry on save (Met if pct >= 80, Partial
      // 50–79, Not yet < 50). The text is snapshotted so the print
      // template + scan modal show the goal even if the goal is later
      // edited or deleted.
      iepGoalId?: string;
      iepGoalArea?: string;
      iepGoalText?: string;
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
    }
  | {
      id: string;
      type: "freetime-action";
      name: string;
      // Minutes of free time this barcode grants (5 / 10 / 15 / 20 …).
      // Pair with a student in the FreetimeModal to start a timed
      // session. Active sessions render on the board strip; on end,
      // they're written to a freetime log.
      freetimeMinutes: number;
      createdDate: string;
    }
  | {
      id: string;
      type: "movement-action";
      name: string;
      // SPECIALS-OUT/IN, LUNCH-OUT/IN — kid scans on the way out, scans
      // again on the way back. Tracks attendance + auto-clears them
      // from the in-room tally on the board.
      movementKind: "specials" | "lunch";
      direction: "out" | "in";
      createdDate: string;
    }
  | {
      id: string;
      type: "timer-action";
      name: string;
      // TIMER-5/10/15/20 — scan starts the class-wide visual timer
      // on the projector board. No modal needed; fires a cross-device
      // event the board listens for.
      timerMinutes: number;
      createdDate: string;
    }
  | {
      id: string;
      type: "supply-action";
      name: string;
      // SUPPLY-PENCIL/TABLET/HEADPHONES + BOOK-OUT/IN — track who
      // borrowed what. Book scans accept a free-text title input in
      // the modal; other supplies are item-only.
      supplyKind: "Pencil" | "Tablet" | "Headphones" | "Book";
      direction: "out" | "in";
      createdDate: string;
    };

export interface ActivePass {
  studentId: string;
  studentName: string;
  passKind: "Bathroom" | "Water" | "Break";
  startedAt: string; // ISO
}

export interface ActiveFreetime {
  studentId: string;
  studentName: string;
  durationMin: number;   // planned minutes
  startedAt: string;     // ISO
  reason?: string;       // optional teacher note (e.g. "Earned for finishing math")
}

export interface FreetimeLogEntry extends ActiveFreetime {
  endedAt: string;       // ISO
  elapsedSec: number;
}

// SPECIALS / LUNCH — kid is currently out of the room for one of these
// activities. One active per student per kind.
export interface ActiveMovement {
  studentId: string;
  studentName: string;
  kind: "specials" | "lunch";
  startedAt: string;
}
export interface MovementLogEntry extends ActiveMovement {
  endedAt: string;
  elapsedSec: number;
}

// Supply / library checkout — currently borrowed item per student.
// One active checkout per (studentId, supplyKind) combination.
export interface SupplyCheckout {
  id: string;
  studentId: string;
  studentName: string;
  supplyKind: "Pencil" | "Tablet" | "Headphones" | "Book";
  bookTitle?: string;     // only for Book checkouts
  checkedOutAt: string;   // ISO
}
export interface SupplyLogEntry extends SupplyCheckout {
  returnedAt: string;
  durationSec: number;
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
  // IEP-aligned assignment fields (mirrored from BcEntry on creation).
  iepGoalId?: string;
  iepGoalArea?: string;
  iepGoalText?: string;
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
  iepGoals: "star_iep_goals",
  iepLog: "star_iep_log",
  iepDefaultMet: "star_iep_default_met",
  iepDefaultPartial: "star_iep_default_partial",
  activeFreetime: "star_active_freetime",
  freetimeLog: "star_freetime_log",
  activeMovement: "star_active_movement",
  movementLog: "star_movement_log",
  supplyCheckouts: "star_supply_checkouts",
  supplyLog: "star_supply_log",
  behaviorDefs: "star_behavior_defs",
  behaviorLog: "star_behavior_log",
  behaviorTemplates: "star_behavior_templates",
  dailyNotes: "star_daily_notes",
} as const;

/**
 * Parse an explicit accuracy / mastery percentage out of an IEP goal
 * sentence. Tries phrases like "80% accuracy", "with 90% accuracy",
 * "achieving 80%", "scoring 2/2", and "4/5 ... assessments".
 * Returns the % as a number (0–100), or undefined if nothing matched.
 */
export function inferMetThresholdFromGoalText(text: string): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  // Direct percentage like "80% accuracy"
  const pctMatch = t.match(/(\d{1,3})\s*%/);
  if (pctMatch) {
    const n = Number(pctMatch[1]);
    if (n > 0 && n <= 100) return n;
  }
  // Fraction like "4/5 opportunities" → 80%, "3/4" → 75%, "8/10" → 80%
  const fracMatch = t.match(/(\d+)\s*\/\s*(\d+)/);
  if (fracMatch) {
    const num = Number(fracMatch[1]);
    const den = Number(fracMatch[2]);
    if (den > 0) {
      const pct = Math.round((num / den) * 100);
      if (pct > 0 && pct <= 100) return pct;
    }
  }
  return undefined;
}

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

// IEP goals + daily log. Multiple goals per student (real IEPs have
// 5–9 each). `iepGoals` is a flat list — query by studentId.
// `iepLog` records daily overall progress per kid (one row per kid per
// day); the SEIF report shows every goal + the daily log table.
export interface IepGoal {
  id: string;             // unique id (so multi-goal edit / delete works)
  studentId: string;
  goalText: string;       // the IEP goal as written in the doc
  area?: string;          // optional category — Reading / Behavior / etc.
  // Per-goal grading thresholds. When set, the GradebookModal auto-log
  // uses these instead of the global defaults — matches IEP wording
  // like "80% accuracy" (Anna) or "60% accuracy" (sight words).
  // pct >= metThreshold      → met
  // pct >= partialThreshold  → partial
  // else                     → not yet
  metThreshold?: number;     // default 80
  partialThreshold?: number; // default 50
  createdDate: string;    // ISO
  updatedDate: string;    // ISO
}

export type IepStatus = "met" | "partial" | "not";

export interface IepLogEntry {
  id: string;             // ulid-ish unique key
  studentId: string;
  date: string;           // YYYY-MM-DD (Pacific) — one canonical entry per kid per day
  status: IepStatus;
  note?: string;
  loggedAt: string;       // ISO timestamp
}

// ── Custom behavior tracker ─────────────────────────────────────
// Teacher defines a list of behaviors (class-wide or per-kid). Each
// instance is a single tap with optional note. Reports aggregate
// frequency per kid per day for IEP meetings.
export interface BehaviorDef {
  id: string;
  label: string;            // "Calling out" / "On task" / etc.
  emoji: string;            // visible chip face
  // "positive" = green, "neutral" = blue, "challenge" = amber/red.
  // Only affects display color; reports use the raw counts.
  tone: "positive" | "neutral" | "challenge";
  scope: "class" | "student";
  studentId?: string;       // required when scope === "student"
  createdDate: string;
  archived?: boolean;
}

export interface BehaviorEvent {
  id: string;
  defId: string;
  studentId: string;
  ts: string;               // ISO
  date: string;             // YYYY-MM-DD (Pacific) for fast filtering
  note?: string;            // legacy free-text note (used by quick-log)
  // ── Full-report fields (all optional; populated when teacher
  //    fills out the incident-report form on the scan modal). Old
  //    quick-log entries leave these blank — reports just hide them.
  location?: string;        // "Classroom" / "Hallway" / "Specials" / etc.
  durationMin?: number;     // how long the incident lasted (minutes)
  antecedent?: string;      // what happened right before
  behaviorDetail?: string;  // what the kid actually did
  response?: string;        // what the teacher tried
  outcome?: string;         // how it ended / where the kid landed
  severity?: 1 | 2 | 3 | 4 | 5;  // 1 = mild reminder, 5 = crisis
  pointsDelta?: number;     // +/- points awarded for this incident
  parentNotified?: boolean;
  parentNotifyMethod?: "phone" | "email" | "classdojo" | "in-person" | "none";
  followUp?: string;        // what's still owed / next step
  witnesses?: string;       // other staff present (free text)
  reporterName?: string;    // who wrote the report
  photoDataUrl?: string;    // optional photo (refused work, calm-corner usage, etc.)
  photoPath?: string;       // Supabase Storage bucket path (preferred over data URL)
}

// Reusable text snippets the teacher can one-tap into the
// behavior incident report form (antecedent + response fields).
// Stored locally so each device has its own templates.
export interface BehaviorTemplate {
  id: string;
  label: string;            // short button label
  field: "antecedent" | "response" | "outcome";  // which field it fills
  body: string;             // the text inserted
  createdDate: string;
}

// LocalStorage with safe parse + default fallback. `set` used to
// silently swallow quota errors — which caused the worst kind of
// bug: the teacher generated assignments that vanished without
// any sign of failure. Now `set` throws on quota so callers can
// surface a "free up space" prompt.
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
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e: any) {
      // QuotaExceededError / NS_ERROR_DOM_QUOTA_REACHED — re-throw
      // a typed error so callers can detect it cleanly.
      const name = e?.name || "";
      const code = (e?.code ?? 0) | 0;
      if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014) {
        const err = new Error(`localStorage full — couldn't save "${key}"`);
        (err as any).quota = true;
        throw err;
      }
      // Any other write error also re-thrown — silent dropping is
      // worse than failing loudly.
      throw e;
    }
  },
};

/** Estimate the localStorage size used by every key in bytes. Used
 *  by the cleanup UI to show what's eating space. */
export function getLocalStorageUsage(): { totalKB: number; byKey: Array<{ key: string; kb: number }> } {
  const byKey: Array<{ key: string; kb: number }> = [];
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) || "";
      const bytes = (k.length + v.length) * 2; // rough UTF-16
      total += bytes;
      byKey.push({ key: k, kb: bytes / 1024 });
    }
  } catch {}
  byKey.sort((a, b) => b.kb - a.kb);
  return { totalKB: total / 1024, byKey };
}

/** Strip photoDataUrl from every behavior log entry. Big photos
 *  are the most common quota-blower; this frees the most space
 *  with the least lost. The frequency report + timeline still
 *  work without the photos. */
export function clearBehaviorPhotos(): { stripped: number } {
  try {
    const log = ls.get<BehaviorEvent[]>(KEYS.behaviorLog, []);
    let stripped = 0;
    for (const e of log) {
      if ((e as any).photoDataUrl) { delete (e as any).photoDataUrl; stripped += 1; }
    }
    if (stripped > 0) ls.set(KEYS.behaviorLog, log);
    return { stripped };
  } catch {
    return { stripped: 0 };
  }
}

/** Strip every kid's STAR-photo cache (the snap-a-worksheet
 *  photos). Doesn't affect grades — those photos are duplicate
 *  attachments only. */
export function clearStudentPhotos(): { stripped: number } {
  try {
    const photos = ls.get<Record<string, StarPhoto[]>>(KEYS.photos, {});
    const count = Object.values(photos).reduce((a, list) => a + (list || []).length, 0);
    ls.set(KEYS.photos, {});
    return { stripped: count };
  } catch {
    return { stripped: 0 };
  }
}

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

// One per-kid daily note. The end-of-day report exposes a form
// per kid where the teacher writes a narrative + sets mood +
// attendance + flags whether parents should hear about today.
// Class-wide notes use studentId === "__class__".
export interface DailyNote {
  date: string;             // YYYY-MM-DD (Pacific)
  studentId: string;        // or "__class__" for class-wide note
  body?: string;            // main narrative — what the kid did today
  highlights?: string;      // wins / shoutouts
  growthAreas?: string;     // what to work on tomorrow
  mood?: "great" | "good" | "ok" | "hard" | "crisis";
  attendance?: "present" | "tardy" | "left-early" | "partial" | "absent";
  parentFollowUp?: boolean; // does the parent need to hear about today?
  parentFollowNote?: string;// what to tell the parent
  updatedAt: string;        // ISO
}

const CLASS_NOTE_STUDENT_ID = "__class__";
export { CLASS_NOTE_STUDENT_ID };

// Reusable text snippets for the ABC report fields. The teacher
// can edit/delete in the tracker UI and add new ones from the
// behavior report form itself.
export const DEFAULT_BEHAVIOR_TEMPLATES: BehaviorTemplate[] = [
  // Antecedent
  { id: "tpl-a-transition",  field: "antecedent", label: "Transition prompt", body: "Asked to put away current activity and transition to the next block.", createdDate: new Date(0).toISOString() },
  { id: "tpl-a-non-pref",    field: "antecedent", label: "Non-preferred task", body: "Given a non-preferred task (worksheet) after a preferred task (free time / iPad).", createdDate: new Date(0).toISOString() },
  { id: "tpl-a-told-no",     field: "antecedent", label: "Told 'no'", body: "Told 'not right now' to a request (bathroom / iPad / leaving the room).", createdDate: new Date(0).toISOString() },
  { id: "tpl-a-peer",        field: "antecedent", label: "Peer interaction", body: "Peer made an unexpected comment / took something / sat in their preferred spot.", createdDate: new Date(0).toISOString() },
  // Response
  { id: "tpl-r-2choices",    field: "response",   label: "2 choices + warning", body: "Gave a 5-minute warning, then offered 2 choices in a calm voice. Restated the expectation.", createdDate: new Date(0).toISOString() },
  { id: "tpl-r-break",       field: "response",   label: "Offered a break", body: "Offered a 5-minute sensory break in the calm corner. Set a visible timer.", createdDate: new Date(0).toISOString() },
  { id: "tpl-r-co-regulate", field: "response",   label: "Co-regulation",     body: "Sat next to the student, used slow breathing, named the feeling, no demands until calm.", createdDate: new Date(0).toISOString() },
  { id: "tpl-r-redirect",    field: "response",   label: "Redirect to task",  body: "Redirected to the assigned task using a 'first / then' visual.", createdDate: new Date(0).toISOString() },
  // Outcome
  { id: "tpl-o-back-on-task",field: "outcome",    label: "Back on task",      body: "Returned to the task within 10 minutes and completed most of it.", createdDate: new Date(0).toISOString() },
  { id: "tpl-o-partial",     field: "outcome",    label: "Partial completion", body: "Completed about half of the task with prompting.", createdDate: new Date(0).toISOString() },
  { id: "tpl-o-no-completion",field: "outcome",   label: "No completion",     body: "Did not return to the task. Will retry tomorrow during the same block.", createdDate: new Date(0).toISOString() },
];

// Sensible starter set the teacher can edit/delete in the tracker UI.
// All class-wide; per-kid behaviors are added through the UI.
export const DEFAULT_BEHAVIOR_DEFS: BehaviorDef[] = [
  { id: "bd-on-task",       label: "On task",          emoji: "🎯", tone: "positive",  scope: "class", createdDate: new Date(0).toISOString() },
  { id: "bd-kind-act",      label: "Kind act",         emoji: "💖", tone: "positive",  scope: "class", createdDate: new Date(0).toISOString() },
  { id: "bd-self-advocate", label: "Self-advocated",   emoji: "🙋", tone: "positive",  scope: "class", createdDate: new Date(0).toISOString() },
  { id: "bd-transition",    label: "Smooth transition",emoji: "🚪", tone: "positive",  scope: "class", createdDate: new Date(0).toISOString() },
  { id: "bd-redirect",      label: "Redirected",       emoji: "↩️", tone: "neutral",   scope: "class", createdDate: new Date(0).toISOString() },
  { id: "bd-call-out",      label: "Calling out",      emoji: "📢", tone: "challenge", scope: "class", createdDate: new Date(0).toISOString() },
  { id: "bd-out-of-seat",   label: "Out of seat",      emoji: "🪑", tone: "challenge", scope: "class", createdDate: new Date(0).toISOString() },
  { id: "bd-disruption",    label: "Disruption",       emoji: "💥", tone: "challenge", scope: "class", createdDate: new Date(0).toISOString() },
];

// Fire-and-forget Supabase mirror. Dynamically imports the sync
// module so this file stays free of a hard dependency on
// @supabase/supabase-js — if the sync layer breaks, local STAR data
// keeps working. Each writer below calls _syncPush after a successful
// localStorage write; the network round-trip happens off the hot path.
function _syncPush(kind: string, payload: any): void {
  // Skip in non-browser contexts (SSR / tests).
  if (typeof window === "undefined") return;
  import("./supabaseSync.ts").then((m) => {
    try {
      switch (kind) {
        case "behaviorDef":      return void m.pushBehaviorDef(payload);
        case "behaviorDef.del":  return void m.deleteBehaviorDefRemote(payload);
        case "behaviorEvent":    return void m.pushBehaviorEvent(payload);
        case "behaviorEvent.del":return void m.deleteBehaviorEventRemote(payload);
        case "behaviorTemplate": return void m.pushBehaviorTemplate(payload);
        case "behaviorTemplate.del": return void m.deleteBehaviorTemplateRemote(payload);
        case "dailyNote":        return void m.pushDailyNote(payload);
        case "iepGoal":          return void m.pushIepGoal(payload);
        case "iepGoal.del":      return void m.deleteIepGoalRemote(payload);
        case "iepLog":           return void m.pushIepLogEntry(payload);
      }
    } catch { /* swallow — local write already succeeded */ }
  }).catch(() => {});
}

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
  // ── Free time sessions ───────────────────────────────────────────
  getActiveFreetime: () => ls.get<ActiveFreetime[]>(KEYS.activeFreetime, []),
  setActiveFreetime: (v: ActiveFreetime[]) => ls.set(KEYS.activeFreetime, v),
  startFreetime: (s: ActiveFreetime) => {
    const all = ls.get<ActiveFreetime[]>(KEYS.activeFreetime, []);
    // One active freetime per student — replace any existing entry.
    const next = all.filter((x) => x.studentId !== s.studentId);
    next.push(s);
    ls.set(KEYS.activeFreetime, next);
  },
  endFreetime: (studentId: string): FreetimeLogEntry | null => {
    const all = ls.get<ActiveFreetime[]>(KEYS.activeFreetime, []);
    const idx = all.findIndex((x) => x.studentId === studentId);
    if (idx < 0) return null;
    const entry = all[idx];
    const elapsedSec = Math.max(0, Math.round((Date.now() - new Date(entry.startedAt).getTime()) / 1000));
    const log: FreetimeLogEntry = { ...entry, endedAt: new Date().toISOString(), elapsedSec };
    const remaining = all.filter((_, i) => i !== idx);
    ls.set(KEYS.activeFreetime, remaining);
    const logArr = ls.get<FreetimeLogEntry[]>(KEYS.freetimeLog, []);
    logArr.unshift(log);
    ls.set(KEYS.freetimeLog, logArr.slice(0, 500));
    return log;
  },
  getFreetimeLog: () => ls.get<FreetimeLogEntry[]>(KEYS.freetimeLog, []),

  // ── SPECIALS / LUNCH movement ───────────────────────────────────
  getActiveMovement: () => ls.get<ActiveMovement[]>(KEYS.activeMovement, []),
  startMovement: (s: ActiveMovement) => {
    const all = ls.get<ActiveMovement[]>(KEYS.activeMovement, []);
    // One active per (studentId, kind) — replace any prior.
    const next = all.filter((x) => !(x.studentId === s.studentId && x.kind === s.kind));
    next.push(s);
    ls.set(KEYS.activeMovement, next);
  },
  endMovement: (studentId: string, kind: ActiveMovement["kind"]): MovementLogEntry | null => {
    const all = ls.get<ActiveMovement[]>(KEYS.activeMovement, []);
    const idx = all.findIndex((x) => x.studentId === studentId && x.kind === kind);
    if (idx < 0) return null;
    const entry = all[idx];
    const elapsedSec = Math.max(0, Math.round((Date.now() - new Date(entry.startedAt).getTime()) / 1000));
    const log: MovementLogEntry = { ...entry, endedAt: new Date().toISOString(), elapsedSec };
    const remaining = all.filter((_, i) => i !== idx);
    ls.set(KEYS.activeMovement, remaining);
    const arr = ls.get<MovementLogEntry[]>(KEYS.movementLog, []);
    arr.unshift(log);
    ls.set(KEYS.movementLog, arr.slice(0, 500));
    return log;
  },
  getMovementLog: () => ls.get<MovementLogEntry[]>(KEYS.movementLog, []),

  // ── Supply / library checkouts ──────────────────────────────────
  getSupplyCheckouts: () => ls.get<SupplyCheckout[]>(KEYS.supplyCheckouts, []),
  checkoutSupply: (s: Omit<SupplyCheckout, "id" | "checkedOutAt"> & { checkedOutAt?: string }): SupplyCheckout => {
    const all = ls.get<SupplyCheckout[]>(KEYS.supplyCheckouts, []);
    // For non-book items, one per (studentId, supplyKind). For books a kid
    // can borrow multiple at once, so keyed by id.
    const filtered = s.supplyKind === "Book"
      ? all
      : all.filter((x) => !(x.studentId === s.studentId && x.supplyKind === s.supplyKind));
    const entry: SupplyCheckout = {
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      studentId: s.studentId,
      studentName: s.studentName,
      supplyKind: s.supplyKind,
      bookTitle: s.bookTitle,
      checkedOutAt: s.checkedOutAt || new Date().toISOString(),
    };
    filtered.push(entry);
    ls.set(KEYS.supplyCheckouts, filtered);
    return entry;
  },
  returnSupply: (id: string): SupplyLogEntry | null => {
    const all = ls.get<SupplyCheckout[]>(KEYS.supplyCheckouts, []);
    const idx = all.findIndex((x) => x.id === id);
    if (idx < 0) return null;
    const entry = all[idx];
    const durationSec = Math.max(0, Math.round((Date.now() - new Date(entry.checkedOutAt).getTime()) / 1000));
    const log: SupplyLogEntry = { ...entry, returnedAt: new Date().toISOString(), durationSec };
    ls.set(KEYS.supplyCheckouts, all.filter((_, i) => i !== idx));
    const arr = ls.get<SupplyLogEntry[]>(KEYS.supplyLog, []);
    arr.unshift(log);
    ls.set(KEYS.supplyLog, arr.slice(0, 500));
    return log;
  },
  getSupplyLog: () => ls.get<SupplyLogEntry[]>(KEYS.supplyLog, []),

  // ── Behavior tracker ────────────────────────────────────────
  getBehaviorDefs: (): BehaviorDef[] => ls.get<BehaviorDef[]>(KEYS.behaviorDefs, DEFAULT_BEHAVIOR_DEFS),
  setBehaviorDefs: (v: BehaviorDef[]) => {
    ls.set(KEYS.behaviorDefs, v);
    for (const d of v) _syncPush("behaviorDef", d);
  },
  addBehaviorDef: (def: BehaviorDef) => {
    const cur = ls.get<BehaviorDef[]>(KEYS.behaviorDefs, DEFAULT_BEHAVIOR_DEFS);
    cur.push(def);
    ls.set(KEYS.behaviorDefs, cur);
    _syncPush("behaviorDef", def);
  },
  removeBehaviorDef: (id: string) => {
    const cur = ls.get<BehaviorDef[]>(KEYS.behaviorDefs, DEFAULT_BEHAVIOR_DEFS);
    ls.set(KEYS.behaviorDefs, cur.filter((d) => d.id !== id));
    _syncPush("behaviorDef.del", id);
  },
  getBehaviorLog: (): BehaviorEvent[] => ls.get<BehaviorEvent[]>(KEYS.behaviorLog, []),
  // recordBehavior — now accepts an optional `ts` so quick-logs can
  // be backdated to when the incident actually happened (the teacher
  // is often logging 5–30 min after the moment). `date` is derived
  // from `ts` so reports filter correctly. Falls back to "now"
  // when ts is omitted.
  recordBehavior: (defId: string, studentId: string, note?: string, ts?: string) => {
    const log = ls.get<BehaviorEvent[]>(KEYS.behaviorLog, []);
    const eventTs = ts || new Date().toISOString();
    const eventDate = new Date(eventTs);
    const pacific = new Date(eventDate.getTime() - 7 * 3600_000);
    const date = `${pacific.getUTCFullYear()}-${String(pacific.getUTCMonth() + 1).padStart(2, "0")}-${String(pacific.getUTCDate()).padStart(2, "0")}`;
    const event: BehaviorEvent = {
      id: `bh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      defId, studentId, note,
      ts: eventTs,
      date,
    };
    log.push(event);
    ls.set(KEYS.behaviorLog, log);
    _syncPush("behaviorEvent", event);
    return log;
  },
  removeBehaviorEvent: (id: string) => {
    const cur = ls.get<BehaviorEvent[]>(KEYS.behaviorLog, []);
    ls.set(KEYS.behaviorLog, cur.filter((e) => e.id !== id));
    _syncPush("behaviorEvent.del", id);
  },
  // Behavior templates (reusable antecedent/response/outcome snippets)
  getBehaviorTemplates: (): BehaviorTemplate[] => ls.get<BehaviorTemplate[]>(KEYS.behaviorTemplates, DEFAULT_BEHAVIOR_TEMPLATES),
  setBehaviorTemplates: (v: BehaviorTemplate[]) => {
    ls.set(KEYS.behaviorTemplates, v);
    for (const t of v) _syncPush("behaviorTemplate", t);
  },
  addBehaviorTemplate: (t: BehaviorTemplate) => {
    const cur = ls.get<BehaviorTemplate[]>(KEYS.behaviorTemplates, DEFAULT_BEHAVIOR_TEMPLATES);
    cur.push(t);
    ls.set(KEYS.behaviorTemplates, cur);
    _syncPush("behaviorTemplate", t);
  },
  removeBehaviorTemplate: (id: string) => {
    const cur = ls.get<BehaviorTemplate[]>(KEYS.behaviorTemplates, DEFAULT_BEHAVIOR_TEMPLATES);
    ls.set(KEYS.behaviorTemplates, cur.filter((t) => t.id !== id));
    _syncPush("behaviorTemplate.del", id);
  },
  // Daily notes — narratives written per kid (and one class-wide)
  // for the end-of-day report. Keyed by `${date}::${studentId}` so
  // upsert is cheap.
  getDailyNotes: (): Record<string, DailyNote> => ls.get<Record<string, DailyNote>>(KEYS.dailyNotes, {}),
  getDailyNote: (date: string, studentId: string): DailyNote | undefined => {
    const all = ls.get<Record<string, DailyNote>>(KEYS.dailyNotes, {});
    return all[`${date}::${studentId}`];
  },
  upsertDailyNote: (note: DailyNote) => {
    const all = ls.get<Record<string, DailyNote>>(KEYS.dailyNotes, {});
    const next = { ...note, updatedAt: new Date().toISOString() };
    all[`${note.date}::${note.studentId}`] = next;
    ls.set(KEYS.dailyNotes, all);
    _syncPush("dailyNote", next);
  },
  clearDailyNote: (date: string, studentId: string) => {
    const all = ls.get<Record<string, DailyNote>>(KEYS.dailyNotes, {});
    delete all[`${date}::${studentId}`];
    ls.set(KEYS.dailyNotes, all);
  },
  // Record a full behavior incident report. All non-required fields
  // are optional; the form sends whatever the teacher filled in.
  recordBehaviorReport: (input: Partial<BehaviorEvent> & { defId: string; studentId: string }) => {
    const log = ls.get<BehaviorEvent[]>(KEYS.behaviorLog, []);
    const now = new Date();
    const d = new Date(now.getTime() - 7 * 3600_000);
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const event: BehaviorEvent = {
      id: `bh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: now.toISOString(),
      date,
      ...input,
    };
    log.push(event);
    ls.set(KEYS.behaviorLog, log);
    _syncPush("behaviorEvent", event);
    return { log, event };
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

  // ── IEP goals (multi-goal per student) + daily log ───────────────
  // `iepGoals` is a flat array. Migrates legacy single-goal storage
  // (Record<studentId, IepGoal>) on first read so older installs keep
  // their data.
  getIepGoals: (): IepGoal[] => {
    const raw: any = ls.get<any>(KEYS.iepGoals, []);
    if (Array.isArray(raw)) return raw as IepGoal[];
    // Legacy: Record<studentId, IepGoal> — migrate.
    if (raw && typeof raw === "object") {
      const out: IepGoal[] = [];
      for (const sid in raw) {
        const g = raw[sid];
        if (g?.goalText) {
          out.push({
            id: `iep-g-${sid}-1`, studentId: sid,
            goalText: String(g.goalText), area: g.area,
            createdDate: g.createdDate || new Date().toISOString(),
            updatedDate: g.updatedDate || new Date().toISOString(),
          });
        }
      }
      ls.set(KEYS.iepGoals, out);
      return out;
    }
    return [];
  },
  setIepGoals: (v: IepGoal[]) => {
    ls.set(KEYS.iepGoals, v);
    for (const g of v) _syncPush("iepGoal", g);
  },
  goalsForStudent: (sid: string): IepGoal[] => {
    const all = ls.get<IepGoal[]>(KEYS.iepGoals, []);
    return Array.isArray(all) ? all.filter((g) => g.studentId === sid) : [];
  },
  addIepGoal: (studentId: string, goalText: string, area?: string): IepGoal => {
    const allRaw: any = ls.get<any>(KEYS.iepGoals, []);
    const all: IepGoal[] = Array.isArray(allRaw) ? allRaw : [];
    const now = new Date().toISOString();
    const goal: IepGoal = {
      id: `iep-g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      studentId,
      goalText: goalText.trim(),
      area: (area || "").trim() || undefined,
      createdDate: now, updatedDate: now,
    };
    all.push(goal);
    ls.set(KEYS.iepGoals, all);
    _syncPush("iepGoal", goal);
    return goal;
  },
  updateIepGoal: (id: string, patch: { goalText?: string; area?: string; metThreshold?: number | null; partialThreshold?: number | null }) => {
    const all = ls.get<IepGoal[]>(KEYS.iepGoals, []);
    const idx = all.findIndex((g) => g.id === id);
    if (idx < 0) return;
    const clamp = (n: any) => {
      if (n === null) return undefined;
      const v = Number(n);
      if (!Number.isFinite(v)) return all[idx].metThreshold;
      return Math.max(0, Math.min(100, Math.round(v)));
    };
    all[idx] = {
      ...all[idx],
      goalText: patch.goalText !== undefined ? patch.goalText.trim() : all[idx].goalText,
      area: patch.area !== undefined ? (patch.area.trim() || undefined) : all[idx].area,
      metThreshold: patch.metThreshold !== undefined ? clamp(patch.metThreshold) : all[idx].metThreshold,
      partialThreshold: patch.partialThreshold !== undefined ? clamp(patch.partialThreshold) : all[idx].partialThreshold,
      updatedDate: new Date().toISOString(),
    };
    ls.set(KEYS.iepGoals, all);
    _syncPush("iepGoal", all[idx]);
  },
  deleteIepGoal: (id: string) => {
    const all = ls.get<IepGoal[]>(KEYS.iepGoals, []).filter((g) => g.id !== id);
    ls.set(KEYS.iepGoals, all);
    _syncPush("iepGoal.del", id);
  },
  // Bulk replace for a single student — used by the "Load my class
  // goals" import. Removes existing goals for that kid then adds the
  // provided ones in order. If the goal text mentions an explicit
  // accuracy % (e.g. "80% accuracy" / "60% accuracy") that becomes the
  // metThreshold automatically, so each imported IEP goal grades to
  // its own success criterion out of the box.
  setStudentGoals: (studentId: string, goals: Array<{ area?: string; goalText: string }>) => {
    const allRaw: any = ls.get<any>(KEYS.iepGoals, []);
    const all: IepGoal[] = Array.isArray(allRaw) ? allRaw : [];
    const kept = all.filter((g) => g.studentId !== studentId);
    const now = new Date().toISOString();
    for (const g of goals) {
      const inferredMet = inferMetThresholdFromGoalText(g.goalText);
      kept.push({
        id: `iep-g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        studentId,
        goalText: g.goalText.trim(),
        area: (g.area || "").trim() || undefined,
        metThreshold: inferredMet,
        // Partial defaults to halfway between the met threshold and 0
        partialThreshold: inferredMet ? Math.max(20, Math.floor(inferredMet / 2)) : undefined,
        createdDate: now, updatedDate: now,
      });
    }
    ls.set(KEYS.iepGoals, kept);
    for (const g of kept) if (g.studentId === studentId) _syncPush("iepGoal", g);
  },

  // ── IEP grading thresholds (global defaults) ─────────────────────
  getIepDefaultMetThreshold:     () => ls.get<number>(KEYS.iepDefaultMet, 80),
  setIepDefaultMetThreshold:     (v: number) => ls.set(KEYS.iepDefaultMet, Math.max(0, Math.min(100, Math.round(v)))),
  getIepDefaultPartialThreshold: () => ls.get<number>(KEYS.iepDefaultPartial, 50),
  setIepDefaultPartialThreshold: (v: number) => ls.set(KEYS.iepDefaultPartial, Math.max(0, Math.min(100, Math.round(v)))),

  getIepLog: () => ls.get<IepLogEntry[]>(KEYS.iepLog, []),
  setIepLog: (v: IepLogEntry[]) => {
    ls.set(KEYS.iepLog, v);
    for (const e of v) _syncPush("iepLog", e);
  },
  // Upsert by (studentId + date) — typing a status replaces the prior
  // entry for the same day. Returns the saved entry.
  logIep: (studentId: string, date: string, status: IepStatus, note?: string): IepLogEntry => {
    const all = ls.get<IepLogEntry[]>(KEYS.iepLog, []);
    const idx = all.findIndex((e) => e.studentId === studentId && e.date === date);
    const entry: IepLogEntry = {
      id: idx >= 0 ? all[idx].id : `iep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      studentId, date, status, note,
      loggedAt: new Date().toISOString(),
    };
    if (idx >= 0) all[idx] = entry; else all.push(entry);
    ls.set(KEYS.iepLog, all);
    _syncPush("iepLog", entry);
    return entry;
  },
  clearIepLogEntry: (studentId: string, date: string) => {
    const all = ls.get<IepLogEntry[]>(KEYS.iepLog, [])
      .filter((e) => !(e.studentId === studentId && e.date === date));
    ls.set(KEYS.iepLog, all);
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

// Free time barcodes — scan + pick a student to start a timed free
// time session. Common preset durations.
export const FREETIME_BARCODES: Array<{ id: string; freetimeMinutes: number; name: string }> = [
  { id: "FREETIME-5",  freetimeMinutes: 5,  name: "🎮 Free Time · 5 min"  },
  { id: "FREETIME-10", freetimeMinutes: 10, name: "🎮 Free Time · 10 min" },
  { id: "FREETIME-15", freetimeMinutes: 15, name: "🎮 Free Time · 15 min" },
  { id: "FREETIME-20", freetimeMinutes: 20, name: "🎮 Free Time · 20 min" },
];

// Movement barcodes — kid scans on the way to/from specials or lunch.
export const MOVEMENT_BARCODES: Array<{ id: string; movementKind: "specials" | "lunch"; direction: "out" | "in"; name: string }> = [
  { id: "SPECIALS-OUT", movementKind: "specials", direction: "out", name: "🎨 Heading to Specials" },
  { id: "SPECIALS-IN",  movementKind: "specials", direction: "in",  name: "🎨 Back from Specials"  },
  { id: "LUNCH-OUT",    movementKind: "lunch",    direction: "out", name: "🍱 Heading to Lunch"    },
  { id: "LUNCH-IN",     movementKind: "lunch",    direction: "in",  name: "🍱 Back from Lunch"     },
];

// Class timer barcodes — scan to start the class-wide visual timer
// on the projector board. Fires a cross-device event the board listens
// for; no modal, just a confirmation toast.
export const TIMER_BARCODES: Array<{ id: string; timerMinutes: number; name: string }> = [
  { id: "TIMER-5",  timerMinutes: 5,  name: "⏱ Class Timer · 5 min"  },
  { id: "TIMER-10", timerMinutes: 10, name: "⏱ Class Timer · 10 min" },
  { id: "TIMER-15", timerMinutes: 15, name: "⏱ Class Timer · 15 min" },
  { id: "TIMER-20", timerMinutes: 20, name: "⏱ Class Timer · 20 min" },
];

// Supply / library checkout barcodes.
export const SUPPLY_BARCODES: Array<{ id: string; supplyKind: "Pencil" | "Tablet" | "Headphones" | "Book"; direction: "out" | "in"; name: string }> = [
  { id: "SUPPLY-PENCIL-OUT",     supplyKind: "Pencil",     direction: "out", name: "✏️ Borrowed Pencil" },
  { id: "SUPPLY-PENCIL-IN",      supplyKind: "Pencil",     direction: "in",  name: "✏️ Returned Pencil" },
  { id: "SUPPLY-TABLET-OUT",     supplyKind: "Tablet",     direction: "out", name: "📱 Borrowed Tablet" },
  { id: "SUPPLY-TABLET-IN",      supplyKind: "Tablet",     direction: "in",  name: "📱 Returned Tablet" },
  { id: "SUPPLY-HEADPHONES-OUT", supplyKind: "Headphones", direction: "out", name: "🎧 Borrowed Headphones" },
  { id: "SUPPLY-HEADPHONES-IN",  supplyKind: "Headphones", direction: "in",  name: "🎧 Returned Headphones" },
  { id: "BOOK-OUT",              supplyKind: "Book",       direction: "out", name: "📚 Checked Out Book" },
  { id: "BOOK-IN",               supplyKind: "Book",       direction: "in",  name: "📚 Returned Book" },
];

// Authoritative grade-level map by first name. Edited in code so every
// device picks up the same levels — no per-device Settings entry needed.
// Bump the version key whenever this map changes so devices re-apply.
const STUDENT_GRADE_MAP: Record<string, string> = {
  zoey:  "1st",
  kaleb: "2nd",
  ameer: "4th",
  anna:  "1st",
  ryan:  "5th",
  jaida: "5th",
  aiden: "2nd",
};
const STUDENT_GRADE_MAP_VERSION = "v3-2026-05-11";

export function backfillStudentGrades(): void {
  try {
    const appliedVersion = localStorage.getItem("star_grade_map_version");
    if (appliedVersion === STUDENT_GRADE_MAP_VERSION) return;
    const students = StarStore.getStudents();
    let changed = false;
    for (const s of students) {
      const fn = (s.firstName || "").trim().toLowerCase();
      const want = STUDENT_GRADE_MAP[fn];
      if (want && s.grade !== want) {
        s.grade = want;
        changed = true;
      }
    }
    if (changed) StarStore.setStudents(students);
    localStorage.setItem("star_grade_map_version", STUDENT_GRADE_MAP_VERSION);
  } catch {}
}

export function rehydrateBcDB(): Record<string, BcEntry> {
  backfillStudentGrades();
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
  for (const f of FREETIME_BARCODES) {
    if (!bcDB[f.id]) {
      bcDB[f.id] = { id: f.id, type: "freetime-action", name: f.name, freetimeMinutes: f.freetimeMinutes, createdDate: new Date().toISOString() };
    }
  }
  for (const m of MOVEMENT_BARCODES) {
    if (!bcDB[m.id]) {
      bcDB[m.id] = { id: m.id, type: "movement-action", name: m.name, movementKind: m.movementKind, direction: m.direction, createdDate: new Date().toISOString() };
    }
  }
  for (const t of TIMER_BARCODES) {
    if (!bcDB[t.id]) {
      bcDB[t.id] = { id: t.id, type: "timer-action", name: t.name, timerMinutes: t.timerMinutes, createdDate: new Date().toISOString() };
    }
  }
  for (const sup of SUPPLY_BARCODES) {
    if (!bcDB[sup.id]) {
      bcDB[sup.id] = { id: sup.id, type: "supply-action", name: sup.name, supplyKind: sup.supplyKind, direction: sup.direction, createdDate: new Date().toISOString() };
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
