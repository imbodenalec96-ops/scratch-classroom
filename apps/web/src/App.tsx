import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.tsx";
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
import Leaderboard from "./components/Leaderboard.tsx";
import Achievements from "./components/Achievements.tsx";
import ChatPanel from "./components/ChatPanel.tsx";
import LessonsPage from "./components/LessonsPage.tsx";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center bg-[#0a0a1a] text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function DashboardRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center bg-[#0a0a1a] text-white">Loading...</div>;
  if (!user) return <Navigate to="/playground" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "teacher") return <Navigate to="/teacher" replace />;
  return <Navigate to="/student" replace />;
}

function ProjectWorkspaceRoute() {
  const { id } = useParams();
  return <ProjectWorkspace projectId={id} />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes with sidebar layout */}
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<DashboardRedirect />} />
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="teacher" element={<TeacherDashboard />} />
            <Route path="student" element={<StudentDashboard />} />
            <Route path="projects" element={<ProjectsList />} />
            <Route path="classes/:id" element={<ClassManager />} />
            <Route path="assignments" element={<AssignmentBuilder />} />
            <Route path="quizzes" element={<QuizBuilder />} />
            <Route path="grading" element={<GradingPanel />} />
            <Route path="analytics" element={<AnalyticsPanel />} />
            <Route path="monitor" element={<MonitorPanel />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="achievements" element={<Achievements />} />
            <Route path="lessons" element={<LessonsPage />} />
          </Route>

          {/* Full-screen project workspace (no sidebar) */}
          <Route path="/project/:id" element={<ProtectedRoute><ProjectWorkspaceRoute /></ProtectedRoute>} />

          {/* Public playground — no login required (works on Vercel without backend) */}
          <Route path="/playground" element={<ProjectWorkspace />} />

          <Route path="*" element={<Navigate to="/playground" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
