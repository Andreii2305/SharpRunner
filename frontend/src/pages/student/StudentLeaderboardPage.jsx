import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import {
  buildApiUrl,
  getAuthHeaders,
  getUser,
} from "../../utils/auth";
import styles from "./StudentLeaderboardPage.module.css";

function initials(name = "") {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function StudentLeaderboardPage() {
  const navigate = useNavigate();
  const user = getUser();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [classroom, setClassroom] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [classSize, setClassSize] = useState(0);
  const [currentUserRank, setCurrentUserRank] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const requestConfig = { headers: getAuthHeaders() };

    const fetchLeaderboard = async () => {
      setErrorMessage("");

      const [leaderboardRes, classroomRes] = await Promise.allSettled([
        axios.get(buildApiUrl("/api/classrooms/leaderboard"), requestConfig),
        axios.get(buildApiUrl("/api/classrooms/me"), requestConfig),
      ]);

      if (!isMounted) {
        return;
      }

      if (leaderboardRes.status === "fulfilled") {
        setLeaderboard(leaderboardRes.value.data?.leaderboard ?? []);
        setClassSize(leaderboardRes.value.data?.classSize ?? 0);
        setCurrentUserRank(leaderboardRes.value.data?.currentUserRank ?? null);
      } else {
        setErrorMessage(
          leaderboardRes.reason?.response?.data?.message ??
            "Unable to load leaderboard data.",
        );
      }

      if (classroomRes.status === "fulfilled") {
        setClassroom(classroomRes.value.data?.primaryClassroom ?? null);
      }

      setIsLoading(false);
    };

    void fetchLeaderboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const myEntry = useMemo(
    () =>
      leaderboard.find((entry) => `${entry.userId}` === `${user?.id}`) ?? null,
    [leaderboard, user?.id],
  );

  return (
    <div className={styles.page}>
      <Sidebar />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>Class Leaderboard</div>
            <h1 className={styles.title}>
              {classroom
                ? `${classroom.className} ${classroom.section}`
                : "Your class rankings"}
            </h1>
            <p className={styles.subtitle}>
              {classroom
                ? `School year ${classroom.schoolYear}. Rankings are based on saved XP and completed levels.`
                : "Rankings are based on saved XP and completed levels."}
            </p>
          </div>

          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate("/dashboard")}
            >
              Back to dashboard
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => navigate("/Map")}
            >
              Continue playing
            </button>
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Your rank</div>
            <div className={styles.summaryValue}>
              {currentUserRank ? `#${currentUserRank}` : "-"}
            </div>
            <div className={styles.summarySub}>
              {classSize > 0 ? `out of ${classSize} students` : "No class data yet"}
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Your XP</div>
            <div className={styles.summaryValue}>
              {(myEntry?.xp ?? 0).toLocaleString()}
            </div>
            <div className={styles.summarySub}>Saved progress only</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Levels cleared</div>
            <div className={styles.summaryValue}>{myEntry?.levelsCleared ?? 0}</div>
            <div className={styles.summarySub}>Completed levels</div>
          </div>
        </section>

        <section className={styles.boardCard}>
          <div className={styles.boardHeader}>
            <div>
              <h2 className={styles.boardTitle}>Full ranking</h2>
              <p className={styles.boardSub}>
                XP is the primary sort. Completed levels are used as the next tie-breaker.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className={styles.stateText}>Loading leaderboard...</div>
          ) : errorMessage ? (
            <div className={styles.errorText}>{errorMessage}</div>
          ) : leaderboard.length === 0 ? (
            <div className={styles.stateText}>No leaderboard data yet.</div>
          ) : (
            <div className={styles.boardList}>
              {leaderboard.map((entry) => {
                const isCurrentUser = `${entry.userId}` === `${user?.id}`;
                return (
                  <div
                    key={entry.userId ?? entry.rank}
                    className={`${styles.row} ${isCurrentUser ? styles.rowCurrentUser : ""}`}
                  >
                    <div className={styles.rank}>{entry.rank}</div>
                    <div className={styles.avatar}>
                      {initials(entry.name ?? entry.username ?? "S")}
                    </div>
                    <div className={styles.person}>
                      <div className={styles.name}>
                        {entry.name ?? entry.username ?? "Student"}
                        {isCurrentUser ? " (You)" : ""}
                      </div>
                      <div className={styles.username}>
                        @{entry.username ?? "student"}
                      </div>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>
                        {(entry.xp ?? 0).toLocaleString()}
                      </span>
                      <span className={styles.metricLabel}>XP</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>
                        {entry.levelsCleared ?? 0}
                      </span>
                      <span className={styles.metricLabel}>Levels</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default StudentLeaderboardPage;
