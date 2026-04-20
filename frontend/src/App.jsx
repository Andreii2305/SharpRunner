import LandingPage from "./Components/LandingPage/LandingPage.jsx";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LessonSection from "./Components/LessonSection/LessonSection.jsx";
import LoginPage from "./Components/LogInPage/Login.jsx";
import SignUp from "./Components/Registration/SignUp.jsx";
import ProtectedRoute from "./Components/ProtectedRoute/ProtectedRoute.jsx";
import LessonMapPage from "./pages/map/LessonMapPage.jsx";
import LevelRoutePage from "./pages/game/LevelRoutePage.jsx";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage.jsx";
import TeacherDashboardPage from "./pages/teacher/TeacherDashboardPage.jsx";
import TeacherClassesPage from "./pages/teacher/TeacherClassesPage.jsx";
import TeacherStudentsPage from "./pages/teacher/TeacherStudentsPage.jsx";
import TeacherAnalyticsPage from "./pages/teacher/TeacherAnalyticsPage.jsx";
import TeacherAnnouncementsPage from "./pages/teacher/TeacherAnnouncementsPage.jsx";
import TeacherLevelEditorPage from "./pages/teacher/TeacherLevelEditorPage.jsx";
import JoinClassPage from "./pages/student/JoinClassPage.jsx";
import StudentLeaderboardPage from "./pages/student/StudentLeaderboardPage.jsx";
import StudentDashboardPage from "./Components/Dashboard/Dashboard.jsx";
import DeveloperPage from "./pages/developer/DeveloperPage.jsx";
import AdminInviteRegisterPage from "./pages/auth/AdminInviteRegisterPage.jsx";

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
    <BrowserRouter basename="/SharpRunner">
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
          path="/Map"
          element={
            <ProtectedRoute requireClassMembership>
              <LessonMapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/Map/level/:levelNumber"
          element={
            <ProtectedRoute requireClassMembership>
              <LevelRoutePage />
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
          path="/teacher/classrooms/:classroomId/levels"
          element={
            <TeacherRoute>
              <TeacherLevelEditorPage />
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
