/* ── Roles & Auth ── */
export type Role = "admin" | "teacher" | "student";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string;
  createdAt: string;
}

export interface AuthPayload {
  token: string;
  user: User;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface RegisterBody extends LoginBody {
  name: string;
  role: Role;
}

/* ── Classes ── */
export interface ClassSection {
  id: string;
  name: string;
  teacherId: string;
  code: string;
  createdAt: string;
}

export interface ClassMember {
  userId: string;
  classId: string;
  joinedAt: string;
}

/* ── Projects ── */
export type ProjectMode = "2d" | "3d";

export interface Sprite {
  id: string;
  name: string;
  x: number;
  y: number;
  z?: number;
  rotation: number;
  scale: number;
  costumeIndex: number;
  costumes: Asset[];
  sounds: Asset[];
  blocks: Block[];
  visible: boolean;
  shape3d?: "box" | "sphere" | "cylinder" | "cone" | "torus" | "plane" | "capsule";
}

export interface Asset {
  id: string;
  name: string;
  url: string;
  type: "image" | "sound" | "model";
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  mode: ProjectMode;
  sprites: Sprite[];
  stage: StageSettings;
  assets: Asset[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface StageSettings {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage?: string;
  camera?: Camera3D;
  lights?: Light3D[];
}

export interface Camera3D {
  x: number;
  y: number;
  z: number;
  fov: number;
}

export interface Light3D {
  type: "ambient" | "directional" | "point" | "spotlight";
  color: string;
  intensity: number;
  x?: number;
  y?: number;
  z?: number;
  angle?: number;
  penumbra?: number;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
}

export type Shape3D = "box" | "sphere" | "cylinder" | "cone" | "torus" | "plane" | "capsule";

/* ── Block coding ── */
export type BlockCategory =
  | "motion"
  | "looks"
  | "sound"
  | "events"
  | "control"
  | "operators"
  | "variables"
  | "lists"
  | "custom"
  | "physics"
  | "sensing";

export interface Block {
  id: string;
  type: string;
  category: BlockCategory;
  inputs: Record<string, BlockInput>;
  next?: string;
  parent?: string;
  x?: number;
  y?: number;
}

export interface BlockInput {
  type: "value" | "block" | "variable";
  value: string | number | boolean;
}

/* ── Assignments ── */
export interface Assignment {
  id: string;
  classId: string;
  teacherId: string;
  title: string;
  description: string;
  dueDate: string;
  rubric: RubricItem[];
  starterProjectId?: string;
  createdAt: string;
}

export interface RubricItem {
  label: string;
  maxPoints: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  projectId: string;
  submittedAt: string;
  grade?: number;
  feedback?: string;
  autoGradeResult?: AutoGradeResult;
}

export interface AutoGradeResult {
  score: number;
  checks: { label: string; passed: boolean; detail: string }[];
}

/* ── Quizzes ── */
export interface Quiz {
  id: string;
  classId: string;
  teacherId: string;
  title: string;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  studentId: string;
  answers: number[];
  score: number;
  submittedAt: string;
}

/* ── Analytics ── */
export interface ProjectAnalytics {
  projectId: string;
  userId: string;
  timeSpent: number;
  blocksUsed: number;
  errorsMade: number;
  lastActive: string;
}

export interface AttendanceRecord {
  userId: string;
  classId: string;
  date: string;
  present: boolean;
}

/* ── Chat ── */
export interface ChatMessage {
  id: string;
  classId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

/* ── Leaderboard ── */
export interface LeaderboardEntry {
  userId: string;
  name: string;
  points: number;
  badges: string[];
  level: number;
}

/* ── WebSocket events ── */
export interface WSEvents {
  "project:update": { projectId: string; sprites: Sprite[] };
  "class:broadcast": { classId: string; message: string };
  "class:lock": { classId: string; locked: boolean };
  "student:screen": { studentId: string; screenshot: string };
  "chat:message": ChatMessage;
}

/* ── AI ── */
export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequest {
  messages: AIMessage[];
  context?: string;
}

/* ── Behavior ── */
export interface BehaviorLog {
  id: string;
  studentId: string;
  classId: string;
  type: "warning" | "positive" | "note";
  note: string;
  createdAt: string;
}
