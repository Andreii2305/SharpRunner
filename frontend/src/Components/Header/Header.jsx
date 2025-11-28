import styles from "./Header.module.css";
import avatar from "../../assets/avatar.png";
import Button from "../Button/Button.jsx";
import { Link } from "react-router-dom";

function Header({ pageType, userName }) {
  const handleClick = () => {
    alert("Join Room button clicked");
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.leftNav}>
        <Link to="/">SharpRunner</Link>
      </div>
      {pageType === "landingPage" && (
        <div className={styles.rightNav}>
          <div>
            <a href="#heroSection">Home</a>
            <a href="#featureSection">Features</a>
            <a href="#howItWorks">How It Works?</a>
            <Link to="/AboutUs">About Us</Link>
          </div>
          <Button label="Join Room" onClick={handleClick} />
          <a href="#">
            <img src={avatar} alt="avatar" />
          </a>
        </div>
      )}

      {pageType === "dashboard" && (
        <div className={styles.rightNav}>
          <span className={styles.greetings}>Welcome Back, {userName}!</span>
          <a href="#">
            <img src={avatar} alt="avatar" />
          </a>
        </div>
      )}
    </nav>
  );
}

export default Header;
