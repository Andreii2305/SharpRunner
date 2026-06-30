import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import LessonMap from "../../Components/LessonMap/LessonMap.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import styles from "./LessonMapPage.module.css";
import { LESSON_ONE_MAP_CONFIG } from "./lessonOneMapConfig";

const LEVEL_ONE_BG_SRC = `${import.meta.env.BASE_URL}game/assets/backgrounds/level1_bg.png`;

const LESSON_DETAILS = [
  "The first five levels stay as the playable onboarding chapter.",
  "Barangay Malumay begins the new Arrays curriculum with collections, indexes, and 2D grids.",
  "Complete each node to continue Kai's path toward the main story curriculum.",
];

const buildFallbackLevelRows = () =>
  LESSON_ONE_MAP_CONFIG.nodes.map((node) => ({
    levelNumber: node.levelNumber,
    levelKey: node.id,
    lessonKey: node.id.startsWith("arrays-") ? "arrays" : LESSON_ONE_MAP_CONFIG.lessonKey,
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
        ?.filter((r) => r.lessonKey === LESSON_ONE_MAP_CONFIG.lessonKey || r.lessonKey === "arrays")
        .map((row) => {
          const matchingNode = LESSON_ONE_MAP_CONFIG.nodes.find(
            (node) =>
              node.id === row.levelKey ||
              (node.id.startsWith(`${row.lessonKey}-level-`) &&
                node.id.endsWith(`-${row.levelNumber}`)),
          );
          return {
            ...row,
            levelNumber: matchingNode?.levelNumber ?? row.levelNumber,
            levelKey: matchingNode?.id ?? row.levelKey,
          };
        }) ?? [];
    const progressByNumber = new Map(rows.map((row) => [row.levelNumber, row]));
    const progressByKey = new Map(rows.map((row) => [row.levelKey, row]));
    return buildFallbackLevelRows()
      .map((fallbackRow) => ({
        ...fallbackRow,
        ...(progressByNumber.get(fallbackRow.levelNumber) ??
          progressByKey.get(fallbackRow.levelKey) ??
          {}),
      }))
      .sort((a, b) => a.levelNumber - b.levelNumber);
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
    const rowByKey = new Map(lessonRows.map((r) => [r.levelKey, r]));
    const firstIncomplete = LESSON_ONE_MAP_CONFIG.nodes
      .map((node) => rowByLevel.get(node.levelNumber) ?? rowByKey.get(node.id))
      .find((r) => r && !r.isCompleted);
    const currentNum =
      firstIncomplete?.levelNumber ??
      LESSON_ONE_MAP_CONFIG.nodes[LESSON_ONE_MAP_CONFIG.nodes.length - 1]?.levelNumber ??
      1;

    return LESSON_ONE_MAP_CONFIG.nodes.map((node) => {
      const row = rowByLevel.get(node.levelNumber) ?? rowByKey.get(node.id);
      let status = "locked";
      if (row?.isCompleted) {
        status = "completed";
      } else if (node.levelNumber === currentNum) {
        status = "current";
      } else if (node.levelNumber < currentNum) {
        status = "unlocked";
      }
      return {
        ...node,
        status,
        route: `/Map/level/${node.levelNumber}`,
        finalScore: row?.finalScore ?? null,
      };
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
      {/* <Sidebar /> */}

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
