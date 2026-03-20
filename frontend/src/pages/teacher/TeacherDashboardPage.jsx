import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  FiActivity,
  FiAlertCircle,
  FiAward,
  FiBarChart2,
  FiBookOpen,
  FiClock,
  FiGrid,
  FiUsers,
} from "react-icons/fi";
import {
  buildApiUrl,
  clearToken,
  getAuthHeaders,
} from "../../utils/auth";
import styles from "./TeacherDashboardPage.module.css";

const SECTION_OPTIONS = [
  "BSIT 1A",
  "BSIT 1B",
  "BSIT 1C",
  "BSIT 1D",
  "BSIT 1E",
  "BSIT 2A",
  "BSIT 2B",
  "BSIT 3A",
  "BSIT 4A",
];

const clampPercent = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(numericValue)));
};

const buildChartPath = (series, width = 360, height = 160) => {
  if (!Array.isArray(series) || series.length === 0) {
    return "";
  }

  const stepX = series.length > 1 ? width / (series.length - 1) : width;
  const points = series.map((item, index) => {
    const score = clampPercent(item.difficultyScore);
    const x = index * stepX;
    const y = height - (score / 100) * height;
    return { x, y };
  });

  return points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(" ");
};

function TeacherDashboardPage() {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdClassCode, setCreatedClassCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [classroomForm, setClassroomForm] = useState({
    className: "",
    section: "",
    schoolYear: "",
    maxStudents: "",
    description: "",
  });

  useEffect(() => {
    const fetchDashboard = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await axios.get(buildApiUrl("/api/teacher/dashboard"), {
          headers: getAuthHeaders(),
        });
        setDashboardData(response.data);
      } catch (error) {
        setErrorMessage(
          error.response?.data?.message ??
            "Failed to load teacher dashboard data."
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const onSignOut = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  const onClassroomFieldChange = (event) => {
    const { name, value } = event.target;
    setClassroomForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const onCreateClassroom = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!classroomForm.className.trim()) {
      setErrorMessage("Class name is required.");
      return;
    }

    if (!classroomForm.section.trim()) {
      setErrorMessage("Section is required.");
      return;
    }

    if (!classroomForm.schoolYear.trim()) {
      setErrorMessage("School year is required.");
      return;
    }

    setIsCreatingClass(true);

    try {
      const response = await axios.post(
        buildApiUrl("/api/teacher/classrooms"),
        {
          className: classroomForm.className.trim(),
          section: classroomForm.section.trim(),
          schoolYear: classroomForm.schoolYear.trim(),
          maxStudents: classroomForm.maxStudents.trim(),
          description: classroomForm.description.trim(),
        },
        {
          headers: getAuthHeaders(),
        }
      );

      setCreatedClassCode(response.data?.classroom?.classCode ?? "");
      setShowCreateClassModal(false);
      setShowSuccessModal(true);
      setClassroomForm({
        className: "",
        section: "",
        schoolYear: "",
        maxStudents: "",
        description: "",
      });

      const refreshed = await axios.get(buildApiUrl("/api/teacher/dashboard"), {
        headers: getAuthHeaders(),
      });
      setDashboardData(refreshed.data);
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ?? "Failed to create classroom."
      );
    } finally {
      setIsCreatingClass(false);
    }
  };

  const overview = dashboardData?.overview ?? {
    totalStudents: 0,
    totalClassrooms: 0,
    averageProgressPercent: 0,
    activeStudentsToday: 0,
  };
  const classPerformance = dashboardData?.classPerformance ?? [];
  const studentPerformance = dashboardData?.studentPerformance ?? [];
  const lessonInsights = dashboardData?.lessonInsights ?? {
    mostCompletedLesson: null,
    mostDifficultLesson: null,
    averageTimePerLessonLabel: "Not enough data",
    completionByLesson: [],
    difficultyByLesson: [],
  };

  const chartSeries = lessonInsights.difficultyByLesson ?? [];
  const chartPath = useMemo(() => buildChartPath(chartSeries), [chartSeries]);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.topbar}>
          <h1>SharpRunner</h1>
          <nav className={styles.nav}>
            <button type="button" className={styles.navActive}>
              Dashboard
            </button>
            <button type="button" className={styles.navButton}>
              Classes
            </button>
            <button type="button" className={styles.navButton}>
              Account
            </button>
            <button
              type="button"
              className={styles.logoutButton}
              onClick={onSignOut}
            >
              Logout
            </button>
          </nav>
        </header>

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}

        <section className={styles.panel}>
          <h2>Overview</h2>
          {isLoading ? (
            <p className={styles.feedback}>Loading overview...</p>
          ) : (
            <div className={styles.overviewGrid}>
              <article className={`${styles.infoCard} ${styles.primaryCard}`}>
                <p className={styles.cardTitle}>
                  <FiUsers size={14} />
                  <span>Total of Students</span>
                </p>
                <p className={styles.cardValue}>{overview.totalStudents}</p>
              </article>

              <article className={styles.infoCard}>
                <div className={styles.cardTopRow}>
                  <p className={styles.cardTitle}>
                    <FiGrid size={14} />
                    <span>Total of Classrooms</span>
                  </p>
                  <button
                    type="button"
                    className={styles.smallAction}
                    onClick={() => setShowCreateClassModal(true)}
                  >
                    new class
                  </button>
                </div>
                <p className={styles.cardValue}>{overview.totalClassrooms}</p>
              </article>

              <article className={styles.infoCard}>
                <p className={styles.cardTitle}>
                  <FiBarChart2 size={14} />
                  <span>Average Progress</span>
                </p>
                <div className={styles.progressRow}>
                  <p className={styles.cardValue}>
                    {clampPercent(overview.averageProgressPercent)}%
                  </p>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{
                        width: `${clampPercent(overview.averageProgressPercent)}%`,
                      }}
                    />
                  </div>
                </div>
              </article>

              <article className={styles.infoCard}>
                <p className={styles.cardTitle}>
                  <FiActivity size={14} />
                  <span>Active Students Today</span>
                </p>
                <p className={styles.cardValue}>{overview.activeStudentsToday}</p>
              </article>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h2>Overall Class Performance</h2>

          {classPerformance.length === 0 ? (
            <p className={styles.feedback}>
              No classrooms yet. Click <strong>new class</strong> to create your first class.
            </p>
          ) : (
            classPerformance.map((item) => (
              <article key={item.classId ?? item.className} className={styles.classCard}>
                <div>
                  <h3>{item.className}</h3>
                  <p>
                    <FiUsers size={13} />
                    <span>{item.studentCount} students</span>
                  </p>
                  <p className={styles.classMeta}>
                    Section: {item.section || "General Section"} | SY:{" "}
                    {item.schoolYear || "N/A"} | Code:{" "}
                    <strong>{item.classCode || "N/A"}</strong>
                  </p>
                </div>
                <div className={styles.classProgressWrap}>
                  <span>
                    Average Progress: {clampPercent(item.averageProgressPercent)}%
                  </span>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${clampPercent(item.averageProgressPercent)}%` }}
                    />
                  </div>
                </div>
              </article>
            ))
          )}

          {isLoading ? (
            <p className={styles.feedback}>Loading student rows...</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Student Name</th>
                    <th>Section</th>
                    <th>Progress</th>
                    <th>Badges</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {studentPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.emptyRow}>
                        No student progress data yet.
                      </td>
                    </tr>
                  ) : (
                    studentPerformance.map((student) => (
                      <tr key={student.userId}>
                        <td>{student.rank}</td>
                        <td>{student.studentName || student.username}</td>
                        <td>{student.section}</td>
                        <td>
                          <div className={styles.tableProgress}>
                            <span>{clampPercent(student.progressPercent)}%</span>
                            <div className={styles.progressTrack}>
                              <div
                                className={styles.progressFill}
                                style={{
                                  width: `${clampPercent(student.progressPercent)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.badges}>
                            {Array.from({
                              length: Math.max(1, Math.min(student.badgesCount, 4)),
                            }).map((_, index) => (
                              <FiAward key={`${student.userId}-${index}`} size={14} />
                            ))}
                          </div>
                        </td>
                        <td>
                          <p
                            className={
                              student.status === "inactive"
                                ? styles.inactiveText
                                : styles.onlineText
                            }
                          >
                            {student.statusLabel}
                          </p>
                          <p className={styles.subStatus}>{student.lastActiveLabel}</p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h2>Overall Lesson Insight</h2>
          <div className={styles.insightTopRow}>
            <article className={styles.insightCard}>
              <p className={styles.insightTitle}>
                <FiBookOpen size={16} />
                <span>Most Completed Lesson</span>
              </p>
              <p className={styles.insightValue}>
                {lessonInsights.mostCompletedLesson?.lessonTitle ?? "No data"}
              </p>
            </article>
            <article className={styles.insightCard}>
              <p className={styles.insightTitle}>
                <FiAlertCircle size={16} />
                <span>Most Difficult Lesson</span>
              </p>
              <p className={styles.insightValue}>
                {lessonInsights.mostDifficultLesson?.lessonTitle ?? "No data"}
              </p>
            </article>
            <article className={styles.insightCard}>
              <p className={styles.insightTitle}>
                <FiClock size={16} />
                <span>Average time per lesson</span>
              </p>
              <p className={styles.insightValue}>
                {lessonInsights.averageTimePerLessonLabel}
              </p>
            </article>
          </div>

          <div className={styles.insightBottomRow}>
            <article className={styles.chartCard}>
              <h3>Completion by Lesson</h3>
              <div className={styles.lessonBars}>
                {(lessonInsights.completionByLesson ?? []).map((lesson) => (
                  <div key={lesson.lessonKey} className={styles.lessonBarRow}>
                    <span>{lesson.lessonTitle}</span>
                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${clampPercent(lesson.completionPercent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.chartCard}>
              <h3>Lesson Difficulty per Student</h3>
              <div className={styles.lineChartWrap}>
                <svg
                  viewBox="0 0 360 200"
                  preserveAspectRatio="none"
                  className={styles.chartSvg}
                >
                  <line x1="0" y1="160" x2="360" y2="160" className={styles.axisLine} />
                  <line x1="0" y1="40" x2="360" y2="40" className={styles.gridLine} />
                  <line x1="0" y1="100" x2="360" y2="100" className={styles.gridLine} />
                  {chartPath ? (
                    <path d={chartPath} className={styles.chartPath} />
                  ) : null}
                </svg>
                <div className={styles.chartLabels}>
                  {chartSeries.map((lesson) => (
                    <span key={lesson.lessonKey}>{lesson.lessonTitle}</span>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>

      {showCreateClassModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalCard}>
            <h3>Create New Class</h3>
            <form onSubmit={onCreateClassroom} className={styles.modalForm}>
              <label>
                <span>Class Name</span>
                <input
                  type="text"
                  name="className"
                  value={classroomForm.className}
                  onChange={onClassroomFieldChange}
                  placeholder="e.g. BSIT - C# Fundamentals"
                />
              </label>
              <label>
                <span>Section</span>
                <select
                  name="section"
                  value={classroomForm.section}
                  onChange={onClassroomFieldChange}
                >
                  <option value="">Choose section</option>
                  {SECTION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>School Year</span>
                <input
                  type="text"
                  name="schoolYear"
                  value={classroomForm.schoolYear}
                  onChange={onClassroomFieldChange}
                  placeholder="e.g. 2025-2026"
                />
              </label>
              <label>
                <span>Maximum Student (Optional)</span>
                <input
                  type="number"
                  name="maxStudents"
                  value={classroomForm.maxStudents}
                  onChange={onClassroomFieldChange}
                  min={1}
                  placeholder="Max student"
                />
              </label>
              <label>
                <span>Description (Optional)</span>
                <input
                  type="text"
                  name="description"
                  value={classroomForm.description}
                  onChange={onClassroomFieldChange}
                  placeholder="Short description"
                />
              </label>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalCancel}
                  onClick={() => setShowCreateClassModal(false)}
                  disabled={isCreatingClass}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.modalSubmit}
                  disabled={isCreatingClass}
                >
                  {isCreatingClass ? "Creating..." : "Create Class"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.successModalCard}>
            <h3>Success!</h3>
            <p>Successfully created new Classroom!</p>
            <p className={styles.successCode}>
              Classroom Code: <strong>{createdClassCode || "N/A"}</strong>
            </p>
            <button
              type="button"
              className={styles.modalSubmit}
              onClick={() => setShowSuccessModal(false)}
            >
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherDashboardPage;
