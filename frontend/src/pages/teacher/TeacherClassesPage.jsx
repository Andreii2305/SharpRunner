import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FiPlus, FiUsers, FiCopy, FiCheck, FiX, FiList } from "react-icons/fi";
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
  const rosterClassCode = useRef("");

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

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      toast.success(`Code "${code}" copied to clipboard!`);
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
    setRosterModal({ classId, className });
    rosterClassCode.current = classCode;
    setRosterStudents([]);
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
      await fetchData();
    } catch (err) {
      setModalError(
        err.response?.data?.message ?? "Failed to create classroom.",
      );
    } finally {
      setIsCreating(false);
    }
  };

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
          <div className={styles.card}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}>All classrooms</div>
              <div className={styles.sectionSub}>
                {classPerformance.length} classroom
                {classPerformance.length !== 1 ? "s" : ""}
              </div>
            </div>

            {isLoading ? (
              <div className={styles.loadingText}>Loading classrooms...</div>
            ) : classPerformance.length === 0 ? (
              <div className={styles.emptyText}>
                No classrooms yet. Create your first class.
              </div>
            ) : (
              <div className={pgStyles.classGrid}>
                {classPerformance.map((item) => (
                  <div
                    key={item.classId ?? item.className}
                    className={pgStyles.classCard}
                  >
                    <div className={pgStyles.classCardTop}>
                      <div className={pgStyles.classCardName}>
                        {item.className}
                      </div>
                      <button
                        type="button"
                        className={styles.codePill}
                        onClick={() => handleCopyCode(item.classCode)}
                        title="Click to copy code"
                        style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, border: "none" }}
                      >
                        {item.classCode}
                        {copiedCode === item.classCode
                          ? <FiCheck size={11} />
                          : <FiCopy size={11} />}
                      </button>
                    </div>
                    <div className={pgStyles.classCardMeta}>
                      <FiUsers
                        size={11}
                        style={{ marginRight: 4, verticalAlign: "middle" }}
                      />
                      {item.studentCount} students · {item.section} · SY{" "}
                      {item.schoolYear}
                    </div>
                    {item.description && (
                      <div className={pgStyles.classDesc}>
                        {item.description}
                      </div>
                    )}
                    <div className={pgStyles.classBarRow}>
                      <span className={pgStyles.classBarLabel}>
                        Avg. progress
                      </span>
                      <div className={styles.miniBarTrack}>
                        <div
                          className={styles.miniBarFill}
                          style={{
                            width: `${clampPercent(item.averageProgressPercent)}%`,
                          }}
                        />
                      </div>
                      <span className={pgStyles.classBarPct}>
                        {clampPercent(item.averageProgressPercent)}%
                      </span>
                    </div>
                    {item.classId && (
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
                    )}
                  </div>
                ))}
              </div>
            )}
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

      {rosterModal && (
        <div className={pgStyles.rosterOverlay} onClick={() => setRosterModal(null)}>
          <div className={pgStyles.rosterPanel} onClick={(e) => e.stopPropagation()}>
            <div className={pgStyles.rosterHeader}>
              <div>
                <div className={pgStyles.rosterTitle}>{rosterModal.className}</div>
                <div className={pgStyles.rosterSub}>
                  Class Roster
                  {rosterStudents.length > 0 && ` · ${rosterStudents.length} student${rosterStudents.length !== 1 ? "s" : ""}`}
                </div>
              </div>
              <button
                type="button"
                className={pgStyles.rosterClose}
                onClick={() => setRosterModal(null)}
              >
                <FiX size={16} />
              </button>
            </div>

            <div className={pgStyles.rosterBody}>
              {rosterLoading ? (
                <div className={styles.loadingText}>Loading roster...</div>
              ) : rosterStudents.length === 0 ? (
                <div className={pgStyles.rosterEmpty}>
                  <FiUsers size={28} style={{ color: "#cbd5e1", marginBottom: 8 }} />
                  <div>No students enrolled yet.</div>
                  <div className={pgStyles.rosterEmptySub}>
                    Share the class code{" "}
                    <span className={styles.codePill}>{rosterClassCode.current}</span>{" "}
                    so students can join.
                  </div>
                </div>
              ) : (
                <table className={pgStyles.rosterTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Progress</th>
                      <th>Levels</th>
                      <th>Avg Score</th>
                      <th>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterStudents.map((s, i) => (
                      <tr key={s.userId}>
                        <td className={pgStyles.rosterRank}>{i + 1}</td>
                        <td>
                          <div className={pgStyles.rosterName}>{s.studentName}</div>
                          <div className={pgStyles.rosterUsername}>@{s.username}</div>
                        </td>
                        <td>
                          <div className={pgStyles.rosterBarRow}>
                            <div className={styles.miniBarTrack} style={{ width: 72 }}>
                              <div
                                className={styles.miniBarFill}
                                style={{ width: `${clampPercent(s.progressPercent)}%` }}
                              />
                            </div>
                            <span className={pgStyles.rosterPct}>{s.progressPercent}%</span>
                          </div>
                        </td>
                        <td className={pgStyles.rosterCell}>{s.completedLevels}</td>
                        <td className={pgStyles.rosterCell}>
                          {s.avgScore != null ? s.avgScore : "—"}
                        </td>
                        <td>
                          <span
                            className={
                              s.isCurrentlyPlaying
                                ? pgStyles.rosterStatusPlaying
                                : pgStyles.rosterStatusLabel
                            }
                          >
                            {s.lastActiveLabel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherClassesPage;
