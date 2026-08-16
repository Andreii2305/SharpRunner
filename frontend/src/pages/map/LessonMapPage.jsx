import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import LessonMap from "../../Components/LessonMap/LessonMap.jsx";
import TiledCurriculumMap from "../../Components/TiledCurriculumMap/TiledCurriculumMap.jsx";
import { getLevelConfig } from "../game/levels/levelConfigs.js";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import styles from "./LessonMapPage.module.css";
import { LESSON_ONE_MAP_CONFIG } from "./lessonOneMapConfig";

const LEVEL_ONE_BG_SRC = `${import.meta.env.BASE_URL}game/assets/backgrounds/level1_bg.png`;
const ARRAYS_MAP_URL = `${import.meta.env.BASE_URL}game/assets/curriculum_map_level/array.tmj`;
const FUNCTIONS_MAP_URL = `${import.meta.env.BASE_URL}game/assets/curriculum_map_level/functions.tmj`;
const FUNCTIONS_ARRAYS_MAP_URL = `${import.meta.env.BASE_URL}game/assets/curriculum_map_level/function_with_arrays.tmj`;
const ARRAYS_ROUTE_START = 6;
const ARRAYS_LEVEL_COUNT = 8;
const FUNCTIONS_ROUTE_START = 14;
const FUNCTIONS_LEVEL_COUNT = 11;
const FUNCTIONS_ARRAYS_ROUTE_START = 26;
const FUNCTIONS_ARRAYS_NODE_COUNT = 5;
const LAST_REGION_KEY = "sharprunner:last-map-region";

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
  const [progressData, setProgressData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState(getInitialRegion);

  useEffect(() => {
    let isMounted = true;
    const fetchProgress = async () => {
      try {
        const response = await axios.get(buildApiUrl("/api/progress/me"), {
          headers: getAuthHeaders(),
        });
        if (isMounted) setProgressData(response.data);
      } catch {
        if (isMounted) setProgressData(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchProgress();
    return () => {
      isMounted = false;
    };
  }, []);

  const progressByKey = useMemo(
    () => new Map((progressData?.levels ?? []).map((row) => [row.levelKey, row])),
    [progressData],
  );

  const tutorialComplete = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) =>
        progressByKey.get(`tutorial-level-${index + 1}`),
      ).every((row) => row?.isCompleted),
    [progressByKey],
  );

  const mapNodes = useMemo(() => {
    const firstIncompleteIndex = LESSON_ONE_MAP_CONFIG.nodes.findIndex(
      (node) => !progressByKey.get(getProgressKeyForMapNode(node))?.isCompleted,
    );
    return LESSON_ONE_MAP_CONFIG.nodes.map((node, index) => {
      const row = progressByKey.get(getProgressKeyForMapNode(node));
      let status = "locked";
      if (row?.isCompleted) status = "completed";
      else if (index === firstIncompleteIndex) status = "current";
      return {
        ...node,
        status,
        route: `/tutorial/level/${node.levelNumber}`,
        finalScore: row?.finalScore ?? null,
      };
    });
  }, [progressByKey]);

  const arrayNodes = useMemo(() => {
    const rows = Array.from({ length: ARRAYS_LEVEL_COUNT }, (_, index) =>
      progressByKey.get(`arrays-level-${index + 1}`),
    );
    const firstIncompleteIndex = rows.findIndex((row) => !row?.isCompleted);
    return rows.map((row, index) => {
      const levelNumber = ARRAYS_ROUTE_START + index;
      const config = getLevelConfig(levelNumber);
      let status = "locked";
      if (row?.isCompleted) status = "completed";
      else if (tutorialComplete && index === firstIncompleteIndex) status = "current";
      return {
        id: `arrays-level-${index + 1}`,
        levelNumber,
        title: config?.title ?? `Arrays ${index + 1}`,
        topic: config?.learnSection?.title ?? config?.subtitle ?? "Arrays",
        route: `/array/level/${index + 1}`,
        status,
        finalScore: row?.finalScore ?? null,
        grade: row?.grade ?? null,
        attemptCount: row?.attemptCount ?? 0,
      };
    });
  }, [progressByKey, tutorialComplete]);

  const arraysComplete = arrayNodes.every((node) => node.status === "completed");

  const functionNodes = useMemo(() => {
    const rows = Array.from({ length: FUNCTIONS_LEVEL_COUNT }, (_, index) =>
      progressByKey.get(`functions-level-${index + 1}`),
    );
    const firstIncompleteIndex = rows.findIndex((row) => !row?.isCompleted);
    return rows.map((row, index) => {
      const levelNumber = FUNCTIONS_ROUTE_START + index;
      const config = getLevelConfig(levelNumber);
      let status = "locked";
      if (row?.isCompleted) status = "completed";
      else if (arraysComplete && index === firstIncompleteIndex) status = "current";
      return {
        id: `functions-level-${index + 1}`,
        levelNumber,
        displayLevelNumber: config?.mapLevelLabel ?? levelNumber,
        title: config?.title ?? `Functions ${index + 1}`,
        topic: config?.learnSection?.title ?? config?.subtitle ?? "Functions and Methods",
        route: `/function/level/${index + 1}`,
        status,
        finalScore: row?.finalScore ?? null,
        grade: row?.grade ?? null,
        attemptCount: row?.attemptCount ?? 0,
      };
    });
  }, [arraysComplete, progressByKey]);

  const functionsComplete = functionNodes.every(
    (node) => node.status === "completed",
  );

  const functionsArraysNodes = useMemo(() => {
    const rows = [
      ...Array.from({ length: 4 }, (_, index) =>
        progressByKey.get(`functions-with-arrays-level-${index + 1}`),
      ),
      progressByKey.get("final-level-1"),
    ];
    const firstIncompleteIndex = rows.findIndex((row) => !row?.isCompleted);
    return rows.map((row, index) => {
      const levelNumber = FUNCTIONS_ARRAYS_ROUTE_START + index;
      const config = getLevelConfig(levelNumber);
      let status = "locked";
      if (row?.isCompleted) status = "completed";
      else if (functionsComplete && index === firstIncompleteIndex) status = "current";
      return {
        id: index < 4 ? `functions-with-arrays-level-${index + 1}` : "final-level-1",
        levelNumber,
        title: config?.title ?? `Functions with Arrays ${index + 1}`,
        topic: config?.learnSection?.title ?? config?.subtitle ?? "Functions with Arrays",
        route: `/function-with-array/level/${index + 1}`,
        status,
        finalScore: row?.finalScore ?? null,
        grade: row?.grade ?? null,
        attemptCount: row?.attemptCount ?? 0,
      };
    });
  }, [functionsComplete, progressByKey]);

  const inferredRegion = !tutorialComplete
    ? "tutorial"
    : arraysComplete
      ? functionsComplete
        ? "functions-arrays"
        : "functions"
      : "arrays";
  const activeRegion = selectedRegion ?? inferredRegion;
  const selectRegion = (region) => {
    setSelectedRegion(region);
    try {
      sessionStorage.setItem(LAST_REGION_KEY, region);
    } catch {
      // The map still works when storage is unavailable.
    }
  };

  const tutorialProgress =
    progressData?.lessons?.find((lesson) => lesson.lessonKey === "tutorial")
      ?.progressPercent ?? 0;
  const arraysProgress =
    progressData?.lessons?.find((lesson) => lesson.lessonKey === "arrays")
      ?.progressPercent ?? 0;
  const functionsProgress =
    progressData?.lessons?.find((lesson) => lesson.lessonKey === "functions")
      ?.progressPercent ?? 0;
  const functionsArraysProgress = Math.round(
    functionsArraysNodes.reduce(
      (sum, node) =>
        sum + (progressByKey.get(node.id)?.progressPercent ?? 0),
      0,
    ) / FUNCTIONS_ARRAYS_NODE_COUNT,
  );
  const arraysCompletedCount = arrayNodes.filter(
    (node) => node.status === "completed",
  ).length;
  const functionsCompletedCount = functionNodes.filter(
    (node) => node.status === "completed",
  ).length;
  const functionsArraysCompletedCount = functionsArraysNodes.filter(
    (node) => node.status === "completed",
  ).length;

  const continueRoute = useMemo(() => {
    const candidates =
      activeRegion === "functions-arrays"
        ? functionsArraysNodes
        : activeRegion === "functions"
        ? functionNodes
        : activeRegion === "arrays"
          ? arrayNodes
          : mapNodes;
    return (
      candidates.find((node) => node.status === "current")?.route ??
      [...candidates].reverse().find((node) => node.status === "completed")?.route ??
      "/tutorial/level/1"
    );
  }, [activeRegion, arrayNodes, functionNodes, functionsArraysNodes, mapNodes]);

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
          progress: functionsArraysProgress,
          completedCount: functionsArraysCompletedCount,
          totalCount: FUNCTIONS_ARRAYS_NODE_COUNT,
          unlocked: functionsComplete,
          badge: "Region IV",
          eyebrow: "Functions with Arrays · Levels 1–5",
          title: "The Final Rituals",
          summary: "Carry arrays through reusable methods, restore the final wards, and face Bakunawa.",
          headerDescription: functionsComplete
            ? "Follow the final ritual path and select an available node to continue."
            : "Complete the Functions & Methods region to unseal these final trials.",
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
          progress: functionsProgress,
          completedCount: functionsCompletedCount,
          totalCount: FUNCTIONS_LEVEL_COUNT,
          unlocked: arraysComplete,
          badge: "Region III",
          eyebrow: "Functions & Methods · Levels 1–11",
          title: "Functions & Methods",
          summary: "Name reusable actions, pass values, return results, and master recursive methods.",
          headerDescription: arraysComplete
            ? "Follow the ritual path and select an available Functions node to continue."
            : "Complete all eight Arrays levels to unseal the Functions region.",
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
          progress: arraysProgress,
          completedCount: arraysCompletedCount,
          totalCount: ARRAYS_LEVEL_COUNT,
          unlocked: tutorialComplete,
          badge: "Region II",
          eyebrow: "Arrays · Levels 6–13",
          title: "The Cursed Collections",
          summary: "Journey through Barangay Malumay and break the curse binding its collections.",
          headerDescription: tutorialComplete
            ? "Follow Kai through Barangay Malumay. Select an available node to continue."
            : "Complete all five tutorial levels to unseal the first Arrays node.",
          notes: [
            "Build collections, read indexes, restore two-dimensional grids, and traverse every item.",
            "Level nodes use your current SharpRunner progress and unlock in curriculum order.",
            "Drag or scroll the map to follow Kai through the region.",
          ],
        };

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
            <span className={styles.regionProgress}>{Math.round(tutorialProgress)}%</span>
          </button>
          <button
            type="button"
            className={activeRegion === "arrays" ? styles.activeRegionTab : ""}
            onClick={() => selectRegion("arrays")}
            aria-pressed={activeRegion === "arrays"}
          >
            <span className={styles.regionOrder}>02</span>
            <span className={styles.regionName}>Arrays</span>
            <span className={styles.regionProgress}>{Math.round(arraysProgress)}%</span>
          </button>
          <button
            type="button"
            className={activeRegion === "functions" ? styles.activeRegionTab : ""}
            onClick={() => selectRegion("functions")}
            aria-pressed={activeRegion === "functions"}
          >
            <span className={styles.regionOrder}>03</span>
            <span className={styles.regionName}>Functions</span>
            <span className={styles.regionProgress}>{Math.round(functionsProgress)}%</span>
          </button>
          <button
            type="button"
            className={activeRegion === "functions-arrays" ? styles.activeRegionTab : ""}
            onClick={() => selectRegion("functions-arrays")}
            aria-pressed={activeRegion === "functions-arrays"}
          >
            <span className={styles.regionOrder}>04</span>
            <span className={styles.regionName}>Methods + Arrays</span>
            <span className={styles.regionProgress}>{functionsArraysProgress}%</span>
          </button>
          </div>
        </nav>

        {activeRegion === "tutorial" ? (
          <LessonMap
            lessonTitle={LESSON_ONE_MAP_CONFIG.lessonTitle}
            subtitle={LESSON_ONE_MAP_CONFIG.subtitle}
            description={isLoading ? "Loading map progress..." : "Complete each level to unlock the next node."}
            progressPercent={tutorialProgress}
            stages={LESSON_ONE_MAP_CONFIG.stages}
            nodes={mapNodes}
            connections={LESSON_ONE_MAP_CONFIG.connections}
            lessonDetails={LESSON_DETAILS}
            backgroundImageSrc={LEVEL_ONE_BG_SRC}
            onContinue={() => navigate(continueRoute)}
            onExit={() => navigate("/dashboard")}
            onNodeClick={(node) => navigate(node.route)}
            continueDisabled={isLoading}
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
                  style={{ "--progress": `${Math.round(tiledRegion.progress) * 3.6}deg` }}
                  aria-label={`${Math.round(tiledRegion.progress)} percent complete`}
                >
                  <span>{Math.round(tiledRegion.progress)}%</span>
                </div>
                <div>
                  <span className={styles.progressHeading}>Quest progress</span>
                  <strong>{Math.round(tiledRegion.progress)}%</strong>
                  <small>{tiledRegion.completedCount} of {tiledRegion.totalCount} nodes conquered</small>
                </div>
              </div>

              <div className={styles.arraysNotes}>
                <h2>Scroll of Wisdom</h2>
                {tiledRegion.notes.map((note) => <p key={note}>{note}</p>)}
              </div>

              <div className={styles.infoActions}>
                <button
                  type="button"
                  className={styles.continueButton}
                  onClick={() => navigate(continueRoute)}
                  disabled={!tiledRegion.unlocked || isLoading}
                >
                  Continue
                </button>
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
                </div>
              </header>
              <TiledCurriculumMap
                mapUrl={tiledRegion.mapUrl}
                nodes={tiledRegion.nodes}
                mapMarkerToLevel={tiledRegion.markerToLevel}
                onNodeClick={(node) => navigate(node.route)}
              />
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

export default LessonMapPage;
