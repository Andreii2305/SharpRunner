import LandingPage from "./Components/LandingPage/LandingPage.jsx";
import Dashboard from "./Components/Dashboard/Dashboard.jsx";
import Sidebar from "./Components/SideBar/Sidebar.jsx";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Header from "./Components/Header/Header.jsx";
import LessonSection from "./Components/LessonSection/LessonSection.jsx";

function App() {
  return (
    <BrowserRouter basename="/SharpRunner">
      {/* <Header /> */}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/lesson" element={<LessonSection />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
