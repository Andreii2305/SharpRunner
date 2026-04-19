import { useEffect, useState } from "react";
import axios from "axios";
import { FiAward, FiX } from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import { clampPercent } from "./TeacherDashboardPage.jsx";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherStudentsPage.module.css";

function TeacherStudentsPage() {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [classrooms, setClassrooms] = useState([]);
  const [gradesModal, setGradesModal] = useState(null);
  const [gradesLoading, setGradesLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(buildApiUrl("/api/teacher/dashboard"), {
          headers: getAuthHeaders(),
        });
        setStudents(res.data?.studentPerformance ?? []);
        setClassrooms(res.data?.classPerformance ?? []);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered =
    filter === "all" ? students : students.filter((s) => s.section === filter);

  const sections = [...new Set(students.map((s) => s.section).filter(Boolean))];

  const openGrades = async (student) => {
    setGradesModal({ studentName: student.studentName || student.username, grades: [] });
    setGradesLoading(true);
    try {
      const res = await axios.get(buildApiUrl(`/api/teacher/students/${student.userId}/grades`), { headers: getAuthHeaders() });
      setGradesModal({ studentName: res.data.studentName, grades: res.data.grades });
    } catch {
      setGradesModal(null);
    } finally {
      setGradesLoading(false);
    }
  };

  return (
    <>
    <div className={styles.root}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.pageHeader}>
          <div className={styles.pageTitle}>Students</div>
          <div className={styles.pageActions}>
            <select
              className={pgStyles.filterSelect}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All sections</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.card}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}>All students</div>
              <div className={styles.sectionSub}>
                {filtered.length} student{filtered.length !== 1 ? "s" : ""}
              </div>
            </div>

            {isLoading ? (
              <div className={styles.loadingText}>Loading students...</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Student name</th>
                      <th>Section</th>
                      <th>Progress</th>
                      <th>Avg. Score</th>
                      <th>Badges</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles.emptyRow}>
                          No students found.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((s) => (
                        <tr key={s.userId}>
                          <td>
                            <span className={pgStyles.rankBadge}>{s.rank}</span>
                          </td>
                          <td>
                            <div className={pgStyles.nameCell}>
                              <div className={pgStyles.stuAv}>
                                {(s.studentName || s.username || "?")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                              <span>{s.studentName || s.username}</span>
                            </div>
                          </td>
                          <td>{s.section}</td>
                          <td>
                            <div className={pgStyles.progressCell}>
                              <div
                                className={styles.miniBarTrack}
                                style={{ width: 80 }}
                              >
                                <div
                                  className={styles.miniBarFill}
                                  style={{
                                    width: `${clampPercent(s.progressPercent)}%`,
                                  }}
                                />
                              </div>
                              <span className={pgStyles.progressPct}>
                                {clampPercent(s.progressPercent)}%
                              </span>
                            </div>
                          </td>
                          <td>
                            {s.avgScore != null ? (
                              <span className={pgStyles.scoreChip}>{s.avgScore}</span>
                            ) : (
                              <span className={pgStyles.scorePending}>—</span>
                            )}
                          </td>
                          <td>
                            <div className={pgStyles.badges}>
                              {Array.from({
                                length: Math.max(1, Math.min(s.badgesCount, 4)),
                              }).map((_, i) => (
                                <FiAward key={`${s.userId}-${i}`} size={13} />
                              ))}
                            </div>
                          </td>
                          <td>
                            <div
                              className={
                                s.status === "inactive"
                                  ? pgStyles.statusInactive
                                  : pgStyles.statusOnline
                              }
                            >
                              {s.statusLabel}
                            </div>
                            <div className={pgStyles.lastActive}>
                              {s.lastActiveLabel}
                            </div>
                          </td>
                          <td>
                            <button className={pgStyles.gradesBtn} onClick={() => openGrades(s)}>
                              Grades
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {gradesModal && (
        <div className={pgStyles.modalBackdrop} onClick={() => setGradesModal(null)}>
          <div className={pgStyles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={pgStyles.modalHeader}>
              <span className={pgStyles.modalTitle}>{gradesModal.studentName} — Grades</span>
              <button className={pgStyles.modalClose} onClick={() => setGradesModal(null)}><FiX /></button>
            </div>
            {gradesLoading ? (
              <div className={styles.loadingText}>Loading...</div>
            ) : (
              <div className={pgStyles.gradeTable}>
                <div className={pgStyles.gradeTableHead}>
                  <span>Level</span><span>Score</span><span>Attempts</span><span>Time</span>
                </div>
                {gradesModal.grades.filter((g) => g.isCompleted).length === 0 ? (
                  <div className={styles.emptyText}>No completed levels yet.</div>
                ) : (
                  gradesModal.grades.filter((g) => g.isCompleted).map((g) => {
                    const mins = Math.floor(g.timeSpentSeconds / 60);
                    const secs = g.timeSpentSeconds % 60;
                    const timeStr = `${mins}m ${secs}s`;
                    return (
                      <div key={g.levelKey} className={pgStyles.gradeTableRow}>
                        <span>Lv {g.orderIndex}</span>
                        <span
                          className={pgStyles.gradeChip}
                          style={{
                            color: g.finalScore >= 90 ? "#0F6E56" : g.finalScore >= 75 ? "#854F0B" : "#993C1D",
                            background: g.finalScore >= 90 ? "#E1F5EE" : g.finalScore >= 75 ? "#FAEEDA" : "#FAECE7",
                          }}
                        >
                          {g.finalScore ?? "—"}
                        </span>
                        <span>{g.attemptCount} fail{g.attemptCount !== 1 ? "s" : ""}</span>
                        <span>{timeStr}</span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
    )}
    </>
  );
}

export default TeacherStudentsPage;
