import LandingPage from "./Components/LandingPage/LandingPage.jsx";
import Dashboard from "./Components/Dashboard/Dashboard.jsx";
import Sidebar from "./Components/SideBar/Sidebar.jsx";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Header from "./Components/Header/Header.jsx";

function App() {
  return (
    <BrowserRouter>
      {/* <Header /> */}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
