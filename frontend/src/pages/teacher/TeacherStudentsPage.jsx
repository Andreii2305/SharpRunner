import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  FiActivity,
  FiAlertCircle,
  FiAward,
  FiBookOpen,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiEye,
  FiSearch,
  FiTrendingUp,
  FiUsers,
  FiX,
} from "react-icons/fi";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import { clampPercent } from "./TeacherShared.jsx";
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

const titleCase = (value = "") => value
  .trim()
  .split(/\s+/)
  .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "")
  .join(" ");

const getStudentName = (student) => titleCase(student.studentName || student.username || "Student");

const getPerformance = (student) => {
  const progress = clampPercent(student.progressPercent);
  if (progress === 0) return { key: "attention", label: "Needs attention" };
  if (progress === 100) return { key: "completed", label: "Completed" };
  if (progress < 25) return { key: "behind", label: "Falling behind" };
  return { key: "track", label: "On track" };
};

const PAGE_SIZE = 8;

function TeacherStudentsPage() {
  const [students, setStudents]     = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [filter, setFilter]         = useState("all");
  const [search, setSearch]         = useState("");
  const [performanceFilter, setPerformanceFilter] = useState("all");
  const [sortBy, setSortBy]         = useState("progress-desc");
  const [page, setPage]             = useState(1);
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
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const sections = [...new Set(students.map((s) => s.section).filter(Boolean))];
  const sectionStudents = filter === "all" ? students : students.filter((s) => s.section === filter);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = sectionStudents.filter((student) => {
      const matchesSearch = !query || [student.studentName, student.username, student.section, student.classroomName]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesPerformance = performanceFilter === "all" || getPerformance(student).key === performanceFilter;
      return matchesSearch && matchesPerformance;
    });
    return [...matching].sort((a, b) => {
      if (sortBy === "name-asc") return getStudentName(a).localeCompare(getStudentName(b));
      if (sortBy === "score-desc") return (b.avgScore ?? -1) - (a.avgScore ?? -1);
      if (sortBy === "activity-desc") return new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0);
      return clampPercent(b.progressPercent) - clampPercent(a.progressPercent)
        || (b.completedLevels ?? 0) - (a.completedLevels ?? 0);
    });
  }, [sectionStudents, search, performanceFilter, sortBy]);

  useEffect(() => setPage(1), [filter, search, performanceFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedStudents = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const scoredStudents = sectionStudents.filter((student) => student.avgScore != null);
  const averageScore = scoredStudents.length
    ? Math.round(scoredStudents.reduce((sum, student) => sum + Number(student.avgScore), 0) / scoredStudents.length)
    : null;
  const averageProgress = sectionStudents.length
    ? Math.round(sectionStudents.reduce((sum, student) => sum + clampPercent(student.progressPercent), 0) / sectionStudents.length)
    : 0;
  const attentionStudents = sectionStudents.filter((student) => ["attention", "behind"].includes(getPerformance(student).key));
  const activeNow = sectionStudents.filter((student) => student.isCurrentlyPlaying).length;

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
    if (tab !== "list" && allGrades === null) ensureGradesLoaded(students);
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
    setGradesModal({ student, studentName: getStudentName(student), grades: [] });
    setGradesLoading(true);
    try {
      const res = await axios.get(
        buildApiUrl(`/api/teacher/students/${student.userId}/grades`),
        { headers: getAuthHeaders() },
      );
      setGradesModal({ student, studentName: titleCase(res.data.studentName || getStudentName(student)), grades: res.data.grades });
    } catch {
      setGradesModal(null);
    } finally {
      setGradesLoading(false);
    }
  };

  // ── Tab content ───────────────────────────────────────────────────────────
  const renderList = () => (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${pgStyles.studentTable}`}>
        <caption className={pgStyles.srOnly}>Student progress, performance, awards, and activity</caption>
        <thead>
          <tr>
            <th>Student name</th><th>Section</th><th>Progress</th><th>Average score</th>
            <th>Badges</th><th>Performance</th><th>Activity</th><th><span className={pgStyles.srOnly}>Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={8} className={styles.emptyRow}>No students match the current filters.</td></tr>
          ) : pagedStudents.map((student) => {
            const performance = getPerformance(student);
            return (
              <tr key={student.userId} className={pgStyles.studentRow}>
                <td><div className={pgStyles.nameCell}>
                  <div className={pgStyles.stuAv}>{getStudentName(student).split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
                  <button type="button" className={pgStyles.studentNameBtn} onClick={() => openGrades(student)}>{getStudentName(student)}</button>
                </div></td>
                <td>{student.section || "No section"}</td>
                <td><div className={pgStyles.progressCell}>
                  <div className={styles.miniBarTrack} style={{ width: 92 }} aria-hidden="true"><div className={styles.miniBarFill} style={{ width: `${clampPercent(student.progressPercent)}%` }} /></div>
                  <span className={pgStyles.progressPct}>{clampPercent(student.progressPercent)}%</span>
                </div></td>
                <td>{student.avgScore != null
                  ? <div><span className={pgStyles.scoreChip}>{student.avgScore}%</span><small className={pgStyles.metricContext}>{student.completedLevels} completed</small></div>
                  : <span className={pgStyles.scorePending}>No graded work</span>}</td>
                <td><div className={pgStyles.badges} title={`${student.badgesCount || 0} badge${student.badgesCount === 1 ? "" : "s"} earned`}>
                  <FiAward size={14} aria-hidden="true" /><span>{student.badgesCount || 0} badge{student.badgesCount === 1 ? "" : "s"}</span>
                </div></td>
                <td><span className={`${pgStyles.performanceChip} ${pgStyles[`performance_${performance.key}`]}`}>{performance.label}</span></td>
                <td>{student.isCurrentlyPlaying
                  ? <span className={pgStyles.playingStatus}><span aria-hidden="true" /> Playing now</span>
                  : <span className={pgStyles.lastActive}>Last active {student.lastActiveLabel || "unknown"}</span>}</td>
                <td><button className={pgStyles.viewBtn} onClick={() => openGrades(student)} aria-label={`View ${getStudentName(student)} details`}><FiEye aria-hidden="true" /> View</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filtered.length > PAGE_SIZE && <div className={pgStyles.pagination}>
        <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
        <div><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} aria-label="Previous page"><FiChevronLeft /></button>
          <span>Page {page} of {totalPages}</span>
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages} aria-label="Next page"><FiChevronRight /></button></div>
      </div>}
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
            <section className={pgStyles.summaryGrid} aria-label="Student overview">
              <div className={pgStyles.summaryCard}><span className={pgStyles.summaryIcon}><FiUsers /></span><div><strong>{sectionStudents.length}</strong><span>Total students</span><small>{filter === "all" ? `${sections.length} section${sections.length === 1 ? "" : "s"}` : filter}</small></div></div>
              <div className={pgStyles.summaryCard}><span className={pgStyles.summaryIcon}><FiTrendingUp /></span><div><strong>{averageProgress}%</strong><span>Average progress</span><small>Across assigned levels</small></div></div>
              <div className={pgStyles.summaryCard}><span className={pgStyles.summaryIcon}><FiBookOpen /></span><div><strong>{averageScore == null ? "—" : `${averageScore}%`}</strong><span>Class average</span><small>{scoredStudents.length} with graded work</small></div></div>
              <div className={`${pgStyles.summaryCard} ${attentionStudents.length ? pgStyles.summaryWarning : ""}`}><span className={pgStyles.summaryIcon}><FiAlertCircle /></span><div><strong>{attentionStudents.length}</strong><span>Need attention</span><small>Below 25% progress</small></div></div>
              <div className={pgStyles.summaryCard}><span className={pgStyles.summaryIcon}><FiActivity /></span><div><strong>{activeNow}</strong><span>Playing now</span><small>Live game activity</small></div></div>
            </section>

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

              {activeTab === "list" && <div className={pgStyles.toolbar}>
                <label className={pgStyles.searchBox}>
                  <FiSearch aria-hidden="true" />
                  <span className={pgStyles.srOnly}>Search students</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students or sections…" />
                  {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><FiX /></button>}
                </label>
                <label><span className={pgStyles.srOnly}>Filter by performance</span><select className={pgStyles.filterSelect} value={performanceFilter} onChange={(event) => setPerformanceFilter(event.target.value)}>
                  <option value="all">All performance</option><option value="attention">Needs attention</option><option value="behind">Falling behind</option><option value="track">On track</option><option value="completed">Completed</option>
                </select></label>
                <label><span className={pgStyles.srOnly}>Sort students</span><select className={pgStyles.filterSelect} value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="progress-desc">Highest progress</option><option value="score-desc">Highest score</option><option value="activity-desc">Recent activity</option><option value="name-asc">Name A–Z</option>
                </select></label>
                {(search || performanceFilter !== "all") && <button type="button" className={pgStyles.clearFilters} onClick={() => { setSearch(""); setPerformanceFilter("all"); }}>Clear filters</button>}
              </div>}

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

            {!isLoading && activeTab === "list" && sectionStudents.length > 0 && <section className={pgStyles.insightsGrid}>
              <div className={pgStyles.insightCard}>
                <div className={pgStyles.insightHeader}><div><strong>Students needing attention</strong><span>Prioritized by lowest progress</span></div><span className={pgStyles.attentionCount}>{attentionStudents.length}</span></div>
                <div className={pgStyles.attentionList}>{attentionStudents.length === 0
                  ? <div className={pgStyles.allClear}>Everyone is making steady progress.</div>
                  : [...attentionStudents].sort((a, b) => clampPercent(a.progressPercent) - clampPercent(b.progressPercent)).slice(0, 4).map((student) => <button type="button" key={student.userId} onClick={() => openGrades(student)}>
                    <span className={pgStyles.miniAvatar}>{getStudentName(student).slice(0, 2).toUpperCase()}</span><span><strong>{getStudentName(student)}</strong><small>{getPerformance(student).label} · {clampPercent(student.progressPercent)}% progress</small></span><FiChevronRight />
                  </button>)}</div>
              </div>
              <div className={pgStyles.insightCard}>
                <div className={pgStyles.insightHeader}><div><strong>Progress distribution</strong><span>Where the class currently stands</span></div></div>
                <div className={pgStyles.distribution}>{[
                  { label: "Not started", min: 0, max: 0, color: "#ef6b5b" },
                  { label: "Getting started", min: 1, max: 24, color: "#f0a44b" },
                  { label: "In progress", min: 25, max: 74, color: "#4f83b3" },
                  { label: "Nearly there", min: 75, max: 99, color: "#6a72c9" },
                  { label: "Completed", min: 100, max: 100, color: "#2f9b78" },
                ].map((bucket) => { const count = sectionStudents.filter((student) => { const value = clampPercent(student.progressPercent); return value >= bucket.min && value <= bucket.max; }).length; return <div key={bucket.label}><span>{bucket.label}</span><div><i style={{ width: `${sectionStudents.length ? Math.max(count ? 5 : 0, count / sectionStudents.length * 100) : 0}%`, background: bucket.color }} /></div><strong>{count}</strong></div>; })}</div>
              </div>
            </section>}
          </div>
        </div>
      </div>

      {/* Grades modal */}
      {gradesModal && (
        <div className={pgStyles.modalBackdrop} onClick={() => setGradesModal(null)}>
          <div className={pgStyles.modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="student-detail-title">
            <div className={pgStyles.modalHeader}>
              <div><span className={pgStyles.modalEyebrow}>Student overview</span><h2 className={pgStyles.modalTitle} id="student-detail-title">{gradesModal.studentName}</h2></div>
              <button className={pgStyles.modalClose} onClick={() => setGradesModal(null)} aria-label="Close student details"><FiX /></button>
            </div>
            <div className={pgStyles.studentSnapshot}>
              <div><span>Progress</span><strong>{clampPercent(gradesModal.student.progressPercent)}%</strong></div>
              <div><span>Average score</span><strong>{gradesModal.student.avgScore == null ? "No grades" : `${gradesModal.student.avgScore}%`}</strong></div>
              <div><span>Completed</span><strong>{gradesModal.student.completedLevels || 0} levels</strong></div>
              <div><span>Badges</span><strong>{gradesModal.student.badgesCount || 0}</strong></div>
            </div>
            <div className={pgStyles.modalSectionHead}><strong>Completed level grades</strong><span>Score, attempts, and time spent</span></div>
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
                        <span>{g.attemptCount} attempt{g.attemptCount !== 1 ? "s" : ""}</span>
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
