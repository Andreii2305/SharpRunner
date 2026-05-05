import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FiPlus, FiUsers, FiCopy, FiCheck, FiX, FiList, FiLayers, FiBarChart2, FiTrendingUp, FiAward } from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import {
  clampPercent,
  CreateClassModal,
  SuccessModal,
} from "./TeacherDashboardPage.jsx";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherClassesPage.module.css";

const ACCENTS = ["#2563eb", "#7c3aed", "#0891b2", "#059669"];

const AVATAR_PALETTES = [
  { bg: "#e0e7ff", color: "#4338ca" },
  { bg: "#fce7f3", color: "#9d174d" },
  { bg: "#d1fae5", color: "#065f46" },
  { bg: "#fef3c7", color: "#92400e" },
  { bg: "#ede9fe", color: "#5b21b6" },
  { bg: "#fee2e2", color: "#991b1b" },
];

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

const getInitials = (name) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
};

const getProgressClass = (pct) => {
  if (pct >= 75) return pgStyles.rosterBarFillHigh;
  if (pct >= 40) return pgStyles.rosterBarFillMid;
  return pgStyles.rosterBarFillLow;
};

function TeacherClassesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [classPerformance, setClassPerformance] = useState([]);
  const [copiedCode, setCopiedCode] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [modalError, setModalError] = useState("");
  const [classForm, setClassForm] = useState({
    className: "",
    section: "",
    schoolYear: "",
    maxStudents: "",
    description: "",
  });
  const [rosterModal, setRosterModal] = useState(null);
  const [rosterStudents, setRosterStudents] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterTab, setRosterTab] = useState("students");
  const rosterClassCode = useRef("");

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      toast.success(`Code "${code}" copied!`);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(buildApiUrl("/api/teacher/dashboard"), {
        headers: getAuthHeaders(),
      });
      setClassPerformance(res.data?.classPerformance ?? []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openRoster = async (classId, className, classCode) => {
    setRosterModal({ classId, className, accent: classAccents.get(classId) ?? ACCENTS[0] });
    rosterClassCode.current = classCode;
    setRosterStudents([]);
    setRosterTab("students");
    setRosterLoading(true);
    try {
      const res = await axios.get(
        buildApiUrl(`/api/teacher/classrooms/${classId}/students`),
        { headers: getAuthHeaders() },
      );
      setRosterStudents(res.data?.students ?? []);
    } catch {
      toast.error("Failed to load roster.");
      setRosterModal(null);
    } finally {
      setRosterLoading(false);
    }
  };

  const onCreateClass = async (e) => {
    e.preventDefault();
    setModalError("");
    if (!classForm.className.trim()) { setModalError("Class name is required."); return; }
    if (!classForm.section.trim())   { setModalError("Section is required."); return; }
    if (!classForm.schoolYear.trim()) { setModalError("School year is required."); return; }
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
      setClassForm({ className: "", section: "", schoolYear: "", maxStudents: "", description: "" });
      await fetchData();
    } catch (err) {
      setModalError(err.response?.data?.message ?? "Failed to create classroom.");
    } finally {
      setIsCreating(false);
    }
  };

  const classAccents = useMemo(() => {
    const map = new Map();
    classPerformance.forEach((c, i) => map.set(c.classId, ACCENTS[i % ACCENTS.length]));
    return map;
  }, [classPerformance]);

  const totalStudents = classPerformance.reduce((sum, c) => sum + (c.studentCount ?? 0), 0);
  const avgProgress = classPerformance.length === 0 ? 0 : Math.round(
    classPerformance.reduce((sum, c) => sum + (c.averageProgressPercent ?? 0), 0) / classPerformance.length
  );

  const classAnalytics = useMemo(() => {
    if (rosterStudents.length === 0) return null;
    const avg = (arr) => arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
    const avgProg = Math.round(avg(rosterStudents.map((s) => s.progressPercent)));
    const scored = rosterStudents.filter((s) => s.avgScore != null);
    const avgScoreVal = scored.length > 0 ? Math.round(avg(scored.map((s) => s.avgScore)) * 10) / 10 : null;
    const totalCompletions = rosterStudents.reduce((s, r) => s + r.completedLevels, 0);
    const playingNow = rosterStudents.filter((s) => s.isCurrentlyPlaying).length;

    const BUCKETS = [
      { label: "0–25%",   min: 0,  max: 25  },
      { label: "26–50%",  min: 26, max: 50  },
      { label: "51–75%",  min: 51, max: 75  },
      { label: "76–100%", min: 76, max: 100 },
    ];
    const buckets = BUCKETS.map((b) => ({
      ...b,
      count: rosterStudents.filter((s) => s.progressPercent >= b.min && s.progressPercent <= b.max).length,
    }));
    const maxBucketCount = Math.max(...buckets.map((b) => b.count), 1);

    const sortedStudents = [...rosterStudents].sort((a, b) => b.progressPercent - a.progressPercent);
    const maxStudentProgress = sortedStudents[0]?.progressPercent ?? 1;

    return { avgProg, avgScoreVal, totalCompletions, playingNow, buckets, maxBucketCount, sortedStudents, maxStudentProgress };
  }, [rosterStudents]);

  return (
    <div className={styles.root}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.pageHeader}>
          <div className={styles.pageTitle}>Classes</div>
          <div className={styles.pageActions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => { setShowCreate(true); setModalError(""); }}
            >
              <FiPlus size={14} /> New class
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {/* Summary chips */}
          {!isLoading && classPerformance.length > 0 && (
            <div className={pgStyles.summaryRow}>
              <div className={pgStyles.summaryChip}>
                <span className={pgStyles.summaryVal}>{classPerformance.length}</span>
                <span className={pgStyles.summaryLbl}>Classes</span>
              </div>
              <div className={pgStyles.summaryChip}>
                <span className={pgStyles.summaryVal}>{totalStudents}</span>
                <span className={pgStyles.summaryLbl}>Total Students</span>
              </div>
              <div className={pgStyles.summaryChip}>
                <span className={pgStyles.summaryVal}>{avgProgress}%</span>
                <span className={pgStyles.summaryLbl}>Avg. Progress</span>
              </div>
            </div>
          )}

          {/* Grid header */}
          <div className={pgStyles.gridHeader}>
            <span className={pgStyles.gridTitle}>All Classrooms</span>
            {!isLoading && (
              <span className={pgStyles.gridSub}>
                {classPerformance.length} classroom{classPerformance.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className={styles.loadingText}>Loading classrooms...</div>
          ) : classPerformance.length === 0 ? (
            <div className={pgStyles.emptyState}>
              <FiLayers size={36} className={pgStyles.emptyStateIcon} />
              <div className={pgStyles.emptyStateTitle}>No classrooms yet</div>
              <div className={pgStyles.emptyStateSub}>Create your first class to get started.</div>
            </div>
          ) : (
            <div className={pgStyles.classGrid}>
              {classPerformance.map((item) => {
                const accent = classAccents.get(item.classId) ?? ACCENTS[0];
                return (
                  <div
                    key={item.classId ?? item.className}
                    className={pgStyles.classCard}
                    style={{ "--accent": accent }}
                  >
                    {/* Top row: avatar + name + code */}
                    <div className={pgStyles.classCardTop}>
                      <div className={pgStyles.classCardLeft}>
                        <div className={pgStyles.classInitial}>
                          {(item.className?.[0] ?? "C").toUpperCase()}
                        </div>
                        <div className={pgStyles.classCardInfo}>
                          <div className={pgStyles.classCardName}>{item.className}</div>
                          <div className={pgStyles.classCardMeta}>
                            {item.section} · SY {item.schoolYear}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={pgStyles.codePillBtn}
                        onClick={() => handleCopyCode(item.classCode)}
                        title="Click to copy class code"
                      >
                        {item.classCode}
                        {copiedCode === item.classCode ? <FiCheck size={10} /> : <FiCopy size={10} />}
                      </button>
                    </div>

                    {/* Student count */}
                    <div className={pgStyles.studentCountRow}>
                      <FiUsers size={11} />
                      <span>{item.studentCount} student{item.studentCount !== 1 ? "s" : ""} enrolled</span>
                    </div>

                    {/* Description */}
                    {item.description && (
                      <div className={pgStyles.classDesc}>{item.description}</div>
                    )}

                    {/* Progress */}
                    <div className={pgStyles.progressSection}>
                      <div className={pgStyles.progressHeader}>
                        <span className={pgStyles.progressLabel}>Avg. Progress</span>
                        <span className={pgStyles.progressPct}>{clampPercent(item.averageProgressPercent)}%</span>
                      </div>
                      <div className={pgStyles.progressTrack}>
                        <div
                          className={pgStyles.progressFill}
                          style={{ width: `${clampPercent(item.averageProgressPercent)}%` }}
                        />
                      </div>
                    </div>

                    {/* Divider + actions */}
                    {item.classId && (
                      <>
                        <div className={pgStyles.cardDivider} />
                        <div className={pgStyles.classCardActions}>
                          <button
                            type="button"
                            className={pgStyles.cardBtn}
                            onClick={() => openRoster(item.classId, item.className, item.classCode)}
                          >
                            <FiList size={11} /> View Roster
                          </button>
                          <button
                            type="button"
                            className={pgStyles.cardBtnSecondary}
                            onClick={() => navigate(`/teacher/classrooms/${item.classId}/levels`)}
                          >
                            ⚙️ Edit Levels
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
        <SuccessModal classCode={createdCode} onClose={() => setShowSuccess(false)} />
      )}

      {rosterModal && (
        <div className={pgStyles.rosterOverlay} onClick={() => setRosterModal(null)}>
          <div className={pgStyles.rosterPanel} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className={pgStyles.rosterHeader}>
              <div className={pgStyles.rosterHeaderLeft}>
                <div
                  className={pgStyles.rosterHeaderIcon}
                  style={{ background: `${rosterModal.accent}18`, borderColor: `${rosterModal.accent}44`, color: rosterModal.accent }}
                >
                  <FiUsers size={16} />
                </div>
                <div>
                  <div className={pgStyles.rosterTitle}>{rosterModal.className}</div>
                  <div className={pgStyles.rosterSub}>
                    {rosterStudents.length > 0
                      ? `${rosterStudents.length} student${rosterStudents.length !== 1 ? "s" : ""}`
                      : "Class Roster"}
                    <span className={pgStyles.rosterCode}>{rosterClassCode.current}</span>
                  </div>
                </div>
              </div>
              <button type="button" className={pgStyles.rosterClose} onClick={() => setRosterModal(null)}>
                <FiX size={15} />
              </button>
            </div>

            {/* Tabs — only when students are loaded */}
            {!rosterLoading && rosterStudents.length > 0 && (
              <div className={pgStyles.rosterTabBar}>
                <button
                  type="button"
                  className={rosterTab === "students" ? pgStyles.rosterTabActive : pgStyles.rosterTabBtn}
                  onClick={() => setRosterTab("students")}
                >
                  <FiList size={12} /> Students
                </button>
                <button
                  type="button"
                  className={rosterTab === "analytics" ? pgStyles.rosterTabActive : pgStyles.rosterTabBtn}
                  onClick={() => setRosterTab("analytics")}
                >
                  <FiBarChart2 size={12} /> Analytics
                </button>
              </div>
            )}

            {/* Body */}
            <div className={pgStyles.rosterBody}>
              {rosterLoading ? (
                <div className={styles.loadingText}>Loading...</div>
              ) : rosterStudents.length === 0 ? (
                <div className={pgStyles.rosterEmpty}>
                  <FiUsers size={32} style={{ color: "#cbd5e1", marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, color: "#1e3a5f", fontSize: 14 }}>No students enrolled yet</div>
                  <div className={pgStyles.rosterEmptySub}>
                    Share the class code{" "}
                    <span className={pgStyles.rosterCode}>{rosterClassCode.current}</span>
                    {" "}so students can join.
                  </div>
                </div>

              ) : rosterTab === "students" ? (
                <table className={pgStyles.rosterTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student</th>
                      <th>Progress</th>
                      <th>Levels Done</th>
                      <th>Avg Score</th>
                      <th>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterStudents.map((s, i) => {
                      const palette = AVATAR_PALETTES[i % AVATAR_PALETTES.length];
                      return (
                        <tr key={s.userId}>
                          <td className={pgStyles.rosterRank}>{i < 3 ? RANK_MEDALS[i] : i + 1}</td>
                          <td>
                            <div className={pgStyles.rosterNameCell}>
                              <div className={pgStyles.rosterAvatar} style={{ "--av-bg": palette.bg, "--av-color": palette.color }}>
                                {getInitials(s.studentName)}
                              </div>
                              <div>
                                <div className={pgStyles.rosterName}>{s.studentName}</div>
                                <div className={pgStyles.rosterUsername}>@{s.username}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className={pgStyles.rosterBarRow}>
                              <div className={pgStyles.rosterBarTrack}>
                                <div className={`${pgStyles.rosterBarFill} ${getProgressClass(s.progressPercent)}`} style={{ width: `${s.progressPercent}%` }} />
                              </div>
                              <span className={pgStyles.rosterPct}>{s.progressPercent}%</span>
                            </div>
                          </td>
                          <td className={pgStyles.rosterCell}>{s.completedLevels}</td>
                          <td className={pgStyles.rosterCell}>{s.avgScore != null ? s.avgScore : "—"}</td>
                          <td>
                            <span className={s.isCurrentlyPlaying ? pgStyles.rosterStatusPlaying : pgStyles.rosterStatusLabel}>
                              {s.lastActiveLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

              ) : classAnalytics && (
                <div className={pgStyles.analyticsTabContent}>
                  {/* Summary chips */}
                  <div className={pgStyles.analyticsStatRow}>
                    <div className={pgStyles.analyticsStat}>
                      <FiTrendingUp size={14} style={{ color: rosterModal.accent }} />
                      <span className={pgStyles.analyticsStatVal}>{classAnalytics.avgProg}%</span>
                      <span className={pgStyles.analyticsStatLbl}>Avg Progress</span>
                    </div>
                    <div className={pgStyles.analyticsStat}>
                      <FiAward size={14} style={{ color: "#f59e0b" }} />
                      <span className={pgStyles.analyticsStatVal}>{classAnalytics.avgScoreVal ?? "—"}</span>
                      <span className={pgStyles.analyticsStatLbl}>Avg Score</span>
                    </div>
                    <div className={pgStyles.analyticsStat}>
                      <FiBarChart2 size={14} style={{ color: "#059669" }} />
                      <span className={pgStyles.analyticsStatVal}>{classAnalytics.totalCompletions}</span>
                      <span className={pgStyles.analyticsStatLbl}>Total Completions</span>
                    </div>
                    <div className={pgStyles.analyticsStat}>
                      <span className={pgStyles.analyticsStatDot} />
                      <span className={pgStyles.analyticsStatVal}>{classAnalytics.playingNow}</span>
                      <span className={pgStyles.analyticsStatLbl}>Playing Now</span>
                    </div>
                  </div>

                  {/* Progress distribution */}
                  <div className={pgStyles.analyticsBlock}>
                    <div className={pgStyles.analyticsBlockTitle}>Progress Distribution</div>
                    <div className={pgStyles.analyticsBlockSub}>Number of students per progress bracket</div>
                    <div className={pgStyles.analyticsBars}>
                      {classAnalytics.buckets.map((b) => (
                        <div key={b.label} className={pgStyles.analyticsBarRow}>
                          <span className={pgStyles.analyticsBarLabel}>{b.label}</span>
                          <div className={pgStyles.analyticsBarTrack}>
                            <div
                              className={pgStyles.analyticsBarFill}
                              style={{
                                width: `${Math.round((b.count / classAnalytics.maxBucketCount) * 100)}%`,
                                background: rosterModal.accent,
                              }}
                            />
                          </div>
                          <span className={pgStyles.analyticsBarValue}>{b.count} student{b.count !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Individual progress */}
                  <div className={pgStyles.analyticsBlock}>
                    <div className={pgStyles.analyticsBlockTitle}>Individual Progress</div>
                    <div className={pgStyles.analyticsBlockSub}>Each student's progress, sorted highest first</div>
                    <div className={pgStyles.analyticsBars}>
                      {classAnalytics.sortedStudents.map((s, i) => {
                        const palette = AVATAR_PALETTES[i % AVATAR_PALETTES.length];
                        return (
                          <div key={s.userId} className={pgStyles.analyticsStudentRow}>
                            <div className={pgStyles.rosterAvatar} style={{ "--av-bg": palette.bg, "--av-color": palette.color, width: 24, height: 24, fontSize: 9, borderRadius: 6 }}>
                              {getInitials(s.studentName)}
                            </div>
                            <span className={pgStyles.analyticsStudentName}>{s.studentName}</span>
                            <div className={pgStyles.analyticsBarTrack}>
                              <div
                                className={pgStyles.analyticsBarFill}
                                style={{
                                  width: `${Math.round((s.progressPercent / classAnalytics.maxStudentProgress) * 100)}%`,
                                  background: rosterModal.accent,
                                }}
                              />
                            </div>
                            <span className={pgStyles.analyticsBarValue}>{s.progressPercent}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherClassesPage;
