import styles from "./Header.module.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getHomeRouteForCurrentUser,
  isAuthenticated,
} from "../../utils/auth";

function Header({ pageType, userName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const loggedIn = isAuthenticated();
  const accountRoute = loggedIn ? getHomeRouteForCurrentUser() : "/login";
  const joinRoute = loggedIn ? "/join-class" : "/login";

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={styles.siteHeader}>
      <nav className={styles.navbar} aria-label="Primary navigation">
        <Link
          to="/"
          className={styles.brand}
          aria-label="SharpRunner home"
          onClick={closeMenu}
        >
          <img
            src="/Sharprunner_logo/sharprunner-mark@4x.png"
            width="1776"
            height="1424"
            className={styles.brandLogo}
            alt="SharpRunner logo"
          />
          <span>SharpRunner</span>
        </Link>

        {pageType === "landingPage" && (
          <>
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={menuOpen}
              aria-controls="landing-navigation"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>

            <div
              id="landing-navigation"
              className={`${styles.navigation} ${menuOpen ? styles.navigationOpen : ""}`}
            >
              <div className={styles.navLinks}>
                <a href="#heroSection" onClick={closeMenu}>Home</a>
                <a href="#featureSection" onClick={closeMenu}>Features</a>
                <a href="#product-demo" onClick={closeMenu}>Platform</a>
                <a href="#howItWorks" onClick={closeMenu}>How It Works</a>
              </div>
              <div className={styles.navActions}>
                <Link className={styles.accountLink} to={accountRoute} onClick={closeMenu}>
                  {loggedIn ? "Dashboard" : "Log in"}
                </Link>
                <Link className={styles.joinLink} to={joinRoute} onClick={closeMenu}>
                  Join Classroom
                </Link>
              </div>
            </div>
          </>
        )}

        {pageType === "primary" && (
          <div className={styles.primaryAccount}>
            <span className={styles.greetings}>Welcome back, {userName}!</span>
            <Link to={accountRoute}>Dashboard</Link>
          </div>
        )}
      </nav>
    </header>
  );
}

export default Header;
