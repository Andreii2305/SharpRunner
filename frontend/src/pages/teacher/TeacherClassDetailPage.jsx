import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft, FiAward, FiBarChart2, FiBookOpen, FiCalendar,
  FiCheckCircle, FiCopy, FiDownload, FiEdit2, FiEye, FiEyeOff, FiFile, FiList, FiMoreVertical, FiMove, FiPaperclip, FiPlus, FiSettings, FiTrash2, FiTrendingUp, FiUpload, FiUsers, FiX,
} from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherClassesPage.module.css";
import detailStyles from "./TeacherClassDetailPage.module.css";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal.jsx";
import { DEFAULT_UPLOAD_POLICY, normalizeUploadPolicy, validateUploadFiles } from "../../utils/uploadPolicy.js";

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
const formatFileSize = (value) => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};
const getFileExtension = (name = "") => name.includes(".") ? name.split(".").pop().toUpperCase() : "FILE";
const emptyContentForm = (contentType = "lesson", uploadPolicy = DEFAULT_UPLOAD_POLICY) => ({ contentType, title: "", description: "", dueAt: "", publishAt: "", isPublished: true, maxScore: 100, rubric: [], feedbackReleaseAt: "", allowLateSubmissions: true, maxAttempts: 0, allowedFileTypes: "", maxFileSizeMb: uploadPolicy.maxFileSizeMb, assignedStudentIds: [] });

function AssignmentSettings({ form, setForm, students, uploadPolicy }) {
  if (form.contentType !== "assignment") return null;
  const updateRubric = (index, changes) => setForm((current) => ({ ...current, rubric: current.rubric.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) }));
  return <div className={detailStyles.assignmentSettings}>
    <fieldset><legend>Submission policies</legend><div className={detailStyles.settingsGrid}><label>Maximum attempts <input type="number" min="0" max="100" value={form.maxAttempts} onChange={(event) => setForm((current) => ({ ...current, maxAttempts: event.target.value }))} /><small>0 means unlimited</small></label><label>Maximum file size <span><input type="number" min="1" max={uploadPolicy.maxFileSizeMb} value={form.maxFileSizeMb} onChange={(event) => setForm((current) => ({ ...current, maxFileSizeMb: event.target.value }))} /> MB</span><small>Server maximum: {uploadPolicy.maxFileSizeMb} MB</small></label><label>Accepted extensions <input value={form.allowedFileTypes} onChange={(event) => setForm((current) => ({ ...current, allowedFileTypes: event.target.value }))} placeholder="pdf, docx, png (blank = any safe type)" /></label><label className={detailStyles.checkSetting}><input type="checkbox" checked={form.allowLateSubmissions} onChange={(event) => setForm((current) => ({ ...current, allowLateSubmissions: event.target.checked }))} /> Accept late submissions</label><label>Release grades and feedback <input type="datetime-local" value={form.feedbackReleaseAt} onChange={(event) => setForm((current) => ({ ...current, feedbackReleaseAt: event.target.value }))} /><small>Blank releases feedback immediately</small></label></div></fieldset>
    <fieldset><legend>Audience</legend><label className={detailStyles.audienceAll}><input type="checkbox" checked={!form.assignedStudentIds.length} onChange={(event) => event.target.checked && setForm((current) => ({ ...current, assignedStudentIds: [] }))} /> Entire class</label><div className={detailStyles.audienceList}>{students.map((student) => <label key={student.userId}><input type="checkbox" checked={!form.assignedStudentIds.length || form.assignedStudentIds.includes(student.userId)} onChange={() => setForm((current) => { const currentIds = current.assignedStudentIds.length ? current.assignedStudentIds : students.map((item) => item.userId); const next = currentIds.includes(student.userId) ? currentIds.filter((id) => id !== student.userId) : [...currentIds, student.userId]; return { ...current, assignedStudentIds: next.length === students.length ? [] : next }; })} /> {student.studentName}</label>)}</div></fieldset>
    <fieldset><legend>Rubric</legend>{form.rubric.map((criterion, index) => <div className={detailStyles.rubricRow} key={criterion.id}><input value={criterion.title} onChange={(event) => updateRubric(index, { title: event.target.value })} placeholder="Criterion" /><input type="number" min="1" value={criterion.points} onChange={(event) => updateRubric(index, { points: event.target.value })} aria-label={`Points for criterion ${index + 1}`} /><button type="button" onClick={() => setForm((current) => ({ ...current, rubric: current.rubric.filter((_, itemIndex) => itemIndex !== index) }))}><FiTrash2 /></button></div>)}<button type="button" className={detailStyles.addCriterion} onClick={() => setForm((current) => ({ ...current, rubric: [...current.rubric, { id: `criterion-${Date.now()}`, title: "", points: 10 }] }))}><FiPlus /> Add criterion</button>{form.rubric.length > 0 && <small>Rubric total: {form.rubric.reduce((sum, item) => sum + (Number(item.points) || 0), 0)} points</small>}</fieldset>
  </div>;
}

function RubricScoring({ rubric, value, onChange }) {
  if (!rubric?.length) return null;
  const scores = value ?? [];
  const update = (criterion, score) => onChange(rubric.map((item) => item.id === criterion.id ? { id: item.id, score: Math.min(Number(item.points) || 0, Math.max(0, Number(score) || 0)) } : scores.find((entry) => entry.id === item.id) ?? { id: item.id, score: 0 }));
  return <div className={detailStyles.rubricScoring}><strong>Rubric scoring</strong>{rubric.map((criterion) => <label key={criterion.id}><span>{criterion.title}</span><span><input type="number" min="0" max={criterion.points} value={scores.find((entry) => entry.id === criterion.id)?.score ?? 0} onChange={(event) => update(criterion, event.target.value)} /> / {criterion.points}</span></label>)}</div>;
}

function TeacherClassDetailPage() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [classroom, setClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [uploadPolicy, setUploadPolicy] = useState(DEFAULT_UPLOAD_POLICY);
  const [activeTab, setActiveTab] = useState("students");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachingLessonId, setAttachingLessonId] = useState(null);
  const [formError, setFormError] = useState("");
  const [lessonForm, setLessonForm] = useState(emptyContentForm());
  const [lessonFiles, setLessonFiles] = useState([]);
  const [editingLesson, setEditingLesson] = useState(null);
  const [editForm, setEditForm] = useState(emptyContentForm());
  const [editError, setEditError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reviewLesson, setReviewLesson] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [contentFilter, setContentFilter] = useState("all");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [gradeForm, setGradeForm] = useState({ grade: "", feedback: "", rubricScores: [] });
  const [management, setManagement] = useState({ storage: null, audits: [], insights: null });
  const [historyLesson, setHistoryLesson] = useState(null);
  const [versions, setVersions] = useState([]);
  const [publishTarget, setPublishTarget] = useState(null);
  const [draggedLessonId, setDraggedLessonId] = useState(null);
  const [studentRemoveTarget, setStudentRemoveTarget] = useState(null);
  const [classActionTarget, setClassActionTarget] = useState(null);
  const [classActionPending, setClassActionPending] = useState(false);

  const loadClass = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [rosterResult, lessonResult, managementResult] = await Promise.all([
        axios.get(buildApiUrl(`/api/teacher/classrooms/${classroomId}/students`), { headers: getAuthHeaders() }),
        axios.get(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons`), { headers: getAuthHeaders() }),
        axios.get(buildApiUrl(`/api/teacher/classrooms/${classroomId}/classwork-management`), { headers: getAuthHeaders() }).catch(() => ({ data: null })),
      ]);
      setClassroom(rosterResult.data?.classroom ?? lessonResult.data?.classroom ?? null);
      setStudents(rosterResult.data?.students ?? []);
      setLessons(lessonResult.data?.lessons ?? []);
      setUploadPolicy(normalizeUploadPolicy(lessonResult.data?.uploadPolicy));
      setManagement(managementResult.data ?? { storage: null, audits: [], insights: null });
    } catch (error) {
      setLoadError(error.response?.data?.message ?? "Failed to load classroom.");
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => { loadClass(); }, [loadClass]);
  useEffect(() => {
    if (!showAddLesson) return undefined;
    const timer = window.setTimeout(() => window.localStorage.setItem(`classwork-draft:${classroomId}:${lessonForm.contentType}`, JSON.stringify(lessonForm)), 500);
    return () => window.clearTimeout(timer);
  }, [showAddLesson, classroomId, lessonForm]);
  useEffect(() => {
    if (!selectedSubmission || !reviewLesson) return;
    setGradeForm({
      grade: selectedSubmission.grade ?? "", feedback: selectedSubmission.feedback ?? "",
      rubricScores: (reviewLesson.rubric ?? []).map((criterion) => selectedSubmission.rubricScores?.find((score) => score.id === criterion.id) ?? { id: criterion.id, score: 0 }),
    });
  }, [selectedSubmission, reviewLesson]);

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

  const filteredLessons = useMemo(() => lessons.filter((lesson) => contentFilter === "all" || lesson.contentType === contentFilter), [lessons, contentFilter]);

  const performAddLesson = async () => {
    if (!lessonForm.title.trim()) { setFormError("Lesson title is required."); return; }
    setSaving(true);
    setUploadProgress(0);
    setFormError("");
    try {
      const payload = new FormData();
      payload.append("title", lessonForm.title.trim());
      payload.append("contentType", lessonForm.contentType);
      payload.append("description", lessonForm.description.trim());
      if (lessonForm.dueAt) payload.append("dueAt", new Date(lessonForm.dueAt).toISOString());
      if (lessonForm.publishAt) payload.append("publishAt", new Date(lessonForm.publishAt).toISOString());
      payload.append("isPublished", String(lessonForm.isPublished));
      payload.append("maxScore", String(lessonForm.maxScore));
      payload.append("rubric", JSON.stringify(lessonForm.rubric));
      payload.append("assignedStudentIds", JSON.stringify(lessonForm.assignedStudentIds));
      payload.append("allowedFileTypes", JSON.stringify(lessonForm.allowedFileTypes.split(",").map((item) => item.trim()).filter(Boolean)));
      payload.append("allowLateSubmissions", String(lessonForm.allowLateSubmissions));
      payload.append("maxAttempts", String(lessonForm.maxAttempts));
      payload.append("maxFileSizeMb", String(lessonForm.maxFileSizeMb));
      if (lessonForm.feedbackReleaseAt) payload.append("feedbackReleaseAt", new Date(lessonForm.feedbackReleaseAt).toISOString());
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
      window.localStorage.removeItem(`classwork-draft:${classroomId}:${lessonForm.contentType}`);
      setLessonForm(emptyContentForm("lesson", uploadPolicy));
      setLessonFiles([]);
      setShowAddLesson(false);
      toast.success(`${lessonForm.contentType === "assignment" ? "Assignment" : "Lesson"} added to this class.`);
    } catch (error) {
      setFormError(error.response?.data?.message ?? "Failed to add lesson.");
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const addLesson = (event) => {
    event.preventDefault();
    if (!lessonForm.title.trim()) { setFormError("Lesson title is required."); return; }
    if (lessonForm.isPublished) {
      setPublishTarget({ kind: "create", title: lessonForm.title, contentType: lessonForm.contentType });
      return;
    }
    performAddLesson();
  };

  const openAttachment = async (attachment) => {
    const office = /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(attachment.originalName);
    const inline = /^(video\/|audio\/|image\/|application\/pdf$|text\/)/i.test(attachment.mimeType) || office;
    const previewWindow = inline ? window.open("", "_blank") : null;
    try {
      const response = await axios.get(buildApiUrl(`/api/lesson-content/classroom-files/${attachment.id}${office ? "/preview" : ""}`), {
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

  const openSubmissionAttachment = async (attachment) => {
    const previewWindow = window.open("", "_blank");
    try {
      const response = await axios.get(buildApiUrl(`/api/lesson-content/submission-files/${attachment.id}`), { headers: getAuthHeaders(), responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      previewWindow.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { previewWindow?.close(); toast.error("Unable to open submitted file."); }
  };

  const addLessonAttachments = async (lessonId, selectedFiles) => {
    const { files, error } = validateUploadFiles(selectedFiles, uploadPolicy);
    if (error) { toast.error(error); return; }
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
      contentType: lesson.contentType ?? (lesson.allowSubmissions ? "assignment" : "lesson"),
      title: lesson.title ?? "",
      description: lesson.description ?? "",
      dueAt: toDateTimeLocal(lesson.dueAt),
      publishAt: toDateTimeLocal(lesson.publishAt),
      isPublished: lesson.isPublished,
      maxScore: lesson.maxScore ?? 100,
      rubric: lesson.rubric ?? [], feedbackReleaseAt: toDateTimeLocal(lesson.feedbackReleaseAt),
      allowLateSubmissions: lesson.allowLateSubmissions !== false, maxAttempts: lesson.maxAttempts ?? 0,
      allowedFileTypes: (lesson.allowedFileTypes ?? []).join(", "), maxFileSizeMb: Math.min(lesson.maxFileSizeMb ?? uploadPolicy.maxFileSizeMb, uploadPolicy.maxFileSizeMb),
      assignedStudentIds: lesson.assignedStudentIds ?? [],
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
          contentType: editForm.contentType,
          description: editForm.description.trim(),
          dueAt: editForm.dueAt ? new Date(editForm.dueAt).toISOString() : null,
          publishAt: editForm.publishAt ? new Date(editForm.publishAt).toISOString() : null,
          isPublished: editForm.isPublished,
          maxScore: Number(editForm.maxScore) || 100,
          rubric: editForm.rubric, feedbackReleaseAt: editForm.feedbackReleaseAt ? new Date(editForm.feedbackReleaseAt).toISOString() : null,
          allowLateSubmissions: editForm.allowLateSubmissions, maxAttempts: Number(editForm.maxAttempts) || 0,
          allowedFileTypes: editForm.allowedFileTypes.split(",").map((item) => item.trim()).filter(Boolean),
          maxFileSizeMb: Number(editForm.maxFileSizeMb) || uploadPolicy.maxFileSizeMb, assignedStudentIds: editForm.assignedStudentIds,
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

  const updateAttachment = async (lesson, attachment, changes) => {
    try {
      const response = await axios.patch(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lesson.id}/attachments/${attachment.id}`), changes, { headers: getAuthHeaders() });
      setLessons((current) => current.map((item) => item.id === lesson.id ? { ...item, attachments: item.attachments.map((file) => file.id === attachment.id ? response.data.attachment : file).sort((a, b) => a.displayOrder - b.displayOrder) } : item));
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to update attachment."); }
  };

  const renameAttachment = (lesson, attachment) => {
    const originalName = window.prompt("Attachment name", attachment.originalName)?.trim();
    if (originalName && originalName !== attachment.originalName) updateAttachment(lesson, attachment, { originalName });
  };

  const deleteAttachment = async (lesson, attachment) => {
    if (!window.confirm(`Remove ${attachment.originalName}?`)) return;
    try {
      await axios.delete(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lesson.id}/attachments/${attachment.id}`), { headers: getAuthHeaders() });
      setLessons((current) => current.map((item) => item.id === lesson.id ? { ...item, attachments: item.attachments.filter((file) => file.id !== attachment.id) } : item));
      toast.success("Attachment removed.");
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to remove attachment."); }
  };

  const replaceAttachment = async (lesson, attachment, file) => {
    if (!file) return;
    const validation = validateUploadFiles([file], uploadPolicy);
    if (validation.error) { toast.error(validation.error); return; }
    const payload = new FormData(); payload.append("files", file);
    try {
      const response = await axios.put(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lesson.id}/attachments/${attachment.id}/file`), payload, { headers: getAuthHeaders() });
      setLessons((current) => current.map((item) => item.id === lesson.id ? { ...item, attachments: item.attachments.map((entry) => entry.id === attachment.id ? response.data.attachment : entry) } : item));
      toast.success("Attachment replaced.");
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to replace attachment."); }
  };

  const reorderAttachments = async (lesson, sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const items = [...(lesson.attachments || [])];
    const sourceIndex = items.findIndex((item) => item.id === sourceId); const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = items.splice(sourceIndex, 1); items.splice(targetIndex, 0, moved);
    const attachments = items.map((item, displayOrder) => ({ ...item, displayOrder }));
    setLessons((current) => current.map((item) => item.id === lesson.id ? { ...item, attachments } : item));
    try { await axios.put(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lesson.id}/attachments/reorder`), { attachmentIds: attachments.map((item) => item.id) }, { headers: getAuthHeaders() }); }
    catch { toast.error("Unable to reorder attachments."); loadClass(); }
  };

  const reorderLessons = async (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const items = [...lessons]; const sourceIndex = items.findIndex((item) => item.id === sourceId); const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = items.splice(sourceIndex, 1); items.splice(targetIndex, 0, moved); setLessons(items);
    try { await axios.put(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/reorder`), { lessonIds: items.map((item) => item.id) }, { headers: getAuthHeaders() }); }
    catch { toast.error("Unable to reorder classwork."); loadClass(); }
  };

  const moveLesson = (lessonId, direction) => {
    const index = lessons.findIndex((item) => item.id === lessonId);
    const target = lessons[index + direction];
    if (index >= 0 && target) reorderLessons(lessonId, target.id);
  };

  const duplicateLesson = async (lesson) => {
    try {
      const response = await axios.post(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lesson.id}/duplicate`), {}, { headers: getAuthHeaders() });
      setLessons((current) => [...current, response.data.lesson]); toast.success("A draft copy was created.");
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to duplicate classwork."); }
  };

  const openVersionHistory = async (lesson) => {
    setHistoryLesson(lesson); setVersions([]);
    try {
      const response = await axios.get(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lesson.id}/versions`), { headers: getAuthHeaders() });
      setVersions(response.data?.versions ?? []);
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to load version history."); }
  };

  const restoreVersion = async (version) => {
    if (!historyLesson) return;
    try {
      const response = await axios.post(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${historyLesson.id}/versions/${version.id}/restore`), {}, { headers: getAuthHeaders() });
      setLessons((current) => current.map((item) => item.id === historyLesson.id ? { ...item, ...response.data.lesson, stats: item.stats } : item));
      setHistoryLesson(null); toast.success(`Version ${version.versionNumber} restored.`); loadClass();
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to restore this version."); }
  };

  const releaseFeedback = async (lesson) => {
    try {
      const response = await axios.post(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lesson.id}/release-feedback`), {}, { headers: getAuthHeaders() });
      setLessons((current) => current.map((item) => item.id === lesson.id ? { ...item, feedbackReleaseAt: response.data.feedbackReleaseAt ?? null } : item));
      toast.success("Grades and feedback are now visible to students.");
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to release feedback."); }
  };

  const setPublication = async (lesson, isPublished) => {
    try {
      const response = await axios.put(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lesson.id}`), {
        title: lesson.title, description: lesson.description || "", contentType: lesson.contentType,
        dueAt: lesson.dueAt, publishAt: isPublished ? lesson.publishAt : null, isPublished, maxScore: lesson.maxScore,
        rubric: lesson.rubric, feedbackReleaseAt: lesson.feedbackReleaseAt, allowLateSubmissions: lesson.allowLateSubmissions,
        maxAttempts: lesson.maxAttempts, allowedFileTypes: lesson.allowedFileTypes, maxFileSizeMb: lesson.maxFileSizeMb,
        assignedStudentIds: lesson.assignedStudentIds,
      }, { headers: getAuthHeaders() });
      setLessons((current) => current.map((item) => item.id === lesson.id ? { ...item, ...response.data.lesson, stats: item.stats } : item));
      toast.success(isPublished ? "Published to the class." : "Classwork moved to drafts.");
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to change publication status."); }
  };

  const previewLesson = (lesson) => window.open(`/${lesson.contentType === "assignment" ? "assignment" : "lesson"}/classroom/${lesson.id}?teacherPreview=1`, "_blank");

  const openSubmissions = async (lesson) => {
    setReviewLesson(lesson); setReviewLoading(true); setSubmissions([]); setSelectedSubmission(null);
    try {
      const response = await axios.get(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${lesson.id}/submissions`), { headers: getAuthHeaders() });
      const loaded = response.data?.submissions ?? []; setSubmissions(loaded);
      if (loaded[0]) { setSelectedSubmission(loaded[0]); setGradeForm({ grade: loaded[0].grade ?? "", feedback: loaded[0].feedback ?? "", rubricScores: lesson.rubric?.map((criterion) => loaded[0].rubricScores?.find((score) => score.id === criterion.id) ?? { id: criterion.id, score: 0 }) ?? [] }); }
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to load submissions."); }
    finally { setReviewLoading(false); }
  };

  const gradeSubmission = async (status = "graded") => {
    if (!selectedSubmission) return;
    try {
      const response = await axios.put(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons/${reviewLesson.id}/submissions/${selectedSubmission.id}/grade`), { grade: Number(gradeForm.grade), feedback: gradeForm.feedback, rubricScores: gradeForm.rubricScores, status }, { headers: getAuthHeaders() });
      const updated = { ...selectedSubmission, ...response.data.submission }; setSelectedSubmission(updated);
      const nextSubmissions = submissions.map((item) => item.id === updated.id ? updated : item); setSubmissions(nextSubmissions);
      setLessons((current) => current.map((item) => item.id === reviewLesson.id ? { ...item, stats: { ...item.stats, graded: nextSubmissions.filter((entry) => entry.status === "graded").length } } : item));
      toast.success("Grade and feedback saved.");
    } catch (error) { toast.error(error.response?.data?.message ?? "Unable to save grade."); }
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

  const openCreateContent = (contentType) => {
    let restored = null;
    try { restored = JSON.parse(window.localStorage.getItem(`classwork-draft:${classroomId}:${contentType}`)); } catch { restored = null; }
    const baseForm = emptyContentForm(contentType, uploadPolicy);
    const restoredMax = Math.min(Number(restored?.maxFileSizeMb) || uploadPolicy.maxFileSizeMb, uploadPolicy.maxFileSizeMb);
    setLessonForm(restored ? { ...baseForm, ...restored, contentType, maxFileSizeMb: restoredMax } : baseForm);
    setLessonFiles([]); setFormError(""); setShowAddLesson(true);
  };

  const confirmPublication = async () => {
    const target = publishTarget; setPublishTarget(null);
    if (target?.kind === "create") await performAddLesson();
    if (target?.kind === "publish" && target.lesson) await setPublication(target.lesson, true);
  };

  const removeStudent = async () => {
    if (!studentRemoveTarget) return;
    try {
      await axios.patch(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/students/${studentRemoveTarget.userId}`),
        { status: "removed" },
        { headers: getAuthHeaders() },
      );
      setStudents((current) => current.filter((student) => student.userId !== studentRemoveTarget.userId));
      toast.success(`${studentRemoveTarget.studentName} was removed from this classroom.`);
      setStudentRemoveTarget(null);
    } catch (error) {
      toast.error(error.response?.data?.message ?? "Unable to remove student.");
    }
  };

  const performClassAction = async () => {
    if (!classActionTarget) return;
    setClassActionPending(true);
    try {
      const response = classActionTarget === "rotate"
        ? await axios.post(buildApiUrl(`/api/teacher/classrooms/${classroomId}/regenerate-code`), {}, { headers: getAuthHeaders() })
        : await axios.patch(buildApiUrl(`/api/teacher/classrooms/${classroomId}`), { isActive: classActionTarget === "reactivate" }, { headers: getAuthHeaders() });
      setClassroom(response.data.classroom);
      toast.success(response.data.message);
      setClassActionTarget(null);
    } catch (error) {
      toast.error(error.response?.data?.message ?? "Unable to update classroom.");
    } finally {
      setClassActionPending(false);
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
          <div className={detailStyles.headerActions}>
            <span className={classroom?.isActive === false ? detailStyles.archivedBadge : detailStyles.activeBadge}>{classroom?.isActive === false ? "Archived" : "Active"}</span>
            <button className={styles.btnOutline} type="button" onClick={() => setClassActionTarget("rotate")} disabled={classroom?.isActive === false}><FiCopy /> New code</button>
            <button className={styles.btnOutline} type="button" onClick={() => setClassActionTarget(classroom?.isActive === false ? "reactivate" : "archive")}>{classroom?.isActive === false ? <FiCheckCircle /> : <FiEyeOff />} {classroom?.isActive === false ? "Reactivate" : "Archive"}</button>
            <button className={styles.btnOutline} type="button" onClick={() => navigate(`/teacher/classrooms/${classroomId}/levels`)}><FiSettings /> Edit levels</button>
          </div>
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
              <div><strong>{lessons.length}</strong><span>Class content</span></div>
              <div><strong>{analytics.avgProgress}%</strong><span>Avg progress</span></div>
            </div>
          </section>

          <nav className={detailStyles.tabs} aria-label="Classroom sections">
            {[
              ["students", <FiList key="students" />, "Students"],
              ["analytics", <FiBarChart2 key="analytics" />, "Analytics"],
              ["lessons", <FiBookOpen key="lessons" />, "Classwork"],
            ].map(([key, icon, label]) => (
              <button type="button" key={key} className={activeTab === key ? detailStyles.tabActive : detailStyles.tab} onClick={() => setActiveTab(key)}>{icon}{label}{key === "lessons" && <span>{lessons.length}</span>}</button>
            ))}
          </nav>

          <section className={detailStyles.contentCard}>
            {loading ? activeTab === "lessons" ? <div className={detailStyles.skeletonGrid}>{[1, 2, 3].map((item) => <span key={item} />)}</div> : <div className={styles.loadingText}>Loading classroom…</div> : activeTab === "students" ? (
              students.length ? (
                <div className={detailStyles.tableScroll}><table className={pgStyles.rosterTable}>
                  <thead><tr><th>#</th><th>Student</th><th>Progress</th><th>Levels Done</th><th>Avg Score</th><th>Last Active</th><th>Actions</th></tr></thead>
                  <tbody>{students.map((student, index) => { const palette = AVATAR_PALETTES[index % AVATAR_PALETTES.length]; return (
                    <tr key={student.userId}><td className={pgStyles.rosterRank}>{index < 3 ? RANK_MEDALS[index] : index + 1}</td><td><div className={pgStyles.rosterNameCell}><div className={pgStyles.rosterAvatar} style={{ "--av-bg": palette.bg, "--av-color": palette.color }}>{getInitials(student.studentName)}</div><div><div className={pgStyles.rosterName}>{student.studentName}</div><div className={pgStyles.rosterUsername}>@{student.username}</div></div></div></td><td><div className={pgStyles.rosterBarRow}><div className={pgStyles.rosterBarTrack}><div className={`${pgStyles.rosterBarFill} ${student.progressPercent >= 75 ? pgStyles.rosterBarFillHigh : student.progressPercent >= 40 ? pgStyles.rosterBarFillMid : pgStyles.rosterBarFillLow}`} style={{ width: `${student.progressPercent}%` }} /></div><span className={pgStyles.rosterPct}>{student.progressPercent}%</span></div></td><td>{student.completedLevels}</td><td>{student.avgScore ?? "—"}</td><td>{student.lastActiveLabel}</td><td><button type="button" className={detailStyles.rosterRemoveButton} onClick={() => setStudentRemoveTarget(student)}><FiX /> Remove</button></td></tr>
                  ); })}</tbody>
                </table></div>
              ) : <div className={detailStyles.emptyState}><FiUsers /><h2>No students enrolled yet</h2><p>Share class code <strong>{classroom?.classCode}</strong> so students can join.</p></div>
            ) : activeTab === "analytics" ? (
              <div className={detailStyles.analyticsDashboard}><div className={detailStyles.analyticsGrid}>
                <div><FiTrendingUp /><strong>{analytics.avgProgress}%</strong><span>Average progress</span></div>
                <div><FiAward /><strong>{analytics.avgScore}</strong><span>Average score</span></div>
                <div><FiBarChart2 /><strong>{management.insights?.submissions ?? 0}</strong><span>Assignment submissions</span></div>
                <div><FiCheckCircle /><strong>{management.insights?.graded ?? 0}</strong><span>Graded submissions</span></div>
                <div><FiCalendar /><strong>{management.insights?.late ?? 0}</strong><span>Late submissions</span></div>
                <div><FiFile /><strong>{formatFileSize(management.storage?.usedBytes)}</strong><span>Classwork storage</span></div>
              </div><div className={detailStyles.managementGrid}><section><h3>Students needing attention</h3>{management.insights?.attention?.slice(0, 8).map((entry) => { const student = students.find((item) => item.userId === entry.studentId); return <div key={entry.studentId}><span>{student?.studentName ?? `Student ${entry.studentId}`}</span><small>{entry.missing} missing · {entry.submitted} submitted{entry.averageGrade != null ? ` · ${entry.averageGrade} avg` : ""}</small></div>; })}</section><section><h3>Recent classwork activity</h3>{management.audits?.slice(0, 8).map((audit) => <div key={audit.id}><span>{String(audit.action || "updated").replaceAll("_", " ")}</span><small>{new Date(audit.createdAt).toLocaleString()} · {audit.actor?.firstName || audit.actor?.username || "Teacher"}</small></div>)}</section></div></div>
            ) : (
              <div>
                <div className={detailStyles.sectionHeader}><div><h2>Class content</h2><p>Lessons are view-only materials. Assignments collect and grade student work.</p></div><div className={detailStyles.createActions}><button className={styles.btnOutline} type="button" onClick={() => openCreateContent("lesson")}><FiPlus /> Add lesson</button><button className={styles.btnPrimary} type="button" onClick={() => openCreateContent("assignment")}><FiPlus /> Add assignment</button></div></div>
                <div className={detailStyles.contentFilters}>{[["all", "All", lessons.length], ["lesson", "Lessons", lessons.filter((item) => item.contentType === "lesson").length], ["assignment", "Assignments", lessons.filter((item) => item.contentType === "assignment").length]].map(([key, label, count]) => <button type="button" key={key} className={contentFilter === key ? detailStyles.contentFilterActive : ""} onClick={() => setContentFilter(key)}>{label}<span>{count}</span></button>)}</div>
                {filteredLessons.length ? <div className={detailStyles.lessonGrid}>{filteredLessons.map((lesson) => (
                  <div className={detailStyles.lessonCardWrap} key={lesson.id} draggable onDragStart={() => setDraggedLessonId(lesson.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { reorderLessons(draggedLessonId, lesson.id); setDraggedLessonId(null); }}>
                  <article className={detailStyles.lessonCard} role="button" tabIndex={0} onClick={() => previewLesson(lesson)} onKeyDown={(event) => event.key === "Enter" && previewLesson(lesson)}><div className={detailStyles.lessonIcon}><FiBookOpen /></div><div><div className={detailStyles.contentKind}><FiMove /> {lesson.contentType === "assignment" ? "Assignment / activity" : "Lesson / material"}</div><div className={detailStyles.lessonTop}><h3>{lesson.title}</h3><span className={!lesson.isPublished ? detailStyles.draftBadge : ""}>{!lesson.isPublished ? "Draft" : lesson.publishAt && new Date(lesson.publishAt) > new Date() ? "Scheduled" : "Published"}</span></div><p>{lesson.description || "No additional instructions."}</p>{lesson.publishAt && <small><FiCalendar /> Publish {new Date(lesson.publishAt).toLocaleString()}</small>}{lesson.contentType === "assignment" && lesson.dueAt && <small><FiCalendar /> Due {new Date(lesson.dueAt).toLocaleString()}</small>}<div className={detailStyles.lessonStats}><span>{lesson.stats?.viewed ?? 0} viewed</span>{lesson.contentType === "lesson" && <span>{lesson.stats?.completed ?? 0} completed</span>}{lesson.contentType === "assignment" && <><span>{lesson.stats?.submitted ?? 0}/{students.length} submitted</span><span>{lesson.stats?.graded ?? 0} graded</span><span>{lesson.stats?.late ?? 0} late</span><span>{Math.max(0, students.length - (lesson.stats?.submitted ?? 0))} missing</span></>}</div>{lesson.attachments?.length > 0 && <div className={detailStyles.attachmentList}>{lesson.attachments.map((attachment) => <div className={detailStyles.attachmentManageRow} draggable key={attachment.id} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("text/attachment-id", String(attachment.id)); }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); reorderAttachments(lesson, Number(event.dataTransfer.getData("text/attachment-id")), attachment.id); }}><button type="button" title={attachment.originalName} onClick={(event) => { event.stopPropagation(); openAttachment(attachment); }}><span className={detailStyles.fileType}>{getFileExtension(attachment.originalName)}</span><span><b>{attachment.originalName}</b><small>{formatFileSize(attachment.sizeBytes)}</small></span><FiDownload /></button><details className={detailStyles.fileMenu} onClick={(event) => event.stopPropagation()}><summary aria-label={`Actions for ${attachment.originalName}`}><FiMoreVertical /></summary><div><button type="button" onClick={() => openAttachment(attachment)}><FiEye /> Preview</button><button type="button" onClick={() => renameAttachment(lesson, attachment)}><FiEdit2 /> Rename</button><label><FiUpload /> Replace<input type="file" onChange={(event) => { replaceAttachment(lesson, attachment, event.target.files?.[0]); event.target.value = ""; }} /></label><span><FiMove /> Drag row to reorder</span><button type="button" className={detailStyles.menuDanger} onClick={() => deleteAttachment(lesson, attachment)}><FiTrash2 /> Delete</button></div></details></div>)}</div>}<label className={detailStyles.addFilesButton} onClick={(event) => event.stopPropagation()}><FiUpload /> {attachingLessonId === lesson.id ? "Uploading…" : "Add files"}<input type="file" multiple disabled={attachingLessonId != null} onChange={(event) => { addLessonAttachments(lesson.id, event.target.files); event.target.value = ""; }} /></label></div></article>
                    <div className={detailStyles.lessonActions}>
                      {lesson.contentType === "assignment" && <button type="button" onClick={() => openSubmissions(lesson)}><FiCheckCircle /> Review ({lesson.stats?.submitted ?? 0})</button>}
                      <button type="button" onClick={() => previewLesson(lesson)}><FiEye /> Preview</button>
                      <button type="button" onClick={() => openEditLesson(lesson)}><FiEdit2 /> Edit</button>
                      <details className={detailStyles.cardMenu}><summary aria-label={`More actions for ${lesson.title}`}><FiMoreVertical /></summary><div><button type="button" onClick={() => moveLesson(lesson.id, -1)}><FiMove /> Move earlier</button><button type="button" onClick={() => moveLesson(lesson.id, 1)}><FiMove /> Move later</button><button type="button" onClick={() => openVersionHistory(lesson)}><FiList /> Version history</button><button type="button" onClick={() => duplicateLesson(lesson)}><FiCopy /> Duplicate</button>{lesson.contentType === "assignment" && lesson.feedbackReleaseAt && new Date(lesson.feedbackReleaseAt) > new Date() && <button type="button" onClick={() => releaseFeedback(lesson)}><FiCheckCircle /> Release feedback now</button>}<button type="button" onClick={() => lesson.isPublished ? setPublication(lesson, false) : setPublishTarget({ kind: "publish", lesson, title: lesson.title, contentType: lesson.contentType })}>{lesson.isPublished ? <><FiEyeOff /> Unpublish</> : <><FiEye /> Publish</>}</button><button type="button" className={detailStyles.menuDanger} onClick={() => setDeleteTarget(lesson)}><FiTrash2 /> Delete</button></div></details>
                    </div>
                  </div>
                ))}</div> : <div className={detailStyles.emptyState}><FiBookOpen /><h2>{lessons.length ? "Nothing in this filter" : "No class content yet"}</h2><p>{lessons.length ? "Choose another filter or create new classwork." : "Add a lesson material or publish an assignment for this class."}</p><div className={detailStyles.createActions}><button className={styles.btnOutline} type="button" onClick={() => openCreateContent("lesson")}><FiPlus /> Add lesson</button><button className={styles.btnPrimary} type="button" onClick={() => openCreateContent("assignment")}><FiPlus /> Add assignment</button></div></div>}
              </div>
            )}
          </section>
        </div>
      </main>

      {showAddLesson && <div className={styles.modalBackdrop} onMouseDown={() => setShowAddLesson(false)}><div className={`${styles.modalCard} ${detailStyles.lessonModal}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}><h3>Add {lessonForm.contentType === "assignment" ? "assignment" : "lesson"} to {classroom?.className}</h3><button type="button" className={styles.modalCloseBtn} onClick={() => setShowAddLesson(false)}><FiX /></button></div>
        {formError && <div className={styles.modalError}>{formError}</div>}
        <form className={styles.modalForm} onSubmit={addLesson}>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>{lessonForm.contentType === "assignment" ? "Assignment title" : "Lesson title"}<input autoFocus maxLength={160} value={lessonForm.title} onChange={(event) => setLessonForm((current) => ({ ...current, title: event.target.value }))} placeholder={lessonForm.contentType === "assignment" ? "e.g. Arrays practice activity" : "e.g. Arrays review material"} /></label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Instructions<textarea className={detailStyles.textarea} maxLength={4000} value={lessonForm.description} onChange={(event) => setLessonForm((current) => ({ ...current, description: event.target.value }))} placeholder="What should students learn or complete?" /></label>
          {lessonForm.contentType === "assignment" && <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Due date (optional)<input type="datetime-local" value={lessonForm.dueAt} onChange={(event) => setLessonForm((current) => ({ ...current, dueAt: event.target.value }))} /></label>}
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Publish schedule (optional)<input type="datetime-local" value={lessonForm.publishAt} onChange={(event) => setLessonForm((current) => ({ ...current, publishAt: event.target.value }))} /></label>
          <div className={detailStyles.optionRow}><label><input type="checkbox" checked={lessonForm.isPublished} onChange={(event) => setLessonForm((current) => ({ ...current, isPublished: event.target.checked }))} /> Publish {lessonForm.contentType}</label>{lessonForm.contentType === "assignment" && <label>Points <input type="number" min="1" max="1000" value={lessonForm.maxScore} onChange={(event) => setLessonForm((current) => ({ ...current, maxScore: event.target.value }))} /></label>}</div>
          <AssignmentSettings form={lessonForm} setForm={setLessonForm} students={students} uploadPolicy={uploadPolicy} />
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Attachments (optional)
            <span className={detailStyles.filePicker}><FiUpload /><span><strong>Choose files</strong><small>Up to {uploadPolicy.maxFiles} safe files · {uploadPolicy.maxFileSizeMb} MB each</small></span><input type="file" multiple onChange={(event) => { const result = validateUploadFiles(event.target.files, uploadPolicy); setLessonFiles(result.files); setFormError(result.error); event.target.value = ""; }} /></span>
          </label>
          {lessonFiles.length > 0 && <div className={detailStyles.selectedFiles}>{lessonFiles.map((file) => <span key={`${file.name}-${file.lastModified}`}><FiPaperclip /> {file.name}</span>)}</div>}
          {saving && lessonFiles.length > 0 && <div className={detailStyles.uploadProgress}><span style={{ width: `${uploadProgress}%` }} /><small>Uploading {uploadProgress}%</small></div>}
          <div className={styles.modalActions}><button className={styles.btnOutline} type="button" disabled={saving} onClick={() => setShowAddLesson(false)}>Cancel</button><button className={styles.btnPrimary} disabled={saving} type="submit">{saving ? "Adding…" : `Add ${lessonForm.contentType}`}</button></div>
        </form>
      </div></div>}

      {editingLesson && <div className={styles.modalBackdrop} onMouseDown={() => !isEditing && setEditingLesson(null)}><div className={`${styles.modalCard} ${detailStyles.lessonModal}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}><h3>Edit {editForm.contentType}</h3><button type="button" className={styles.modalCloseBtn} disabled={isEditing} onClick={() => setEditingLesson(null)}><FiX /></button></div>
        {editError && <div className={styles.modalError}>{editError}</div>}
        <form className={styles.modalForm} onSubmit={saveLessonChanges}>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>{editForm.contentType === "assignment" ? "Assignment title" : "Lesson title"}<input autoFocus maxLength={160} value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Instructions<textarea className={detailStyles.textarea} maxLength={4000} value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} /></label>
          {editForm.contentType === "assignment" && <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Due date (optional)<input type="datetime-local" value={editForm.dueAt} onChange={(event) => setEditForm((current) => ({ ...current, dueAt: event.target.value }))} /></label>}
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>Publish schedule (optional)<input type="datetime-local" value={editForm.publishAt} onChange={(event) => setEditForm((current) => ({ ...current, publishAt: event.target.value }))} /></label>
          <AssignmentSettings form={editForm} setForm={setEditForm} students={students} uploadPolicy={uploadPolicy} />
          <div className={detailStyles.optionRow}><span>Publication: <strong>{editForm.isPublished ? "Published" : "Draft"}</strong> · change this from the classwork menu.</span>{editForm.contentType === "assignment" && <label>Points <input type="number" min="1" max="1000" value={editForm.maxScore} onChange={(event) => setEditForm((current) => ({ ...current, maxScore: event.target.value }))} /></label>}</div>
          <div className={styles.modalActions}><button className={styles.btnOutline} type="button" disabled={isEditing} onClick={() => setEditingLesson(null)}>Cancel</button><button className={styles.btnPrimary} disabled={isEditing} type="submit">{isEditing ? "Savingâ€¦" : "Save changes"}</button></div>
        </form>
      </div></div>}

      {historyLesson && <div className={styles.modalBackdrop} onMouseDown={() => setHistoryLesson(null)}><div className={`${styles.modalCard} ${detailStyles.historyModal}`} onMouseDown={(event) => event.stopPropagation()}><div className={styles.modalHeader}><h3>Version history · {historyLesson.title}</h3><button type="button" className={styles.modalCloseBtn} onClick={() => setHistoryLesson(null)}><FiX /></button></div><div className={detailStyles.versionList}>{versions.length ? versions.map((version) => <article key={version.id}><div><strong>Version {version.versionNumber}</strong><span>{new Date(version.createdAt).toLocaleString()} · {version.editor?.firstName || version.editor?.username || "Teacher"}</span></div><p>{version.snapshot?.title || "Untitled"} · {version.snapshot?.isPublished ? "Published" : "Draft"}</p><button type="button" className={styles.btnOutline} onClick={() => restoreVersion(version)}>Restore</button></article>) : <p>No earlier versions yet.</p>}</div></div></div>}

      {reviewLesson && <div className={styles.modalBackdrop} onMouseDown={() => setReviewLesson(null)}><div className={`${styles.modalCard} ${detailStyles.reviewModal}`} onMouseDown={(event) => event.stopPropagation()}>
        {selectedSubmission && <RubricScoring rubric={reviewLesson.rubric} value={gradeForm.rubricScores} onChange={(rubricScores) => setGradeForm((current) => ({ ...current, rubricScores, grade: rubricScores.reduce((sum, item) => sum + (Number(item.score) || 0), 0) }))} />}
        <div className={styles.modalHeader}><h3>Submissions · {reviewLesson.title}</h3><button type="button" className={styles.modalCloseBtn} onClick={() => setReviewLesson(null)}><FiX /></button></div>
        {reviewLoading ? <div className={detailStyles.reviewSkeleton}><span /><span /><span /></div> : <div className={detailStyles.gradingWorkspace}><aside><div className={detailStyles.gradingSummary}><strong>{submissions.length}/{students.length}</strong><span>submitted</span><strong>{submissions.filter((item) => item.status === "graded").length}</strong><span>graded</span></div>{submissions.map((submission) => <button type="button" key={submission.id} className={selectedSubmission?.id === submission.id ? detailStyles.submissionActive : ""} onClick={() => { setSelectedSubmission(submission); setGradeForm({ grade: submission.grade ?? "", feedback: submission.feedback ?? "" }); }}><span>{`${submission.student?.firstName ?? ""} ${submission.student?.lastName ?? ""}`.trim() || submission.student?.username || "Student"}</span><small>{reviewLesson.dueAt && new Date(submission.submittedAt) > new Date(reviewLesson.dueAt) ? "Late" : submission.status}</small></button>)}<div className={detailStyles.missingStudents}><strong>Missing ({Math.max(0, students.length - submissions.length)})</strong>{students.filter((student) => !submissions.some((item) => item.student?.id === student.userId)).map((student) => <span key={student.userId}>{student.studentName}</span>)}</div></aside><section>{selectedSubmission ? <><div className={detailStyles.submissionHeader}><div><h4>{`${selectedSubmission.student?.firstName ?? ""} ${selectedSubmission.student?.lastName ?? ""}`.trim() || selectedSubmission.student?.username}</h4><span>Submitted {new Date(selectedSubmission.submittedAt).toLocaleString()}</span></div><span>{reviewLesson.dueAt && new Date(selectedSubmission.submittedAt) > new Date(reviewLesson.dueAt) ? "Late" : selectedSubmission.status}</span></div><div className={detailStyles.submittedAnswer}>{selectedSubmission.comment || "No written response."}</div><div className={detailStyles.submittedFiles}>{selectedSubmission.attachments?.map((file) => <button type="button" key={file.id} onClick={() => openSubmissionAttachment(file)}><FiFile /> <span>{file.originalName}</span><small>{formatFileSize(file.sizeBytes)}</small></button>)}</div><div className={detailStyles.gradeFields}><label>Score <span><input type="number" min="0" max={reviewLesson.maxScore} value={gradeForm.grade} onChange={(event) => setGradeForm((current) => ({ ...current, grade: event.target.value }))} /> / {reviewLesson.maxScore}</span></label><label>Feedback<textarea value={gradeForm.feedback} onChange={(event) => setGradeForm((current) => ({ ...current, feedback: event.target.value }))} placeholder="Give clear, actionable feedback…" /></label><div><button type="button" className={styles.btnOutline} onClick={() => gradeSubmission("resubmit")}>Request resubmission</button><button type="button" className={styles.btnPrimary} onClick={() => gradeSubmission("graded")}>Save grade</button></div></div></> : <div className={detailStyles.gradingEmpty}><FiCheckCircle /><p>{submissions.length ? "Select a student to review." : "No submissions yet."}</p></div>}</section></div>}
      </div></div>}

      <ConfirmModal open={Boolean(publishTarget)} title={`Publish this ${publishTarget?.contentType ?? "item"}?`} message={`“${publishTarget?.title ?? ""}” will be visible to ${students.length} enrolled student${students.length === 1 ? "" : "s"}, and a dashboard notification will be available.`} confirmLabel="Publish now" onConfirm={confirmPublication} onCancel={() => setPublishTarget(null)} />

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
      <ConfirmModal open={Boolean(studentRemoveTarget)} title="Remove student from this classroom?" message={studentRemoveTarget ? `${studentRemoveTarget.studentName} will lose access to this classroom. Saved progress is retained, and the student can be added again later.` : ""} confirmLabel="Remove student" danger onConfirm={removeStudent} onCancel={() => setStudentRemoveTarget(null)} />
      <ConfirmModal open={Boolean(classActionTarget)} title={classActionTarget === "rotate" ? "Generate a new class code?" : classActionTarget === "archive" ? "Archive this classroom?" : "Reactivate this classroom?"} message={classActionTarget === "rotate" ? "The current code will stop working immediately. Existing students remain enrolled." : classActionTarget === "archive" ? "Students cannot join this classroom and new announcements are blocked until it is reactivated." : "Students can join and classroom activity can resume."} confirmLabel={classActionPending ? "Saving..." : classActionTarget === "rotate" ? "Generate new code" : classActionTarget === "archive" ? "Archive classroom" : "Reactivate classroom"} danger={classActionTarget === "archive" || classActionTarget === "rotate"} confirmDisabled={classActionPending} onConfirm={performClassAction} onCancel={() => !classActionPending && setClassActionTarget(null)} />
    </div>
  );
}

export default TeacherClassDetailPage;
