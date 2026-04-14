import { useEffect, useState } from "react";
import axios from "axios";
import { FiMessageSquare, FiSend } from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import {
  buildAnnouncementPayload,
  parseAnnouncementPayload,
  formatDateTime,
} from "./TeacherDashboardPage.jsx";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherAnnouncementsPage.module.css";

function TeacherAnnouncementsPage() {
  const [annData, setAnnData] = useState({ classrooms: [], announcements: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [annError, setAnnError] = useState("");
  const [annSuccess, setAnnSuccess] = useState("");
  const [annForm, setAnnForm] = useState({
    classroomId: "",
    header: "",
    message: "",
  });

  const fetchData = async () => {
    setIsLoading(true);
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
          /* fall through */
        }
      }
      setAnnError(
        err.response?.data?.message ?? "Failed to load announcements.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onFieldChange = (e) => {
    const { name, value } = e.target;
    setAnnForm((c) => ({ ...c, [name]: value }));
  };

  const onPost = async (e) => {
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
      setAnnSuccess("Announcement posted to student dashboard.");
      setAnnForm((c) => ({ ...c, header: "", message: "" }));
      await fetchData();
    } catch (err) {
      setAnnError(
        err.response?.status === 404
          ? "Announcement API not found. Restart backend from latest code."
          : (err.response?.data?.message ?? "Failed to post announcement."),
      );
    } finally {
      setIsPosting(false);
    }
  };

  const teacherClassrooms = annData.classrooms ?? [];
  const teacherAnnouncements = annData.announcements ?? [];

  return (
    <div className={styles.root}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.pageHeader}>
          <div className={styles.pageTitle}>Announcements</div>
          <div className={styles.sectionSub}>
            {teacherAnnouncements.length} announcement
            {teacherAnnouncements.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className={styles.body}>
          <div className={pgStyles.annGrid}>
            {/* Composer */}
            <div className={styles.card}>
              <div className={styles.sectionTitle}>Post announcement</div>
              <p className={pgStyles.annHint}>
                <FiMessageSquare size={13} />
                Post reminders, deadlines, or guidance. Students see this in
                their dashboard.
              </p>

              {annError && <div className={pgStyles.annError}>{annError}</div>}
              {annSuccess && (
                <div className={pgStyles.annSuccess}>{annSuccess}</div>
              )}

              <form onSubmit={onPost} className={pgStyles.annForm}>
                <label className={pgStyles.annLabel}>
                  <span>Classroom</span>
                  <select
                    name="classroomId"
                    value={annForm.classroomId}
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
                <label className={pgStyles.annLabel}>
                  <span>Header</span>
                  <input
                    type="text"
                    name="header"
                    value={annForm.header}
                    onChange={onFieldChange}
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
                    onChange={onFieldChange}
                    rows={6}
                    maxLength={1000}
                    placeholder="Type your announcement details for students..."
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
                    {isPosting ? "Posting..." : "Post announcement"}
                  </button>
                </div>
              </form>
            </div>

            {/* Full feed */}
            <div className={styles.card}>
              <div className={styles.sectionTitle}>All announcements</div>
              {isLoading ? (
                <div className={styles.loadingText}>Loading...</div>
              ) : teacherAnnouncements.length === 0 ? (
                <div className={styles.emptyText}>
                  No announcements posted yet.
                </div>
              ) : (
                <div className={pgStyles.annList}>
                  {teacherAnnouncements.map((item) => {
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
    </div>
  );
}

export default TeacherAnnouncementsPage;
