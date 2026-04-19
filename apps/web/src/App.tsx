import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { isAccessAllowed } from "./lib/workUnlock.ts";
import { AuthProvider, useAuth } from "./lib/auth.tsx";
import { ThemeProvider } from "./lib/theme.tsx";
import LoginPage from "./components/LoginPage.tsx";
import Layout from "./components/Layout.tsx";
import AdminDashboard from "./components/AdminDashboard.tsx";
import TeacherDashboard from "./components/TeacherDashboard.tsx";
import StudentDashboard from "./components/StudentDashboard.tsx";
import ProjectWorkspace from "./components/ProjectWorkspace.tsx";
import ProjectsList from "./components/ProjectsList.tsx";
import ClassManager from "./components/ClassManager.tsx";
import AssignmentBuilder from "./components/AssignmentBuilder.tsx";
import QuizBuilder from "./components/QuizBuilder.tsx";
import GradingPanel from "./components/GradingPanel.tsx";
import AnalyticsPanel from "./components/AnalyticsPanel.tsx";
import MonitorPanel from "./components/MonitorPanel.tsx";
import MonitorPage from "./components/MonitorPage.tsx";
import Leaderboard from "./components/Leaderboard.tsx";
import Achievements from "./components/Achievements.tsx";
import ChatPanel from "./components/ChatPanel.tsx";
import LessonsPage from "./components/LessonsPage.tsx";
import ArcadePage from "./components/ArcadePage.tsx";
import YouTubeManager from "./components/YouTubeManager.tsx";
import LessonAnalytics from "./components/LessonAnalytics.tsx";
import ClassGrades from "./components/ClassGrades.tsx";
import TeacherGradebook, { GradebookStudentPicker } from "./components/TeacherGradebook.tsx";
import TeacherWebsites from "./components/TeacherWebsites.tsx";
import TeacherSchedule from "./components/TeacherSchedule.tsx";
import WebsiteViewer from "./components/WebsiteViewer.tsx";
import {
  VideoLearningPage, TedTalkPage, DismissalPage, CashoutPage,
  AssignmentTodayPage, SELPage,
} from "./components/BlockPlaceholder.tsx";
import DailyNewsViewer from "./components/DailyNewsViewer.tsx";
import { useClassConfig } from "./lib/useClassConfig.ts";
import LandingPage from "./components/LandingPage.tsx";
import PublicLayout from "./components/PublicLayout.tsx";
import StudentKiosk from "./components/StudentKiosk.tsx";
import TeacherAdmin from "./components/TeacherAdmin.tsx";
import ClassroomBoard from "./components/ClassroomBoard.tsx";
import TeacherBoardSettings from "./components/TeacherBoardSettings.tsx";
import StudentVideoPage from "./components/StudentVideoPage.tsx";
import PrintAssignment from "./components/PrintAssignment.tsx";

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
  if (loading) return <AppLoader />;
  if (!user) return <Navigate to="/login" replace />;
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
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
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
            <Route path="teacher/websites" element={<TeacherWebsites />} />
            <Route path="teacher/schedule" element={<TeacherSchedule />} />
            <Route path="teacher/board-settings" element={<TeacherBoardSettings />} />

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
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
