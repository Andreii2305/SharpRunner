import { useEffect, useState } from "react";
import axios from "axios";
import { FiAward } from "react-icons/fi";
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

  return (
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
                      <th>Badges</th>
                      <th>Status</th>
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
  );
}

export default TeacherStudentsPage;
