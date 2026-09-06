import { useEffect, useState } from "react";
import axios from "axios";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import Button from "../../Components/Button/Button.jsx";
import GamePage from "./GamePage.jsx";
import styles from "./LevelRoutePage.module.css";
import {
  getAvailableLessonRoutes,
  getLevelConfig,
  getLevelConfigByProgressKey,
  getLevelConfigByRoute,
  getLevelRoute,
} from "./levels/levelConfigs";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import { bgmManager } from "./audio/bgmManager";

const AVAILABLE_ROUTES = getAvailableLessonRoutes();
const formatDeadline = (value) => new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(value));

function LevelRoutePage() {
  const navigate = useNavigate();
  const { lessonSlug, levelNumber } = useParams();
  const parsedLevelNumber = Number(levelNumber);
  const levelConfig = lessonSlug
    ? getLevelConfigByRoute(lessonSlug, parsedLevelNumber)
    : getLevelConfig(parsedLevelNumber);
  const [checkVersion, setCheckVersion] = useState(0);
  const [accessCheck, setAccessCheck] = useState({
    levelKey: null,
    status: "loading",
    message: "",
    prerequisiteLevelKey: null,
    effectiveDueAt: null,
  });

  useEffect(() => {
    let isMounted = true;
    const levelKey = levelConfig?.progressKey ?? null;

    if (!lessonSlug || !levelConfig) {
      setAccessCheck({ levelKey, status: "allowed", message: "", prerequisiteLevelKey: null });
      return () => {
        isMounted = false;
      };
    }

    setAccessCheck({ levelKey, status: "loading" });
    axios
      .get(buildApiUrl("/api/progress/me"), { headers: getAuthHeaders() })
      .then((response) => {
        if (!isMounted) return;
        const level = response.data?.levels?.find((row) => row.levelKey === levelKey);
        const isScheduled = level?.lockReason === "scheduled";
        const isExpired = level?.lockReason === "deadline";
        setAccessCheck({
          levelKey,
          status: level?.isAccessible || level?.isCompleted ? "allowed" : isExpired ? "expired" : "locked",
          message: !level
            ? "Your teacher has disabled this level for the classroom."
            : isExpired
              ? "This level is no longer available. Contact your instructor if you need an extension."
            : isScheduled
              ? `This level unlocks on ${new Date(level.unlockAt).toLocaleString()}.`
              : "Complete the previous assigned level before opening this level.",
          prerequisiteLevelKey: level?.prerequisiteLevelKey ?? null,
          effectiveDueAt: level?.effectiveDueAt ?? null,
        });
      })
      .catch(() => {
        if (isMounted) setAccessCheck({ levelKey, status: "error" });
      });

    return () => {
      isMounted = false;
    };
  }, [checkVersion, lessonSlug, levelConfig]);

  const accessStatus =
    accessCheck.levelKey === levelConfig?.progressKey
      ? accessCheck.status
      : "loading";

  useEffect(() => {
    if (accessStatus === "allowed" && levelConfig) {
      bgmManager.playForLevel(levelConfig.levelNumber);
    }
  }, [accessStatus, levelConfig]);

  useEffect(() => () => bgmManager.leaveGameplay(), []);

  if (!lessonSlug && levelConfig) {
    return <Navigate to={getLevelRoute(levelConfig.levelNumber)} replace />;
  }

  if (Number.isInteger(parsedLevelNumber) && levelConfig && accessStatus === "allowed") {
    return <GamePage levelConfig={levelConfig} />;
  }

  if (levelConfig && accessStatus === "loading") {
    return (
      <div className={styles.placeholderPage} role="status" aria-live="polite">
        <div className={styles.placeholderCard}>
          <h1>Checking level access...</h1>
          <p>Confirming that the previous level is complete.</p>
        </div>
      </div>
    );
  }

  if (levelConfig && accessStatus === "locked") {
    const prerequisiteConfig = getLevelConfigByProgressKey(
      accessCheck.prerequisiteLevelKey,
    );
    return (
      <div className={styles.placeholderPage}>
        <div className={styles.placeholderCard}>
          <h1>Level locked</h1>
          <p>{accessCheck.message}</p>
          <div className={styles.placeholderActions}>
            {prerequisiteConfig ? (
              <Button
                label="Go to Previous Assigned Level"
                variant="primary"
                size="md"
                onClick={() => navigate(getLevelRoute(prerequisiteConfig.levelNumber))}
              />
            ) : null}
            <Button
              label="Back to Map"
              variant="outline"
              size="md"
              onClick={() => navigate("/Map")}
            />
          </div>
        </div>
      </div>
    );
  }

  if (levelConfig && accessStatus === "expired") {
    return (
      <div className={styles.placeholderPage}>
        <div className={styles.placeholderCard}>
          <h1>Deadline Passed</h1>
          {accessCheck.effectiveDueAt ? (
            <p>Due: {formatDeadline(accessCheck.effectiveDueAt)} (Philippine Time)</p>
          ) : null}
          <p>{accessCheck.message}</p>
          <Button label="Back to Map" variant="primary" size="md" onClick={() => navigate("/Map")} />
        </div>
      </div>
    );
  }

  if (levelConfig && accessStatus === "error") {
    return (
      <div className={styles.placeholderPage}>
        <div className={styles.placeholderCard}>
          <h1>Could not verify level access</h1>
          <p>Your progress could not be loaded. Retry or return to the map.</p>
          <div className={styles.placeholderActions}>
            <Button
              label="Retry"
              variant="primary"
              size="md"
              onClick={() => setCheckVersion((version) => version + 1)}
            />
            <Button
              label="Back to Map"
              variant="outline"
              size="md"
              onClick={() => navigate("/Map")}
            />
          </div>
        </div>
      </div>
    );
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
          Use a level from Tutorial, Array, Function, or Function with Array.
          There are {AVAILABLE_ROUTES.length} available levels. Go back to the
          lesson map and continue from there.
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
