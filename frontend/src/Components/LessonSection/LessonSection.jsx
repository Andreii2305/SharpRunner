import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import styles from "./LessonSection.module.css";
import Sidebar from "../SideBar/Sidebar.jsx";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import LockOutlineIcon from "@mui/icons-material/LockOutline";
import CheckIcon from "@mui/icons-material/Check";
import { useNavigate } from "react-router-dom";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";

const DEFAULT_LESSON_META = [
  {
    lessonKey: "variables-and-data-types",
    fallbackTitle: "Variables and Data Types",
    region: "The Castle of Syntax",
    description:
      "Explore a crumbling castle and learn to declare variables and assign the right data types.",
    route: "/Map",
  },
  {
    lessonKey: "operators",
    fallbackTitle: "Operators",
    region: "The Forge of Symbols",
    description:
      "Master the industrial forge by writing arithmetic and comparison expressions to power its machines.",
    route: "/Map",
  },
  {
    lessonKey: "conditional-statements",
    fallbackTitle: "Conditional Statements",
    region: "The Branching Keep",
    description:
      "Navigate a gothic fortress of split paths using if, else if, and else to choose the correct route.",
    route: "/Map",
  },
  {
    lessonKey: "loops",
    fallbackTitle: "Loops",
    region: "The Spiral Citadel",
    description:
      "Climb a citadel trapped in infinite recursion using for, while, and do-while to break the cycles.",
    route: "/Map",
  },
];

const STATUS_CONFIG = {
  active: {
    badgeClass: "badgeActive",
    badgeLabel: "In progress",
    iconWrapClass: "iconWrapActive",
    progressColor: "#26547c",
    pctClass: "pctActive",
  },
  completed: {
    badgeClass: "badgeDone",
    badgeLabel: "Completed",
    iconWrapClass: "iconWrapDone",
    progressColor: "#1D9E75",
    pctClass: "pctDone",
  },
  locked: {
    badgeClass: "badgeLocked",
    badgeLabel: "Locked",
    iconWrapClass: "iconWrapLocked",
    progressColor: "#cbd5e1",
    pctClass: "pctLocked",
  },
};

function clampProgress(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function titleFromKey(lessonKey) {
  return String(lessonKey ?? "")
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function buildOrderedLessonMeta(seedLessons = []) {
  const defaultMetaByKey = new Map(
    DEFAULT_LESSON_META.map((meta) => [meta.lessonKey, meta])
  );
  const mergedMetaByKey = new Map(defaultMetaByKey);
  const orderedKeys = [];

  for (const seedLesson of seedLessons) {
    const lessonKey =
      typeof seedLesson?.lessonKey === "string"
        ? seedLesson.lessonKey.trim().toLowerCase()
        : "";

    if (!lessonKey) {
      continue;
    }

    const fallbackMeta = defaultMetaByKey.get(lessonKey);
    const fallbackTitle =
      seedLesson.lessonTitle ?? fallbackMeta?.fallbackTitle ?? titleFromKey(lessonKey);

    mergedMetaByKey.set(lessonKey, {
      lessonKey,
      fallbackTitle,
      region: seedLesson.theme ?? fallbackMeta?.region ?? fallbackTitle,
      description:
        seedLesson.description ??
        seedLesson.summary ??
        seedLesson.levels?.[0]?.objective ??
        fallbackMeta?.description ??
        `Complete all levels in ${fallbackTitle}.`,
      route: "/Map",
    });

    orderedKeys.push(lessonKey);
  }

  for (const defaultMeta of DEFAULT_LESSON_META) {
    if (!orderedKeys.includes(defaultMeta.lessonKey)) {
      orderedKeys.push(defaultMeta.lessonKey);
    }
  }

  return orderedKeys.map((key) => mergedMetaByKey.get(key)).filter(Boolean);
}

function buildLessonsFromData({ lessonMeta = [], progressLessons = [] }) {
  const progressByKey = new Map(
    progressLessons.map((lesson) => [lesson.lessonKey, lesson])
  );

  const orderedKeys = lessonMeta.map((meta) => meta.lessonKey);
  for (const row of progressLessons) {
    if (!orderedKeys.includes(row.lessonKey)) {
      orderedKeys.push(row.lessonKey);
    }
  }

  const metaByKey = new Map(lessonMeta.map((meta) => [meta.lessonKey, meta]));

  const baseLessons = orderedKeys.map((lessonKey) => {
    const meta = metaByKey.get(lessonKey);
    const progressRow = progressByKey.get(lessonKey);
    const title =
      progressRow?.lessonTitle ?? meta?.fallbackTitle ?? titleFromKey(lessonKey);

    return {
      id: lessonKey,
      lessonKey,
      title,
      region: meta?.region ?? title,
      description: meta?.description ?? `Complete all levels in ${title}.`,
      progress: clampProgress(progressRow?.progressPercent),
      status: "locked",
      route: meta?.route ?? "/Map",
    };
  });

  const resolvedLessons = [];
  let hasActiveLesson = false;

  for (let index = 0; index < baseLessons.length; index += 1) {
    const lesson = baseLessons[index];
    const previousLessonCompleted =
      index === 0 ? true : resolvedLessons[index - 1].status === "completed";

    let status = "locked";

    if (previousLessonCompleted) {
      if (lesson.progress >= 100) {
        status = "completed";
      } else if (!hasActiveLesson) {
        status = "active";
        hasActiveLesson = true;
      }
    }

    resolvedLessons.push({
      ...lesson,
      status,
      route: status === "locked" ? null : lesson.route,
    });
  }

  return resolvedLessons;
}

function LessonIcon({ status }) {
  if (status === "completed") {
    return <CheckIcon sx={{ fontSize: 22, color: "#0F6E56" }} />;
  }

  if (status === "locked") {
    return <LockOutlineIcon sx={{ fontSize: 22, color: "#94a3b8" }} />;
  }

  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#26547c"
      strokeWidth="1.8"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function ActionBtn({ status, onClick }) {
  if (status === "completed") {
    return (
      <div className={`${styles.actionBtn} ${styles.actionDone}`}>
        <CheckIcon sx={{ fontSize: 18, color: "#0F6E56" }} />
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className={`${styles.actionBtn} ${styles.actionLocked}`}>
        <LockOutlineIcon sx={{ fontSize: 17, color: "#94a3b8" }} />
      </div>
    );
  }

  return (
    <button className={`${styles.actionBtn} ${styles.actionPlay}`} onClick={onClick}>
      <PlayArrowIcon sx={{ fontSize: 22, color: "#fff" }} />
    </button>
  );
}

function LessonCard({ lesson, onPlay, onLocked }) {
  const cfg = STATUS_CONFIG[lesson.status];
  const isLocked = lesson.status === "locked";

  return (
    <div
      className={`${styles.lessonCard}
        ${lesson.status === "active" ? styles.cardActive : ""}
        ${isLocked ? styles.cardLocked : ""}
      `}
      onClick={isLocked ? onLocked : undefined}
    >
      <div className={`${styles.cardIcon} ${styles[cfg.iconWrapClass]}`}>
        <LessonIcon status={lesson.status} />
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.cardTitle}>{lesson.title}</span>
          <span className={`${styles.cardBadge} ${styles[cfg.badgeClass]}`}>
            {cfg.badgeLabel}
          </span>
        </div>
        <p className={styles.cardRegion}>{lesson.region}</p>
        <p className={styles.cardDesc}>{lesson.description}</p>
        <div className={styles.progressRow}>
          <span className={styles.progressLabel}>Progress</span>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{
                width: `${lesson.progress}%`,
                background: cfg.progressColor,
              }}
            />
          </div>
          <span className={`${styles.progressPct} ${styles[cfg.pctClass]}`}>
            {lesson.progress}%
          </span>
        </div>
      </div>

      <ActionBtn status={lesson.status} onClick={() => onPlay(lesson)} />
    </div>
  );
}

function LessonSection() {
  const navigate = useNavigate();
  const [progressLessons, setProgressLessons] = useState([]);
  const [lessonSeed, setLessonSeed] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const fetchLessonSectionData = async () => {
      const [progressResult, lessonResult] = await Promise.allSettled([
        axios.get(buildApiUrl("/api/progress/me"), {
          headers: getAuthHeaders(),
        }),
        axios.get(buildApiUrl("/api/lesson-content"), {
          headers: getAuthHeaders(),
        }),
      ]);

      if (!isMounted) {
        return;
      }

      if (progressResult.status === "fulfilled") {
        setProgressLessons(progressResult.value.data?.lessons ?? []);
      } else {
        console.error("Failed to load lesson progress", progressResult.reason);
        setProgressLessons([]);
      }

      if (lessonResult.status === "fulfilled") {
        setLessonSeed(lessonResult.value.data?.lessons ?? []);
      } else {
        console.error("Failed to load lesson content", lessonResult.reason);
        setLessonSeed([]);
      }
    };

    fetchLessonSectionData();

    return () => {
      isMounted = false;
    };
  }, []);

  const lessons = useMemo(() => {
    const orderedMeta = buildOrderedLessonMeta(lessonSeed);
    return buildLessonsFromData({
      lessonMeta: orderedMeta,
      progressLessons,
    });
  }, [lessonSeed, progressLessons]);

  const activeLesson = lessons.find((lesson) => lesson.status === "active") ?? lessons[0];

  const handlePlay = (lesson) => {
    if (lesson?.route) {
      navigate(lesson.route);
    }
  };

  const handleLocked = () => {
    alert("This lesson is locked. Finish the current lesson to unlock it.");
  };

  const completedCount = lessons.filter((lesson) => lesson.status === "completed").length;

  return (
    <div className={styles.lessonContainer}>
      <Sidebar />

      <div className={styles.pageBody}>
        <div className={styles.topBar}>
          <div className={styles.topLeft}>
            <div className={styles.topLabel}>Current lesson</div>
            <div className={styles.topTitle}>{activeLesson.title}</div>
            <div className={styles.topSub}>{activeLesson.region}</div>
          </div>
          <button className={styles.btnContinue} onClick={() => handlePlay(activeLesson)}>
            <PlayArrowIcon sx={{ fontSize: 16, color: "#fff" }} />
            Continue Game
          </button>
        </div>

        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>All lessons</div>
          <div className={styles.sectionCount}>
            {completedCount} / {lessons.length} completed
          </div>
        </div>

        <div className={styles.lessonsGrid}>
          {lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onPlay={handlePlay}
              onLocked={handleLocked}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default LessonSection;
