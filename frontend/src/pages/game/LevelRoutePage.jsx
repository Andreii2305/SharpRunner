import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { bgmManager } from "./audio/bgmManager";
import { fetchPrimaryClassroomId } from "../../services/builtInLessonContentService.js";
import { getProgress } from "../../services/studentAssessmentService.js";
import {
  buildMapHref,
  createLevelEntryViewModel,
  loadExactProgress,
  withExactClassroom,
} from "../../utils/lessonProgressionNavigation.js";

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
  const accessPanelRef = useRef(null);
  const { lessonSlug, levelNumber } = useParams();
  const [searchParams] = useSearchParams();
  const requestedClassroomId = searchParams.get("classroomId");
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
    classroomId: null,
    entry: null,
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

    const controller = new AbortController();
    setAccessCheck({ levelKey, status: "loading", classroomId: null, entry: null });
    loadExactProgress({
      requestedClassroomId,
      getProgress,
      resolvePrimary: fetchPrimaryClassroomId,
      signal: controller.signal,
    })
      .then((progress) => {
        if (!isMounted) return;
        const level = progress?.levels?.find((row) => row.levelKey === levelKey);
        const gameHref = withExactClassroom(getLevelRoute(levelConfig.levelNumber), progress.classroomId);
        const entry = createLevelEntryViewModel({
          classroomId: progress.classroomId,
          level,
          gameHref,
        });
        const isScheduled = level?.lockReason === "scheduled";
        const isExpired = level?.lockReason === "deadline";
        setAccessCheck({
          levelKey,
          status: entry.kind === "game"
            ? "allowed"
            : entry.kind === "assessment"
              ? "assessment"
              : entry.kind === "recovery"
                ? "recovery"
                : entry.kind === "invalid"
                  ? "invalid"
                  : isExpired ? "expired" : "locked",
          message: !level
            ? "Your teacher has disabled this level for the classroom."
            : isExpired
              ? "This level is no longer available. Contact your instructor if you need an extension."
            : isScheduled
              ? `This level unlocks on ${new Date(level.unlockAt).toLocaleString()}.`
              : "Complete the previous assigned level before opening this level.",
          prerequisiteLevelKey: level?.prerequisiteLevelKey ?? null,
          effectiveDueAt: level?.effectiveDueAt ?? null,
          classroomId: progress.classroomId,
          entry,
        });
      })
      .catch(() => {
        if (isMounted) setAccessCheck({ levelKey, status: "error" });
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [checkVersion, requestedClassroomId, lessonSlug, levelConfig]);

  const accessStatus =
    accessCheck.levelKey === levelConfig?.progressKey
      ? accessCheck.status
      : "loading";

  useEffect(() => {
    if (["recovery", "invalid"].includes(accessStatus)) {
      accessPanelRef.current?.focus();
    }
  }, [accessStatus]);

  useEffect(() => {
    if (accessStatus === "allowed" && levelConfig) {
      bgmManager.playForLevel(levelConfig.levelNumber);
    }
  }, [accessStatus, levelConfig]);

  useEffect(() => () => bgmManager.leaveGameplay(), []);

  if (!lessonSlug && levelConfig) {
    return <Navigate to={withExactClassroom(getLevelRoute(levelConfig.levelNumber), requestedClassroomId)} replace />;
  }

  if (levelConfig && accessStatus === "assessment" && accessCheck.entry?.href) {
    return <Navigate to={accessCheck.entry.href} replace />;
  }

  if (Number.isInteger(parsedLevelNumber) && levelConfig && accessStatus === "allowed") {
    return <GamePage levelConfig={levelConfig} classroomId={accessCheck.classroomId} />;
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
                onClick={() => navigate(withExactClassroom(
                  getLevelRoute(prerequisiteConfig.levelNumber),
                  accessCheck.classroomId,
                ))}
              />
            ) : null}
            <Button
              label="Back to Map"
              variant="outline"
              size="md"
              onClick={() => navigate(buildMapHref(accessCheck.classroomId))}
            />
          </div>
        </div>
      </div>
    );
  }

  if (levelConfig && ["recovery", "invalid"].includes(accessStatus)) {
    return (
      <div className={styles.placeholderPage}>
        <div ref={accessPanelRef} className={styles.placeholderCard} role="alert" tabIndex={-1}>
          <h1>{accessStatus === "recovery" ? "Post-Test attempts exhausted" : "Level access changed"}</h1>
          <p>{accessCheck.entry?.label}</p>
          <Button
            label="Back to Map"
            variant="primary"
            size="md"
            onClick={() => navigate(buildMapHref(accessCheck.classroomId))}
          />
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
          <Button label="Back to Map" variant="primary" size="md" onClick={() => navigate(buildMapHref(accessCheck.classroomId))} />
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
              onClick={() => navigate(buildMapHref(accessCheck.classroomId))}
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
            onClick={() => navigate(buildMapHref(accessCheck.classroomId))}
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
