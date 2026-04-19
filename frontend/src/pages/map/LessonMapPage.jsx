import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import LessonMap from "../../Components/LessonMap/LessonMap.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import styles from "./LessonMapPage.module.css";
import { LESSON_ONE_MAP_CONFIG } from "./lessonOneMapConfig";

const TOTAL_LEVELS = 10;
const LEVEL_ONE_BG_SRC = `${import.meta.env.BASE_URL}game/assets/backgrounds/level1_bg.png`;

const LESSON_DETAILS = [
  "A variable is a named container that stores data so your program can use and change it.",
  "Data types define what kind of value a variable can hold, like text, whole numbers, decimals, or true/false.",
  "Choosing the right data type makes your code safer, clearer, and easier to debug.",
];

const buildFallbackLevelRows = () =>
  Array.from({ length: TOTAL_LEVELS }, (_, i) => ({
    levelNumber: i + 1,
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

  const lessonRows = useMemo(() => {
    const rows =
      progressData?.levels
        ?.filter((r) => r.lessonKey === LESSON_ONE_MAP_CONFIG.lessonKey)
        .sort((a, b) => a.levelNumber - b.levelNumber) ?? [];
    return rows.length > 0 ? rows : buildFallbackLevelRows();
  }, [progressData]);

  const lessonProgressPercent = useMemo(() => {
    const summary = progressData?.lessons?.find(
      (l) => l.lessonKey === LESSON_ONE_MAP_CONFIG.lessonKey,
    );
    if (summary) return summary.progressPercent;
    if (lessonRows.length === 0) return 0;
    const total = lessonRows.reduce((s, r) => s + (r.progressPercent ?? 0), 0);
    return Math.round(total / lessonRows.length);
  }, [progressData, lessonRows]);

  const mapNodes = useMemo(() => {
    const rowByLevel = new Map(lessonRows.map((r) => [r.levelNumber, r]));
    const firstIncomplete = lessonRows.find((r) => !r.isCompleted);
    const currentNum =
      firstIncomplete?.levelNumber ??
      lessonRows[lessonRows.length - 1]?.levelNumber ??
      1;

    return LESSON_ONE_MAP_CONFIG.nodes.map((node) => {
      const row = rowByLevel.get(node.levelNumber);
      let status = "locked";
      if (row?.isCompleted) {
        status = "completed";
      } else if (node.levelNumber === currentNum) {
        status = "current";
      } else if (node.levelNumber < currentNum) {
        status = "unlocked";
      }
      return { ...node, status, route: `/Map/level/${node.levelNumber}`, finalScore: row?.finalScore ?? null };
    });
  }, [lessonRows]);

  const continueRoute = useMemo(() => {
    const current = mapNodes.find((n) => n.status === "current");
    if (current) return current.route;
    const lastDone = [...mapNodes]
      .reverse()
      .find((n) => n.status === "completed");
    return lastDone?.route ?? "/Map/level/1";
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
          backgroundImageSrc={LEVEL_ONE_BG_SRC}
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
