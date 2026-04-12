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
  FiMessageSquare,
  FiSend,
  FiUsers,
  FiPlus,
} from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import styles from "./TeacherDashboardPage.module.css";

/* ─── Constants ───────────────────────────────────────────────── */
const TABS = ["Overview", "Classes", "Students", "Analytics", "Announcements"];

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

const ANNOUNCEMENT_HEADER_PREFIX = "HEADER:";

/* ─── Pure helpers (unchanged logic) ─────────────────────────── */
const clampPercent = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
};

const buildChartPath = (series, width = 360, height = 160) => {
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

const formatDateTime = (value) => {
  if (!value) return "Just now";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Just now" : d.toLocaleString();
};

const buildAnnouncementPayload = (header, message) =>
  `${ANNOUNCEMENT_HEADER_PREFIX} ${`${header ?? ""}`.trim()}\n${`${message ?? ""}`.trim()}`;

const parseAnnouncementPayload = (raw) => {
  const text = `${raw ?? ""}`.trim();
  const [first = "", ...rest] = text.split(/\r?\n/);
  if (!first.toUpperCase().startsWith(ANNOUNCEMENT_HEADER_PREFIX))
    return { header: "Announcement", body: text };
  return {
    header:
      first.slice(ANNOUNCEMENT_HEADER_PREFIX.length).trim() || "Announcement",
    body: rest.join("\n").trim(),
  };
};

/* ─── Sub-components ──────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, accentBg, accentText, action }) {
  return (
    <div
      className={styles.statCard}
      style={accentBg ? { background: accentBg, borderColor: accentBg } : {}}
    >
      <div
        className={styles.statLabel}
        style={accentText ? { color: accentText } : {}}
      >
        {icon}
        {label}
        {action && <span className={styles.statAction}>{action}</span>}
      </div>
      <div
        className={styles.statVal}
        style={accentText ? { color: accentText } : {}}
      >
        {value}
      </div>
      {sub && (
        <div
          className={styles.statSub}
          style={accentText ? { color: accentText, opacity: 0.8 } : {}}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionHead({ title, action }) {
  return (
    <div className={styles.sectionHead}>
      <div className={styles.sectionTitle}>{title}</div>
      {action}
    </div>
  );
}

/* ─── Tab panels ──────────────────────────────────────────────── */

/* OVERVIEW */
function OverviewTab({
  overview,
  classPerformance,
  studentPerformance,
  isLoading,
  onNewClass,
}) {
  const topStudents = studentPerformance.slice(0, 5);
  return (
    <div className={styles.tabBody}>
      {/* 4 stat cards */}
      <div className={styles.statRow}>
        <StatCard
          icon={<FiUsers size={13} />}
          label="Total students"
          value={overview.totalStudents}
          sub={`across ${overview.totalClassrooms} classroom${overview.totalClassrooms !== 1 ? "s" : ""}`}
          accentBg="#1e3a5f"
          accentText="#ffffff"
        />
        <StatCard
          icon={<FiGrid size={13} />}
          label="Classrooms"
          value={overview.totalClassrooms}
          sub={`${overview.totalClassrooms} active`}
          action={
            <button
              className={styles.inlineNewBtn}
              onClick={onNewClass}
              type="button"
            >
              <FiPlus size={11} /> New
            </button>
          }
        />
        <StatCard
          icon={<FiBarChart2 size={13} />}
          label="Avg. progress"
          value={`${clampPercent(overview.averageProgressPercent)}%`}
          sub="across all lessons"
        />
        <StatCard
          icon={<FiActivity size={13} />}
          label="Active today"
          value={overview.activeStudentsToday}
          sub="students online now"
        />
      </div>

      {/* Middle: class list + top students */}
      <div className={styles.midRow}>
        <div className={styles.card}>
          <SectionHead title="My classrooms" />
          {isLoading ? (
            <div className={styles.loadingText}>Loading...</div>
          ) : classPerformance.length === 0 ? (
            <div className={styles.emptyText}>
              No classrooms yet. Create one above.
            </div>
          ) : (
            classPerformance.map((item) => (
              <div
                key={item.classId ?? item.className}
                className={styles.classRow}
              >
                <div className={styles.classRowLeft}>
                  <div className={styles.className}>{item.className}</div>
                  <div className={styles.classMeta}>
                    {item.section} · SY {item.schoolYear} · {item.studentCount}{" "}
                    students
                  </div>
                  <div className={styles.classCodePill}>{item.classCode}</div>
                </div>
                <div className={styles.classRowRight}>
                  <div className={styles.classAvgLabel}>
                    Avg {clampPercent(item.averageProgressPercent)}%
                  </div>
                  <div className={styles.miniBarTrack}>
                    <div
                      className={styles.miniBarFill}
                      style={{
                        width: `${clampPercent(item.averageProgressPercent)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.card}>
          <SectionHead title="Top students" />
          {isLoading ? (
            <div className={styles.loadingText}>Loading...</div>
          ) : topStudents.length === 0 ? (
            <div className={styles.emptyText}>No student data yet.</div>
          ) : (
            topStudents.map((s, i) => (
              <div key={s.userId} className={styles.studentRow}>
                <div className={styles.stuRank}>{i + 1}</div>
                <div
                  className={styles.stuAv}
                  style={
                    i === 0
                      ? { background: "#FAEEDA", color: "#BA7517" }
                      : { background: "#e8f0fb", color: "#26547c" }
                  }
                >
                  {(s.studentName || s.username || "?")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className={styles.stuInfo}>
                  <div className={styles.stuName}>
                    {s.studentName || s.username}
                  </div>
                  <div className={styles.stuSection}>{s.section}</div>
                </div>
                <div className={styles.stuRight}>
                  <div className={styles.stuPct}>
                    {clampPercent(s.progressPercent)}%
                  </div>
                  <div className={styles.stuBarWrap}>
                    <div
                      className={styles.stuBar}
                      style={{ width: `${clampPercent(s.progressPercent)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* CLASSES */
function ClassesTab({ classPerformance, isLoading, onNewClass }) {
  return (
    <div className={styles.tabBody}>
      <div className={styles.card}>
        <SectionHead
          title="All classrooms"
          action={
            <button
              className={styles.btnNewClass}
              onClick={onNewClass}
              type="button"
            >
              <FiPlus size={14} /> New class
            </button>
          }
        />
        {isLoading ? (
          <div className={styles.loadingText}>Loading classrooms...</div>
        ) : classPerformance.length === 0 ? (
          <div className={styles.emptyText}>No classrooms yet.</div>
        ) : (
          <div className={styles.classGrid}>
            {classPerformance.map((item) => (
              <div
                key={item.classId ?? item.className}
                className={styles.classCard}
              >
                <div className={styles.classCardTop}>
                  <div className={styles.classCardName}>{item.className}</div>
                  <span className={styles.classCodePill}>{item.classCode}</span>
                </div>
                <div className={styles.classCardMeta}>
                  {item.section} · SY {item.schoolYear} · {item.studentCount}{" "}
                  students
                </div>
                <div className={styles.classBarRow}>
                  <span className={styles.classBarLabel}>Avg progress</span>
                  <div className={styles.miniBarTrack}>
                    <div
                      className={styles.miniBarFill}
                      style={{
                        width: `${clampPercent(item.averageProgressPercent)}%`,
                      }}
                    />
                  </div>
                  <span className={styles.classBarPct}>
                    {clampPercent(item.averageProgressPercent)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* STUDENTS */
function StudentsTab({ studentPerformance, isLoading }) {
  return (
    <div className={styles.tabBody}>
      <div className={styles.card}>
        <SectionHead
          title="All students"
          action={
            <div className={styles.sectionSub}>
              {studentPerformance.length} students
            </div>
          }
        />
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
                {studentPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyRow}>
                      No student data yet.
                    </td>
                  </tr>
                ) : (
                  studentPerformance.map((s) => (
                    <tr key={s.userId}>
                      <td>{s.rank}</td>
                      <td>
                        <div className={styles.stuNameCell}>
                          <div className={styles.stuAvSm}>
                            {(s.studentName || s.username || "?")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          {s.studentName || s.username}
                        </div>
                      </td>
                      <td>{s.section}</td>
                      <td>
                        <div className={styles.tableProgressRow}>
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
                          <span className={styles.tableProgressPct}>
                            {clampPercent(s.progressPercent)}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.badges}>
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
                              ? styles.statusInactive
                              : styles.statusOnline
                          }
                        >
                          {s.statusLabel}
                        </div>
                        <div className={styles.lastActive}>
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
  );
}

/* ANALYTICS */
function AnalyticsTab({ lessonInsights, chartPath, chartSeries, isLoading }) {
  return (
    <div className={styles.tabBody}>
      {/* Insight cards */}
      <div className={styles.insightRow}>
        <div className={styles.insightCard}>
          <div className={styles.insightLabel}>
            <FiBookOpen size={13} /> Most completed lesson
          </div>
          <div className={styles.insightVal}>
            {lessonInsights.mostCompletedLesson?.lessonTitle ?? "No data"}
          </div>
        </div>
        <div className={styles.insightCard}>
          <div className={styles.insightLabel}>
            <FiAlertCircle size={13} /> Most difficult lesson
          </div>
          <div className={styles.insightVal}>
            {lessonInsights.mostDifficultLesson?.lessonTitle ?? "No data"}
          </div>
        </div>
        <div className={styles.insightCard}>
          <div className={styles.insightLabel}>
            <FiClock size={13} /> Avg time per lesson
          </div>
          <div className={styles.insightVal}>
            {lessonInsights.averageTimePerLessonLabel}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className={styles.chartsRow}>
        <div className={styles.card}>
          <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>
            Completion by lesson
          </div>
          {(lessonInsights.completionByLesson ?? []).length === 0 ? (
            <div className={styles.emptyText}>No data yet.</div>
          ) : (
            <div className={styles.lessonBars}>
              {(lessonInsights.completionByLesson ?? []).map((lesson) => (
                <div key={lesson.lessonKey} className={styles.lessonBarRow}>
                  <span className={styles.lessonBarLabel}>
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
                  <span className={styles.lessonBarPct}>
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
          <svg
            viewBox="0 0 360 180"
            preserveAspectRatio="none"
            className={styles.chartSvg}
          >
            <line
              x1="0"
              y1="144"
              x2="360"
              y2="144"
              className={styles.axisLine}
            />
            <line x1="0" y1="36" x2="360" y2="36" className={styles.gridLine} />
            <line x1="0" y1="90" x2="360" y2="90" className={styles.gridLine} />
            {chartPath && <path d={chartPath} className={styles.chartPath} />}
          </svg>
          <div className={styles.chartLabels}>
            {chartSeries.map((l) => (
              <span key={l.lessonKey}>{l.lessonTitle}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ANNOUNCEMENTS */
function AnnouncementsTab({
  teacherClassrooms,
  teacherAnnouncements,
  announcementForm,
  onFieldChange,
  onPost,
  isPosting,
  isLoadingAnn,
  annError,
  annSuccess,
}) {
  return (
    <div className={styles.tabBody}>
      <div className={styles.annGrid}>
        {/* Composer */}
        <div className={styles.card}>
          <div className={styles.sectionTitle} style={{ marginBottom: 4 }}>
            Post announcement
          </div>
          <p className={styles.annHint}>
            <FiMessageSquare size={13} />
            Post reminders or guidance — students see this in their dashboard.
          </p>

          {annError && <div className={styles.annError}>{annError}</div>}
          {annSuccess && <div className={styles.annSuccess}>{annSuccess}</div>}

          <form onSubmit={onPost} className={styles.annForm}>
            <label className={styles.annLabel}>
              <span>Classroom</span>
              <select
                name="classroomId"
                value={announcementForm.classroomId}
                onChange={onFieldChange}
                disabled={teacherClassrooms.length === 0 || isPosting}
              >
                <option value="">Choose classroom</option>
                {teacherClassrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.className} — {c.section}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.annLabel}>
              <span>Header</span>
              <input
                type="text"
                name="header"
                value={announcementForm.header}
                onChange={onFieldChange}
                placeholder="e.g. Quiz reminder"
                maxLength={80}
                disabled={isPosting}
              />
            </label>

            <label className={styles.annLabel}>
              <span>Message</span>
              <textarea
                name="message"
                value={announcementForm.message}
                onChange={onFieldChange}
                rows={5}
                maxLength={1000}
                placeholder="Type your announcement details for students..."
                disabled={isPosting}
              />
            </label>

            <div className={styles.annFooter}>
              <span className={styles.annCount}>
                {announcementForm.message.length} / 1000
              </span>
              <button
                type="submit"
                className={styles.btnPost}
                disabled={isPosting || teacherClassrooms.length === 0}
              >
                <FiSend size={13} />
                {isPosting ? "Posting..." : "Post announcement"}
              </button>
            </div>
          </form>
        </div>

        {/* Feed */}
        <div className={styles.card}>
          <div className={styles.sectionTitle} style={{ marginBottom: 12 }}>
            Recent announcements
          </div>
          {isLoadingAnn ? (
            <div className={styles.loadingText}>Loading...</div>
          ) : teacherAnnouncements.length === 0 ? (
            <div className={styles.emptyText}>No announcements posted yet.</div>
          ) : (
            <div className={styles.annList}>
              {teacherAnnouncements.map((item) => {
                const parsed = parseAnnouncementPayload(item.message);
                return (
                  <div key={item.id} className={styles.annItem}>
                    <div className={styles.annItemTop}>
                      <span className={styles.annTag}>
                        {item.className} — {item.section}
                      </span>
                      <span className={styles.annTime}>
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>
                    <div className={styles.annItemTitle}>{parsed.header}</div>
                    <p className={styles.annItemBody}>{parsed.body}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Create class modal (unchanged logic) ────────────────────── */
function CreateClassModal({
  form,
  onChange,
  onSubmit,
  onClose,
  isCreating,
  error,
}) {
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3>Create new class</h3>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {error && <div className={styles.modalError}>{error}</div>}
        <form onSubmit={onSubmit} className={styles.modalForm}>
          <label className={styles.modalLabel}>
            <span>Class name</span>
            <input
              type="text"
              name="className"
              value={form.className}
              onChange={onChange}
              placeholder="e.g. BSIT - C# Fundamentals"
            />
          </label>
          <label className={styles.modalLabel}>
            <span>Section</span>
            <select name="section" value={form.section} onChange={onChange}>
              <option value="">Choose section</option>
              {SECTION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.modalLabel}>
            <span>School year</span>
            <input
              type="text"
              name="schoolYear"
              value={form.schoolYear}
              onChange={onChange}
              placeholder="e.g. 2025-2026"
            />
          </label>
          <label className={styles.modalLabel}>
            <span>Max students (optional)</span>
            <input
              type="number"
              name="maxStudents"
              value={form.maxStudents}
              onChange={onChange}
              min={1}
              placeholder="No limit"
            />
          </label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>
            <span>Description (optional)</span>
            <input
              type="text"
              name="description"
              value={form.description}
              onChange={onChange}
              placeholder="Short description"
            />
          </label>
          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnCreate}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Create class"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SuccessModal({ classCode, onClose }) {
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.successCard}>
        <div className={styles.successIcon}>✓</div>
        <h3>Classroom created!</h3>
        <p>Share this code with your students so they can join.</p>
        <div className={styles.codeBlock}>{classCode || "N/A"}</div>
        <button type="button" className={styles.btnCreate} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────── */
function TeacherDashboardPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("Overview");
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAnn, setIsLoadingAnn] = useState(true);
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  const [isPostingAnn, setIsPostingAnn] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdClassCode, setCreatedClassCode] = useState("");
  const [modalError, setModalError] = useState("");
  const [annError, setAnnError] = useState("");
  const [annSuccess, setAnnSuccess] = useState("");
  const [announcementData, setAnnouncementData] = useState({
    classrooms: [],
    announcements: [],
  });
  const [classroomForm, setClassroomForm] = useState({
    className: "",
    section: "",
    schoolYear: "",
    maxStudents: "",
    description: "",
  });
  const [announcementForm, setAnnouncementForm] = useState({
    classroomId: "",
    header: "",
    message: "",
  });

  /* ── Fetch announcement data ── */
  const fetchAnnouncementData = async () => {
    setIsLoadingAnn(true);
    setAnnError("");
    const url = buildApiUrl("/api/teacher/announcements");
    const applyData = (payload) => {
      const safe = payload ?? { classrooms: [], announcements: [] };
      setAnnouncementData(safe);
      setAnnouncementForm((cur) => ({
        ...cur,
        classroomId: cur.classroomId || `${safe.classrooms?.[0]?.id ?? ""}`,
      }));
    };
    try {
      const res = await axios.get(url, {
        headers: getAuthHeaders(),
        params: { _ts: Date.now() },
      });
      applyData(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        try {
          const retry = await axios.get(url, {
            headers: {
              ...getAuthHeaders(),
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
            params: { _ts: Date.now(), _retry: "1" },
          });
          applyData(retry.data);
          return;
        } catch (e2) {
          setAnnError(
            e2.response?.data?.message ??
              `Failed to load announcements (${e2.response?.status ?? 404}).`,
          );
          return;
        }
      }
      setAnnError(
        err.response?.data?.message ?? "Failed to load announcements.",
      );
    } finally {
      setIsLoadingAnn(false);
    }
  };

  /* ── Fetch dashboard data ── */
  useEffect(() => {
    const fetchDashboard = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(buildApiUrl("/api/teacher/dashboard"), {
          headers: getAuthHeaders(),
        });
        setDashboardData(res.data);
      } catch {
        /* silently fail — empty states handle gracefully */
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
    fetchAnnouncementData();
  }, []);

  /* ── Create classroom ── */
  const onCreateClassroom = async (e) => {
    e.preventDefault();
    setModalError("");
    if (!classroomForm.className.trim()) {
      setModalError("Class name is required.");
      return;
    }
    if (!classroomForm.section.trim()) {
      setModalError("Section is required.");
      return;
    }
    if (!classroomForm.schoolYear.trim()) {
      setModalError("School year is required.");
      return;
    }
    setIsCreatingClass(true);
    try {
      const res = await axios.post(
        buildApiUrl("/api/teacher/classrooms"),
        {
          className: classroomForm.className.trim(),
          section: classroomForm.section.trim(),
          schoolYear: classroomForm.schoolYear.trim(),
          maxStudents: classroomForm.maxStudents.trim(),
          description: classroomForm.description.trim(),
        },
        { headers: getAuthHeaders() },
      );
      setCreatedClassCode(res.data?.classroom?.classCode ?? "");
      setShowCreateModal(false);
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
      await fetchAnnouncementData();
    } catch (err) {
      setModalError(
        err.response?.data?.message ?? "Failed to create classroom.",
      );
    } finally {
      setIsCreatingClass(false);
    }
  };

  /* ── Post announcement ── */
  const onPostAnnouncement = async (e) => {
    e.preventDefault();
    setAnnError("");
    setAnnSuccess("");
    const classroomId = Number.parseInt(announcementForm.classroomId, 10);
    if (!Number.isInteger(classroomId) || classroomId <= 0) {
      setAnnError("Please select a classroom.");
      return;
    }
    if (!announcementForm.header.trim()) {
      setAnnError("Header is required.");
      return;
    }
    if (!announcementForm.message.trim()) {
      setAnnError("Message is required.");
      return;
    }
    setIsPostingAnn(true);
    try {
      await axios.post(
        buildApiUrl("/api/teacher/announcements"),
        {
          classroomId,
          message: buildAnnouncementPayload(
            announcementForm.header,
            announcementForm.message,
          ),
        },
        { headers: getAuthHeaders() },
      );
      setAnnSuccess("Announcement posted to student dashboard.");
      setAnnouncementForm((cur) => ({ ...cur, header: "", message: "" }));
      await fetchAnnouncementData();
    } catch (err) {
      setAnnError(
        err.response?.status === 404
          ? "Announcement API not found. Restart backend from latest code."
          : (err.response?.data?.message ?? "Failed to post announcement."),
      );
    } finally {
      setIsPostingAnn(false);
    }
  };

  /* ── Derived data ── */
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

  const fallbackClassrooms = (classPerformance ?? []).map((item) => ({
    id: item.classId,
    className: item.className,
    section: item.section ?? "General",
    schoolYear: item.schoolYear ?? "",
    classCode: item.classCode ?? "",
  }));
  const teacherClassrooms =
    announcementData.classrooms?.length > 0
      ? announcementData.classrooms
      : fallbackClassrooms;
  const teacherAnnouncements = announcementData.announcements ?? [];

  /* ── Render ── */
  return (
    <div className={styles.root}>
      <Sidebar />

      <div className={styles.main}>
        {/* Top tab bar */}
        <div className={styles.tabBar}>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tabBtn} ${activeTab === tab ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
          <div className={styles.tabBarRight}>
            <button
              type="button"
              className={styles.btnNewClass}
              onClick={() => {
                setShowCreateModal(true);
                setModalError("");
              }}
            >
              <FiPlus size={14} /> New class
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className={styles.body}>
          {activeTab === "Overview" && (
            <OverviewTab
              overview={overview}
              classPerformance={classPerformance}
              studentPerformance={studentPerformance}
              isLoading={isLoading}
              onNewClass={() => {
                setShowCreateModal(true);
                setModalError("");
              }}
            />
          )}
          {activeTab === "Classes" && (
            <ClassesTab
              classPerformance={classPerformance}
              isLoading={isLoading}
              onNewClass={() => {
                setShowCreateModal(true);
                setModalError("");
              }}
            />
          )}
          {activeTab === "Students" && (
            <StudentsTab
              studentPerformance={studentPerformance}
              isLoading={isLoading}
            />
          )}
          {activeTab === "Analytics" && (
            <AnalyticsTab
              lessonInsights={lessonInsights}
              chartPath={chartPath}
              chartSeries={chartSeries}
              isLoading={isLoading}
            />
          )}
          {activeTab === "Announcements" && (
            <AnnouncementsTab
              teacherClassrooms={teacherClassrooms}
              teacherAnnouncements={teacherAnnouncements}
              announcementForm={announcementForm}
              onFieldChange={(e) => {
                const { name, value } = e.target;
                setAnnouncementForm((cur) => ({ ...cur, [name]: value }));
              }}
              onPost={onPostAnnouncement}
              isPosting={isPostingAnn}
              isLoadingAnn={isLoadingAnn}
              annError={annError}
              annSuccess={annSuccess}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateClassModal
          form={classroomForm}
          onChange={(e) => {
            const { name, value } = e.target;
            setClassroomForm((cur) => ({ ...cur, [name]: value }));
          }}
          onSubmit={onCreateClassroom}
          onClose={() => setShowCreateModal(false)}
          isCreating={isCreatingClass}
          error={modalError}
        />
      )}
      {showSuccessModal && (
        <SuccessModal
          classCode={createdClassCode}
          onClose={() => setShowSuccessModal(false)}
        />
      )}
    </div>
  );
}

export default TeacherDashboardPage;
