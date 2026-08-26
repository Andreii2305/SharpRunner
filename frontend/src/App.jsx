import { lazy, Suspense } from "react";
import LandingPage from "./Components/LandingPage/LandingPage.jsx";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./Components/ProtectedRoute/ProtectedRoute.jsx";
import { ToastProvider } from "./Components/Toast/ToastProvider.jsx";

const LessonSection = lazy(() => import("./Components/LessonSection/LessonSection.jsx"));
const LoginPage = lazy(() => import("./Components/LogInPage/Login.jsx"));
const SignUp = lazy(() => import("./Components/Registration/SignUp.jsx"));
const LessonMapPage = lazy(() => import("./pages/map/LessonMapPage.jsx"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage.jsx"));
const TeacherDashboardPage = lazy(() => import("./pages/teacher/TeacherDashboardPage.jsx"));
const TeacherClassesPage = lazy(() => import("./pages/teacher/TeacherClassesPage.jsx"));
const TeacherStudentsPage = lazy(() => import("./pages/teacher/TeacherStudentsPage.jsx"));
const TeacherAnalyticsPage = lazy(() => import("./pages/teacher/TeacherAnalyticsPage.jsx"));
const TeacherAnnouncementsPage = lazy(() => import("./pages/teacher/TeacherAnnouncementsPage.jsx"));
const TeacherClassDetailPage = lazy(() => import("./pages/teacher/TeacherClassDetailPage.jsx"));
const JoinClassPage = lazy(() => import("./pages/student/JoinClassPage.jsx"));
const StudentLeaderboardPage = lazy(() => import("./pages/student/StudentLeaderboardPage.jsx"));
const ClassroomLessonPage = lazy(() => import("./pages/student/ClassroomLessonPage.jsx"));
const StudentDashboardPage = lazy(() => import("./Components/Dashboard/Dashboard.jsx"));
const DeveloperPage = lazy(() => import("./pages/developer/DeveloperPage.jsx"));
const AdminInviteRegisterPage = lazy(() => import("./pages/auth/AdminInviteRegisterPage.jsx"));
const GoogleCallbackPage = lazy(() => import("./pages/auth/GoogleCallbackPage.jsx"));
const EmailVerificationPage = lazy(() => import("./pages/auth/EmailVerificationPage.jsx"));
const AdminEmailVerificationPage = lazy(() => import("./pages/auth/AdminEmailVerificationPage.jsx"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage.jsx"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage.jsx"));
const LevelRoutePage = lazy(() => import("./pages/game/LevelRoutePage.jsx"));
const TeacherLevelEditorPage = lazy(() => import("./pages/teacher/TeacherLevelEditorPage.jsx"));
const TeacherSettingsPage = lazy(() => import("./pages/teacher/TeacherSettingsPage.jsx"));

const gameRouteFallback = (
  <div role="status" aria-live="polite" style={{ padding: "2rem", textAlign: "center" }}>
    Loading level...
  </div>
);

/* Convenience wrapper so teacher routes stay DRY */
function TeacherRoute({ children }) {
  return (
    <ProtectedRoute allowedRoles={["teacher", "admin"]}>
      {children}
    </ProtectedRoute>
  );
}

function App() {
  return (
    <ToastProvider>
    <BrowserRouter>
      <Suspense fallback={gameRouteFallback}>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        {/* ── Student routes ── */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requireClassMembership>
              <StudentDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/join-class"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <JoinClassPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leaderboards"
          element={
            <ProtectedRoute requireClassMembership>
              <StudentLeaderboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson/classroom/:lessonId"
          element={
            <ProtectedRoute requireClassMembership>
              <ClassroomLessonPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assignment/classroom/:lessonId"
          element={
            <ProtectedRoute requireClassMembership>
              <ClassroomLessonPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/Map"
          element={
            <ProtectedRoute requireClassMembership>
              <LessonMapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/:lessonSlug/level/:levelNumber"
          element={
            <ProtectedRoute requireClassMembership>
              <Suspense fallback={gameRouteFallback}>
                <LevelRoutePage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/Map/level/:levelNumber"
          element={
            <ProtectedRoute requireClassMembership>
              <Suspense fallback={gameRouteFallback}>
                <LevelRoutePage />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* ── Teacher routes ── */}
        <Route
          path="/teacher"
          element={
            <TeacherRoute>
              <TeacherDashboardPage />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/classes"
          element={
            <TeacherRoute>
              <TeacherClassesPage />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/students"
          element={
            <TeacherRoute>
              <TeacherStudentsPage />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/analytics"
          element={
            <TeacherRoute>
              <TeacherAnalyticsPage />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/announcements"
          element={
            <TeacherRoute>
              <TeacherAnnouncementsPage />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/classrooms/:classroomId"
          element={
            <TeacherRoute>
              <TeacherClassDetailPage />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/classrooms/:classroomId/levels"
          element={
            <TeacherRoute>
              <Suspense fallback={gameRouteFallback}>
                <TeacherLevelEditorPage />
              </Suspense>
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/settings"
          element={
            <TeacherRoute>
              <TeacherSettingsPage />
            </TeacherRoute>
          }
        />

        {/* ── Admin ── */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />

        {/* ── Auth / misc ── */}
        <Route path="/lesson" element={<LessonSection />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/developer" element={<DeveloperPage />} />
        <Route path="/admin-invite" element={<AdminInviteRegisterPage />} />
        <Route path="/auth/callback" element={<GoogleCallbackPage />} />
        <Route path="/verify-email" element={<EmailVerificationPage />} />
        <Route path="/admin-verify-email" element={<AdminEmailVerificationPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
