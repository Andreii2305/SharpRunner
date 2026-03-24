import LandingPage from "./Components/LandingPage/LandingPage.jsx";
import Dashboard from "./Components/Dashboard/Dashboard.jsx";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LessonSection from "./Components/LessonSection/LessonSection.jsx";
import LoginPage from "./Components/LogInPage/Login.jsx";
import SignUp from "./Components/Registration/SignUp.jsx";
import ProtectedRoute from "./Components/ProtectedRoute/ProtectedRoute.jsx";
import LessonMapPage from "./pages/map/LessonMapPage.jsx";
import LevelRoutePage from "./pages/game/LevelRoutePage.jsx";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage.jsx";
import TeacherDashboardPage from "./pages/teacher/TeacherDashboardPage.jsx";
import JoinClassPage from "./pages/student/JoinClassPage.jsx";
import DeveloperPage from "./pages/developer/DeveloperPage.jsx";
import AdminInviteRegisterPage from "./pages/auth/AdminInviteRegisterPage.jsx";

function App() {
  return (
    <BrowserRouter basename="/SharpRunner">
      {/* <Header /> */}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requireClassMembership>
              <Dashboard />
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
          path="/teacher"
          element={
            <ProtectedRoute allowedRoles={["teacher", "admin"]}>
              <TeacherDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="/lesson" element={<LessonSection />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/developer" element={<DeveloperPage />} />
        <Route path="/admin-invite" element={<AdminInviteRegisterPage />} />
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
        <Route path="/signup" element={<SignUp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
