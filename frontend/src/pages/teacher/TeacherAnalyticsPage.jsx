import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiAlertCircle, FiBookOpen, FiClock } from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import { clampPercent } from "./TeacherDashboardPage.jsx";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherAnalyticsPage.module.css";

const buildChartPath = (series, width = 360, height = 140) => {
  if (!Array.isArray(series) || series.length === 0) return "";
  const stepX = series.length > 1 ? width / (series.length - 1) : width;
  return series
    .map((item, i) => {
      const score = clampPercent(item.difficultyScore);
      const x = (i * stepX).toFixed(2);
      const y = (height - (score / 100) * height).toFixed(2);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
};

function TeacherAnalyticsPage() {
  const [insights, setInsights] = useState({
    mostCompletedLesson: null,
    mostDifficultLesson: null,
    averageTimePerLessonLabel: "Not enough data",
    completionByLesson: [],
    difficultyByLesson: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(buildApiUrl("/api/teacher/dashboard"), {
          headers: getAuthHeaders(),
        });
        if (res.data?.lessonInsights) setInsights(res.data.lessonInsights);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const chartSeries = insights.difficultyByLesson ?? [];
  const chartPath = useMemo(() => buildChartPath(chartSeries), [chartSeries]);

  return (
    <div className={styles.root}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.pageHeader}>
          <div className={styles.pageTitle}>Analytics</div>
        </div>

        <div className={styles.body}>
          {/* Insight summary cards */}
          <div className={pgStyles.insightRow}>
            <div
              className={styles.card}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <div className={pgStyles.insightIcon}>
                <FiBookOpen size={18} />
              </div>
              <div>
                <div className={pgStyles.insightLabel}>
                  Most completed lesson
                </div>
                <div className={pgStyles.insightVal}>
                  {isLoading
                    ? "—"
                    : (insights.mostCompletedLesson?.lessonTitle ?? "No data")}
                </div>
              </div>
            </div>
            <div
              className={styles.card}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <div
                className={pgStyles.insightIcon}
                style={{ background: "#FAECE7", color: "#993C1D" }}
              >
                <FiAlertCircle size={18} />
              </div>
              <div>
                <div className={pgStyles.insightLabel}>
                  Most difficult lesson
                </div>
                <div className={pgStyles.insightVal}>
                  {isLoading
                    ? "—"
                    : (insights.mostDifficultLesson?.lessonTitle ?? "No data")}
                </div>
              </div>
            </div>
            <div
              className={styles.card}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <div
                className={pgStyles.insightIcon}
                style={{ background: "#FAEEDA", color: "#854F0B" }}
              >
                <FiClock size={18} />
              </div>
              <div>
                <div className={pgStyles.insightLabel}>
                  Avg. time per lesson
                </div>
                <div className={pgStyles.insightVal}>
                  {isLoading ? "—" : insights.averageTimePerLessonLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className={pgStyles.chartsRow}>
            <div className={styles.card}>
              <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>
                Completion by lesson
              </div>
              {isLoading ? (
                <div className={styles.loadingText}>Loading...</div>
              ) : (insights.completionByLesson ?? []).length === 0 ? (
                <div className={styles.emptyText}>No data yet.</div>
              ) : (
                <div className={pgStyles.lessonBars}>
                  {(insights.completionByLesson ?? []).map((lesson) => (
                    <div
                      key={lesson.lessonKey}
                      className={pgStyles.lessonBarRow}
                    >
                      <span className={pgStyles.lessonBarLabel}>
                        {lesson.lessonTitle}
                      </span>
                      <div className={styles.miniBarTrack}>
                        <div
                          className={styles.miniBarFill}
                          style={{
                            width: `${clampPercent(lesson.completionPercent)}%`,
                          }}
                        />
                      </div>
                      <span className={pgStyles.lessonBarPct}>
                        {clampPercent(lesson.completionPercent)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>
                Lesson difficulty per student
              </div>
              {isLoading ? (
                <div className={styles.loadingText}>Loading...</div>
              ) : (
                <>
                  <svg
                    viewBox="0 0 360 160"
                    preserveAspectRatio="none"
                    className={pgStyles.chartSvg}
                  >
                    <line
                      x1="0"
                      y1="128"
                      x2="360"
                      y2="128"
                      className={pgStyles.axisLine}
                    />
                    <line
                      x1="0"
                      y1="32"
                      x2="360"
                      y2="32"
                      className={pgStyles.gridLine}
                    />
                    <line
                      x1="0"
                      y1="80"
                      x2="360"
                      y2="80"
                      className={pgStyles.gridLine}
                    />
                    {chartPath && (
                      <path d={chartPath} className={pgStyles.chartPath} />
                    )}
                  </svg>
                  <div className={pgStyles.chartLabels}>
                    {chartSeries.map((l) => (
                      <span key={l.lessonKey}>{l.lessonTitle}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeacherAnalyticsPage;
