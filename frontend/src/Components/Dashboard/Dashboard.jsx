import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import { getProgress } from "../../services/studentAssessmentService.js";
import { buildApiUrl, getAuthHeaders, getUser, setUser as persistUser } from "../../utils/auth";
import {
  normalizePreferences,
  resolvePreferenceModes,
} from "./preferencePersonalization.js";
import {
  createDashboardNextStepViewModel,
  dashboardProgressionReducer,
  fulfilledDashboardSections,
  initialDashboardProgressionState,
} from "./dashboardNextStep.js";
import {
  DASHBOARD_GAME_REGIONS,
  createDashboardProgressDisplay,
} from "./dashboardProgressDisplay.js";
import {
  DashboardGameProgressPanel,
} from "./DashboardProgressDisplay.jsx";
import { revealDashboardNotifications } from "./dashboardInteractions.js";
import styles from "./Dashboard.module.css";

const ANNOUNCEMENT_HEADER_PREFIX = "HEADER:";

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

function formatDuration(totalSeconds) {
  const parsed = Number(totalSeconds);
  if (!Number.isFinite(parsed) || parsed < 0) return "—";

  const seconds = Math.floor(parsed);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];

  if (hours > 0) parts.push(`${hours}hr`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(`${remainingSeconds}s`);
  }

  return parts.join(" ");
}

function parseAnnouncementPayload(rawMessage = "") {
  const text = String(rawMessage ?? "").trim();
  const [firstLine = "", ...restLines] = text.split(/\r?\n/);
  const hasHeader = firstLine
    .toUpperCase()
    .startsWith(ANNOUNCEMENT_HEADER_PREFIX);

  if (!hasHeader) {
    return {
      header: "Announcement",
      body: text,
    };
  }

  return {
    header:
      firstLine.slice(ANNOUNCEMENT_HEADER_PREFIX.length).trim() ||
      "Announcement",
    body: restLines.join("\n").trim(),
  };
}

function PersonalizedFocusCard({ eyebrow, title, value, detail, progress }) {
  return (
    <article className={styles.focusCard}>
      <div className={styles.focusLabel}>{eyebrow}</div>
      <h3>{title}</h3>
      <strong className={styles.focusValue}>{value}</strong>
      <p>{detail}</p>
      {Number.isFinite(progress) && (
        <div
          className={styles.focusProgressTrack}
          role="progressbar"
          aria-label={title}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(progress)}
        >
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </article>
  );
}

function focusCardFor(mode, data, secondary = false) {
  const eyebrow = secondary ? "Because you enjoy" : "Personalized focus";

  if (mode === "competition") {
    return data.rank
      ? {
          eyebrow,
          title: secondary ? "Competition" : "Your Classroom Standing",
          value: `Rank #${data.rank}`,
          detail: data.classSize
            ? `${data.xp.toLocaleString()} XP among ${data.classSize} students.`
            : `${data.xp.toLocaleString()} XP earned in your classroom.`,
        }
      : {
          eyebrow,
          title: secondary ? "Competition" : "Your Classroom Standing",
          value: "Your first rank awaits",
          detail: "Complete a game activity to join your classroom ranking.",
        };
  }

  if (mode === "rewards") {
    return {
      eyebrow,
      title: secondary ? "Rewards" : "Your Rewards",
      value: `${data.xp.toLocaleString()} XP earned`,
      detail: data.latestXp > 0
        ? `Your latest completed game activity added ${data.latestXp} XP.`
        : "Complete your first game activity to earn XP and completion bonuses.",
      progress: data.xpNext > 0 ? (data.xp / data.xpNext) * 100 : 0,
    };
  }

  if (mode === "story") {
    return {
      eyebrow,
      title: secondary ? "Exploration" : "Your Story Journey",
      value: data.region.label,
      detail: `${data.currentLevel} is your next stop in ${data.region.topic}. ${data.unlockedLevels} game activities are currently open to explore.`,
    };
  }

  if (mode === "challenges") {
    return {
      eyebrow,
      title: "Challenges",
      value: data.firstAttemptCompletions > 0
        ? `${data.firstAttemptCompletions} first-attempt ${data.firstAttemptCompletions === 1 ? "win" : "wins"}`
        : "Your first challenge awaits",
      detail: data.completedLevels > 0
        ? `${data.completedLevels} game activities completed across your coding journey.`
        : "Complete a game activity to start building your challenge record.",
    };
  }

  return {
    eyebrow: secondary ? "Next learning goal" : eyebrow,
    title: secondary ? data.currentLevel : "Your Game Progress",
    value: `${data.completedLevels} game activities completed`,
    detail: data.overallPct >= 100
      ? "Game progress complete — you cleared every available game activity."
      : `${Math.round(data.overallPct)}% game progress. Continue with ${data.currentLevel}.`,
    progress: data.overallPct,
  };
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
  const toast = useToast();
  const [user, setProfileUser] = useState(() => getUser());

  const [progressionState, dispatchProgression] = useReducer(
    dashboardProgressionReducer,
    initialDashboardProgressionState,
  );
  const progressionGenerationRef = useRef(0);
  const progressionControllerRef = useRef(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [leaderboardMeta, setLeaderboardMeta] = useState({
    classSize: null,
    currentUserRank: null,
  });
  const [announcements, setAnnouncements] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState("announcements");
  const [preferencesExpanded, setPreferencesExpanded] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [announcementActionError, setAnnouncementActionError] = useState("");
  const [notificationActionError, setNotificationActionError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [preferenceForm, setPreferenceForm] = useState(() =>
    normalizePreferences(getUser()),
  );
  const [preferenceStatus, setPreferenceStatus] = useState("");
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const notificationTabRef = useRef(null);

  const loadProgression = useCallback(async () => {
    const generation = progressionGenerationRef.current + 1;
    progressionGenerationRef.current = generation;
    progressionControllerRef.current?.abort();
    const controller = new AbortController();
    progressionControllerRef.current = controller;
    dispatchProgression({ type: "load-started", generation });

    let confirmedClassroom = null;
    try {
      const classroomResponse = await axios.get(
        buildApiUrl("/api/classrooms/me"),
        { headers: getAuthHeaders(), signal: controller.signal },
      );
      if (generation !== progressionGenerationRef.current) return;

      const classroomPayload = classroomResponse.data;
      confirmedClassroom = classroomPayload?.primaryClassroom ?? null;
      if (classroomPayload?.hasActiveMembership === false && !confirmedClassroom) {
        dispatchProgression({ type: "load-unenrolled", generation });
        return;
      }
      if (!Number.isSafeInteger(Number(confirmedClassroom?.id))
        || Number(confirmedClassroom.id) <= 0) {
        throw new Error("Your classroom selection could not be confirmed.");
      }

      const progress = await getProgress({
        classroomId: confirmedClassroom.id,
        signal: controller.signal,
      });
      if (generation !== progressionGenerationRef.current) return;
      if (Number(progress?.classroomId) !== Number(confirmedClassroom.id)) {
        throw new Error("Your classroom progress did not match the selected classroom.");
      }
      dispatchProgression({
        type: "load-succeeded",
        generation,
        classroom: confirmedClassroom,
        progress,
      });
    } catch (error) {
      if (axios.isCancel(error)
        || error?.name === "CanceledError"
        || error?.name === "AbortError"
        || error?.code === "ERR_CANCELED"
        || generation !== progressionGenerationRef.current) return;
      dispatchProgression({
        type: "load-failed",
        generation,
        classroom: confirmedClassroom,
        error: error?.message || "Progress could not be loaded",
      });
    }
  }, []);

  useEffect(() => {
    loadProgression();
    return () => {
      progressionGenerationRef.current += 1;
      progressionControllerRef.current?.abort();
    };
  }, [loadProgression]);

  useEffect(() => {
    let isMounted = true;
    const h = { headers: getAuthHeaders() };

    const fetchAll = async () => {
      const [leaderboard, announcementsResult, notificationsResult, profile] =
        await Promise.allSettled([
          axios.get(buildApiUrl("/api/classrooms/leaderboard"), h),
          axios.get(buildApiUrl("/api/classrooms/announcements"), h),
          axios.get(buildApiUrl("/api/notifications/me"), h),
          axios.get(buildApiUrl("/api/auth/me"), h),
        ]);

      if (!isMounted) return;
      const settled = fulfilledDashboardSections({
        leaderboard,
        announcements: announcementsResult,
        notifications: notificationsResult,
        profile,
      });
      if (settled.leaderboard) setLeaderboardData(settled.leaderboard);
      if (settled.leaderboardMeta) setLeaderboardMeta(settled.leaderboardMeta);
      if (settled.announcements) setAnnouncements(settled.announcements);
      if (settled.notifications) setNotifications(settled.notifications);
      if (settled.profile) {
        const loadedUser = settled.profile;
        setProfileUser(loadedUser);
        persistUser(loadedUser);
        setPreferenceForm(normalizePreferences(loadedUser));
      }

      setIsLoading(false);
    };

    fetchAll();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (preferenceStatus !== "Preferences saved") return undefined;
    const timer = window.setTimeout(() => setPreferenceStatus(""), 3000);
    return () => window.clearTimeout(timer);
  }, [preferenceStatus]);

  const savePreferences = async () => {
    setIsSavingPreferences(true);
    setPreferenceStatus("Saving preferences...");
    try {
      const response = await axios.put(
        buildApiUrl("/api/auth/me/gamification-preferences"),
        preferenceForm,
        { headers: getAuthHeaders() },
      );
      const nextUser = { ...user, ...response.data };
      setProfileUser(nextUser);
      persistUser(nextUser);
      setPreferenceStatus("Preferences saved");
      toast.success("Preferences saved. Your dashboard focus has been updated.");
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "Could not save preferences. Check your connection and try again.";
      setPreferenceStatus(message);
      toast.error(message);
    } finally {
      setIsSavingPreferences(false);
    }
  };


  const markAnnouncementAsViewed = async (announcement) => {
    if (!announcement?.id || announcement.isRead) {
      return;
    }

    const announcementId = Number.parseInt(announcement.id, 10);

    setAnnouncements((current) =>
      current.map((item) =>
        item.id === announcement.id ? { ...item, isRead: true } : item,
      ),
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
        { headers: getAuthHeaders() },
      );
    } catch (error) {
      setAnnouncements((current) =>
        current.map((item) =>
          item.id === announcement.id ? { ...item, isRead: false } : item,
        ),
      );
      setAnnouncementActionError(
        error.response?.data?.message ??
          "Failed to mark announcement as viewed. Please try again.",
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
        item.id === notification.id ? { ...item, isRead: true } : item,
      ),
    );

    try {
      await axios.post(
        buildApiUrl(`/api/notifications/${encodedNotificationId}/viewed`),
        {},
        { headers: getAuthHeaders() },
      );
    } catch (error) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, isRead: false } : item,
        ),
      );
      setNotificationActionError(
        error.response?.data?.message ??
          "Failed to mark notification as viewed. Please try again.",
      );
    }
  };

  const onNotificationOpen = async (notification) => {
    setNotificationActionError("");
    await markNotificationAsViewed(notification);
    if (notification?.route) navigate(notification.route);
  };

  const revealNotifications = () => {
    revealDashboardNotifications({
      selectNotifications: () => setActiveTab("notifications"),
      getDestination: () => notificationTabRef.current,
    });
  };

  /* ── Derived values ── */
  const progressData = progressionState.progress;
  const classroom = progressionState.classroom;
  const nextStep = createDashboardNextStepViewModel(progressionState);
  const progressDisplay = createDashboardProgressDisplay(progressData);
  const overallPct = progressDisplay.progressPercent ?? 0;
  const totalCleared =
    progressData?.summary?.totalLevelsCleared ??
    progressData?.summary?.completedLevels ??
    0;
  const currentLessonLabel =
    progressData?.summary?.currentLesson ?? DASHBOARD_GAME_REGIONS[0].label;
  const currentLevelLabel =
    progressData?.summary?.currentLevelName ?? "Level 1-1";
  const xpCurrent = progressData?.summary?.xp ?? 0;
  const xpNext =
    progressData?.summary?.xpToNextLevel ??
    Math.max(250, Math.min(1000, Math.ceil((xpCurrent + 1) / 250) * 250));
  const myRankDisplay =
    progressData?.summary?.classRank ?? leaderboardMeta.currentUserRank ?? null;
  const classSize =
    progressData?.summary?.classSize ?? leaderboardMeta.classSize ?? null;
  const totalTimePlayed = formatDuration(
    progressData?.summary?.totalTimePlayed,
  );

  const myUserId = user?.id;
  const myRank =
    leaderboardData.findIndex((e) => `${e.userId}` === `${myUserId}`) + 1 ||
    null;
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

    const matchedRegion = DASHBOARD_GAME_REGIONS.find(
      (region) =>
        normalize(region.key) === target ||
        normalize(region.label) === target ||
        normalize(region.topic) === target,
    );

    return matchedRegion?.key ?? DASHBOARD_GAME_REGIONS[0].key;
  }, [progressData, currentLessonLabel]);

  const completedLevelRows =
    progressData?.levels?.filter((level) => level.isCompleted) ?? [];
  const latestCompletedLevel = [...completedLevelRows]
    .filter((level) => level.completedAt)
    .sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
    )[0];
  const currentRegion =
    DASHBOARD_GAME_REGIONS.find((region) => region.key === currentLessonKey)
    ?? DASHBOARD_GAME_REGIONS[0];
  const preferenceModes = resolvePreferenceModes(user);
  const personalizationData = {
    rank: myRankDisplay,
    classSize,
    xp: xpCurrent,
    xpNext,
    latestXp: Number(latestCompletedLevel?.xpAwarded ?? 0),
    region: currentRegion,
    currentLevel: currentLevelLabel,
    unlockedLevels:
      progressData?.levels?.filter((level) => level.isAccessible !== false).length ?? 0,
    firstAttemptCompletions: completedLevelRows.filter(
      (level) => Number(level.attemptCount ?? 0) === 0,
    ).length,
    completedLevels: totalCleared,
    overallPct,
  };
  const primaryFocusCard = focusCardFor(
    preferenceModes.primaryMode,
    personalizationData,
  );
  const secondaryFocusCard = focusCardFor(
    preferenceModes.secondaryMode,
    personalizationData,
    true,
  );

  /* ─── Render ──────────────────────────────────────────────────── */
  return (
    <div className={styles.root}>
      <Sidebar />

      <main className={styles.main}>
        <div className={styles.content}>
          <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.avatar}>{initials(displayName)}</div>
            <div className={styles.headerInfo}>
              <h1 className={styles.headerName}>
                Welcome back, {user?.firstName ?? user?.username ?? "Student"}
              </h1>
              <div className={styles.headerClass}>
                {["idle", "loading"].includes(progressionState.status)
                  ? "Loading class..."
                  : classroom
                    ? `${classroom.className} · ${classroom.section} · ${classroom.schoolYear}`
                    : progressionState.status === "unenrolled"
                      ? "Not enrolled in a class"
                      : "Class information unavailable"}
              </div>
            </div>
          </div>

          <div className={styles.headerRight}>
            <button
              className={styles.bellBtn}
              onClick={revealNotifications}
              aria-label={totalUnread > 0 ? `Notifications, ${totalUnread} unread updates` : "Notifications"}
              aria-controls="dashboard-updates"
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

          <section
          className={`${styles.nextStepPanel} ${styles[`nextStep_${nextStep.kind}`] ?? ""}`}
          aria-labelledby="dashboard-next-step-title"
          aria-live="polite"
          aria-busy={nextStep.kind === "loading"}
        >
          <div className={styles.nextStepCopy}>
            <div className={styles.nextStepLabel}>{nextStep.eyebrow}</div>
            <h2 id="dashboard-next-step-title">{nextStep.title}</h2>
            <p>{nextStep.description}</p>
          </div>
          <div className={styles.nextStepActions}>
            {nextStep.action && (
              <button
                type="button"
                className={styles.nextStepPrimary}
                disabled={nextStep.action.disabled}
                onClick={() => nextStep.action.href && navigate(nextStep.action.href)}
              >
                {nextStep.action.label}
              </button>
            )}
            {nextStep.canRetry && (
              <button
                type="button"
                className={styles.nextStepPrimary}
                onClick={loadProgression}
              >
                Try again
              </button>
            )}
            {nextStep.secondaryAction && (
              <button
                type="button"
                className={styles.nextStepSecondary}
                onClick={() => navigate(nextStep.secondaryAction.href)}
              >
                {nextStep.secondaryAction.label}
              </button>
            )}
          </div>
          </section>

          <dl className={styles.summaryBar} aria-label="Learning summary">
            <div className={styles.summaryItem}>
              <dt>Class rank</dt>
              <dd>{myRankDisplay ? `#${myRankDisplay}` : "—"}</dd>
              <span>{classSize ? `of ${classSize} students` : "Not ranked yet"}</span>
            </div>
            <div className={styles.summaryItem}>
              <dt>Time played</dt>
              <dd>{totalTimePlayed}</dd>
              <span>Across game activities</span>
            </div>
            <div className={styles.summaryItem}>
              <dt>XP earned</dt>
              <dd>{xpCurrent.toLocaleString()}</dd>
              <span>{xpNext > 0 ? `${xpNext.toLocaleString()} XP milestone` : "Current total"}</span>
            </div>
          </dl>

          <div className={styles.mainGrid}>
          {/* Left: Lesson progress + common mistakes */}
          <DashboardGameProgressPanel progressData={progressData} />

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

          <div className={styles.bottomRow}>
          {/* My Grades card */}
          <div className={styles.card}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}>My grades</div>
              <div className={styles.sectionSub}>Completed levels</div>
            </div>
            {["idle", "loading"].includes(progressionState.status) ? (
              <div className={styles.loadingText}>Loading...</div>
            ) : progressionState.status === "error" ? (
              <div className={styles.emptyText}>Grades are unavailable until progress loads successfully.</div>
            ) : progressionState.status === "unenrolled" ? (
              <div className={styles.emptyText}>Join a classroom to begin earning grades.</div>
            ) : (() => {
              const gradedLevels = (progressData?.levels ?? [])
                .filter((l) => l.isCompleted && l.finalScore != null)
                .sort((a, b) => a.orderIndex - b.orderIndex);
              if (gradedLevels.length === 0) {
                return <div className={styles.emptyText}>No graded levels yet. Complete a level to see your score.</div>;
              }
              return (
                <div className={styles.gradeList}>
                  {gradedLevels.map((level) => (
                    <div key={level.levelKey} className={styles.gradeRow}>
                      <div className={styles.gradeLevel}>
                        <span className={styles.gradeLevelNum}>Lv {level.orderIndex}</span>
                        <span className={styles.gradeLevelKey}>{level.lessonTitle}</span>
                      </div>
                      <span
                        className={styles.gradeScore}
                        style={{
                          color: level.finalScore >= 90 ? "#0F6E56" : level.finalScore >= 75 ? "#854F0B" : "#993C1D",
                          background: level.finalScore >= 90 ? "#E1F5EE" : level.finalScore >= 75 ? "#FAEEDA" : "#FAECE7",
                        }}
                      >
                        {level.finalScore}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Announcements + Notifications */}
          <div className={styles.card} id="dashboard-updates">
            <div
              className={styles.notifTabs}
              role="tablist"
              aria-label="Class updates"
            >
              <button
                type="button"
                className={`${styles.notifTab} ${activeTab === "announcements" ? styles.notifTabActive : ""}`}
                onClick={() => setActiveTab("announcements")}
                role="tab"
                aria-selected={activeTab === "announcements"}
                aria-controls="dashboard-updates-panel"
              >
                Announcements
                {unreadAnnCount > 0 && (
                  <span className={styles.tabBadge}>{unreadAnnCount}</span>
                )}
              </button>
              <button
                type="button"
                ref={notificationTabRef}
                className={`${styles.notifTab} ${activeTab === "notifications" ? styles.notifTabActive : ""}`}
                onClick={() => setActiveTab("notifications")}
                role="tab"
                aria-selected={activeTab === "notifications"}
                aria-controls="dashboard-updates-panel"
              >
                Notifications
                {unreadNotifCount > 0 && (
                  <span className={styles.tabBadge}>{unreadNotifCount}</span>
                )}
              </button>
            </div>

            <div
              className={styles.notifList}
              id="dashboard-updates-panel"
              role="tabpanel"
              aria-live="polite"
            >
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
                      {(() => {
                        const parsedAnnouncement = parseAnnouncementPayload(
                          ann.message,
                        );
                        return (
                          <>
                            <div
                              className={`${styles.notifDot} ${ann.isRead ? styles.notifDotRead : ""}`}
                            />
                            <div>
                              <div className={styles.notifText}>
                                <span
                                  className={styles.announcementInlineTitle}
                                >
                                  {parsedAnnouncement.header}
                                </span>
                                {parsedAnnouncement.body
                                  ? ` - ${parsedAnnouncement.body}`
                                  : ""}
                              </div>
                              <div className={styles.notifMeta}>
                                {ann.teacherName ?? "Teacher"} &nbsp;·&nbsp;{" "}
                                {timeAgo(ann.createdAt) || ann.timeAgo}
                              </div>
                            </div>
                          </>
                        );
                      })()}
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

          <section
            className={styles.preferenceSection}
            aria-labelledby="dashboard-personalization-title"
          >
            <div className={styles.preferenceHeader}>
              <div>
                <h2 id="dashboard-personalization-title">
                  Personalized dashboard
                </h2>
                <p>
                  Keep the learning signals that motivate you within easy reach.
                </p>
              </div>
              <button
                type="button"
                className={styles.preferenceToggle}
                aria-expanded={preferencesExpanded}
                aria-controls="dashboard-preference-editor"
                onClick={() => setPreferencesExpanded((current) => !current)}
              >
                {preferencesExpanded ? "Hide preferences" : "Edit preferences"}
              </button>
            </div>

            <div className={styles.personalizationGrid} aria-live="polite">
              <PersonalizedFocusCard {...primaryFocusCard} />
              <PersonalizedFocusCard {...secondaryFocusCard} />
            </div>

            <div
              id="dashboard-preference-editor"
              className={styles.preferencePanel}
              hidden={!preferencesExpanded}
            >
              <div className={styles.preferenceIntro}>
                <strong>Your learning game preferences</strong>
                <span>
                  Saved choices update the personalized summaries above.
                </span>
              </div>
              <label>
                Motivation
                <select
                  value={preferenceForm.gamificationPreference}
                  onChange={(event) => {
                    setPreferenceStatus("");
                    setPreferenceForm((current) => ({
                      ...current,
                      gamificationPreference: event.target.value,
                    }));
                  }}
                >
                  <option value="progress">Progress</option>
                  <option value="competition">Competition</option>
                  <option value="rewards">Achievement / rewards</option>
                  <option value="story">Story / exploration</option>
                </select>
              </label>
              <label>
                Game interest
                <select
                  value={preferenceForm.learningGameInterest}
                  onChange={(event) => {
                    setPreferenceStatus("");
                    setPreferenceForm((current) => ({
                      ...current,
                      learningGameInterest: event.target.value,
                    }));
                  }}
                >
                  <option value="challenges">Challenges</option>
                  <option value="exploration">Exploration</option>
                  <option value="competition">Competition</option>
                  <option value="rewards">Rewards</option>
                </select>
              </label>
              <div className={styles.preferenceAction}>
                <button
                  type="button"
                  onClick={savePreferences}
                  disabled={isSavingPreferences}
                >
                  {isSavingPreferences ? "Saving..." : "Save preferences"}
                </button>
                {preferenceStatus && (
                  <small role="status">{preferenceStatus}</small>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {selectedAnnouncement &&
        (() => {
          const parsedAnnouncement = parseAnnouncementPayload(
            selectedAnnouncement.message,
          );
          return (
            <div
              className={styles.announcementModalBackdrop}
              onClick={() => setSelectedAnnouncement(null)}
            >
              <div
                className={styles.announcementModalCard}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.announcementModalHeader}>
                  <h3>{parsedAnnouncement.header}</h3>
                  <button
                    type="button"
                    className={styles.announcementModalClose}
                    onClick={() => setSelectedAnnouncement(null)}
                  >
                    Close
                  </button>
                </div>
                <p className={styles.announcementModalMessage}>
                  {parsedAnnouncement.body}
                </p>
                <p className={styles.announcementModalMeta}>
                  {selectedAnnouncement.teacherName ?? "Teacher"} ·{" "}
                  {selectedAnnouncement.createdAt
                    ? new Date(selectedAnnouncement.createdAt).toLocaleString()
                    : "Just now"}
                </p>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

export default StudentDashboardPage;
