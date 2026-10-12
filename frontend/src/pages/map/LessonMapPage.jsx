import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LessonMap from "../../Components/LessonMap/LessonMap.jsx";
import TiledCurriculumMap from "../../Components/TiledCurriculumMap/TiledCurriculumMap.jsx";
import { getLevelConfig } from "../game/levels/levelConfigs.js";
import LessonProgressionPanel from "../../Components/LessonProgression/LessonProgressionPanel.jsx";
import { fetchPrimaryClassroomId } from "../../services/builtInLessonContentService.js";
import { getProgress } from "../../services/studentAssessmentService.js";
import { loadExactProgress, withExactClassroom } from "../../utils/lessonProgressionNavigation.js";
import styles from "./LessonMapPage.module.css";
import { LESSON_ONE_MAP_CONFIG } from "./lessonOneMapConfig";
import {
  createLessonMapViewModel,
  createMapLevelEntry,
  initialMapProgressState,
  isConfirmedUnenrolled,
  mapProgressReducer,
} from "./lessonMapViewModel.js";

const LEVEL_ONE_BG_SRC = `${import.meta.env.BASE_URL}game/assets/backgrounds/level1_bg.png`;
const ARRAYS_MAP_URL = `${import.meta.env.BASE_URL}game/assets/curriculum_map_level/array.tmj`;
const FUNCTIONS_MAP_URL = `${import.meta.env.BASE_URL}game/assets/curriculum_map_level/functions.tmj`;
const FUNCTIONS_ARRAYS_MAP_URL = `${import.meta.env.BASE_URL}game/assets/curriculum_map_level/function_with_arrays.tmj`;
const ARRAYS_ROUTE_START = 6;
const ARRAYS_LEVEL_COUNT = 8;
const FUNCTIONS_ROUTE_START = 14;
const FUNCTIONS_LEVEL_COUNT = 11;
const FUNCTIONS_ARRAYS_ROUTE_START = 26;
const LAST_REGION_KEY = "sharprunner:last-map-region";
const getDeadlineProps = (row) => ({
  effectiveDueAt: row?.effectiveDueAt ?? null,
  hasExtension: Boolean(row?.hasExtension),
});

const LESSON_DETAILS = [
  "Learn movement, inputs, counts, and precise code through five onboarding trials.",
  "Complete each tutorial node in order to unlock the Arrays curriculum.",
  "After the fifth trial, switch to the Arrays region to continue Kai's journey.",
];

const getProgressKeyForMapNode = (node) => {
  const [lessonKey] = node.id.split("-level-");
  const localNumber = Number(node.id.match(/-level-(\d+)$/)?.[1]);
  return Number.isInteger(localNumber) ? `${lessonKey}-level-${localNumber}` : node.id;
};

const getInitialRegion = () => {
  try {
    const stored = sessionStorage.getItem(LAST_REGION_KEY);
    return stored === "tutorial" || stored === "arrays" || stored === "functions" || stored === "functions-arrays"
      ? stored
      : null;
  } catch {
    return null;
  }
};

function LessonMapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedClassroomId = searchParams.get("classroomId");
  const requestKey = requestedClassroomId == null
    ? "primary"
    : `classroom:${requestedClassroomId}`;
  const [requestState, dispatchProgress] = useReducer(mapProgressReducer, initialMapProgressState);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);
  const [selectedRegion, setSelectedRegion] = useState(getInitialRegion);

  useEffect(() => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    dispatchProgress({ type: "load-started", generation, requestKey });
    const controller = new AbortController();
    const fetchProgress = async () => {
      try {
        const response = await loadExactProgress({
          requestedClassroomId,
          getProgress,
          resolvePrimary: fetchPrimaryClassroomId,
          signal: controller.signal,
        });
        dispatchProgress({
          type: "load-succeeded",
          generation,
          requestKey,
          progress: response,
        });
      } catch (error) {
        if (error?.name === "AbortError") return;
        dispatchProgress({
          type: isConfirmedUnenrolled(error, requestedClassroomId)
            ? "load-unenrolled"
            : "load-failed",
          generation,
          requestKey,
          error: error?.message ?? "Progress could not be loaded.",
        });
      }
    };
    fetchProgress();
    return () => controller.abort();
  }, [requestKey, requestedClassroomId, retryGeneration]);

  const currentRequestState = requestState.requestKey === requestKey
    ? requestState
    : initialMapProgressState;
  const progressData = currentRequestState.status === "ready" ? currentRequestState.progress : null;
  const mapViewModel = useMemo(
    () => createLessonMapViewModel(progressData, { selectedRegion }),
    [progressData, selectedRegion],
  );
  const classroomId = mapViewModel.classroomId;

  const mapNodes = useMemo(() => {
    return LESSON_ONE_MAP_CONFIG.nodes.map((node) => {
      const levelKey = getProgressKeyForMapNode(node);
      const row = mapViewModel.levelsByKey.get(levelKey);
      const gameRoute = withExactClassroom(`/tutorial/level/${node.levelNumber}`, classroomId);
      const entry = createMapLevelEntry(mapViewModel, levelKey, gameRoute);
      return {
        ...node,
        status: entry.visualStatus,
        route: entry.href,
        actionLabel: entry.label,
        disabled: entry.disabled,
        completed: row?.isCompleted === true,
        finalScore: row?.finalScore ?? null,
        ...getDeadlineProps(row),
      };
    });
  }, [classroomId, mapViewModel]);

  const arrayNodes = useMemo(() => {
    return Array.from({ length: ARRAYS_LEVEL_COUNT }, (_, index) => {
      const levelKey = `arrays-level-${index + 1}`;
      const row = mapViewModel.levelsByKey.get(levelKey);
      const levelNumber = ARRAYS_ROUTE_START + index;
      const config = getLevelConfig(levelNumber);
      const gameRoute = withExactClassroom(`/array/level/${index + 1}`, classroomId);
      const entry = createMapLevelEntry(mapViewModel, levelKey, gameRoute);
      return {
        id: levelKey,
        levelNumber,
        title: config?.title ?? `Arrays ${index + 1}`,
        topic: config?.learnSection?.title ?? config?.subtitle ?? "Arrays",
        route: entry.href,
        status: entry.visualStatus,
        actionLabel: entry.label,
        disabled: entry.disabled,
        completed: row?.isCompleted === true,
        finalScore: row?.finalScore ?? null,
        grade: row?.grade ?? null,
        attemptCount: row?.attemptCount ?? 0,
        ...getDeadlineProps(row),
      };
    });
  }, [classroomId, mapViewModel]);

  const functionNodes = useMemo(() => {
    return Array.from({ length: FUNCTIONS_LEVEL_COUNT }, (_, index) => {
      const levelKey = `functions-level-${index + 1}`;
      const row = mapViewModel.levelsByKey.get(levelKey);
      const levelNumber = FUNCTIONS_ROUTE_START + index;
      const config = getLevelConfig(levelNumber);
      const gameRoute = withExactClassroom(`/function/level/${index + 1}`, classroomId);
      const entry = createMapLevelEntry(mapViewModel, levelKey, gameRoute);
      return {
        id: levelKey,
        levelNumber,
        displayLevelNumber: config?.mapLevelLabel ?? levelNumber,
        title: config?.title ?? `Functions ${index + 1}`,
        topic: config?.learnSection?.title ?? config?.subtitle ?? "Functions and Methods",
        route: entry.href,
        status: entry.visualStatus,
        actionLabel: entry.label,
        disabled: entry.disabled,
        completed: row?.isCompleted === true,
        finalScore: row?.finalScore ?? null,
        grade: row?.grade ?? null,
        attemptCount: row?.attemptCount ?? 0,
        ...getDeadlineProps(row),
      };
    });
  }, [classroomId, mapViewModel]);

  const functionsArraysNodes = useMemo(() => {
    return Array.from({ length: 5 }, (_, index) => {
      const levelKey = index < 4 ? `functions-with-arrays-level-${index + 1}` : "final-level-1";
      const row = mapViewModel.levelsByKey.get(levelKey);
      const levelNumber = FUNCTIONS_ARRAYS_ROUTE_START + index;
      const config = getLevelConfig(levelNumber);
      const gameRoute = withExactClassroom(`/function-with-array/level/${index + 1}`, classroomId);
      const entry = createMapLevelEntry(mapViewModel, levelKey, gameRoute);
      return {
        id: levelKey,
        levelNumber,
        title: config?.title ?? `Functions with Arrays ${index + 1}`,
        topic: config?.learnSection?.title ?? config?.subtitle ?? "Functions with Arrays",
        route: entry.href,
        status: entry.visualStatus,
        actionLabel: entry.label,
        disabled: entry.disabled,
        completed: row?.isCompleted === true,
        finalScore: row?.finalScore ?? null,
        grade: row?.grade ?? null,
        attemptCount: row?.attemptCount ?? 0,
        ...getDeadlineProps(row),
      };
    });
  }, [classroomId, mapViewModel]);

  const nextLessonKey = mapViewModel.nextStep.lessonKey;
  const inferredRegion = nextLessonKey === "arrays"
    ? "arrays"
    : nextLessonKey === "functions-with-arrays" || nextLessonKey === "final"
      ? "functions-arrays"
      : nextLessonKey === "functions"
        ? "functions"
        : "tutorial";
  const activeRegion = selectedRegion ?? inferredRegion;
  const selectRegion = (region) => {
    setSelectedRegion(region);
    try {
      sessionStorage.setItem(LAST_REGION_KEY, region);
    } catch {
      // The map still works when storage is unavailable.
    }
  };

  const tutorialMetric = mapViewModel.regions.tutorial;
  const arraysMetric = mapViewModel.regions.arrays;
  const functionsMetric = mapViewModel.regions.functions;
  const functionsArraysMetric = mapViewModel.regions["functions-arrays"];

  const mapMarkerToLevel = useCallback(
    (markerLevelNumber) => ARRAYS_ROUTE_START + markerLevelNumber - 1,
    [],
  );
  const functionMarkerToLevel = useCallback(
    (markerLevelNumber) => FUNCTIONS_ROUTE_START + markerLevelNumber - 1,
    [],
  );
  const functionsArraysMarkerToLevel = useCallback(
    (markerLevelNumber) => FUNCTIONS_ARRAYS_ROUTE_START + markerLevelNumber - 1,
    [],
  );

  const tiledRegion =
    activeRegion === "functions-arrays"
      ? {
          mapUrl: FUNCTIONS_ARRAYS_MAP_URL,
          nodes: functionsArraysNodes,
          markerToLevel: functionsArraysMarkerToLevel,
          metric: functionsArraysMetric,
          badge: "Region IV",
          eyebrow: "Functions with Arrays · Levels 1–5",
          title: "The Final Rituals",
          summary: "Carry arrays through reusable methods, restore the final wards, and face Bakunawa.",
          headerDescription: functionsArraysMetric.availability === "available"
            ? "Follow the teacher-assigned sequence and select an available node."
            : functionsArraysMetric.countText === "No assigned game activities"
              ? "No game activities are assigned in this region."
              : functionsArraysMetric.availability === "locked"
                ? "Complete the required curriculum step to unlock this region."
                : "Region availability could not be confirmed.",
          notes: [
            "Pass one-dimensional arrays into methods and process every item.",
            "Restore two-dimensional grids through reusable method logic.",
            "The fifth marker leads to the separate Bakunawa final challenge.",
          ],
        }
      : activeRegion === "functions"
      ? {
          mapUrl: FUNCTIONS_MAP_URL,
          nodes: functionNodes,
          markerToLevel: functionMarkerToLevel,
          metric: functionsMetric,
          badge: "Region III",
          eyebrow: "Functions & Methods · Levels 1–11",
          title: "Functions & Methods",
          summary: "Name reusable actions, pass values, return results, and master recursive methods.",
          headerDescription: functionsMetric.availability === "available"
            ? "Follow the teacher-assigned sequence and select an available Functions node."
            : functionsMetric.countText === "No assigned game activities"
              ? "No game activities are assigned in this region."
              : functionsMetric.availability === "locked"
                ? "Complete the required curriculum step to unlock this region."
                : "Region availability could not be confirmed.",
          notes: [
            "Define and call reusable methods for protective rituals.",
            "Use parameters and return values to carry information between actions.",
            "Finish with the double-length recursive challenge at Level 24–25.",
          ],
        }
      : {
          mapUrl: ARRAYS_MAP_URL,
          nodes: arrayNodes,
          markerToLevel: mapMarkerToLevel,
          metric: arraysMetric,
          badge: "Region II",
          eyebrow: "Arrays · Levels 6–13",
          title: "The Cursed Collections",
          summary: "Journey through Barangay Malumay and break the curse binding its collections.",
          headerDescription: arraysMetric.availability === "available"
            ? "Follow the teacher-assigned sequence and select an available Arrays node."
            : arraysMetric.countText === "No assigned game activities"
              ? "No game activities are assigned in this region."
              : arraysMetric.availability === "locked"
                ? "Complete the required curriculum step to unlock this region."
                : "Region availability could not be confirmed.",
          notes: [
            "Build collections, read indexes, restore two-dimensional grids, and traverse every item.",
            "Level nodes use your current SharpRunner progress and unlock in curriculum order.",
            "Drag or scroll the map to follow Kai through the region.",
          ],
        };

  const retryProgress = () => setRetryGeneration((value) => value + 1);
  const requestStatus = currentRequestState.status === "idle"
    ? "loading"
    : currentRequestState.status;
  if (requestStatus !== "ready" || mapViewModel.status === "unavailable") {
    const isLoading = requestStatus === "loading";
    const isUnenrolled = requestStatus === "unenrolled";
    const title = isLoading
      ? "Loading your lesson map"
      : isUnenrolled
        ? "Join a classroom to begin"
        : "Lesson map progress unavailable";
    const message = isLoading
      ? "Checking the learning path assigned to this classroom…"
      : isUnenrolled
        ? "Your teacher's classroom connects you to lessons, assessments, and game activities."
        : currentRequestState.error ?? mapViewModel.nextStep.description;
    return (
      <div className={styles.lessonMapPage}>
        <section className={styles.lessonMapContent}>
          <div className={styles.requestStatus} role={isLoading ? "status" : "alert"}>
            <span className={styles.requestEyebrow}>Lesson map</span>
            <h1>{title}</h1>
            <p>{message}</p>
            {!isLoading && (
              <div className={styles.requestActions}>
                {isUnenrolled ? (
                  <button type="button" onClick={() => navigate("/join-class")}>Join a classroom</button>
                ) : (
                  <button type="button" onClick={retryProgress}>Retry</button>
                )}
                <button type="button" className={styles.secondaryAction} onClick={() => navigate("/dashboard")}>Dashboard</button>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.lessonMapPage}>
      <section className={styles.lessonMapContent}>
        <nav className={styles.regionTabs} aria-label="Curriculum regions">
          <span className={styles.regionTabsLabel}>Switch lesson</span>
          <div className={styles.regionTabList}>
          <button
            type="button"
            className={activeRegion === "tutorial" ? styles.activeRegionTab : ""}
            onClick={() => selectRegion("tutorial")}
            aria-pressed={activeRegion === "tutorial"}
          >
            <span className={styles.regionOrder}>01</span>
            <span className={styles.regionName}>Tutorial</span>
            <span className={styles.regionProgress}>{tutorialMetric.percentageText}</span>
          </button>
          <button
            type="button"
            className={activeRegion === "arrays" ? styles.activeRegionTab : ""}
            onClick={() => selectRegion("arrays")}
            aria-pressed={activeRegion === "arrays"}
          >
            <span className={styles.regionOrder}>02</span>
            <span className={styles.regionName}>Arrays</span>
            <span className={styles.regionProgress}>{arraysMetric.percentageText}</span>
          </button>
          <button
            type="button"
            className={activeRegion === "functions" ? styles.activeRegionTab : ""}
            onClick={() => selectRegion("functions")}
            aria-pressed={activeRegion === "functions"}
          >
            <span className={styles.regionOrder}>03</span>
            <span className={styles.regionName}>Functions</span>
            <span className={styles.regionProgress}>{functionsMetric.percentageText}</span>
          </button>
          <button
            type="button"
            className={activeRegion === "functions-arrays" ? styles.activeRegionTab : ""}
            onClick={() => selectRegion("functions-arrays")}
            aria-pressed={activeRegion === "functions-arrays"}
          >
            <span className={styles.regionOrder}>04</span>
            <span className={styles.regionName}>Methods + Arrays</span>
            <span className={styles.regionProgress}>{functionsArraysMetric.percentageText}</span>
          </button>
          </div>
        </nav>

        <div className={styles.progressionPanel}>
          {mapViewModel.nextStep.progression ? (
            <LessonProgressionPanel
              title={mapViewModel.nextStep.title}
              model={mapViewModel.nextStep.progression}
              showAction
            />
          ) : (
            <div className={styles.nextStepStatus}>
              <span>Next step</span>
              <h2>{mapViewModel.status === "empty"
                ? "No assigned game activities"
                : mapViewModel.nextStep.title}</h2>
              <p>{mapViewModel.status === "empty"
                ? "No game activities are currently assigned in this classroom."
                : mapViewModel.nextStep.description}</p>
            </div>
          )}
        </div>

        {activeRegion === "tutorial" ? (
          <LessonMap
            lessonTitle={LESSON_ONE_MAP_CONFIG.lessonTitle}
            subtitle={LESSON_ONE_MAP_CONFIG.subtitle}
            description="Complete each assigned level from the point your classroom progress allows."
            progressPercent={tutorialMetric.progressPercent}
            progressSummary={tutorialMetric.countText}
            stages={LESSON_ONE_MAP_CONFIG.stages}
            nodes={mapNodes}
            connections={LESSON_ONE_MAP_CONFIG.connections}
            lessonDetails={LESSON_DETAILS}
            backgroundImageSrc={LEVEL_ONE_BG_SRC}
            onExit={() => navigate("/dashboard")}
            onNodeClick={(node) => { if (node.route) navigate(node.route); }}
            showContinue={false}
          />
        ) : (
          <div className={styles.arraysLayout}>
            <aside className={styles.arraysInfoPanel}>
              <div className={styles.arraysHero}>
                <span className={styles.regionBadge}>⚔ {tiledRegion.badge}</span>
                <div className={styles.arraysHeroText}>
                  <span className={styles.eyebrow}>{tiledRegion.eyebrow}</span>
                  <h1>{tiledRegion.title}</h1>
                  <p>{tiledRegion.summary}</p>
                </div>
              </div>

              <div className={styles.arraysProgressBlock}>
                <div
                  className={styles.progressSeal}
                  style={{ "--progress": `${(tiledRegion.metric.progressPercent ?? 0) * 3.6}deg` }}
                  aria-label={tiledRegion.metric.progressPercent == null
                    ? tiledRegion.metric.countText
                    : `${tiledRegion.metric.progressPercent} percent complete`}
                >
                  <span>{tiledRegion.metric.percentageText}</span>
                </div>
                <div>
                  <span className={styles.progressHeading}>Quest progress</span>
                  <strong>{tiledRegion.metric.percentageText}</strong>
                  <small>{tiledRegion.metric.countText}</small>
                </div>
              </div>

              <div className={styles.arraysNotes}>
                <h2>Scroll of Wisdom</h2>
                {tiledRegion.notes.map((note) => <p key={note}>{note}</p>)}
              </div>

              <div className={styles.infoActions}>
                <button type="button" onClick={() => navigate("/dashboard")}>Dashboard</button>
              </div>
            </aside>

            <section className={styles.arraysRegion}>
              <header className={styles.arraysHeader}>
                <div>
                  <h2>⚔ {tiledRegion.title} ⚔</h2>
                  <p>{tiledRegion.headerDescription}</p>
                </div>
                <div className={styles.mapLegend} aria-label="Level status legend">
                  <span><i className={styles.legendCompleted} />Conquered</span>
                  <span><i className={styles.legendCurrent} />In quest</span>
                  <span><i className={styles.legendAvailable} />Available</span>
                  <span><i className={styles.legendLocked} />Sealed</span>
                  <span><i className={styles.legendUnassigned} />Not assigned</span>
                </div>
              </header>
              <TiledCurriculumMap
                mapUrl={tiledRegion.mapUrl}
                nodes={tiledRegion.nodes}
                mapMarkerToLevel={tiledRegion.markerToLevel}
                onNodeClick={(node) => { if (node.route) navigate(node.route); }}
              />
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

export default LessonMapPage;
