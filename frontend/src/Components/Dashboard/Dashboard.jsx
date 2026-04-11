import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders, getUser } from "../../utils/auth";
import styles from "./Dashboard.module.css";

/* ─── Region config ───────────────────────────────────────────── */
const REGIONS = [
  {
    key: "variables-and-data-types",
    label: "Castle of Syntax",
    topic: "Variables & Data Types",
    accent: "#5f5e5a",
    fill: "#D3D1C7",
    totalLevels: 10,
    pixelColor: "#888780",
    letter: "V",
  },
  {
    key: "operators",
    label: "Forge of Symbols",
    topic: "Operators",
    accent: "#854F0B",
    fill: "#FAC775",
    totalLevels: 10,
    pixelColor: "#EF9F27",
    letter: "O",
  },
  {
    key: "conditional-statements",
    label: "Branching Keep",
    topic: "Conditional Statements",
    accent: "#534AB7",
    fill: "#CECBF6",
    totalLevels: 10,
    pixelColor: "#AFA9EC",
    letter: "C",
  },
  {
    key: "loops",
    label: "Spiral Citadel",
    topic: "Loops",
    accent: "#185FA5",
    fill: "#B5D4F4",
    totalLevels: 10,
    pixelColor: "#85B7EB",
    letter: "L",
  },
];

const FALLBACK_LESSONS = REGIONS.map((r) => ({
  lessonKey: r.key,
  lessonTitle: r.label,
  progressPercent: 0,
  levelsCleared: 0,
}));

const LEVEL_BACKGROUND_BY_NUMBER = {
  1: "game/assets/backgrounds/level1_bg.png",
  2: "game/assets/backgrounds/level1_bg.png",
};

/* ─── Helpers ─────────────────────────────────────────────────── */
function initials(name = "") {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function parseLevelNumberFromLabel(label = "") {
  const match = String(label).match(/\d+/g);
  if (!match || match.length === 0) return null;

  const parsed = Number.parseInt(match[match.length - 1], 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/* ─── Sub-components ──────────────────────────────────────────── */
function StatCard({ label, value, sub, accent }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statVal} style={accent ? { color: accent } : {}}>
        {value}
      </div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

function XpBar({ current, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  return (
    <div className={styles.xpWrap}>
      <span className={styles.xpLabel}>XP</span>
      <div className={styles.xpTrack}>
        <div className={styles.xpFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.xpVal}>
        {current.toLocaleString()} / {max.toLocaleString()}
      </span>
    </div>
  );
}

function RegionTile({ region, levelsCleared, locked }) {
  const pct =
    region.totalLevels > 0
      ? Math.round((levelsCleared / region.totalLevels) * 100)
      : 0;
  const done = levelsCleared >= region.totalLevels;

  return (
    <div className={`${styles.regionTile} ${locked ? styles.locked : ""}`}>
      <div
        className={styles.regionIcon}
        style={{ background: region.fill, color: region.accent }}
      >
        {region.letter}
      </div>
      <div className={styles.regionName}>{region.label}</div>
      <div className={styles.regionTopic}>{region.topic}</div>
      <div className={styles.miniBarTrack}>
        <div
          className={styles.miniBarFill}
          style={{ width: `${pct}%`, background: region.accent }}
        />
      </div>
      <div
        className={`${styles.regionStatus} ${
          locked
            ? styles.statusLocked
            : done
              ? styles.statusDone
              : styles.statusProgress
        }`}
      >
        {locked
          ? "🔒 Locked"
          : done
            ? `✓ ${levelsCleared} / ${region.totalLevels} · Completed`
            : `${levelsCleared} / ${region.totalLevels} · In progress`}
      </div>
    </div>
  );
}

function MistakeRow({ label, type, count, typeColor, typeBg }) {
  return (
    <div className={styles.mistakeRow}>
      <span className={styles.mistakeLabel}>{label}</span>
      <div className={styles.mistakeRight}>
        <span
          className={styles.mistakeTag}
          style={{ background: typeBg, color: typeColor }}
        >
          {type}
        </span>
        <span className={styles.mistakeCount}>{count}×</span>
      </div>
    </div>
  );
}

function LeaderboardRow({ rank, name, xp, levels, isMe }) {
  const medals = ["🥇", "🥈", "🥉"];
  const avColors = [
    { bg: "#FAEEDA", color: "#BA7517" },
    { bg: "#E5E7EB", color: "#374151" },
    { bg: "#FAECE7", color: "#993C1D" },
  ];
  const avStyle = isMe
    ? { background: "#CECBF6", color: "#3C3489" }
    : rank <= 3
      ? avColors[rank - 1]
      : { background: "#D3D1C7", color: "#444441" };

  const maxXp = 1000;
  const barPct = Math.min(100, Math.round((xp / maxXp) * 100));

  return (
    <div className={`${styles.lbRow} ${isMe ? styles.lbMe : ""}`}>
      <div className={styles.lbRank}>
        {rank <= 3 ? (
          <span className={styles.lbMedal}>{medals[rank - 1]}</span>
        ) : (
          <span className={styles.lbRankNum}>{rank}</span>
        )}
      </div>
      <div className={styles.lbAv} style={avStyle}>
        {initials(name)}
      </div>
      <div className={styles.lbInfo}>
        <div className={`${styles.lbName} ${isMe ? styles.lbNameMe : ""}`}>
          {isMe ? `You · ${name}` : name}
        </div>
        <div className={styles.lbBarTrack}>
          <div
            className={styles.lbBarFill}
            style={{
              width: `${barPct}%`,
              background: isMe ? "#26547c" : "#D3D1C7",
            }}
          />
        </div>
      </div>
      <div className={styles.lbRight}>
        <div className={`${styles.lbXp} ${isMe ? styles.lbXpMe : ""}`}>
          {xp.toLocaleString()} XP
        </div>
        <div className={styles.lbLevels}>{levels} lvls</div>
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────── */
function StudentDashboardPage() {
  const navigate = useNavigate();
  const user = getUser();

  const [progressData, setProgressData] = useState(null);
  const [classroomData, setClassroomData] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [leaderboardMeta, setLeaderboardMeta] = useState({
    classSize: null,
    currentUserRank: null,
  });
  const [announcements, setAnnouncements] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState("announcements");
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [announcementActionError, setAnnouncementActionError] = useState("");
  const [notificationActionError, setNotificationActionError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const h = { headers: getAuthHeaders() };

    const fetchAll = async () => {
      const [progressRes, classroomRes, lbRes, annRes, notifRes] =
        await Promise.allSettled([
          axios.get(buildApiUrl("/api/progress/me"), h),
          axios.get(buildApiUrl("/api/classrooms/me"), h),
          axios.get(buildApiUrl("/api/classrooms/leaderboard"), h),
          axios.get(buildApiUrl("/api/classrooms/announcements"), h),
          axios.get(buildApiUrl("/api/notifications/me"), h),
        ]);

      if (!isMounted) return;

      if (progressRes.status === "fulfilled")
        setProgressData(progressRes.value.data);
      if (classroomRes.status === "fulfilled")
        setClassroomData(classroomRes.value.data);
      if (lbRes.status === "fulfilled") {
        setLeaderboardData(lbRes.value.data?.leaderboard ?? []);
        setLeaderboardMeta({
          classSize: lbRes.value.data?.classSize ?? null,
          currentUserRank: lbRes.value.data?.currentUserRank ?? null,
        });
      }
      if (annRes.status === "fulfilled")
        setAnnouncements(annRes.value.data?.announcements ?? []);
      if (notifRes.status === "fulfilled")
        setNotifications(notifRes.value.data?.notifications ?? []);

      setIsLoading(false);
    };

    fetchAll();
    return () => {
      isMounted = false;
    };
  }, []);

  const markAnnouncementAsViewed = async (announcement) => {
    if (!announcement?.id || announcement.isRead) {
      return;
    }

    const announcementId = Number.parseInt(announcement.id, 10);

    setAnnouncements((current) =>
      current.map((item) =>
        item.id === announcement.id ? { ...item, isRead: true } : item
      )
    );

    // Backward compatibility for legacy synthetic announcements
    // that used non-numeric ids before DB-backed announcements.
    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      return;
    }

    try {
      await axios.post(
        buildApiUrl(`/api/classrooms/announcements/${announcementId}/viewed`),
        {},
        { headers: getAuthHeaders() }
      );
    } catch (error) {
      setAnnouncements((current) =>
        current.map((item) =>
          item.id === announcement.id ? { ...item, isRead: false } : item
        )
      );
      setAnnouncementActionError(
        error.response?.data?.message ??
          "Failed to mark announcement as viewed. Please try again."
      );
    }
  };

  const onAnnouncementOpen = async (announcement) => {
    setSelectedAnnouncement(announcement);
    setAnnouncementActionError("");
    await markAnnouncementAsViewed(announcement);
  };

  const markNotificationAsViewed = async (notification) => {
    if (!notification?.id || notification.isRead) {
      return;
    }

    const encodedNotificationId = encodeURIComponent(String(notification.id));

    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, isRead: true } : item
      )
    );

    try {
      await axios.post(
        buildApiUrl(`/api/notifications/${encodedNotificationId}/viewed`),
        {},
        { headers: getAuthHeaders() }
      );
    } catch (error) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, isRead: false } : item
        )
      );
      setNotificationActionError(
        error.response?.data?.message ??
          "Failed to mark notification as viewed. Please try again."
      );
    }
  };

  const onNotificationOpen = async (notification) => {
    setNotificationActionError("");
    await markNotificationAsViewed(notification);
  };

  /* ── Derived values ── */
  const lessons = useMemo(
    () =>
      progressData?.lessons?.length > 0
        ? progressData.lessons
        : FALLBACK_LESSONS,
    [progressData],
  );

  const overallPct = progressData?.summary?.overallProgress ?? 0;
  const totalCleared =
    progressData?.summary?.totalLevelsCleared ??
    progressData?.summary?.completedLevels ??
    0;
  const currentLessonLabel =
    progressData?.summary?.currentLesson ?? REGIONS[0].label;
  const currentLevelLabel =
    progressData?.summary?.currentLevelName ?? "Level 1-1";
  const currentLevelHint =
    progressData?.summary?.currentLevelHint ??
    "Open the map to continue your journey.";

  const classroom = classroomData?.primaryClassroom ?? null;
  const xpCurrent = progressData?.summary?.xp ?? 0;
  const xpNext =
    progressData?.summary?.xpToNextLevel ??
    Math.max(250, Math.min(1000, Math.ceil((xpCurrent + 1) / 250) * 250));
  const myRankDisplay =
    progressData?.summary?.classRank ??
    leaderboardMeta.currentUserRank ??
    null;
  const classSize =
    progressData?.summary?.classSize ?? leaderboardMeta.classSize ?? null;
  const totalTimePlayed = progressData?.summary?.totalTimePlayed ?? "—";
  const mistakes = progressData?.summary?.commonMistakes ?? [];

  const myUserId = user?.id;
  const myRank =
    leaderboardData.findIndex((e) => `${e.userId}` === `${myUserId}`) + 1 || null;
  const topFive = leaderboardData.slice(0, 5);

  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;
  const unreadAnnCount = announcements.filter((a) => !a.isRead).length;
  const totalUnread = unreadNotifCount + unreadAnnCount;

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : (user?.username ?? "Student");

  const currentLessonKey = useMemo(() => {
    if (progressData?.summary?.currentLessonKey) {
      return progressData.summary.currentLessonKey;
    }

    const normalize = (value) =>
      String(value ?? "")
        .trim()
        .toLowerCase();
    const target = normalize(currentLessonLabel);

    const matchedRegion = REGIONS.find(
      (region) =>
        normalize(region.key) === target ||
        normalize(region.label) === target ||
        normalize(region.topic) === target,
    );

    return matchedRegion?.key ?? REGIONS[0].key;
  }, [progressData, currentLessonLabel]);

  const currentLevelNumber = useMemo(() => {
    const levelRows =
      progressData?.levels
        ?.filter((level) => level.lessonKey === currentLessonKey)
        .sort((a, b) => a.levelNumber - b.levelNumber) ?? [];

    if (levelRows.length > 0) {
      const firstIncomplete = levelRows.find((level) => !level.isCompleted);
      return (
        firstIncomplete?.levelNumber ?? levelRows[levelRows.length - 1].levelNumber
      );
    }

    return parseLevelNumberFromLabel(currentLevelLabel) ?? 1;
  }, [progressData, currentLessonKey, currentLevelLabel]);

  const continueCardBackgroundSrc = `${import.meta.env.BASE_URL}${
    LEVEL_BACKGROUND_BY_NUMBER[currentLevelNumber] ??
    LEVEL_BACKGROUND_BY_NUMBER[1]
  }`;

  /* ─── Render ──────────────────────────────────────────────────── */
  return (
    <div className={styles.root}>
      <Sidebar />

      <main className={styles.main}>
        {/* ── HEADER ── */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.avatar}>{initials(displayName)}</div>
            <div className={styles.headerInfo}>
              <div className={styles.headerName}>
                Welcome back, {user?.firstName ?? user?.username ?? "Student"}
              </div>
              <div className={styles.headerClass}>
                {isLoading
                  ? "Loading class..."
                  : classroom
                    ? `${classroom.className} · ${classroom.section} · ${classroom.schoolYear}`
                    : "Not enrolled in a class"}
              </div>
              <XpBar current={xpCurrent} max={xpNext} />
            </div>
          </div>

          <div className={styles.headerRight}>
            <button
              className={styles.btnContinueHeader}
              onClick={() => navigate("/Map")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6h8M6 2l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Continue playing
            </button>
            <button
              className={styles.bellBtn}
              onClick={() => setActiveTab("notifications")}
              aria-label="Notifications"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                />
              </svg>
              {totalUnread > 0 && <span className={styles.bellBadge} />}
            </button>
          </div>
        </header>

        {/* ── STAT CARDS ROW ── */}
        <div className={styles.statRow}>
          <StatCard
            label="Overall progress"
            value={`${Math.round(overallPct)}%`}
            sub={`${totalCleared} of 40 levels done`}
          />
          <StatCard
            label="Current level"
            value={currentLevelLabel}
            sub={currentLessonLabel}
          />
          <StatCard
            label="Class rank"
            value={myRankDisplay ? `#${myRankDisplay}` : "—"}
            sub={classSize ? `of ${classSize} students` : ""}
            accent="#26547c"
          />
          <StatCard
            label="Total time played"
            value={totalTimePlayed}
            sub="this session"
          />
        </div>

        {/* ── MAIN GRID ── */}
        <div className={styles.mainGrid}>
          {/* Left: Lesson progress + common mistakes */}
          <div className={styles.card}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}>Lesson progress</div>
              <div className={styles.sectionSub}>
                {totalCleared} / 40 levels
              </div>
            </div>

            {/* Overall bar */}
            <div className={styles.overallBarWrap}>
              <div className={styles.overallBar}>
                <div
                  className={styles.overallFill}
                  style={{ width: `${overallPct}%` }}
                />
              </div>
              <span className={styles.overallPct}>
                {Math.round(overallPct)}%
              </span>
            </div>

            {/* Region tiles */}
            <div className={styles.lessonGrid}>
              {REGIONS.map((region, idx) => {
                const lessonData = lessons.find(
                  (l) => l.lessonKey === region.key,
                );
                const cleared =
                  lessonData?.levelsCleared ?? lessonData?.completedLevels ?? 0;
                const prevPct =
                  idx === 0
                    ? 100
                    : (lessons.find((l) => l.lessonKey === REGIONS[idx - 1].key)
                        ?.progressPercent ?? 0);
                const locked = idx > 0 && prevPct < 100;
                return (
                  <RegionTile
                    key={region.key}
                    region={region}
                    levelsCleared={cleared}
                    locked={locked}
                  />
                );
              })}
            </div>

            {/* Common mistakes */}
            <div className={styles.divider} />
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}>Common mistakes</div>
            </div>
            {isLoading ? (
              <div className={styles.loadingText}>Loading...</div>
            ) : mistakes.length === 0 ? (
              <>
                <MistakeRow
                  label="Wrong data type used"
                  type="type error"
                  count={0}
                  typeBg="#FAECE7"
                  typeColor="#993C1D"
                />
                <MistakeRow
                  label="Operator precedence"
                  type="logic error"
                  count={0}
                  typeBg="#FAEEDA"
                  typeColor="#854F0B"
                />
                <MistakeRow
                  label="Missing semicolon"
                  type="syntax error"
                  count={0}
                  typeBg="#E1F5EE"
                  typeColor="#0F6E56"
                />
              </>
            ) : (
              mistakes
                .slice(0, 4)
                .map((m, i) => (
                  <MistakeRow
                    key={i}
                    label={m.label}
                    type={m.type}
                    count={m.count}
                    typeBg={m.typeBg ?? "#FAECE7"}
                    typeColor={m.typeColor ?? "#993C1D"}
                  />
                ))
            )}
          </div>

          {/* Right: Leaderboard */}
          <div className={styles.card}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}>Class leaderboard</div>
              <button
                className={styles.sectionLink}
                onClick={() => navigate("/leaderboards")}
              >
                See all →
              </button>
            </div>

            {/* Rank callout */}
            {myRankDisplay && (
              <div className={styles.rankCallout}>
                <div className={styles.rankCalloutIcon}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M10 2l2 4.5 5 .7-3.5 3.4.8 5L10 13.4 5.7 15.6l.8-5L3 7.2l5-.7z"
                      fill="#CECBF6"
                    />
                  </svg>
                </div>
                <div>
                  <div className={styles.rankCalloutText}>
                    You&apos;re ranked <strong>#{myRankDisplay}</strong> in your
                    class
                  </div>
                  <div className={styles.rankCalloutSub}>
                    {classSize ? `out of ${classSize} students` : "Keep going!"}
                  </div>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className={styles.loadingText}>Loading...</div>
            ) : topFive.length === 0 ? (
              <div className={styles.emptyText}>No leaderboard data yet.</div>
            ) : (
              <div className={styles.lbList}>
                {topFive.map((entry, i) => (
                  <LeaderboardRow
                    key={entry.userId ?? i}
                    rank={i + 1}
                    name={entry.name ?? entry.username}
                    xp={entry.xp ?? 0}
                    levels={entry.levelsCleared ?? 0}
                    isMe={`${entry.userId}` === `${myUserId}`}
                  />
                ))}

                {myRank &&
                  myRank > 5 &&
                  (() => {
                    const me = leaderboardData[myRank - 1];
                    return (
                      <>
                        <div className={styles.lbDivider}>· · ·</div>
                        <LeaderboardRow
                          rank={myRank}
                          name={me?.name ?? user?.username ?? "You"}
                          xp={me?.xp ?? xpCurrent}
                          levels={me?.levelsCleared ?? totalCleared}
                          isMe
                        />
                      </>
                    );
                  })()}
              </div>
            )}
          </div>
        </div>

        {/* ── BOTTOM ROW ── */}
        <div className={styles.bottomRow}>
          {/* Continue playing card */}
          <div className={styles.continueCard}>
            <div className={styles.cardLabel}>Continue playing</div>
            <div className={styles.regionArt}>
              <img
                className={styles.regionArtImage}
                src={continueCardBackgroundSrc}
                alt={`${currentLevelLabel} scene preview`}
              />
            </div>

            <div className={styles.continueMeta}>
              <span className={styles.regionTag}>{currentLessonLabel}</span>
              <div className={styles.levelName}>{currentLevelLabel}</div>
              <div className={styles.levelHint}>{currentLevelHint}</div>
            </div>

            <div className={styles.continueActions}>
              <button
                className={styles.btnContinue}
                onClick={() => navigate("/Map")}
              >
                Continue
              </button>
              <button
                className={styles.btnMap}
                onClick={() => navigate("/Map")}
              >
                View full map
              </button>
            </div>
          </div>

          {/* Time per lesson card */}
          <div className={styles.card}>
            <div className={styles.sectionTitle} style={{ marginBottom: 12 }}>
              Time per lesson
            </div>
            {REGIONS.map((region, idx) => {
              const lessonData = lessons.find(
                (l) => l.lessonKey === region.key,
              );
              const timeStr = lessonData?.timeSpent ?? "—";
              const pct = lessonData?.progressPercent ?? 0;
              return (
                <div key={region.key} className={styles.timeRow}>
                  <div className={styles.timeLeft}>
                    <div className={styles.timeLabel}>{region.topic}</div>
                    <div className={styles.timeMiniBarTrack}>
                      <div
                        className={styles.timeMiniBarFill}
                        style={{ width: `${pct}%`, background: region.accent }}
                      />
                    </div>
                  </div>
                  <div className={styles.timeVal}>{timeStr}</div>
                </div>
              );
            })}
          </div>

          {/* Announcements + Notifications */}
          <div className={styles.card}>
            <div className={styles.notifTabs}>
              <button
                className={`${styles.notifTab} ${activeTab === "announcements" ? styles.notifTabActive : ""}`}
                onClick={() => setActiveTab("announcements")}
              >
                Announcements
                {unreadAnnCount > 0 && (
                  <span className={styles.tabBadge}>{unreadAnnCount}</span>
                )}
              </button>
              <button
                className={`${styles.notifTab} ${activeTab === "notifications" ? styles.notifTabActive : ""}`}
                onClick={() => setActiveTab("notifications")}
              >
                Notifications
                {unreadNotifCount > 0 && (
                  <span className={styles.tabBadge}>{unreadNotifCount}</span>
                )}
              </button>
            </div>

            <div className={styles.notifList}>
              {activeTab === "announcements" ? (
                isLoading ? (
                  <div className={styles.loadingText}>Loading...</div>
                ) : announcements.length === 0 ? (
                  <div className={styles.emptyText}>No announcements yet.</div>
                ) : (
                  announcements.slice(0, 5).map((ann, i) => (
                    <button
                      type="button"
                      key={ann.id ?? i}
                      className={`${styles.notifItem} ${styles.notifButton}`}
                      onClick={() => onAnnouncementOpen(ann)}
                    >
                      <div
                        className={`${styles.notifDot} ${ann.isRead ? styles.notifDotRead : ""}`}
                      />
                      <div>
                        <div className={styles.notifText}>{ann.message}</div>
                        <div className={styles.notifMeta}>
                          {ann.teacherName ?? "Teacher"} &nbsp;·&nbsp;{" "}
                          {timeAgo(ann.createdAt) || ann.timeAgo}
                        </div>
                      </div>
                    </button>
                  ))
                )
              ) : isLoading ? (
                <div className={styles.loadingText}>Loading...</div>
              ) : notifications.length === 0 ? (
                <div className={styles.emptyText}>No notifications yet.</div>
              ) : (
                notifications.slice(0, 5).map((notif, i) => (
                  <button
                    type="button"
                    key={notif.id ?? i}
                    className={`${styles.notifItem} ${styles.notifButton}`}
                    onClick={() => onNotificationOpen(notif)}
                  >
                    <div
                      className={`${styles.notifDot} ${notif.isRead ? styles.notifDotRead : ""}`}
                    />
                    <div>
                      <div className={styles.notifText}>{notif.message}</div>
                      <div className={styles.notifMeta}>
                        {timeAgo(notif.createdAt) || notif.timeAgo}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            {announcementActionError && (
              <p className={styles.notifError}>{announcementActionError}</p>
            )}
            {notificationActionError && (
              <p className={styles.notifError}>{notificationActionError}</p>
            )}
          </div>
        </div>
      </main>

      {selectedAnnouncement && (
        <div
          className={styles.announcementModalBackdrop}
          onClick={() => setSelectedAnnouncement(null)}
        >
          <div
            className={styles.announcementModalCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.announcementModalHeader}>
              <h3>Announcement</h3>
              <button
                type="button"
                className={styles.announcementModalClose}
                onClick={() => setSelectedAnnouncement(null)}
              >
                Close
              </button>
            </div>
            <p className={styles.announcementModalMessage}>
              {selectedAnnouncement.message}
            </p>
            <p className={styles.announcementModalMeta}>
              {selectedAnnouncement.teacherName ?? "Teacher"} ·{" "}
              {selectedAnnouncement.createdAt
                ? new Date(selectedAnnouncement.createdAt).toLocaleString()
                : "Just now"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudentDashboardPage;
