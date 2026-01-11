import styles from "./HeroSection.module.css";
import typingBro from "../../assets/typing-bro-1.svg";
import Button from "../Button/Button.jsx";
import Background from "./BackgroundEffect.jsx";
import { useNavigate } from "react-router-dom";

function HeroSection() {
  const navigate = useNavigate();

  const handleClick1 = () => {
    // Add your logic here for "Join Room via Code"
    alert("Join Room via Code clicked!");
  };

  const dashboardClick = () => {
    navigate("/dashboard");
  };

  return (
    <div id="heroSection" className={styles.heroSection}>
      <Background />
      <h1>
        A <span className={styles.green}>Fun</span> and{" "}
        <span className={styles.green}>Interactive</span> way to{" "}
        <span className={styles.blue}>Learn</span> Java Programming
      </h1>
      <p>
        Gamify your coding journey through interactive lessons, code challenges,
        and progress tracking, built for students and teachers.
      </p>
      <div className={styles.buttons}>
        <Button
          label="Open Dashboard"
          variant="outline"
          onClick={dashboardClick}
        />
        <Button
          label="Join Room via Code"
          variant="primary"
          onClick={handleClick1}
        />
      </div>
      <img src={typingBro} alt="typing-bro" />
    </div>
  );
}

export default HeroSection;
