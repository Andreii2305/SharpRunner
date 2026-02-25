import styles from "./Sidebar.module.css";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import LeaderboardOutlinedIcon from "@mui/icons-material/LeaderboardOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import Logout from "@mui/icons-material/LogoutOutlined";
import { Link, useNavigate } from "react-router-dom";
import avatar from "../../assets/avatar.png";
import { clearToken } from "../../utils/auth";

function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  return (
    <aside className={styles.sidebar}>
      <ul>
        <li>
          <Link to="/" className={styles.link}>
            {/* <span className={`${styles.icon} ${styles.logo}`}>
              <img src={Logo} alt="SharpRunner-Logo" />
            </span> */}
            <span className={styles.label}>SharpRunner</span>
          </Link>
        </li>
        <li>
          <Link to="/dashboard" className={styles.link}>
            <span className={styles.icon}>
              <DashboardOutlined sx={{ color: "#26547c" }} />
            </span>

            <span className={styles.label}>Dashboard</span>
          </Link>
        </li>
        <li>
          <Link to="/lesson" className={styles.link}>
            <span className={styles.icon}>
              <LibraryBooksOutlinedIcon />
            </span>
            <span className={styles.label}>Lesson</span>
          </Link>
        </li>
        <li>
          <Link to="/leaderboards" className={styles.link}>
            <span className={styles.icon}>
              <LeaderboardOutlinedIcon />
            </span>
            <span className={styles.label}>Leaderboards</span>
          </Link>
        </li>
        <li>
          <Link to="/map" className={styles.link}>
            <span className={styles.icon}>
              <MapOutlinedIcon />
            </span>
            <span className={styles.label}>Map</span>
          </Link>
        </li>
      </ul>

      <ul>
        <li>
          <Link className={styles.link}>
            <span className={styles.icon}>
              <img src={avatar} alt="account" />
            </span>
            <span className={styles.label}>Account</span>
          </Link>
        </li>
        <li>
          <button
            type="button"
            className={styles.linkButton}
            onClick={handleLogout}
          >
            <span className={styles.icon}>
              <Logout />
            </span>
            <span className={styles.label}>Logout</span>
          </button>
        </li>
      </ul>
    </aside>
  );
}

export default Sidebar;
