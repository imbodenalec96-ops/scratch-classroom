const BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "/api");

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
  } catch (e: any) {
    // Preserve AbortError so callers can distinguish user-cancel from network failure
    if (e?.name === "AbortError") throw e;
    throw new Error("Cannot reach server. If running locally, start API with npm run dev:api.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) => request<any>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string, name: string, role: string) => request<any>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name, role }) }),
  me: () => request<any>("/auth/me"),
  listStudentAccounts: () => request<Array<{ id: string; name: string; avatarUrl: string | null }>>("/auth/students"),
  studentLogin: (id: string, password: string) => request<any>("/auth/student-login", { method: "POST", body: JSON.stringify({ id, password }) }),

  // Classes
  getClasses: () => request<any[]>("/classes"),
  createClass: (name: string) => request<any>("/classes", { method: "POST", body: JSON.stringify({ name }) }),
  getClass: (id: string) => request<any>(`/classes/${id}`),
  deleteClass: (id: string) => request<any>(`/classes/${id}`, { method: "DELETE" }),
  joinClass: (code: string) => request<any>("/classes/join", { method: "POST", body: JSON.stringify({ code }) }),
  getStudents: (classId: string) => request<any[]>(`/classes/${classId}/students`),
  importStudents: (classId: string, students: any[]) => request<any>(`/classes/${classId}/import`, { method: "POST", body: JSON.stringify({ students }) }),
  getControls: (classId: string, studentId: string) => request<any>(`/classes/${classId}/controls/${studentId}`),
  updateControls: (classId: string, studentId: string, data: any) => request<any>(`/classes/${classId}/controls/${studentId}`, { method: "PUT", body: JSON.stringify(data) }),
  saveAttendance: (classId: string, records: any[]) => request<any>(`/classes/${classId}/attendance`, { method: "POST", body: JSON.stringify({ records }) }),
  getAttendance: (classId: string) => request<any[]>(`/classes/${classId}/attendance`),
  addBehavior: (classId: string, studentId: string, type: string, note: string) => request<any>(`/classes/${classId}/behavior`, { method: "POST", body: JSON.stringify({ studentId, type, note }) }),
  getBehavior: (classId: string) => request<any[]>(`/classes/${classId}/behavior`),

  // Projects
  getProjects: () => request<any[]>("/projects"),
  getAllProjects: () => request<any[]>("/projects/all"),
  getStudentProjectsByClass: (classId: string) => request<any[]>(`/projects/class/${classId}/student-projects`),
  createProject: (title: string, mode: string, data?: any) => request<any>("/projects", { method: "POST", body: JSON.stringify({ title, mode, data }) }),
  getProject: (id: string) => request<any>(`/projects/${id}`),
  saveProject: (id: string, data: any) => request<any>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getVersions: (id: string) => request<any[]>(`/projects/${id}/versions`),
  deleteProject: (id: string) => request<any>(`/projects/${id}`, { method: "DELETE" }),

  // Assignments
  getAssignments: (classId: string) => request<any[]>(`/assignments/class/${classId}`),
  createAssignment: (data: any) => request<any>("/assignments", { method: "POST", body: JSON.stringify(data) }),
  // NB: data may include { targetGradeMin, targetGradeMax, targetSubject } for per-assignment grade gating
  generateAssignment: (data: { title: string; subject: string; grade: string; instructions?: string }) =>
    request<any>("/ai/generate-assignment", { method: "POST", body: JSON.stringify(data) }),
  getAssignment: (id: string) => request<any>(`/assignments/${id}`),
  updateAssignment: (id: string, data: any) => request<any>(`/assignments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getTodayAssignment: (classId: string) => request<any[]>(`/assignments/class/${classId}/today`),
  getPendingAssignments: (classId: string) => request<any[]>(`/assignments/class/${classId}/pending`),
  createWeeklyAssignments: (data: any) => request<any>(`/assignments/weekly`, { method: "POST", body: JSON.stringify(data) }),
  generateFullWeek: (data: {
    classId: string;
    weekStarting?: string;
    subjects?: string[];
    themeBySubject?: Record<string, string>;
    difficultyTweak?: "match" | "easier" | "harder";
    varietyLevel?: "low" | "medium" | "high";
    studentIds?: string[];
  }) => request<any>(`/assignments/generate-full-week`, { method: "POST", body: JSON.stringify(data) }),
  planFullWeek: (data: {
    classId: string;
    weekStarting?: string;
    subjects?: string[];
    themeBySubject?: Record<string, string>;
    difficultyTweak?: "match" | "easier" | "harder";
    varietyLevel?: "low" | "medium" | "high";
    studentIds?: string[];
  }) => request<{ slots: any[]; total: number; students: number; subjects: number; days: number }>(
    `/assignments/plan-full-week`, { method: "POST", body: JSON.stringify(data) }),
  generateAssignmentSlot: (slot: any, signal?: AbortSignal) => request<any>(`/assignments/generate-slot`, {
    method: "POST", body: JSON.stringify(slot), signal,
  }),
  adjustAssignmentDifficulty: (id: string, direction: "easier" | "harder") =>
    request<any>(`/assignments/${id}/adjust-difficulty`, { method: "POST", body: JSON.stringify({ direction }) }),
  regenerateAssignment: (id: string) =>
    request<any>(`/assignments/${id}/regenerate`, { method: "POST", body: JSON.stringify({}) }),
  getAssignmentSubmissionCount: (id: string) => request<{count:number}>(`/assignments/${id}/submission-count`),
  deleteAssignment: (id: string) => request<any>(`/assignments/${id}`, { method: "DELETE" }),
  bulkAssignments: (body: {
    assignmentIds: string[];
    action: "assign" | "grade" | "delete";
    studentIds?: string[];
    targetSubject?: string;
    targetGradeMin?: number;
    targetGradeMax?: number;
  }) => request<any>(`/assignments/bulk`, { method: "POST", body: JSON.stringify(body) }),
  getClassSettings: (classId: string) => request<any>(`/assignments/settings/${classId}`),
  updateClassSettings: (classId: string, data: any) => request<any>(`/assignments/settings/${classId}`, { method: "PUT", body: JSON.stringify(data) }),
  submitAssignmentWithAnswers: (assignmentId: string, answers: any) =>
    request<any>(`/submissions`, { method: "POST", body: JSON.stringify({ assignmentId, answers: JSON.stringify(answers) }) }),

  // Submissions
  submitAssignment: (assignmentId: string, projectId: string) => request<any>("/submissions", { method: "POST", body: JSON.stringify({ assignmentId, projectId }) }),
  getSubmissions: (assignmentId: string) => request<any[]>(`/submissions/assignment/${assignmentId}`),
  getMySubmissions: () => request<any[]>("/submissions/mine"),
  gradeSubmission: (id: string, grade: number, feedback: string) => request<any>(`/submissions/${id}/grade`, { method: "PUT", body: JSON.stringify({ grade, feedback }) }),

  // Gradebook (per-student)
  getSubmission: (id: string) => request<any>(`/submissions/${id}`),

  // Websites — per-student URL embed system (teacher-curated library)
  requestWebsite: (title: string) =>
    request<any>("/websites/request", { method: "POST", body: JSON.stringify({ title }) }),
  getMyWebsites: () => request<any[]>("/websites/mine"),
  getMyWebsite: (id: string) => request<any>(`/websites/mine/${id}`),
  getPendingWebsiteRequests: () => request<any[]>("/websites/requests/pending"),
  getWebsiteLibrary: (classId?: string) =>
    request<any[]>(`/websites/library${classId ? `?classId=${classId}` : ""}`),
  approveWebsite: (body: { requestId?: string; title: string; url: string; category?: string; classId?: string; thumbnailUrl?: string; iconEmoji?: string }) =>
    request<any>("/websites/approve", { method: "POST", body: JSON.stringify(body) }),
  denyWebsiteRequest: (requestId: string, note?: string) =>
    request<any>("/websites/deny", { method: "POST", body: JSON.stringify({ requestId, note }) }),
  deleteWebsite: (id: string) =>
    request<any>(`/websites/library/${id}`, { method: "DELETE" }),
  grantWebsite: (studentId: string, websiteId: string) =>
    request<any>("/websites/grant", { method: "POST", body: JSON.stringify({ studentId, websiteId }) }),
  revokeWebsite: (studentId: string, websiteId: string) =>
    request<any>("/websites/revoke", { method: "POST", body: JSON.stringify({ studentId, websiteId }) }),
  getStudentWebsiteGrants: (studentId: string) =>
    request<any[]>(`/websites/student/${studentId}/grants`),

  // Class schedule
  getSchedule: (classId: string) =>
    request<any[]>(`/classes/${classId}/schedule`),
  updateSchedule: (classId: string, blocks: any[]) =>
    request<any[]>(`/classes/${classId}/schedule`, { method: "PUT", body: JSON.stringify({ blocks }) }),
  resetSchedule: (classId: string) =>
    request<any[]>(`/classes/${classId}/schedule/reset`, { method: "POST" }),

  // Daily News source (teacher-paste flow)
  getDailyNews: (classId: string) =>
    request<any>(`/classes/${classId}/daily-news`),
  setDailyNews: (classId: string, body: { todays_file_url: string; todays_file_title?: string; drive_folder_url?: string }) =>
    request<any>(`/classes/${classId}/daily-news`, { method: "POST", body: JSON.stringify(body) }),
  getStudentAssignments: (studentId: string, scope: "today" | "week" | "all" = "week") =>
    request<any[]>(`/students/${studentId}/assignments?scope=${scope}`),
  humanGradeAssignment: (assignmentId: string, studentId: string, passed: boolean, feedback?: string) =>
    request<{ ok: boolean; submission: any }>(`/assignments/${assignmentId}/grade`, {
      method: "POST",
      body: JSON.stringify({ studentId, passed, feedback: feedback ?? null }),
    }),

  // Quizzes
  getQuizzes: (classId: string) => request<any[]>(`/quizzes/class/${classId}`),
  getPendingQuizzes: (classId: string) => request<any[]>(`/quizzes/class/${classId}/pending`),
  createQuiz: (data: any) => request<any>("/quizzes", { method: "POST", body: JSON.stringify(data) }),
  getQuiz: (id: string) => request<any>(`/quizzes/${id}`),
  submitQuiz: (quizId: string, answers: number[]) => request<any>(`/quizzes/${quizId}/attempt`, { method: "POST", body: JSON.stringify({ answers }) }),

  // Analytics
  trackAnalytics: (data: any) => request<any>("/analytics/track", { method: "POST", body: JSON.stringify(data) }),
  getClassAnalytics: (classId: string) => request<any[]>(`/analytics/class/${classId}`),
  getMyAnalytics: () => request<any[]>("/analytics/mine"),

  // Chat
  getChat: (classId: string) => request<any[]>(`/chat/${classId}`),
  sendChat: (classId: string, text: string) => request<any>(`/chat/${classId}`, { method: "POST", body: JSON.stringify({ text }) }),

  // Leaderboard
  getLeaderboard: () => request<any[]>("/leaderboard"),
  getAssignmentLeaderboard: () => request<any[]>("/leaderboard/assignments"),
  addPoints: (userId: string, points: number) => request<any>("/leaderboard/points", { method: "POST", body: JSON.stringify({ userId, points }) }),

  // Users
  getUsers: () => request<any[]>("/users"),
  updateRole: (userId: string, role: string) => request<any>(`/users/${userId}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
  deleteUser: (userId: string) => request<any>(`/users/${userId}`, { method: "DELETE" }),

  // AI
  aiChat: (messages: any[], context?: string) => request<any>("/ai/chat", { method: "POST", body: JSON.stringify({ messages, context }) }),
  aiGenerateProject: (prompt: string) => request<any>("/ai/generate-project", { method: "POST", body: JSON.stringify({ prompt }) }),
  aiGenerateQuiz: (topic: string, count = 5, subject?: string, grade?: string) =>
    request<any>("/ai/generate-quiz", { method: "POST", body: JSON.stringify({ topic, count, subject, grade }) }),

  // Upload
  upload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const token = localStorage.getItem("token");
    const res = await fetch(`${BASE}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    return res.json();
  },

  // Class daily schedule (block-based day table; seeded for Star)
  getClassSchedule: (classId: string) => request<any[]>(`/classes/${classId}/schedule`),

  // Class video
  getClassVideo: (classId: string) => request<any>(`/classes/${classId}/video`),
  shareClassVideo: (classId: string, videoId: string, videoTitle?: string) =>
    request<any>(`/classes/${classId}/video`, { method: "POST", body: JSON.stringify({ videoId, videoTitle }) }),
  stopClassVideo: (classId: string) => request<any>(`/classes/${classId}/video`, { method: "DELETE" }),

  // Student: get my controls for a class (lock status etc.)
  getMyControls: (classId: string) => request<any>(`/classes/${classId}/my-controls`),
  pingPresence: (classId: string, activity?: string) =>
    request<{ok: boolean}>(`/classes/${classId}/ping`, { method: "POST", body: JSON.stringify({ activity: activity || "online" }) }),
  getClassPresence: (classId: string) =>
    request<any[]>(`/classes/${classId}/presence`),

  // Per-student command pipe (new foundation — gradually replaces class_commands)
  getMyCommands: () => request<Array<{id:string; command_type:string; payload:string; created_at:string}>>(`/students/me/commands`),
  consumeMyCommand: (id: string) => request<any>(`/students/me/commands/${id}/consume`, { method: "POST", body: JSON.stringify({}) }),

  // GoGuardian classroom control
  getClassroomState: (classId: string, since?: string) =>
    request<any>(`/classes/${classId}/classroom-state${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  consumeCommand: (classId: string, commandId: string) =>
    request<any>(`/classes/${classId}/commands/${commandId}/consume`, { method: "DELETE" }),
  endBreak: (studentId: string) =>
    request<any>(`/classes/end-break/${studentId}`, { method: "POST" }),
  endAllBreaks: (classId: string) =>
    request<any>(`/classes/${classId}/end-all-breaks`, { method: "POST" }),
  lockClass: (classId: string, message?: string) =>
    request<any>(`/classes/${classId}/lock`, { method: "POST", body: JSON.stringify({ message: message || '' }) }),
  unlockClass: (classId: string) =>
    request<any>(`/classes/${classId}/unlock`, { method: "POST", body: JSON.stringify({}) }),
  sendClassCommand: (classId: string, type: string, payload?: string, targetUserId?: string) =>
    request<any>(`/classes/${classId}/command`, { method: "POST", body: JSON.stringify({ type, payload: payload || '', targetUserId }) }),
  forceUnlockAll: () => request<any>(`/classes/force-unlock-all`, { method: "POST", body: JSON.stringify({}) }),
  forceUnlockStudent: (studentId: string) => request<any>(`/classes/force-unlock-student/${studentId}`, { method: "POST", body: JSON.stringify({}) }),
  lockStudent: (studentId: string, message?: string) => request<any>(`/classes/lock-student/${studentId}`, { method: "POST", body: JSON.stringify({ message: message || '' }) }),
  unlockStudent: (studentId: string) => request<any>(`/classes/unlock-student/${studentId}`, { method: "POST", body: JSON.stringify({}) }),
  lockStudentCmd: (studentId: string, message?: string) => request<any>(`/students/${studentId}/lock`, { method: "POST", body: JSON.stringify({ message: message || null }) }),
  unlockStudentCmd: (studentId: string) => request<any>(`/students/${studentId}/unlock`, { method: "POST", body: JSON.stringify({}) }),
  sendStudentMessage: (studentId: string, text: string) => request<any>(`/students/${studentId}/message`, { method: "POST", body: JSON.stringify({ text }) }),
  grantStudentFreeTime: (studentId: string, minutes?: number) => request<any>(`/students/${studentId}/grant-freetime`, { method: "POST", body: JSON.stringify({ minutes: minutes ?? 15 }) }),
  revokeStudentFreeTime: (studentId: string) => request<any>(`/students/${studentId}/revoke-freetime`, { method: "POST", body: JSON.stringify({}) }),
  endStudentBreak: (studentId: string) => request<any>(`/students/${studentId}/end-break`, { method: "POST", body: JSON.stringify({}) }),
  // YouTube broadcast via student_commands (parallels legacy class_video path)
  broadcastClassVideo: (classId: string, url: string) =>
    request<any>(`/classes/${classId}/broadcast-video`, { method: "POST", body: JSON.stringify({ url }) }),
  endClassBroadcast: (classId: string) =>
    request<any>(`/classes/${classId}/broadcast-end`, { method: "POST", body: JSON.stringify({}) }),
  broadcastStudentVideo: (studentId: string, url: string) =>
    request<any>(`/students/${studentId}/broadcast-video`, { method: "POST", body: JSON.stringify({ url }) }),
  endStudentBroadcast: (studentId: string) =>
    request<any>(`/students/${studentId}/broadcast-end`, { method: "POST", body: JSON.stringify({}) }),
  focusStudent: (studentId: string, focused: boolean) => request<any>(`/classes/focus-student/${studentId}`, { method: "POST", body: JSON.stringify({ focused }) }),
  grantFreeTime: (studentId: string) => request<any>(`/classes/grant-free-time/${studentId}`, { method: "POST", body: JSON.stringify({}) }),
  revokeFreeTime: (studentId: string) => request<any>(`/classes/revoke-free-time/${studentId}`, { method: "POST", body: JSON.stringify({}) }),
  grantFreeTimeAll: (classId: string) => request<any>(`/classes/${classId}/grant-free-time-all`, { method: "POST", body: JSON.stringify({}) }),
  revokeFreeTimeAll: (classId: string) => request<any>(`/classes/${classId}/revoke-free-time-all`, { method: "POST", body: JSON.stringify({}) }),
  getClassConfig: (classId: string) => request<any>(`/classes/${classId}/config`),
  updateClassConfig: (classId: string, config: any) => request<any>(`/classes/${classId}/config`, { method: "PUT", body: JSON.stringify(config) }),

  // DOM preview thumbnails
  postSnapshot: (data: string, path: string) =>
    request<{ok:boolean}>(`/classes/snapshot`, { method: "POST", body: JSON.stringify({ data, path }) }),
  getStudentSnapshot: (userId: string) =>
    request<{data: string | null; path?: string; capturedAt?: string}>(`/classes/snapshot/${userId}`),
  getClassSnapshots: (classId: string) =>
    request<Array<{userId: string; data: string; path: string; capturedAt: string}>>(`/classes/${classId}/snapshots`),
  heartbeat: (activity?: string) => request<{ok:boolean}>(`/classes/heartbeat`, { method: "POST", body: JSON.stringify({ activity: activity || 'online' }) }),
  debugMe: () => request<any>(`/classes/debug/me`),

  // Student management
  getStudentsKiosk: () => request<any[]>('/students'),
  getStudent: (id: string) => request<any>(`/students/${id}`),
  createStudent: (data: any) => request<any>('/students', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (id: string, data: any) => request<any>(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStudent: (id: string) => request<any>(`/students/${id}`, { method: 'DELETE' }),
  setSkipWorkDay: (id: string) => request<any>(`/students/${id}/skip-work-day`, { method: 'POST' }),
  clearSkipWorkDay: (id: string) => request<any>(`/students/${id}/skip-work-day`, { method: 'DELETE' }),
  approveStudentVideo: (id: string, url: string, title?: string) =>
    request<any>(`/students/${id}/approve-video`, { method: 'PUT', body: JSON.stringify({ url, title }) }),
  clearStudentVideo: (id: string) => request<any>(`/students/${id}/approve-video`, { method: 'DELETE' }),

  // Tasks
  getStudentTasks: (studentId: string, date: string) => request<any[]>(`/tasks/${studentId}/${date}`),
  createTask: (data: any) => request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  submitTaskAnswer: (id: string, answer: string) => request<any>(`/tasks/${id}/answer`, { method: 'PUT', body: JSON.stringify({ student_answer: answer }) }),
  gradeTask: (id: string, data: any) => request<any>(`/tasks/${id}/grade`, { method: 'PUT', body: JSON.stringify(data) }),
  regenerateTasks: (studentId: string, date: string) => request<any>(`/tasks/student/${studentId}/date/${date}`, { method: 'DELETE' }),

  // Breaks
  getBreakConfig: () => request<any>('/breaks/config'),
  updateBreakConfig: (data: any) => request<any>('/breaks/config', { method: 'PUT', body: JSON.stringify(data) }),
  getBreakGames: () => request<any[]>('/breaks/games'),
  setBreakGames: (games: any[]) => request<any>('/breaks/games', { method: 'PUT', body: JSON.stringify({ games }) }),
  logBreak: (data: any) => request<any>('/breaks/log', { method: 'POST', body: JSON.stringify(data) }),
  getBreakLog: (params?: string) => request<any[]>(`/breaks/log${params ? '?' + params : ''}`),

  // Worksheets
  getWorksheetLibrary: (params?: string) => request<any[]>(`/worksheets/library${params ? '?' + params : ''}`),
  addWorksheetToLibrary: (data: any) => request<any>('/worksheets/library', { method: 'POST', body: JSON.stringify(data) }),
  deleteWorksheetFromLibrary: (id: string) => request<any>(`/worksheets/library/${id}`, { method: 'DELETE' }),
  getWorksheetAssignments: (params?: string) => request<any[]>(`/worksheets/assignments${params ? '?' + params : ''}`),
  assignWorksheet: (data: any) => request<any>('/worksheets/assignments', { method: 'POST', body: JSON.stringify(data) }),
  completeWorksheet: (id: string) => request<any>(`/worksheets/assignments/${id}/complete`, { method: 'PUT' }),
  deleteWorksheetAssignment: (id: string) => request<any>(`/worksheets/assignments/${id}`, { method: 'DELETE' }),

  // YouTube library (curated class videos)
  getYouTubeLibrary: (classId: string) => request<any[]>(`/youtube/library/${classId}`),
  addToYouTubeLibrary: (data: any) => request<any>('/youtube/library', { method: 'POST', body: JSON.stringify(data) }),
  removeFromYouTubeLibrary: (id: string) => request<any>(`/youtube/library/${id}`, { method: 'DELETE' }),
  pickLibraryVideo: (libraryId: string, studentId: string | number) => request<any>(`/youtube/library/${libraryId}/pick`, { method: 'POST', body: JSON.stringify({ student_id: studentId }) }),

  // YouTube
  getYouTubeRequests: (status?: string) => request<any[]>(`/youtube/requests${status ? '?status=' + status : ''}`),
  getStudentYouTubeRequests: (studentId: string | number) => request<any[]>(`/youtube/requests/student/${studentId}`),
  createYouTubeRequest: (data: any) => request<any>('/youtube/requests', { method: 'POST', body: JSON.stringify(data) }),
  approveYouTubeRequest: (id: string, note?: string) => request<any>(`/youtube/requests/${id}/approve`, { method: 'PUT', body: JSON.stringify({ teacher_note: note }) }),
  denyYouTubeRequest: (id: string, note?: string) => request<any>(`/youtube/requests/${id}/deny`, { method: 'PUT', body: JSON.stringify({ teacher_note: note }) }),
  getApprovedURLs: () => request<any[]>('/youtube/approved'),
  addApprovedURL: (data: any) => request<any>('/youtube/approved', { method: 'POST', body: JSON.stringify(data) }),
  removeApprovedURL: (id: string) => request<any>(`/youtube/approved/${id}`, { method: 'DELETE' }),

  // Admin settings
  getAdminSettings: () => request<any>('/admin-settings'),
  updateAdminSettings: (data: any) => request<any>('/admin-settings', { method: 'PUT', body: JSON.stringify(data) }),
  checkAdminPin: (pin: string) => request<any>(`/admin-settings/check-pin?pin=${encodeURIComponent(pin)}`),
  checkAdminPassword: (password: string) => request<any>('/admin-settings/check-password', { method: 'POST', body: JSON.stringify({ password }) }),

  // AI Tasks (Step 6)
  generateTasks: (data: { student_id: string; date: string; subject: string; grade_min: number; grade_max: number; focus?: string }) =>
    request<any[]>('/ai-tasks/generate', { method: 'POST', body: JSON.stringify(data) }),
  generateClasswideTasks: (data: { class_id: string; date: string; subject: string; grade_min: number; grade_max: number; focus?: string }) =>
    request<any>('/ai-tasks/generate-classwide', { method: 'POST', body: JSON.stringify(data) }),

  // Lesson views (Feature 22)
  viewLesson: (lessonId: string) => request<{ok:boolean}>(`/lessons/view/${encodeURIComponent(lessonId)}`, { method: "POST", body: JSON.stringify({}) }),
  markLessonRead: (lessonId: string) => request<any>(`/lessons/mark-read/${encodeURIComponent(lessonId)}`, { method: "POST", body: JSON.stringify({}) }),
  getMyLessonViews: () => request<Array<{lesson_id: string; opened_at: string; marked_read_at: string}>>("/lessons/my-views"),
  getClassLessonViews: (classId: string) => request<any[]>(`/lessons/class/${classId}/views`),

  // Per-student grade levels (Feature 17)
  getMyGrades: () => request<{reading_grade:number; math_grade:number; writing_grade:number}>("/grades/mine"),
  getStudentGrades: (userId: string) => request<any>(`/grades/student/${userId}`),
  setStudentGrades: (userId: string, data: { reading_grade?: number; math_grade?: number; writing_grade?: number }) =>
    request<any>(`/grades/student/${userId}`, { method: "PUT", body: JSON.stringify(data) }),
  getClassGrades: (classId: string) => request<any[]>(`/grades/class/${classId}`),
  bulkSetClassGrades: (classId: string, data: { reading_grade?: number; math_grade?: number; writing_grade?: number }) =>
    request<any>(`/grades/class/${classId}/bulk`, { method: "PUT", body: JSON.stringify(data) }),
  worksheetSearch: (query: string, grade_min: number, grade_max: number) =>
    request<any[]>('/ai-tasks/worksheet-search', { method: 'POST', body: JSON.stringify({ query, grade_min, grade_max }) }),
  getTaskConfig: () => request<any[]>('/ai-tasks/task-config'),
  updateTaskConfig: (subject: string, base_count: number) =>
    request<any>(`/ai-tasks/task-config/${subject}`, { method: 'PUT', body: JSON.stringify({ base_count }) }),

  // ── Classroom Board (central control) ──
  getBoardData: (classId: string) => request<any>(`/board/classes/${classId}/data`),
  bumpStudentStars: (studentId: string, delta: number) =>
    request<any>(`/board/students/${studentId}/stars`, { method: "POST", body: JSON.stringify({ delta }) }),
  setStudentLevel: (studentId: string, level: number) =>
    request<any>(`/board/students/${studentId}/level`, { method: "POST", body: JSON.stringify({ level }) }),
  saveResourceSchedule: (studentId: string, rows: any[]) =>
    request<any>(`/board/resource-schedules/${studentId}`, { method: "PUT", body: JSON.stringify({ rows }) }),
  saveSpecialsRotation: (grade: number, rows: any[]) =>
    request<any>(`/board/specials-rotation/${grade}`, { method: "PUT", body: JSON.stringify({ rows }) }),
  saveBoardSetting: (key: string, value: string) =>
    request<any>(`/board/settings`, { method: "PUT", body: JSON.stringify({ key, value }) }),
  getMyStars: () => request<{ stars: number; rewards: number }>(`/board/me/stars`),

  // ── Paper-only students (printable worksheets flow) ──
  // ── Group / center shared notes ──
  getGroupNotes: (assignmentId: string) =>
    request<{ content: string; updated_at: string | null; updated_by: string | null }>(`/assignments/${assignmentId}/group-notes`),
  saveGroupNotes: (assignmentId: string, content: string) =>
    request<any>(`/assignments/${assignmentId}/group-notes`, { method: "PUT", body: JSON.stringify({ content }) }),

  setStudentPaperOnly: (studentId: string, paperOnly: boolean) =>
    request<any>(`/students/${studentId}/paper-only`, {
      method: "PUT",
      body: JSON.stringify({ paper_only: paperOnly }),
    }),
};
