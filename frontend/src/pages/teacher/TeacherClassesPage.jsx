import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FiPlus, FiUsers, FiCopy, FiCheck } from "react-icons/fi";
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
                      <button
                        type="button"
                        onClick={() => navigate(`/teacher/classrooms/${item.classId}/levels`)}
                        style={{
                          marginTop: 10,
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#26547c",
                          background: "linear-gradient(135deg,#e8f0fb 0%,#d0e2f7 100%)",
                          border: "1.5px solid #bcd4ec",
                          borderRadius: 8,
                          padding: "5px 12px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          transition: "background 0.15s, border-color 0.15s",
                        }}
                      >
                        ⚙️ Edit Levels
                      </button>
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
    </div>
  );
}

export default TeacherClassesPage;
