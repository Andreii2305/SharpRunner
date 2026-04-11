import styles from "./LessonSection.module.css";
import Sidebar from "../SideBar/Sidebar.jsx";
import ProgressBar from "../ProgressBarComponent/ProgressBarComponent.jsx";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import LockOutlineIcon from "@mui/icons-material/LockOutline";
import CheckIcon from "@mui/icons-material/Check";
import { useNavigate } from "react-router-dom";

/* ─── Lesson data ─────────────────────────────────────────────
   Replace hardcoded values here with API data when ready.
   Each lesson maps to a region from the SharpRunner story.
──────────────────────────────────────────────────────────────── */
const LESSONS = [
  {
    id: "variables-and-data-types",
    title: "Variables and Data Types",
    region: "The Castle of Syntax",
    description:
      "Explore a crumbling castle and learn to declare variables and assign the right data types.",
    progress: 75,
    status: "active", // "active" | "completed" | "locked"
    route: "/Map",
  },
  {
    id: "operators",
    title: "Operators",
    region: "The Forge of Symbols",
    description:
      "Master the industrial forge by writing arithmetic and comparison expressions to power its machines.",
    progress: 100,
    status: "completed",
    route: "/Map",
  },
  {
    id: "conditional-statements",
    title: "Conditional Statements",
    region: "The Branching Keep",
    description:
      "Navigate a gothic fortress of split paths using if, else if, and else to choose the correct route.",
    progress: 0,
    status: "locked",
    route: null,
  },
  {
    id: "loops",
    title: "Loops",
    region: "The Spiral Citadel",
    description:
      "Climb a citadel trapped in infinite recursion using for, while, and do-while to break the cycles.",
    progress: 0,
    status: "locked",
    route: null,
  },
];

/* ─── Per-status config ───────────────────────────────────────── */
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

/* ─── Icon inside the card icon area ─────────────────────────── */
function LessonIcon({ status }) {
  if (status === "completed")
    return <CheckIcon sx={{ fontSize: 22, color: "#0F6E56" }} />;
  if (status === "locked")
    return <LockOutlineIcon sx={{ fontSize: 22, color: "#94a3b8" }} />;
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

/* ─── Action button on the right ─────────────────────────────── */
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
    <button
      className={`${styles.actionBtn} ${styles.actionPlay}`}
      onClick={onClick}
    >
      <PlayArrowIcon sx={{ fontSize: 22, color: "#fff" }} />
    </button>
  );
}

/* ─── Single lesson card ──────────────────────────────────────── */
function LessonCard({ lesson, onPlay, onLocked }) {
  const cfg = STATUS_CONFIG[lesson.status];
  const isLocked = lesson.status === "locked";

  const handleClick = () => {
    if (isLocked) onLocked();
    else onPlay(lesson);
  };

  return (
    <div
      className={`${styles.lessonCard}
        ${lesson.status === "active" ? styles.cardActive : ""}
        ${isLocked ? styles.cardLocked : ""}
      `}
      onClick={isLocked ? onLocked : undefined}
    >
      {/* Left icon */}
      <div className={`${styles.cardIcon} ${styles[cfg.iconWrapClass]}`}>
        <LessonIcon status={lesson.status} />
      </div>

      {/* Body */}
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

      {/* Action button */}
      <ActionBtn status={lesson.status} onClick={() => onPlay(lesson)} />
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────── */
function LessonSection() {
  const navigate = useNavigate();

  const activelesson = LESSONS.find((l) => l.status === "active") ?? LESSONS[0];

  const handlePlay = (lesson) => {
    if (lesson.route) navigate(lesson.route);
  };

  const handleLocked = () => {
    alert("This lesson is locked. Finish the current lesson to unlock it.");
  };

  const completedCount = LESSONS.filter((l) => l.status === "completed").length;

  return (
    <div className={styles.lessonContainer}>
      <Sidebar />

      <div className={styles.pageBody}>
        {/* ── Top bar ── */}
        <div className={styles.topBar}>
          <div className={styles.topLeft}>
            <div className={styles.topLabel}>Current lesson</div>
            <div className={styles.topTitle}>{activelesson.title}</div>
            <div className={styles.topSub}>{activelesson.region}</div>
          </div>
          <button
            className={styles.btnContinue}
            onClick={() => handlePlay(activelesson)}
          >
            <PlayArrowIcon sx={{ fontSize: 16, color: "#fff" }} />
            Continue Game
          </button>
        </div>

        {/* ── Section heading ── */}
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>All lessons</div>
          <div className={styles.sectionCount}>
            {completedCount} / {LESSONS.length} completed
          </div>
        </div>

        {/* ── Lesson cards grid ── */}
        <div className={styles.lessonsGrid}>
          {LESSONS.map((lesson) => (
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
