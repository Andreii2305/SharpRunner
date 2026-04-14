import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  FiActivity,
  FiBarChart2,
  FiGrid,
  FiMessageSquare,
  FiPlus,
  FiSend,
  FiUsers,
} from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherDashboardPage.module.css";

/* ─── Shared helpers ──────────────────────────────────────────── */
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

export const clampPercent = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
};

export const buildAnnouncementPayload = (header, message) =>
  `${ANNOUNCEMENT_HEADER_PREFIX} ${`${header ?? ""}`.trim()}\n${`${message ?? ""}`.trim()}`;

export const parseAnnouncementPayload = (raw) => {
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

export const formatDateTime = (value) => {
  if (!value) return "Just now";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Just now" : d.toLocaleString();
};

/* ─── Create class modal ──────────────────────────────────────── */
export function CreateClassModal({
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
              className={styles.btnOutline}
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
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

export function SuccessModal({ classCode, onClose }) {
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.successCard}>
        <div className={styles.successIcon}>✓</div>
        <h3>Classroom created!</h3>
        <p>Share this code with your students.</p>
        <div className={styles.codeBlock}>{classCode || "N/A"}</div>
        <button type="button" className={styles.btnPrimary} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/* ─── Overview page ───────────────────────────────────────────── */
function TeacherDashboardPage() {
  const [dashData, setDashData] = useState(null);
  const [annData, setAnnData] = useState({ classrooms: [], announcements: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAnn, setIsLoadingAnn] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [modalError, setModalError] = useState("");
  const [annError, setAnnError] = useState("");
  const [annSuccess, setAnnSuccess] = useState("");
  const [classForm, setClassForm] = useState({
    className: "",
    section: "",
    schoolYear: "",
    maxStudents: "",
    description: "",
  });
  const [annForm, setAnnForm] = useState({
    classroomId: "",
    header: "",
    message: "",
  });

  /* ── fetch announcement data ── */
  const fetchAnnData = async () => {
    setIsLoadingAnn(true);
    const url = buildApiUrl("/api/teacher/announcements");
    const apply = (payload) => {
      const safe = payload ?? { classrooms: [], announcements: [] };
      setAnnData(safe);
      setAnnForm((c) => ({
        ...c,
        classroomId: c.classroomId || `${safe.classrooms?.[0]?.id ?? ""}`,
      }));
    };
    try {
      const res = await axios.get(url, {
        headers: getAuthHeaders(),
        params: { _ts: Date.now() },
      });
      apply(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        try {
          const r2 = await axios.get(url, {
            headers: {
              ...getAuthHeaders(),
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
            params: { _ts: Date.now(), _retry: "1" },
          });
          apply(r2.data);
          return;
        } catch {
          /* handled below */
        }
      }
      setAnnError(
        err.response?.data?.message ?? "Failed to load announcements.",
      );
    } finally {
      setIsLoadingAnn(false);
    }
  };

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(buildApiUrl("/api/teacher/dashboard"), {
          headers: getAuthHeaders(),
        });
        setDashData(res.data);
      } finally {
        setIsLoading(false);
      }
    })();
    fetchAnnData();
  }, []);

  /* ── create class ── */
  const onCreateClass = async (e) => {
    e.preventDefault();
    setModalError("");
    if (!classForm.className.trim()) {
      setModalError("Class name is required.");
      return;
    }
    if (!classForm.section.trim()) {
      setModalError("Section is required.");
      return;
    }
    if (!classForm.schoolYear.trim()) {
      setModalError("School year is required.");
      return;
    }
    setIsCreating(true);
    try {
      const res = await axios.post(
        buildApiUrl("/api/teacher/classrooms"),
        {
          className: classForm.className.trim(),
          section: classForm.section.trim(),
          schoolYear: classForm.schoolYear.trim(),
          maxStudents: classForm.maxStudents.trim(),
          description: classForm.description.trim(),
        },
        { headers: getAuthHeaders() },
      );
      setCreatedCode(res.data?.classroom?.classCode ?? "");
      setShowCreate(false);
      setShowSuccess(true);
      setClassForm({
        className: "",
        section: "",
        schoolYear: "",
        maxStudents: "",
        description: "",
      });
      const refreshed = await axios.get(buildApiUrl("/api/teacher/dashboard"), {
        headers: getAuthHeaders(),
      });
      setDashData(refreshed.data);
      await fetchAnnData();
    } catch (err) {
      setModalError(
        err.response?.data?.message ?? "Failed to create classroom.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  /* ── post announcement ── */
  const onPostAnn = async (e) => {
    e.preventDefault();
    setAnnError("");
    setAnnSuccess("");
    const cid = Number.parseInt(annForm.classroomId, 10);
    if (!Number.isInteger(cid) || cid <= 0) {
      setAnnError("Please select a classroom.");
      return;
    }
    if (!annForm.header.trim()) {
      setAnnError("Header is required.");
      return;
    }
    if (!annForm.message.trim()) {
      setAnnError("Message is required.");
      return;
    }
    setIsPosting(true);
    try {
      await axios.post(
        buildApiUrl("/api/teacher/announcements"),
        {
          classroomId: cid,
          message: buildAnnouncementPayload(annForm.header, annForm.message),
        },
        { headers: getAuthHeaders() },
      );
      setAnnSuccess("Announcement posted.");
      setAnnForm((c) => ({ ...c, header: "", message: "" }));
      await fetchAnnData();
    } catch (err) {
      setAnnError(
        err.response?.data?.message ?? "Failed to post announcement.",
      );
    } finally {
      setIsPosting(false);
    }
  };

  /* ── derived data ── */
  const overview = dashData?.overview ?? {
    totalStudents: 0,
    totalClassrooms: 0,
    averageProgressPercent: 0,
    activeStudentsToday: 0,
  };
  const classPerformance = dashData?.classPerformance ?? [];
  const topStudents = (dashData?.studentPerformance ?? []).slice(0, 5);
  const recentActivity = dashData?.recentActivity ?? [];

  const fallbackClassrooms = classPerformance.map((c) => ({
    id: c.classId,
    className: c.className,
    section: c.section ?? "General",
    schoolYear: c.schoolYear ?? "",
    classCode: c.classCode ?? "",
  }));
  const teacherClassrooms =
    annData.classrooms?.length > 0 ? annData.classrooms : fallbackClassrooms;
  const teacherAnnouncements = annData.announcements ?? [];

  return (
    <div className={styles.root}>
      <Sidebar />
      <div className={styles.main}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageTitle}>Overview</div>
          <div className={styles.pageActions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                setShowCreate(true);
                setModalError("");
              }}
            >
              <FiPlus size={14} /> New class
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {/* Stat cards */}
          <div className={styles.statRow}>
            <div
              className={styles.statCard}
              style={{ background: "#1e3a5f", borderColor: "#1e3a5f" }}
            >
              <div
                className={styles.statLabel}
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                <FiUsers size={13} /> Total students
              </div>
              <div className={styles.statVal} style={{ color: "#fff" }}>
                {overview.totalStudents}
              </div>
              <div
                className={styles.statSub}
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                across {overview.totalClassrooms} classroom
                {overview.totalClassrooms !== 1 ? "s" : ""}
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>
                <FiGrid size={13} /> Classrooms
              </div>
              <div className={styles.statVal}>{overview.totalClassrooms}</div>
              <div className={styles.statSub}>
                {overview.totalClassrooms} active
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>
                <FiBarChart2 size={13} /> Avg. progress
              </div>
              <div className={styles.statVal}>
                {clampPercent(overview.averageProgressPercent)}%
              </div>
              <div className={styles.statSub}>across all lessons</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>
                <FiActivity size={13} /> Active today
              </div>
              <div className={styles.statVal}>
                {overview.activeStudentsToday}
              </div>
              <div className={styles.statSub}>students online now</div>
            </div>
          </div>

          {/* Mid row: classrooms + top students */}
          <div className={pgStyles.midRow}>
            <div className={styles.card}>
              <div className={styles.sectionHead}>
                <div className={styles.sectionTitle}>My classrooms</div>
              </div>
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
                    className={pgStyles.classRow}
                  >
                    <div>
                      <div className={pgStyles.className}>{item.className}</div>
                      <div className={pgStyles.classMeta}>
                        {item.section} · SY {item.schoolYear} ·{" "}
                        {item.studentCount} students
                      </div>
                      <span className={styles.codePill}>{item.classCode}</span>
                    </div>
                    <div className={pgStyles.classRowRight}>
                      <div className={pgStyles.classAvgLabel}>
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
              <div className={styles.sectionHead}>
                <div className={styles.sectionTitle}>Top students</div>
              </div>
              {isLoading ? (
                <div className={styles.loadingText}>Loading...</div>
              ) : topStudents.length === 0 ? (
                <div className={styles.emptyText}>No student data yet.</div>
              ) : (
                topStudents.map((s, i) => (
                  <div key={s.userId} className={pgStyles.studentRow}>
                    <div className={pgStyles.stuRank}>{i + 1}</div>
                    <div
                      className={pgStyles.stuAv}
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
                    <div className={pgStyles.stuInfo}>
                      <div className={pgStyles.stuName}>
                        {s.studentName || s.username}
                      </div>
                      <div className={pgStyles.stuSection}>{s.section}</div>
                    </div>
                    <div className={pgStyles.stuRight}>
                      <div className={pgStyles.stuPct}>
                        {clampPercent(s.progressPercent)}%
                      </div>
                      <div className={pgStyles.stuBarWrap}>
                        <div
                          className={pgStyles.stuBar}
                          style={{
                            width: `${clampPercent(s.progressPercent)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bottom row: quick announcement + recent activity */}
          <div className={pgStyles.bottomRow}>
            {/* Quick announcement composer */}
            <div className={styles.card}>
              <div className={styles.sectionHead}>
                <div className={styles.sectionTitle}>Quick announcement</div>
              </div>
              <p className={pgStyles.annHint}>
                <FiMessageSquare size={13} />
                Post reminders or guidance — students see this in their
                dashboard.
              </p>
              {annError && (
                <div
                  className={pgStyles.annFeedback}
                  style={{ color: "#E24B4A" }}
                >
                  {annError}
                </div>
              )}
              {annSuccess && (
                <div
                  className={pgStyles.annFeedback}
                  style={{ color: "#0F6E56" }}
                >
                  {annSuccess}
                </div>
              )}
              <form onSubmit={onPostAnn} className={pgStyles.annForm}>
                <label className={pgStyles.annLabel}>
                  <span>Classroom</span>
                  <select
                    name="classroomId"
                    value={annForm.classroomId}
                    onChange={(e) =>
                      setAnnForm((c) => ({ ...c, classroomId: e.target.value }))
                    }
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
                <label className={pgStyles.annLabel}>
                  <span>Header</span>
                  <input
                    type="text"
                    name="header"
                    value={annForm.header}
                    onChange={(e) =>
                      setAnnForm((c) => ({ ...c, header: e.target.value }))
                    }
                    placeholder="e.g. Quiz reminder"
                    maxLength={80}
                    disabled={isPosting}
                  />
                </label>
                <label className={pgStyles.annLabel}>
                  <span>Message</span>
                  <textarea
                    name="message"
                    value={annForm.message}
                    onChange={(e) =>
                      setAnnForm((c) => ({ ...c, message: e.target.value }))
                    }
                    rows={3}
                    maxLength={1000}
                    placeholder="Type your message for students..."
                    disabled={isPosting}
                  />
                </label>
                <div className={pgStyles.annFooter}>
                  <span className={pgStyles.annCount}>
                    {annForm.message.length} / 1000
                  </span>
                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={isPosting || teacherClassrooms.length === 0}
                  >
                    <FiSend size={13} />
                    {isPosting ? "Posting..." : "Post"}
                  </button>
                </div>
              </form>
            </div>

            {/* Recent announcements */}
            <div className={styles.card}>
              <div className={styles.sectionTitle} style={{ marginBottom: 4 }}>
                Recent announcements
              </div>
              {isLoadingAnn ? (
                <div className={styles.loadingText}>Loading...</div>
              ) : teacherAnnouncements.length === 0 ? (
                <div className={styles.emptyText}>
                  No announcements posted yet.
                </div>
              ) : (
                <div className={pgStyles.annList}>
                  {teacherAnnouncements.slice(0, 4).map((item) => {
                    const p = parseAnnouncementPayload(item.message);
                    return (
                      <div key={item.id} className={pgStyles.annItem}>
                        <div className={pgStyles.annItemTop}>
                          <span className={pgStyles.annTag}>
                            {item.className} — {item.section}
                          </span>
                          <span className={pgStyles.annTime}>
                            {formatDateTime(item.createdAt)}
                          </span>
                        </div>
                        <div className={pgStyles.annItemTitle}>{p.header}</div>
                        <p className={pgStyles.annItemBody}>{p.body}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateClassModal
          form={classForm}
          onChange={(e) => {
            const { name, value } = e.target;
            setClassForm((c) => ({ ...c, [name]: value }));
          }}
          onSubmit={onCreateClass}
          onClose={() => setShowCreate(false)}
          isCreating={isCreating}
          error={modalError}
        />
      )}
      {showSuccess && (
        <SuccessModal
          classCode={createdCode}
          onClose={() => setShowSuccess(false)}
        />
      )}
    </div>
  );
}

export default TeacherDashboardPage;
