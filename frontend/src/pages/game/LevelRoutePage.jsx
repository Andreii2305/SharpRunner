import { useNavigate, useParams } from "react-router-dom";
import Button from "../../Components/Button/Button.jsx";
import GamePage from "./GamePage.jsx";
import styles from "./LevelRoutePage.module.css";

const AVAILABLE_LEVELS = new Set([1]);

function LevelRoutePage() {
  const navigate = useNavigate();
  const { levelNumber } = useParams();
  const parsedLevelNumber = Number(levelNumber);

  if (
    Number.isInteger(parsedLevelNumber) &&
    AVAILABLE_LEVELS.has(parsedLevelNumber)
  ) {
    return <GamePage />;
  }

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderCard}>
        <h1>
          {Number.isInteger(parsedLevelNumber)
            ? `Level ${parsedLevelNumber} is not available yet`
            : "Unknown level"}
        </h1>
        <p>
          Only Level 1 is implemented right now. You can go back to the lesson
          map and continue from there.
        </p>

        <div className={styles.placeholderActions}>
          <Button
            label="Back to Map"
            variant="primary"
            size="md"
            onClick={() => navigate("/Map")}
          />
          <Button
            label="Dashboard"
            variant="outline"
            size="md"
            onClick={() => navigate("/dashboard")}
          />
        </div>
      </div>
    </div>
  );
}

export default LevelRoutePage;
