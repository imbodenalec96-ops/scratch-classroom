const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
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

  // Classes
  getClasses: () => request<any[]>("/classes"),
  createClass: (name: string) => request<any>("/classes", { method: "POST", body: JSON.stringify({ name }) }),
  getClass: (id: string) => request<any>(`/classes/${id}`),
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
  createProject: (title: string, mode: string, data?: any) => request<any>("/projects", { method: "POST", body: JSON.stringify({ title, mode, data }) }),
  getProject: (id: string) => request<any>(`/projects/${id}`),
  saveProject: (id: string, data: any) => request<any>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getVersions: (id: string) => request<any[]>(`/projects/${id}/versions`),
  deleteProject: (id: string) => request<any>(`/projects/${id}`, { method: "DELETE" }),

  // Assignments
  getAssignments: (classId: string) => request<any[]>(`/assignments/class/${classId}`),
  createAssignment: (data: any) => request<any>("/assignments", { method: "POST", body: JSON.stringify(data) }),
  getAssignment: (id: string) => request<any>(`/assignments/${id}`),
  updateAssignment: (id: string, data: any) => request<any>(`/assignments/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Submissions
  submitAssignment: (assignmentId: string, projectId: string) => request<any>("/submissions", { method: "POST", body: JSON.stringify({ assignmentId, projectId }) }),
  getSubmissions: (assignmentId: string) => request<any[]>(`/submissions/assignment/${assignmentId}`),
  getMySubmissions: () => request<any[]>("/submissions/mine"),
  gradeSubmission: (id: string, grade: number, feedback: string) => request<any>(`/submissions/${id}/grade`, { method: "PUT", body: JSON.stringify({ grade, feedback }) }),

  // Quizzes
  getQuizzes: (classId: string) => request<any[]>(`/quizzes/class/${classId}`),
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
  addPoints: (userId: string, points: number) => request<any>("/leaderboard/points", { method: "POST", body: JSON.stringify({ userId, points }) }),

  // Users
  getUsers: () => request<any[]>("/users"),
  updateRole: (userId: string, role: string) => request<any>(`/users/${userId}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
  deleteUser: (userId: string) => request<any>(`/users/${userId}`, { method: "DELETE" }),

  // AI
  aiChat: (messages: any[], context?: string) => request<any>("/ai/chat", { method: "POST", body: JSON.stringify({ messages, context }) }),
  aiGenerateProject: (prompt: string) => request<any>("/ai/generate-project", { method: "POST", body: JSON.stringify({ prompt }) }),
  aiGenerateQuiz: (topic: string, count: number) => request<any>("/ai/generate-quiz", { method: "POST", body: JSON.stringify({ topic, count }) }),

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
};
