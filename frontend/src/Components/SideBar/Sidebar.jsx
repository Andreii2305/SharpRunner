import styles from "./Sidebar.module.css";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import DashboardFilled from "@mui/icons-material/Dashboard";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import LibraryBooksFilled from "@mui/icons-material/LibraryBooks";
import LeaderboardOutlinedIcon from "@mui/icons-material/LeaderboardOutlined";
import LeaderboardFilled from "@mui/icons-material/Leaderboard";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import MapOutFilled from "@mui/icons-material/Map";
import Logout from "@mui/icons-material/LogoutOutlined";
import { Link } from "react-router-dom";
import avatar from "../../assets/avatar.png";
import Logo from "../../assets/SharpRunner.png";

function Sidebar() {
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
          <Link to="/Map" className={styles.link}>
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
          <Link className={styles.link}>
            <span className={styles.icon}>
              <Logout />
            </span>
            <span className={styles.label}>Logout</span>
          </Link>
        </li>
      </ul>
    </aside>
  );
}

export default Sidebar;
