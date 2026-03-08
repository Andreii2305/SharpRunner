import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import LessonMap from "../../Components/LessonMap/LessonMap.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import styles from "./LessonMapPage.module.css";
import { LESSON_ONE_MAP_CONFIG } from "./lessonOneMapConfig";

const BACKGROUND_IMAGE_SRC = `${import.meta.env.BASE_URL}game/assets/backgrounds/level1_bg.png`;
const TOTAL_LEVELS = 10;
const LESSON_DETAILS = [
  "A variable is a named container that stores data so your program can use and change it.",
  "Data types define what kind of value a variable can hold, like text, whole numbers, decimals, or true/false.",
  "Choosing the right data type makes your code safer, clearer, and easier to debug.",
];

const buildFallbackLevelRows = () =>
  Array.from({ length: TOTAL_LEVELS }, (_, index) => ({
    levelNumber: index + 1,
    isCompleted: false,
    progressPercent: 0,
  }));

function LessonMapPage() {
  const navigate = useNavigate();
  const [progressData, setProgressData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchProgress = async () => {
      try {
        const response = await axios.get(buildApiUrl("/api/progress/me"), {
          headers: getAuthHeaders(),
        });

        if (!isMounted) {
          return;
        }

        setProgressData(response.data);
      } catch {
        if (!isMounted) {
          return;
        }

        setProgressData(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProgress();

    return () => {
      isMounted = false;
    };
  }, []);

  const lessonRows = useMemo(() => {
    const levelRows =
      progressData?.levels
        ?.filter((row) => row.lessonKey === LESSON_ONE_MAP_CONFIG.lessonKey)
        .sort((a, b) => a.levelNumber - b.levelNumber) ?? [];

    if (levelRows.length === 0) {
      return buildFallbackLevelRows();
    }

    return levelRows;
  }, [progressData]);

  const lessonProgressPercent = useMemo(() => {
    const lessonSummary = progressData?.lessons?.find(
      (lesson) => lesson.lessonKey === LESSON_ONE_MAP_CONFIG.lessonKey,
    );

    if (lessonSummary) {
      return lessonSummary.progressPercent;
    }

    if (lessonRows.length === 0) {
      return 0;
    }

    const totalPercent = lessonRows.reduce(
      (sum, level) => sum + (level.progressPercent ?? 0),
      0,
    );

    return Math.round(totalPercent / lessonRows.length);
  }, [progressData, lessonRows]);

  const mapNodes = useMemo(() => {
    const rowByLevelNumber = new Map(
      lessonRows.map((row) => [row.levelNumber, row]),
    );
    const firstIncompleteLevel = lessonRows.find((row) => !row.isCompleted);
    const currentLevelNumber =
      firstIncompleteLevel?.levelNumber ??
      lessonRows[lessonRows.length - 1]?.levelNumber ??
      1;

    return LESSON_ONE_MAP_CONFIG.nodes.map((node) => {
      const levelRow = rowByLevelNumber.get(node.levelNumber);

      let status = "locked";
      if (levelRow?.isCompleted) {
        status = "completed";
      } else if (node.levelNumber === currentLevelNumber) {
        status = "current";
      } else if (node.levelNumber < currentLevelNumber) {
        status = "unlocked";
      }

      return {
        ...node,
        status,
        route: `/Map/level/${node.levelNumber}`,
      };
    });
  }, [lessonRows]);

  const continueRoute = useMemo(() => {
    const currentNode = mapNodes.find((node) => node.status === "current");
    if (currentNode) {
      return currentNode.route;
    }

    const lastCompletedNode = [...mapNodes]
      .reverse()
      .find((node) => node.status === "completed");

    return lastCompletedNode?.route ?? "/Map/level/1";
  }, [mapNodes]);

  return (
    <div className={styles.lessonMapPage}>
      <Sidebar />

      <section className={styles.lessonMapContent}>
        <LessonMap
          lessonTitle={LESSON_ONE_MAP_CONFIG.lessonTitle}
          subtitle={LESSON_ONE_MAP_CONFIG.subtitle}
          description={
            isLoading
              ? "Loading map progress..."
              : "Complete each level to unlock the next node."
          }
          progressPercent={lessonProgressPercent}
          stages={LESSON_ONE_MAP_CONFIG.stages}
          nodes={mapNodes}
          connections={LESSON_ONE_MAP_CONFIG.connections}
          lessonDetails={LESSON_DETAILS}
          backgroundImageSrc={BACKGROUND_IMAGE_SRC}
          onContinue={() => navigate(continueRoute)}
          onExit={() => navigate("/dashboard")}
          onNodeClick={(node) => navigate(node.route)}
          continueDisabled={isLoading}
        />
      </section>
    </div>
  );
}

export default LessonMapPage;
