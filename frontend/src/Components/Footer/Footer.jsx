import styles from "./Footer.module.css";
import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.brandColumn}>
          <Link to="/" className={styles.brand}>
            <span aria-hidden="true">&gt;_</span>
            SharpRunner
          </Link>
          <p>
            Interactive C# lessons and platforming challenges for beginner
            students and their classrooms.
          </p>
        </div>
        <nav className={styles.footerNav} aria-label="Footer navigation">
          <a href="#heroSection">Home</a>
          <a href="#featureSection">Features</a>
          <a href="#product-demo">Platform</a>
          <a href="#howItWorks">How It Works</a>
          <Link to="/login">Log in</Link>
        </nav>
      </div>
      <div className={styles.footerBottom}>
        <p>&copy; {new Date().getFullYear()} SharpRunner. Capstone project.</p>
        <p>Learn C# through play.</p>
      </div>
    </footer>
  );
}

export default Footer;
