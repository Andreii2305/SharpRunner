import styles from "./Sidebar.module.css";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import DashboardFilled from "@mui/icons-material/Dashboard";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import LibraryBooksFilled from "@mui/icons-material/LibraryBooks";
import LeaderboardOutlinedIcon from "@mui/icons-material/LeaderboardOutlined";
import LeaderboardFilled from "@mui/icons-material/Leaderboard";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import MapOutFilled from "@mui/icons-material/Map";
import { Link } from "react-router-dom";

function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <ul>
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
          <Link to="/Map" className={styles.link}>
            <span className={styles.icon}>
              <MapOutlinedIcon />
            </span>
            <span className={styles.label}>Map</span>
          </Link>
        </li>
      </ul>
    </aside>
  );
}

export default Sidebar;
