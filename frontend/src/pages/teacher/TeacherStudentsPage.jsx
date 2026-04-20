import { useEffect, useState } from "react";
import axios from "axios";
import { FiAward, FiX, FiDownload } from "react-icons/fi";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import { clampPercent } from "./TeacherDashboardPage.jsx";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherStudentsPage.module.css";

const TABS = [
  { key: "list",    label: "Student List" },
  { key: "gradebook", label: "Gradebook" },
  { key: "lessons", label: "Lesson Averages" },
];

const getLessonKey = (levelKey) => levelKey.split("-level-")[0];
const getLessonTitle = (lessonKey) =>
  lessonKey.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function TeacherStudentsPage() {
  const [students, setStudents]     = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [filter, setFilter]         = useState("all");
  const [classrooms, setClassrooms] = useState([]);
  const [activeTab, setActiveTab]   = useState("list");
  const [allGrades, setAllGrades]   = useState(null);   // Map<userId, grades[]>
  const [tabLoading, setTabLoading] = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [gradesModal, setGradesModal]   = useState(null);
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

  const filtered = filter === "all" ? students : students.filter((s) => s.section === filter);
  const sections = [...new Set(students.map((s) => s.section).filter(Boolean))];

  // ── Shared grade data for tabs 2 & 3 ─────────────────────────────────────
  const ensureGradesLoaded = async (students) => {
    if (allGrades !== null) return allGrades;
    setTabLoading(true);
    try {
      const results = await Promise.all(
        students.map(async (s) => {
          try {
            const res = await axios.get(
              buildApiUrl(`/api/teacher/students/${s.userId}/grades`),
              { headers: getAuthHeaders() },
            );
            return { studentId: s.userId, grades: res.data.grades ?? [] };
          } catch {
            return { studentId: s.userId, grades: [] };
          }
        }),
      );
      const map = new Map(results.map((r) => [r.studentId, r.grades]));
      setAllGrades(map);
      return map;
    } finally {
      setTabLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== "list" && allGrades === null) ensureGradesLoaded(filtered);
  };

  // ── Column builders ───────────────────────────────────────────────────────
  const buildLevelColumns = (gradesMap) => {
    const levelMap = new Map();
    for (const grades of gradesMap.values()) {
      for (const g of grades) {
        if (!levelMap.has(g.levelKey))
          levelMap.set(g.levelKey, { levelKey: g.levelKey, orderIndex: g.orderIndex });
      }
    }
    return Array.from(levelMap.values()).sort((a, b) => a.orderIndex - b.orderIndex);
  };

  const buildLessonColumns = (gradesMap) => {
    const seen = new Map();
    for (const grades of gradesMap.values()) {
      for (const g of grades) {
        const lk = getLessonKey(g.levelKey);
        if (!seen.has(lk)) seen.set(lk, getLessonTitle(lk));
      }
    }
    return Array.from(seen.entries()).map(([key, title]) => ({ key, title }));
  };

  const computeLessonAvg = (grades, lessonKey) => {
    const scores = grades
      .filter((g) => getLessonKey(g.levelKey) === lessonKey && g.isCompleted && g.finalScore != null)
      .map((g) => g.finalScore);
    if (scores.length === 0) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  };

  // ── Export helpers ────────────────────────────────────────────────────────
  const sectionLabel = filter === "all" ? "All Sections" : `Section ${filter}`;
  const exportDate   = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const fileSlug     = `grades_${filter === "all" ? "all" : filter}_${new Date().toISOString().slice(0, 10)}`;

  const pdfHeader = (doc, title) => {
    doc.setFontSize(16);
    doc.setTextColor(26, 54, 93);
    doc.text(title, 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(`${sectionLabel}   ·   Exported ${exportDate}`, 14, 23);
  };

  const downloadPDF = async () => {
    setExporting(true);
    try {
      if (activeTab === "list") {
        const doc = new jsPDF();
        pdfHeader(doc, "SharpRunner — Student List");
        autoTable(doc, {
          startY: 30,
          head: [["Rank", "Student Name", "Section", "Progress", "Avg Score"]],
          body: filtered.map((s) => [
            s.rank ?? "—",
            s.studentName || s.username,
            s.section || "—",
            `${clampPercent(s.progressPercent)}%`,
            s.avgScore != null ? s.avgScore : "—",
          ]),
          headStyles: { fillColor: [38, 84, 124], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { fontSize: 10, cellPadding: 4 },
          columnStyles: {
            0: { halign: "center", cellWidth: 18 },
            3: { halign: "center", cellWidth: 28 },
            4: { halign: "center", cellWidth: 28 },
          },
        });
        doc.save(`${fileSlug}_list.pdf`);

      } else if (activeTab === "gradebook") {
        const gradesMap  = await ensureGradesLoaded(filtered);
        const levelCols  = buildLevelColumns(gradesMap);
        const doc = new jsPDF({ orientation: "landscape" });
        pdfHeader(doc, "SharpRunner — Gradebook (Per Level)");
        autoTable(doc, {
          startY: 30,
          head: [["Student Name", "Section", ...levelCols.map((l) => `Lv ${l.orderIndex}`), "Avg"]],
          body: filtered.map((s) => {
            const grades = gradesMap.get(s.userId) ?? [];
            const byKey  = new Map(grades.map((g) => [g.levelKey, g]));
            return [
              s.studentName || s.username,
              s.section || "—",
              ...levelCols.map((l) => {
                const g = byKey.get(l.levelKey);
                return g?.isCompleted && g?.finalScore != null ? g.finalScore : "—";
              }),
              s.avgScore ?? "—",
            ];
          }),
          headStyles: { fillColor: [38, 84, 124], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { fontSize: 9, cellPadding: 3, halign: "center" },
          columnStyles: { 0: { halign: "left", cellWidth: 50 }, 1: { halign: "left", cellWidth: 24 } },
        });
        doc.save(`${fileSlug}_gradebook.pdf`);

      } else if (activeTab === "lessons") {
        const gradesMap   = await ensureGradesLoaded(filtered);
        const lessonCols  = buildLessonColumns(gradesMap);
        const doc = new jsPDF({ orientation: "landscape" });
        pdfHeader(doc, "SharpRunner — Lesson Averages");
        autoTable(doc, {
          startY: 30,
          head: [["Student Name", "Section", ...lessonCols.map((l) => l.title), "Overall Avg"]],
          body: filtered.map((s) => {
            const grades = gradesMap.get(s.userId) ?? [];
            return [
              s.studentName || s.username,
              s.section || "—",
              ...lessonCols.map((l) => computeLessonAvg(grades, l.key) ?? "—"),
              s.avgScore ?? "—",
            ];
          }),
          headStyles: { fillColor: [38, 84, 124], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { fontSize: 9, cellPadding: 3, halign: "center" },
          columnStyles: { 0: { halign: "left", cellWidth: 50 }, 1: { halign: "left", cellWidth: 24 } },
        });
        doc.save(`${fileSlug}_lesson_avg.pdf`);
      }
    } finally {
      setExporting(false);
    }
  };

  const downloadExcel = async () => {
    setExporting(true);
    try {
      if (activeTab === "list") {
        const rows = [
          ["Rank", "Student Name", "Section", "Progress (%)", "Avg Score"],
          ...filtered.map((s) => [
            s.rank ?? "",
            s.studentName || s.username,
            s.section || "",
            clampPercent(s.progressPercent),
            s.avgScore ?? "",
          ]),
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Student List");
        XLSX.writeFile(wb, `${fileSlug}_list.xlsx`);

      } else if (activeTab === "gradebook") {
        const gradesMap = await ensureGradesLoaded(filtered);
        const levelCols = buildLevelColumns(gradesMap);
        const rows = [
          ["Student Name", "Section", ...levelCols.map((l) => `Level ${l.orderIndex}`), "Avg Score"],
          ...filtered.map((s) => {
            const grades = gradesMap.get(s.userId) ?? [];
            const byKey  = new Map(grades.map((g) => [g.levelKey, g]));
            return [
              s.studentName || s.username,
              s.section || "",
              ...levelCols.map((l) => {
                const g = byKey.get(l.levelKey);
                return g?.isCompleted && g?.finalScore != null ? g.finalScore : "";
              }),
              s.avgScore ?? "",
            ];
          }),
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Gradebook");
        XLSX.writeFile(wb, `${fileSlug}_gradebook.xlsx`);

      } else if (activeTab === "lessons") {
        const gradesMap  = await ensureGradesLoaded(filtered);
        const lessonCols = buildLessonColumns(gradesMap);
        const rows = [
          ["Student Name", "Section", ...lessonCols.map((l) => l.title), "Overall Avg"],
          ...filtered.map((s) => {
            const grades = gradesMap.get(s.userId) ?? [];
            return [
              s.studentName || s.username,
              s.section || "",
              ...lessonCols.map((l) => computeLessonAvg(grades, l.key) ?? ""),
              s.avgScore ?? "",
            ];
          }),
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Lesson Averages");
        XLSX.writeFile(wb, `${fileSlug}_lesson_avg.xlsx`);
      }
    } finally {
      setExporting(false);
    }
  };

  // ── Grades modal ──────────────────────────────────────────────────────────
  const openGrades = async (student) => {
    setGradesModal({ studentName: student.studentName || student.username, grades: [] });
    setGradesLoading(true);
    try {
      const res = await axios.get(
        buildApiUrl(`/api/teacher/students/${student.userId}/grades`),
        { headers: getAuthHeaders() },
      );
      setGradesModal({ studentName: res.data.studentName, grades: res.data.grades });
    } catch {
      setGradesModal(null);
    } finally {
      setGradesLoading(false);
    }
  };

  // ── Tab content ───────────────────────────────────────────────────────────
  const renderList = () => (
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
            <tr><td colSpan={8} className={styles.emptyRow}>No students found.</td></tr>
          ) : (
            filtered.map((s) => (
              <tr key={s.userId}>
                <td><span className={pgStyles.rankBadge}>{s.rank}</span></td>
                <td>
                  <div className={pgStyles.nameCell}>
                    <div className={pgStyles.stuAv}>
                      {(s.studentName || s.username || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <span>{s.studentName || s.username}</span>
                  </div>
                </td>
                <td>{s.section}</td>
                <td>
                  <div className={pgStyles.progressCell}>
                    <div className={styles.miniBarTrack} style={{ width: 80 }}>
                      <div className={styles.miniBarFill} style={{ width: `${clampPercent(s.progressPercent)}%` }} />
                    </div>
                    <span className={pgStyles.progressPct}>{clampPercent(s.progressPercent)}%</span>
                  </div>
                </td>
                <td>
                  {s.avgScore != null
                    ? <span className={pgStyles.scoreChip}>{s.avgScore}</span>
                    : <span className={pgStyles.scorePending}>—</span>}
                </td>
                <td>
                  <div className={pgStyles.badges}>
                    {Array.from({ length: Math.max(1, Math.min(s.badgesCount, 4)) }).map((_, i) => (
                      <FiAward key={`${s.userId}-${i}`} size={13} />
                    ))}
                  </div>
                </td>
                <td>
                  <div className={s.status === "inactive" ? pgStyles.statusInactive : pgStyles.statusOnline}>
                    {s.statusLabel}
                  </div>
                  <div className={pgStyles.lastActive}>{s.lastActiveLabel}</div>
                </td>
                <td>
                  <button className={pgStyles.gradesBtn} onClick={() => openGrades(s)}>Grades</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderGradebook = () => {
    if (tabLoading || allGrades === null) return <div className={styles.loadingText}>Loading grades…</div>;
    const levelCols = buildLevelColumns(allGrades);
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Student name</th>
              <th>Section</th>
              {levelCols.map((l) => <th key={l.levelKey}>Lv {l.orderIndex}</th>)}
              <th>Avg</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={3 + levelCols.length} className={styles.emptyRow}>No students found.</td></tr>
            ) : (
              filtered.map((s) => {
                const grades = allGrades.get(s.userId) ?? [];
                const byKey  = new Map(grades.map((g) => [g.levelKey, g]));
                return (
                  <tr key={s.userId}>
                    <td>
                      <div className={pgStyles.nameCell}>
                        <div className={pgStyles.stuAv}>
                          {(s.studentName || s.username || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <span>{s.studentName || s.username}</span>
                      </div>
                    </td>
                    <td>{s.section}</td>
                    {levelCols.map((l) => {
                      const g = byKey.get(l.levelKey);
                      const score = g?.isCompleted && g?.finalScore != null ? g.finalScore : null;
                      return (
                        <td key={l.levelKey} style={{ textAlign: "center" }}>
                          {score != null
                            ? <span className={pgStyles.gradeChip} style={{
                                color: score >= 90 ? "#0F6E56" : score >= 75 ? "#854F0B" : "#993C1D",
                                background: score >= 90 ? "#E1F5EE" : score >= 75 ? "#FAEEDA" : "#FAECE7",
                              }}>{score}</span>
                            : <span className={pgStyles.scorePending}>—</span>}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "center" }}>
                      {s.avgScore != null
                        ? <span className={pgStyles.scoreChip}>{s.avgScore}</span>
                        : <span className={pgStyles.scorePending}>—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderLessonAverages = () => {
    if (tabLoading || allGrades === null) return <div className={styles.loadingText}>Loading grades…</div>;
    const lessonCols = buildLessonColumns(allGrades);
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Student name</th>
              <th>Section</th>
              {lessonCols.map((l) => <th key={l.key}>{l.title}</th>)}
              <th>Overall Avg</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={3 + lessonCols.length} className={styles.emptyRow}>No students found.</td></tr>
            ) : (
              filtered.map((s) => {
                const grades = allGrades.get(s.userId) ?? [];
                return (
                  <tr key={s.userId}>
                    <td>
                      <div className={pgStyles.nameCell}>
                        <div className={pgStyles.stuAv}>
                          {(s.studentName || s.username || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <span>{s.studentName || s.username}</span>
                      </div>
                    </td>
                    <td>{s.section}</td>
                    {lessonCols.map((l) => {
                      const avg = computeLessonAvg(grades, l.key);
                      return (
                        <td key={l.key} style={{ textAlign: "center" }}>
                          {avg != null
                            ? <span className={pgStyles.gradeChip} style={{
                                color: avg >= 90 ? "#0F6E56" : avg >= 75 ? "#854F0B" : "#993C1D",
                                background: avg >= 90 ? "#E1F5EE" : avg >= 75 ? "#FAEEDA" : "#FAECE7",
                              }}>{avg}</span>
                            : <span className={pgStyles.scorePending}>—</span>}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "center" }}>
                      {s.avgScore != null
                        ? <span className={pgStyles.scoreChip}>{s.avgScore}</span>
                        : <span className={pgStyles.scorePending}>—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
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
                {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.body}>
            <div className={styles.card}>
              {/* Tab navigation */}
              <div className={pgStyles.tabRow}>
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    className={activeTab === t.key ? pgStyles.tabActive : pgStyles.tab}
                    onClick={() => handleTabChange(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
                <div className={pgStyles.tabSpacer} />
                <span className={pgStyles.tabCount}>
                  {filtered.length} student{filtered.length !== 1 ? "s" : ""}
                </span>
                <div className={pgStyles.exportGroup}>
                  <FiDownload size={13} />
                  <button
                    className={pgStyles.exportBtn}
                    onClick={downloadPDF}
                    disabled={exporting || filtered.length === 0}
                  >
                    {exporting ? "…" : "PDF"}
                  </button>
                  <button
                    className={pgStyles.exportBtn}
                    onClick={downloadExcel}
                    disabled={exporting || filtered.length === 0}
                  >
                    {exporting ? "…" : "Excel"}
                  </button>
                </div>
              </div>

              {/* Tab content */}
              {isLoading ? (
                <div className={styles.loadingText}>Loading students…</div>
              ) : (
                <>
                  {activeTab === "list"      && renderList()}
                  {activeTab === "gradebook" && renderGradebook()}
                  {activeTab === "lessons"   && renderLessonAverages()}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Grades modal */}
      {gradesModal && (
        <div className={pgStyles.modalBackdrop} onClick={() => setGradesModal(null)}>
          <div className={pgStyles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={pgStyles.modalHeader}>
              <span className={pgStyles.modalTitle}>{gradesModal.studentName} — Grades</span>
              <button className={pgStyles.modalClose} onClick={() => setGradesModal(null)}><FiX /></button>
            </div>
            {gradesLoading ? (
              <div className={styles.loadingText}>Loading…</div>
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
                    return (
                      <div key={g.levelKey} className={pgStyles.gradeTableRow}>
                        <span>Lv {g.orderIndex}</span>
                        <span
                          className={pgStyles.gradeChip}
                          style={{
                            color:       g.finalScore >= 90 ? "#0F6E56" : g.finalScore >= 75 ? "#854F0B" : "#993C1D",
                            background:  g.finalScore >= 90 ? "#E1F5EE" : g.finalScore >= 75 ? "#FAEEDA" : "#FAECE7",
                          }}
                        >
                          {g.finalScore ?? "—"}
                        </span>
                        <span>{g.attemptCount} fail{g.attemptCount !== 1 ? "s" : ""}</span>
                        <span>{mins}m {secs}s</span>
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
