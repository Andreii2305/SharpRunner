import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft, FiAward, FiBarChart2, FiBookOpen, FiCalendar,
  FiDownload, FiEdit2, FiFile, FiList, FiPaperclip, FiPlus, FiSettings, FiTrash2, FiTrendingUp, FiUpload, FiUsers, FiX,
} from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherClassesPage.module.css";
import detailStyles from "./TeacherClassDetailPage.module.css";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal.jsx";

const AVATAR_PALETTES = [
  { bg: "#e0e7ff", color: "#4338ca" }, { bg: "#fce7f3", color: "#9d174d" },
  { bg: "#d1fae5", color: "#065f46" }, { bg: "#fef3c7", color: "#92400e" },
];
const RANK_MEDALS = ["🥇", "🥈", "🥉"];
const getInitials = (name = "") => name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
const toDateTimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

function TeacherClassDetailPage() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [classroom, setClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [activeTab, setActiveTab] = useState("students");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachingLessonId, setAttachingLessonId] = useState(null);
  const [formError, setFormError] = useState("");
  const [lessonForm, setLessonForm] = useState({ title: "", description: "", dueAt: "" });
  const [lessonFiles, setLessonFiles] = useState([]);
  const [editingLesson, setEditingLesson] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", dueAt: "" });
  const [editError, setEditError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadClass = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [rosterResult, lessonResult] = await Promise.all([
        axios.get(buildApiUrl(`/api/teacher/classrooms/${classroomId}/students`), { headers: getAuthHeaders() }),
        axios.get(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons`), { headers: getAuthHeaders() }),
      ]);
      setClassroom(rosterResult.data?.classroom ?? lessonResult.data?.classroom ?? null);
      setStudents(rosterResult.data?.students ?? []);
      setLessons(lessonResult.data?.lessons ?? []);
    } catch (error) {
      setLoadError(error.response?.data?.message ?? "Failed to load classroom.");
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => { loadClass(); }, [loadClass]);

  const analytics = useMemo(() => {
    const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const scored = students.filter((student) => student.avgScore != null);
    return {
      avgProgress: Math.round(average(students.map((student) => student.progressPercent))),
      avgScore: scored.length ? Math.round(average(scored.map((student) => student.avgScore)) * 10) / 10 : "—",
      completions: students.reduce((sum, student) => sum + student.completedLevels, 0),
      playing: students.filter((student) => student.isCurrentlyPlaying).length,
    };
  }, [students]);

  const addLesson = async (event) => {
    event.preventDefault();
    if (!lessonForm.title.trim()) { setFormError("Lesson title is required."); return; }
    setSaving(true);
    setUploadProgress(0);
    setFormError("");
    try {
      const payload = new FormData();
      payload.append("title", lessonForm.title.trim());
      payload.append("description", lessonForm.description.trim());
      if (lessonForm.dueAt) payload.append("dueAt", new Date(lessonForm.dueAt).toISOString());
      lessonFiles.forEach((file) => payload.append("files", file));
      const response = await axios.post(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons`),
        payload,
        {
          headers: getAuthHeaders(),
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
          },
        },
      );
      setLessons((current) => [response.data.lesson, ...current]);
      setLessonForm({ title: "", description: "", dueAt: "" });
      setLessonFiles([]);
      setShowAddLesson(false);
      toast.success("Lesson added to this class.");
    } catch (error) {
      setFormError(error.response?.data?.message ?? "Failed to add lesson.");
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const openAttachment = async (attachment) => {
    const inline = /^(video\/|audio\/|image\/|application\/pdf$|text\/)/i.test(attachment.mimeType);
    const previewWindow = inline ? window.open("", "_blank") : null;
    try {
      const response = await axios.get(buildApiUrl(`/api/lesson-content/classroom-files/${attachment.id}`), {
        headers: getAuthHeaders(), responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      if (previewWindow) previewWindow.location.href = url;
      else {
        const link = document.createElement("a");
        link.href = url; link.download = attachment.originalName; link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      previewWindow?.close();
      toast.error("Unable to open attachment.");
    }
  };

  const addLessonAttachments = async (lessonId, selectedFiles) => {
    const files = Array.from(selectedFiles ?? []).slice(0, 10);
    if (!files.length) return;
    setAttachingLessonId(lessonId);
    try {
      const payload = new FormData();
      files.forEach((file) => payload.append("files", file));
      const response = await axios.post(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lessonId}/attachments`),
        payload,
        { headers: getAuthHeaders() },
      );
      setLessons((current) => current.map((lesson) =>
        lesson.id === lessonId ? { ...lesson, attachments: response.data?.attachments ?? lesson.attachments } : lesson
      ));
      toast.success(response.data?.removedUnavailableCount
        ? "Files re-uploaded and the unavailable copy was removed."
        : "Files added to the lesson.");
    } catch (error) {
      toast.error(error.response?.data?.message ?? "Unable to add files.");
    } finally {
      setAttachingLessonId(null);
    }
  };

  const openEditLesson = (lesson) => {
    setEditingLesson(lesson);
    setEditForm({
      title: lesson.title ?? "",
      description: lesson.description ?? "",
      dueAt: toDateTimeLocal(lesson.dueAt),
    });
    setEditError("");
  };

  const saveLessonChanges = async (event) => {
    event.preventDefault();
    if (!editForm.title.trim()) { setEditError("Lesson title is required."); return; }
    setIsEditing(true);
    setEditError("");
    try {
      const response = await axios.put(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${editingLesson.id}`),
        {
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          dueAt: editForm.dueAt ? new Date(editForm.dueAt).toISOString() : null,
        },
        { headers: getAuthHeaders() },
      );
      setLessons((current) => current.map((lesson) =>
        lesson.id === editingLesson.id ? response.data.lesson : lesson
      ));
      setEditingLesson(null);
      toast.success("Lesson updated.");
    } catch (error) {
      setEditError(error.response?.data?.message ?? "Unable to update lesson.");
    } finally {
      setIsEditing(false);
    }
  };

  const deleteLesson = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await axios.delete(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${deleteTarget.id}`),
        { headers: getAuthHeaders() },
      );
      setLessons((current) => current.filter((lesson) => lesson.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Lesson deleted.");
    } catch (error) {
      toast.error(error.response?.data?.message ?? "Unable to delete lesson.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.root}>
      <Sidebar />
      <main className={styles.main}>
        <header className={styles.pageHeader}>
          <div className={detailStyles.headerIdentity}>
            <button className={detailStyles.backButton} type="button" onClick={() => navigate("/teacher/classes")} aria-label="Back to classes"><FiArrowLeft /></button>
            <div>
              <div className={styles.pageTitle}>{classroom?.className ?? "Classroom"}</div>
              <div className={detailStyles.headerMeta}>{classroom ? `${classroom.section} · SY ${classroom.schoolYear} · ${classroom.classCode}` : "Loading class details…"}</div>
            </div>
          </div>
          <button className={styles.btnOutline} type="button" onClick={() => navigate(`/teacher/classrooms/${classroomId}/levels`)}><FiSettings /> Edit levels</button>
        </header>

        <div className={styles.body}>
          {loadError && <div className={styles.errorText}>{loadError}</div>}
          <section className={detailStyles.heroCard}>
            <div className={detailStyles.heroIcon}>{(classroom?.className?.[0] ?? "C").toUpperCase()}</div>
            <div className={detailStyles.heroCopy}>
              <h1>{classroom?.className ?? "Classroom"}</h1>
              <p>{classroom?.description || "Manage students, progress, and class-only lessons from one place."}</p>
            </div>
            <div className={detailStyles.heroStats}>
              <div><strong>{students.length}</strong><span>Students</span></div>
              <div><strong>{lessons.length}</strong><span>Class lessons</span></div>
              <div><strong>{analytics.avgProgress}%</strong><span>Avg progress</span></div>
            </div>
          </section>

          <nav className={detailStyles.tabs} aria-label="Classroom sections">
            {[
              ["students", <FiList key="students" />, "Students"],
              ["analytics", <FiBarChart2 key="analytics" />, "Analytics"],
              ["lessons", <FiBookOpen key="lessons" />, "Lessons"],
            ].map(([key, icon, label]) => (
              <button type="button" key={key} className={activeTab === key ? detailStyles.tabActive : detailStyles.tab} onClick={() => setActiveTab(key)}>{icon}{label}{key === "lessons" && <span>{lessons.length}</span>}</button>
            ))}
          </nav>

          <section className={detailStyles.contentCard}>
            {loading ? <div className={styles.loadingText}>Loading classroom…</div> : activeTab === "students" ? (
              students.length ? (
                <div className={detailStyles.tableScroll}><table className={pgStyles.rosterTable}>
                  <thead><tr><th>#</th><th>Student</th><th>Progress</th><th>Levels Done</th><th>Avg Score</th><th>Last Active</th></tr></thead>
                  <tbody>{students.map((student, index) => { const palette = AVATAR_PALETTES[index % AVATAR_PALETTES.length]; return (
                    <tr key={student.userId}><td className={pgStyles.rosterRank}>{index < 3 ? RANK_MEDALS[index] : index + 1}</td><td><div className={pgStyles.rosterNameCell}><div className={pgStyles.rosterAvatar} style={{ "--av-bg": palette.bg, "--av-color": palette.color }}>{getInitials(student.studentName)}</div><div><div className={pgStyles.rosterName}>{student.studentName}</div><div className={pgStyles.rosterUsername}>@{student.username}</div></div></div></td><td><div className={pgStyles.rosterBarRow}><div className={pgStyles.rosterBarTrack}><div className={`${pgStyles.rosterBarFill} ${student.progressPercent >= 75 ? pgStyles.rosterBarFillHigh : student.progressPercent >= 40 ? pgStyles.rosterBarFillMid : pgStyles.rosterBarFillLow}`} style={{ width: `${student.progressPercent}%` }} /></div><span className={pgStyles.rosterPct}>{student.progressPercent}%</span></div></td><td>{student.completedLevels}</td><td>{student.avgScore ?? "—"}</td><td>{student.lastActiveLabel}</td></tr>
                  ); })}</tbody>
                </table></div>
              ) : <div className={detailStyles.emptyState}><FiUsers /><h2>No students enrolled yet</h2><p>Share class code <strong>{classroom?.classCode}</strong> so students can join.</p></div>
            ) : activeTab === "analytics" ? (
              <div className={detailStyles.analyticsGrid}>
                <div><FiTrendingUp /><strong>{analytics.avgProgress}%</strong><span>Average progress</span></div>
                <div><FiAward /><strong>{analytics.avgScore}</strong><span>Average score</span></div>
                <div><FiBarChart2 /><strong>{analytics.completions}</strong><span>Total completions</span></div>
                <div><FiUsers /><strong>{analytics.playing}</strong><span>Playing now</span></div>
              </div>
            ) : (
              <div>
                <div className={detailStyles.sectionHeader}><div><h2>Class lessons</h2><p>These lessons are visible only to students enrolled in {classroom?.className ?? "this class"}.</p></div><button className={styles.btnPrimary} type="button" onClick={() => { setShowAddLesson(true); setFormError(""); }}><FiPlus /> Add lesson</button></div>
                {lessons.length ? <div className={detailStyles.lessonGrid}>{lessons.map((lesson) => (
                  <div className={detailStyles.lessonCardWrap} key={lesson.id}>
                  <article key={lesson.id} className={detailStyles.lessonCard}><div className={detailStyles.lessonIcon}><FiBookOpen /></div><div><div className={detailStyles.lessonTop}><h3>{lesson.title}</h3><span>Published</span></div><p>{lesson.description || "No additional instructions."}</p>{lesson.dueAt && <small><FiCalendar /> Due {new Date(lesson.dueAt).toLocaleString()}</small>}{lesson.attachments?.length > 0 && <div className={detailStyles.attachmentList}>{lesson.attachments.map((attachment) => <button type="button" key={attachment.id} onClick={() => openAttachment(attachment)}><FiFile /><span>{attachment.originalName}</span><FiDownload /></button>)}</div>}<label className={detailStyles.addFilesButton}><FiUpload /> {attachingLessonId === lesson.id ? "Uploading…" : lesson.attachments?.length ? "Add or re-upload files" : "Add files"}<input type="file" multiple disabled={attachingLessonId != null} onChange={(event) => { addLessonAttachments(lesson.id, event.target.files); event.target.value = ""; }} /></label></div></article>
                    <div className={detailStyles.lessonActions}>
                      <button type="button" onClick={() => openEditLesson(lesson)}><FiEdit2 /> Edit</button>
                      <button type="button" className={detailStyles.deleteLessonButton} onClick={() => setDeleteTarget(lesson)}><FiTrash2 /> Delete</button>
                    </div>
                  </div>
                ))}</div> : <div className={detailStyles.emptyState}><FiBookOpen /><h2>No class lessons yet</h2><p>Add a lesson and it will appear only to students in this class.</p><button className={styles.btnPrimary} type="button" onClick={() => setShowAddLesson(true)}><FiPlus /> Add first lesson</button></div>}
              </div>
            )}
          </section>
        </div>
      </main>

      {showAddLesson && <div className={styles.modalBackdrop} onMouseDown={() => setShowAddLesson(false)}><div className={`${styles.modalCard} ${detailStyles.lessonModal}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}><h3>Add lesson to {classroom?.className}</h3><button type="button" className={styles.modalCloseBtn} onClick={() => setShowAddLesson(false)}><FiX /></button></div>
        {formError && <div className={styles.modalError}>{formError}</div>}
        <form className={styles.modalForm} onSubmit={addLesson}>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Lesson title<input autoFocus maxLength={160} value={lessonForm.title} onChange={(event) => setLessonForm((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Arrays review" /></label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Instructions<textarea className={detailStyles.textarea} maxLength={4000} value={lessonForm.description} onChange={(event) => setLessonForm((current) => ({ ...current, description: event.target.value }))} placeholder="What should students learn or complete?" /></label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Due date (optional)<input type="datetime-local" value={lessonForm.dueAt} onChange={(event) => setLessonForm((current) => ({ ...current, dueAt: event.target.value }))} /></label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Attachments (optional)
            <span className={detailStyles.filePicker}><FiUpload /><span><strong>Choose files</strong><small>MP4, PDF, Word, images, archives, or any other file · up to 100 MB each</small></span><input type="file" multiple onChange={(event) => setLessonFiles(Array.from(event.target.files ?? []).slice(0, 10))} /></span>
          </label>
          {lessonFiles.length > 0 && <div className={detailStyles.selectedFiles}>{lessonFiles.map((file) => <span key={`${file.name}-${file.lastModified}`}><FiPaperclip /> {file.name}</span>)}</div>}
          {saving && lessonFiles.length > 0 && <div className={detailStyles.uploadProgress}><span style={{ width: `${uploadProgress}%` }} /><small>Uploading {uploadProgress}%</small></div>}
          <div className={styles.modalActions}><button className={styles.btnOutline} type="button" disabled={saving} onClick={() => setShowAddLesson(false)}>Cancel</button><button className={styles.btnPrimary} disabled={saving} type="submit">{saving ? "Adding…" : "Add lesson"}</button></div>
        </form>
      </div></div>}

      {editingLesson && <div className={styles.modalBackdrop} onMouseDown={() => !isEditing && setEditingLesson(null)}><div className={`${styles.modalCard} ${detailStyles.lessonModal}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}><h3>Edit lesson</h3><button type="button" className={styles.modalCloseBtn} disabled={isEditing} onClick={() => setEditingLesson(null)}><FiX /></button></div>
        {editError && <div className={styles.modalError}>{editError}</div>}
        <form className={styles.modalForm} onSubmit={saveLessonChanges}>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Lesson title<input autoFocus maxLength={160} value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Instructions<textarea className={detailStyles.textarea} maxLength={4000} value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Due date (optional)<input type="datetime-local" value={editForm.dueAt} onChange={(event) => setEditForm((current) => ({ ...current, dueAt: event.target.value }))} /></label>
          <div className={styles.modalActions}><button className={styles.btnOutline} type="button" disabled={isEditing} onClick={() => setEditingLesson(null)}>Cancel</button><button className={styles.btnPrimary} disabled={isEditing} type="submit">{isEditing ? "Savingâ€¦" : "Save changes"}</button></div>
        </form>
      </div></div>}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete this lesson?"
        message={deleteTarget ? `“${deleteTarget.title}” and all of its attachments will be permanently removed from this class.` : ""}
        confirmLabel={isDeleting ? "Deletingâ€¦" : "Delete lesson"}
        danger
        confirmDisabled={isDeleting}
        onConfirm={deleteLesson}
        onCancel={() => !isDeleting && setDeleteTarget(null)}
      />
    </div>
  );
}

export default TeacherClassDetailPage;
