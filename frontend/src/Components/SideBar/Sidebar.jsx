import styles from "./Sidebar.module.css";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import LeaderboardOutlinedIcon from "@mui/icons-material/LeaderboardOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import ClassOutlinedIcon from "@mui/icons-material/ClassOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearToken, getUser } from "../../utils/auth";

/* ─── Nav items per role ──────────────────────────────────────── */
const STUDENT_NAV = [
  { to: "/dashboard", Icon: DashboardOutlinedIcon, label: "Dashboard" },
  { to: "/lesson", Icon: LibraryBooksOutlinedIcon, label: "Lessons" },
  { to: "/leaderboards", Icon: LeaderboardOutlinedIcon, label: "Leaderboard" },
  { to: "/Map", Icon: MapOutlinedIcon, label: "Map" },
];

const TEACHER_NAV = [
  { to: "/teacher", Icon: DashboardOutlinedIcon, label: "Overview" },
  { to: "/teacher/classes", Icon: ClassOutlinedIcon, label: "Classes" },
  { to: "/teacher/students", Icon: PeopleOutlinedIcon, label: "Students" },
  { to: "/teacher/analytics", Icon: BarChartOutlinedIcon, label: "Analytics" },
  {
    to: "/teacher/announcements",
    Icon: CampaignOutlinedIcon,
    label: "Announcements",
  },
];

/* ─── Helpers ─────────────────────────────────────────────────── */
function initials(name = "") {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/* ─── Component ───────────────────────────────────────────────── */
function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();

  const role = user?.role ?? "student";
  const isTeacher = role === "teacher" || role === "admin";
  const navItems = isTeacher ? TEACHER_NAV : STUDENT_NAV;

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : (user?.username ?? "Account");

  const handleLogout = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  const isActive = (to) => {
    /* exact match for root teacher and root student dashboard */
    if (to === "/teacher") return location.pathname === "/teacher";
    if (to === "/dashboard") return location.pathname === "/dashboard";
    /* prefix match for sub-pages */
    if (to === "/Map") return location.pathname.startsWith("/Map");
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  return (
    <aside className={styles.sidebar}>
      {/* Brand */}
      <div className={styles.brand}>
        <Link to="/" className={styles.brandLink}>
          <div className={styles.brandIcon}>S</div>
          <span className={styles.brandName}>SharpRunner</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {navItems.map(({ to, Icon, label }) => (
          <Link
            key={to}
            to={to}
            className={`${styles.navItem} ${isActive(to) ? styles.navActive : ""}`}
          >
            <span className={styles.navIcon}>
              <Icon sx={{ fontSize: 20 }} />
            </span>
            <span className={styles.navLabel}>{label}</span>
            {isActive(to) && <span className={styles.activeIndicator} />}
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className={styles.bottom}>
        <div className={styles.accountRow}>
          <div className={styles.accountAv}>
            {initials(displayName) || (
              <AccountCircleOutlinedIcon sx={{ fontSize: 18 }} />
            )}
          </div>
          <div className={styles.accountInfo}>
            <div className={styles.accountName}>{displayName}</div>
            <div className={styles.accountRole}>{role}</div>
          </div>
        </div>
        <button
          type="button"
          className={styles.logoutBtn}
          onClick={handleLogout}
          aria-label="Logout"
        >
          <span className={styles.navIcon}>
            <LogoutOutlinedIcon sx={{ fontSize: 20 }} />
          </span>
          <span className={styles.navLabel}>Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
