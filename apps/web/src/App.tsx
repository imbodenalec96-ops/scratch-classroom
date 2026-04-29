import React, { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { isAccessAllowed } from "./lib/workUnlock.ts";
import { AuthProvider, useAuth } from "./lib/auth.tsx";
import { ThemeProvider } from "./lib/theme.tsx";

// Eagerly loaded — these are on the critical path of every initial render
// (login → layout → dashboard) so lazy-loading them just adds a flash.
import LoginPage from "./components/LoginPage.tsx";
import Layout from "./components/Layout.tsx";
import StudentDashboard from "./components/StudentDashboard.tsx";
import LandingPage from "./components/LandingPage.tsx";
import PublicLayout from "./components/PublicLayout.tsx";

// Lazy-loaded — every other route is split into its own chunk so the
// initial bundle older iPads have to download + parse stays small. Each
// route only ships when the student actually navigates to it.
const AdminDashboard = lazy(() => import("./components/AdminDashboard.tsx"));
const TeacherDashboard = lazy(() => import("./components/TeacherDashboard.tsx"));
const ProjectWorkspace = lazy(() => import("./components/ProjectWorkspace.tsx"));
const ProjectsList = lazy(() => import("./components/ProjectsList.tsx"));
const ClassManager = lazy(() => import("./components/ClassManager.tsx"));
const AssignmentBuilder = lazy(() => import("./components/AssignmentBuilder.tsx"));
const QuizBuilder = lazy(() => import("./components/QuizBuilder.tsx"));
const GradingPanel = lazy(() => import("./components/GradingPanel.tsx"));
const AnalyticsPanel = lazy(() => import("./components/AnalyticsPanel.tsx"));
const MonitorPanel = lazy(() => import("./components/MonitorPanel.tsx"));
const MonitorPage = lazy(() => import("./components/MonitorPage.tsx"));
const Leaderboard = lazy(() => import("./components/Leaderboard.tsx"));
const Achievements = lazy(() => import("./components/Achievements.tsx"));
const ChatPanel = lazy(() => import("./components/ChatPanel.tsx"));
const LessonsPage = lazy(() => import("./components/LessonsPage.tsx"));
const ArcadePage = lazy(() => import("./components/ArcadePage.tsx"));
const YouTubeManager = lazy(() => import("./components/YouTubeManager.tsx"));
const LessonAnalytics = lazy(() => import("./components/LessonAnalytics.tsx"));
const ClassGrades = lazy(() => import("./components/ClassGrades.tsx"));
const TeacherGradebook = lazy(() => import("./components/TeacherGradebook.tsx"));
const GradebookStudentPickerLazy = lazy(() =>
  import("./components/TeacherGradebook.tsx").then((m) => ({ default: m.GradebookStudentPicker })),
);
const TeacherWebsites = lazy(() => import("./components/TeacherWebsites.tsx"));
const StudentWebsites = lazy(() => import("./components/StudentWebsites.tsx"));
const TeacherSchedule = lazy(() => import("./components/TeacherSchedule.tsx"));
const WebsiteViewer = lazy(() => import("./components/WebsiteViewer.tsx"));
const VideoLearningPageLazy = lazy(() =>
  import("./components/BlockPlaceholder.tsx").then((m) => ({ default: m.VideoLearningPage })),
);
const TedTalkPageLazy = lazy(() =>
  import("./components/BlockPlaceholder.tsx").then((m) => ({ default: m.TedTalkPage })),
);
const DismissalPageLazy = lazy(() =>
  import("./components/BlockPlaceholder.tsx").then((m) => ({ default: m.DismissalPage })),
);
const AssignmentTodayPageLazy = lazy(() =>
  import("./components/BlockPlaceholder.tsx").then((m) => ({ default: m.AssignmentTodayPage })),
);
const SELPageLazy = lazy(() =>
  import("./components/BlockPlaceholder.tsx").then((m) => ({ default: m.SELPage })),
);
const CashoutPage = lazy(() => import("./components/CashoutPage.tsx"));
const DailyNewsViewer = lazy(() => import("./components/DailyNewsViewer.tsx"));
const StudentKiosk = lazy(() => import("./components/StudentKiosk.tsx"));
const TeacherAdmin = lazy(() => import("./components/TeacherAdmin.tsx"));
const AssignmentSchedulePage = lazy(() => import("./components/AssignmentSchedulePage.tsx"));
const ClassroomBoard = lazy(() => import("./components/ClassroomBoard.tsx"));
const TeacherBoardSettings = lazy(() => import("./components/TeacherBoardSettings.tsx"));
const TeacherStore = lazy(() => import("./components/TeacherStore.tsx"));
const StudentVideoPage = lazy(() => import("./components/StudentVideoPage.tsx"));
const PrintAssignment = lazy(() => import("./components/PrintAssignment.tsx"));

import { useClassConfig } from "./lib/useClassConfig.ts";

// Aliases keep the rest of the file untouched — these names match the
// ones used by <Route> elements below.
const VideoLearningPage = VideoLearningPageLazy;
const TedTalkPage = TedTalkPageLazy;
const DismissalPage = DismissalPageLazy;
const AssignmentTodayPage = AssignmentTodayPageLazy;
const SELPage = SELPageLazy;
const GradebookStudentPicker = GradebookStudentPickerLazy;

function AppLoader() {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-6 relative overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 -left-24 w-72 h-72 bg-violet-600/10 rounded-full blur-[80px] animate-pulse-slow" />
        <div className="absolute bottom-1/3 -right-24 w-72 h-72 bg-indigo-600/10 rounded-full blur-[80px] animate-pulse-slow" style={{ animationDelay: "1.5s" }} />
      </div>
      {/* Logo with orbiting dot */}
      <div className="relative animate-float">
        <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-violet-600/40">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>
        </div>
        <span className="absolute top-1/2 left-1/2 w-2.5 h-2.5 -mt-1.25 -ml-1.25 rounded-full bg-violet-400/70 shadow shadow-violet-400/50 animate-orbit pointer-events-none" />
      </div>
      <div className="flex flex-col items-center gap-2 animate-fade-in" style={{ animationDelay: "150ms" }}>
        <span className="text-lg font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400">BlockForge</span>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
              style={{ animationDelay: `${i * 140}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function DashboardRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <AppLoader />;
  if (!user) return <Navigate to="/home" replace />;
  if (user.role === "admin") return <Navigate to="/admin-dashboard" replace />;
  if (user.role === "teacher") return <Navigate to="/teacher" replace />;
  return <Navigate to="/student" replace />;
}

function ProjectWorkspaceRoute() {
  const { user } = useAuth();
  const { id } = useParams();
  // Students can access projects only after completing today's work
  if (user?.role === 'student' && !isAccessAllowed()) return <Navigate to="/student" replace />;
  return <ProjectWorkspace projectId={id} />;
}

function ArcadeGuard() {
  const { user } = useAuth();
  // Students can access arcade only after completing today's work
  if (user?.role === 'student' && !isAccessAllowed()) return <Navigate to="/student" replace />;
  return <ArcadePage />;
}

function ProjectsGuard() {
  const { user } = useAuth();
  const cfg = useClassConfig();
  // Students can access projects only after completing today's work
  if (user?.role === 'student' && !isAccessAllowed()) return <Navigate to="/student" replace />;
  // Teacher-set config: projects disabled
  if (user?.role === 'student' && !cfg.projectsEnabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: "var(--bg)" }}>
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold mb-2 text-t1">Projects are paused</h1>
        <p className="text-sm max-w-sm text-t3">
          Your teacher has turned off Projects for now. You'll see them again when they're turned back on.
        </p>
      </div>
    );
  }
  return <ProjectsList />;
}

export default function App() {
  useEffect(() => {
    const ping = () => fetch("/api/ping").catch(() => {});
    ping();
    const iv = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<AppLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes with sidebar layout */}
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<DashboardRedirect />} />
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin-dashboard" element={<AdminDashboard />} />
            <Route path="teacher" element={<TeacherDashboard />} />
            <Route path="student" element={<StudentDashboard />} />
            <Route path="student/videos" element={<StudentVideoPage />} />
            <Route path="projects" element={<ProjectsGuard />} />
            <Route path="classes/:id" element={<ClassManager />} />
            <Route path="assignments" element={<AssignmentBuilder />} />
            <Route path="quizzes" element={<QuizBuilder />} />
            {/* Gradebook consolidates the old /grading page — redirect to keep old links working */}
            <Route path="grading" element={<Navigate to="/teacher/gradebook" replace />} />
            <Route path="analytics" element={<AnalyticsPanel />} />
            <Route path="monitor" element={<MonitorPage />} />
            <Route path="monitor-legacy" element={<MonitorPanel />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="achievements" element={<Achievements />} />
            <Route path="lessons" element={<LessonsPage />} />
            <Route path="youtube" element={<YouTubeManager />} />
            <Route path="lesson-analytics" element={<LessonAnalytics />} />
            <Route path="class-grades" element={<ClassGrades />} />
            <Route path="teacher/gradebook" element={<GradebookStudentPicker />} />
            <Route path="teacher/gradebook/:studentId" element={<TeacherGradebook />} />
            <Route path="websites" element={<StudentWebsites />} />
            <Route path="go/apps" element={<StudentWebsites />} />
            <Route path="teacher/websites" element={<TeacherWebsites />} />
            <Route path="teacher/schedule" element={<TeacherSchedule />} />
            <Route path="teacher/board-settings" element={<TeacherBoardSettings />} />
            <Route path="teacher/store" element={<TeacherStore />} />
            <Route path="teacher/assignment-schedule" element={<AssignmentSchedulePage />} />

            {/* Schedule block routes — placeholder pages auto-nav'd to by useBlockAutoNav */}
            <Route path="daily-news" element={<DailyNewsViewer />} />
            <Route path="video-learning" element={<VideoLearningPage />} />
            <Route path="ted-talk" element={<TedTalkPage />} />
            <Route path="dismissal" element={<DismissalPage />} />
            <Route path="cashout" element={<CashoutPage />} />
            <Route path="assignment/today/sel" element={<SELPage />} />
            <Route path="assignment/today/:subject" element={<AssignmentTodayPage />} />
          </Route>

          {/* Full-screen embedded website viewer (no sidebar) */}
          <Route path="/app/:websiteId" element={<ProtectedRoute><WebsiteViewer /></ProtectedRoute>} />

          {/* Full-screen project workspace (no sidebar) */}
          <Route path="/project/:id" element={<ProtectedRoute><ProjectWorkspaceRoute /></ProtectedRoute>} />

          {/* ── Public routes — no login needed ── */}
          <Route element={<PublicLayout />}>
            <Route path="/home" element={<LandingPage />} />
            <Route path="/arcade" element={<ArcadeGuard />} />
          </Route>

          {/* Public playground — no login required */}
          <Route path="/playground" element={<ProjectWorkspace />} />

          {/* Student kiosk — no login required */}
          <Route path="/kiosk" element={<StudentKiosk />} />

          {/* Classroom board — TV/projector kiosk view */}
          <Route path="/board" element={<ProtectedRoute><ClassroomBoard /></ProtectedRoute>} />

          {/* Printable assignment — auto-triggers print dialog */}
          <Route path="/print/assignment/:id" element={<PrintAssignment />} />

          {/* Teacher admin portal — password-protected, no auth guard */}
          <Route path="/admin" element={<TeacherAdmin />} />

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
