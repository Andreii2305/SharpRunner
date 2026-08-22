import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft, FiBookOpen, FiCalendar, FiDownload, FiFile,
  FiCheckCircle, FiFileText, FiPaperclip, FiUpload,
} from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import { buildApiUrl, getAuthHeaders, getUserRole } from "../../utils/auth.js";
import { DEFAULT_UPLOAD_POLICY, normalizeUploadPolicy, validateUploadFiles } from "../../utils/uploadPolicy.js";
import styles from "./ClassroomLessonPage.module.css";

const isOfficeFile = (name = "") => /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(name);
const isPreviewable = (mimeType = "", name = "") => /^(video\/|audio\/|image\/|application\/pdf$|text\/)/i.test(mimeType) || isOfficeFile(name);

const formatFileSize = (value) => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

function AssignmentSubmissionPanel({ lesson, submission, comment, setComment, files, uploadPolicy, submitting, onSubmit, onDownload, onFilesSelected }) {
  const isPastDue = lesson.dueAt && new Date(lesson.dueAt) < new Date();
  const attemptsUsed = submission?.attemptCount ?? 0;
  const attemptsClosed = lesson.maxAttempts > 0 && attemptsUsed >= lesson.maxAttempts;
  const lateClosed = isPastDue && lesson.allowLateSubmissions === false;
  const accepted = (lesson.allowedFileTypes ?? []).map((type) => `.${String(type).replace(/^\./, "")}`).join(",");
  return <form className={styles.submissionForm} onSubmit={onSubmit}>
    <div className={styles.sectionLabel}>Submit your work</div>
    <div className={styles.policySummary}><span>{lesson.maxAttempts > 0 ? `${attemptsUsed}/${lesson.maxAttempts} attempts used` : `${attemptsUsed} attempt${attemptsUsed === 1 ? "" : "s"} · unlimited`}</span><span>Up to {uploadPolicy.maxFiles} files · {Math.min(lesson.maxFileSizeMb ?? uploadPolicy.maxFileSizeMb, uploadPolicy.maxFileSizeMb)} MB each</span>{accepted && <span>Accepted: {accepted}</span>}</div>
    {isPastDue && <div className={styles.lateNotice}>{lateClosed ? "Past due · submissions are closed" : "Past due · submissions are marked late"}</div>}
    <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add your answer or a note…" disabled={lateClosed || attemptsClosed} />
    <label className={styles.submissionPicker}><FiUpload /> Attach files<input type="file" multiple accept={accepted || undefined} disabled={lateClosed || attemptsClosed} onChange={(event) => { onFilesSelected(event.target.files); event.target.value = ""; }} /></label>
    {files.map((file) => <small key={`${file.name}-${file.lastModified}`}>{file.name}</small>)}
    <button type="submit" disabled={submitting || lateClosed || attemptsClosed}>{submitting ? "Submitting…" : attemptsClosed ? "Attempt limit reached" : submission ? "Resubmit work" : "Submit work"}</button>
    {submission && <div className={styles.feedbackBox}><strong>{submission.feedbackPending ? "Submitted · feedback will be released later" : submission.status === "graded" ? `Grade: ${submission.grade}/${lesson.maxScore}` : submission.status === "resubmit" ? "Changes requested" : "Submitted"}</strong>{submission.feedback && <p>{submission.feedback}</p>}{submission.rubricScores?.length > 0 && <div className={styles.rubricResult}>{submission.rubricScores.map((score) => { const criterion = lesson.rubric?.find((item) => item.id === score.id); return <span key={score.id}>{criterion?.title ?? "Criterion"}: {score.score}/{criterion?.points ?? "—"}</span>; })}</div>}{submission.attachments?.map((file) => <button type="button" key={file.id} onClick={() => onDownload(file)}><FiFile /> {file.originalName}</button>)}</div>}
  </form>;
}

function ClassroomLessonPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isTeacherPreview = ["teacher", "admin"].includes(getUserRole());
  const previewUrlRef = useRef(null);
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState({ attachment: null, url: "", loading: false, error: "" });
  const [progress, setProgress] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [submissionComment, setSubmissionComment] = useState("");
  const [submissionFiles, setSubmissionFiles] = useState([]);
  const [uploadPolicy, setUploadPolicy] = useState(DEFAULT_UPLOAD_POLICY);
  const [submitting, setSubmitting] = useState(false);

  const loadPreview = useCallback(async (attachment) => {
    if (!attachment || !isPreviewable(attachment.mimeType, attachment.originalName)) return;
    setPreview({ attachment, url: "", loading: true, error: "" });
    try {
      const response = await axios.get(
        buildApiUrl(`/api/lesson-content/classroom-files/${attachment.id}${isOfficeFile(attachment.originalName) ? "/preview" : ""}`),
        { headers: getAuthHeaders(), responseType: "blob" },
      );
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(response.data);
      previewUrlRef.current = url;
      setPreview({ attachment, url, loading: false, error: "" });
    } catch (requestError) {
      const unavailable = requestError.response?.status === 404;
      setPreview({
        attachment,
        url: "",
        loading: false,
        error: unavailable
          ? "This file is no longer available. Ask your teacher to re-upload it."
          : requestError.response?.status === 415
            ? "Office preview needs LibreOffice enabled on the server. You can still download this file."
            : "Unable to preview this file.",
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadLesson = async () => {
      try {
        const response = await axios.get(
          buildApiUrl(`/api/lesson-content/classroom-lessons/${lessonId}`),
          { headers: getAuthHeaders() },
        );
        if (!mounted) return;
        const loadedLesson = response.data?.lesson ?? null;
        setLesson(loadedLesson);
        setProgress(response.data?.progress ?? null);
        setSubmission(response.data?.submission ?? null);
        setUploadPolicy(normalizeUploadPolicy(response.data?.uploadPolicy));
        setSubmissionComment(response.data?.submission?.comment ?? "");
        const firstPreviewable = loadedLesson?.attachments?.find((attachment) => isPreviewable(attachment.mimeType, attachment.originalName));
        if (firstPreviewable) loadPreview(firstPreviewable);
      } catch (requestError) {
        if (mounted) setError(requestError.response?.data?.message ?? "Unable to load this lesson.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadLesson();
    return () => {
      mounted = false;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [lessonId, loadPreview]);

  const downloadAttachment = async (attachment) => {
    try {
      const response = await axios.get(
        buildApiUrl(`/api/lesson-content/classroom-files/${attachment.id}`),
        { headers: getAuthHeaders(), responseType: "blob" },
      );
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.originalName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (requestError) {
      toast.error(requestError.response?.status === 404
        ? "This file is unavailable. Ask your teacher to re-upload it."
        : "Unable to download attachment.");
    }
  };

  const toggleCompletion = async () => {
    try {
      const response = await axios.put(buildApiUrl(`/api/lesson-content/classroom-lessons/${lessonId}/completion`), { completed: !progress?.completedAt }, { headers: getAuthHeaders() });
      setProgress(response.data.progress); toast.success(response.data.message);
    } catch (requestError) { toast.error(requestError.response?.data?.message ?? "Unable to update lesson."); }
  };

  const submitWork = async (event) => {
    event.preventDefault();
    const effectivePolicy = { ...uploadPolicy, maxFileSizeMb: Math.min(lesson.maxFileSizeMb ?? uploadPolicy.maxFileSizeMb, uploadPolicy.maxFileSizeMb) };
    const validation = validateUploadFiles(submissionFiles, effectivePolicy);
    if (validation.error) { toast.error(validation.error); return; }
    setSubmitting(true);
    try {
      const payload = new FormData(); payload.append("comment", submissionComment.trim());
      submissionFiles.forEach((file) => payload.append("files", file));
      const response = await axios.post(buildApiUrl(`/api/lesson-content/classroom-lessons/${lessonId}/submission`), payload, { headers: getAuthHeaders() });
      setSubmission(response.data.submission); setSubmissionFiles([]); toast.success("Work submitted to your teacher.");
    } catch (requestError) { toast.error(requestError.response?.data?.message ?? "Unable to submit work."); }
    finally { setSubmitting(false); }
  };

  const selectSubmissionFiles = (selectedFiles) => {
    const effectivePolicy = { ...uploadPolicy, maxFileSizeMb: Math.min(lesson.maxFileSizeMb ?? uploadPolicy.maxFileSizeMb, uploadPolicy.maxFileSizeMb) };
    const result = validateUploadFiles(selectedFiles, effectivePolicy);
    setSubmissionFiles(result.files);
    if (result.error) toast.error(result.error);
  };

  const downloadSubmissionFile = async (attachment) => {
    try {
      const response = await axios.get(buildApiUrl(`/api/lesson-content/submission-files/${attachment.id}`), { headers: getAuthHeaders(), responseType: "blob" });
      const url = URL.createObjectURL(response.data); const link = document.createElement("a"); link.href = url; link.download = attachment.originalName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { toast.error("Unable to download submitted file."); }
  };

  const renderPreview = () => {
    if (preview.loading) return <div className={styles.previewMessage}>Loading preview…</div>;
    if (preview.error) return <div className={styles.previewMessage}>{preview.error}</div>;
    if (!preview.url || !preview.attachment) return <div className={styles.previewMessage}><FiFileText /> Select a supported file to preview it here.</div>;
    const { mimeType, originalName } = preview.attachment;
    if (mimeType.startsWith("image/")) return <img className={styles.imagePreview} src={preview.url} alt={originalName} />;
    if (mimeType.startsWith("video/")) return <video className={styles.mediaPreview} src={preview.url} controls title={originalName} />;
    if (mimeType.startsWith("audio/")) return <audio className={styles.audioPreview} src={preview.url} controls />;
    return <iframe className={styles.documentPreview} src={preview.url} title={originalName} />;
  };

  return (
    <div className={styles.root}>
      <Sidebar />
      <main className={styles.main}>
        <header className={styles.header}>
          <button type="button" className={styles.backButton} onClick={() => navigate(isTeacherPreview && lesson?.classroomId ? `/teacher/classrooms/${lesson.classroomId}` : "/lesson")}><FiArrowLeft /> {isTeacherPreview ? "Back to classroom" : "Back to classwork"}</button>
          <span className={styles.headerType}><FiBookOpen /> {isTeacherPreview ? "Teacher preview" : lesson?.contentType === "assignment" ? "Assignment / activity" : "Lesson / material"}</span>
        </header>

        {loading ? <div className={styles.status}>Loading lesson…</div> : error || !lesson ? (
          <div className={styles.status}><h1>Class content unavailable</h1><p>{error || "This item could not be found."}</p><button type="button" onClick={() => navigate("/lesson")}>Return to classwork</button></div>
        ) : (
          <>
            <section className={styles.hero}>
              <div className={styles.heroIcon}><FiBookOpen /></div>
              <div className={styles.heroCopy}>
                <span>{lesson.contentType === "assignment" ? "Assignment from your teacher" : "Lesson material from your teacher"}</span>
                <h1>{lesson.title}</h1>
                <div className={styles.heroMeta}>
                  {lesson.dueAt && <span><FiCalendar /> Due {new Date(lesson.dueAt).toLocaleString()}</span>}
                  <span><FiPaperclip /> {lesson.attachments?.length ?? 0} attachment{lesson.attachments?.length === 1 ? "" : "s"}</span>
                </div>
              </div>
              {!isTeacherPreview && lesson.contentType !== "assignment" && <button type="button" className={styles.completeButton} onClick={toggleCompletion}><FiCheckCircle /> {progress?.completedAt ? "Completed" : "Mark complete"}</button>}
            </section>

            <div className={styles.contentGrid}>
              <section className={styles.lessonContent}>
                <div className={styles.sectionLabel}>{lesson.contentType === "assignment" ? "Assignment instructions" : "Lesson content"}</div>
                <div className={styles.instructions}>{lesson.description || "No additional instructions were provided."}</div>
                {lesson.externalUrl && (
                  <p><a href={lesson.externalUrl} target="_blank" rel="noreferrer">Open external learning resource</a></p>
                )}

                {lesson.attachments?.some((attachment) => isPreviewable(attachment.mimeType, attachment.originalName)) && (
                  <div className={styles.previewSection}>
                    <div className={styles.previewHeader}>
                      <div><span>File preview</span><strong>{preview.attachment?.originalName ?? "Select a file"}</strong></div>
                      {preview.attachment && <button type="button" onClick={() => downloadAttachment(preview.attachment)}><FiDownload /> Download</button>}
                    </div>
                    <div className={styles.previewCanvas}>{renderPreview()}</div>
                  </div>
                )}
              </section>

              <aside className={styles.attachmentsPanel}>
                <div className={styles.sectionLabel}>Attachments</div>
                {lesson.attachments?.length ? lesson.attachments.map((attachment) => (
                  <div className={`${styles.fileRow} ${preview.attachment?.id === attachment.id ? styles.fileRowActive : ""}`} key={attachment.id}>
                    <button className={styles.fileMain} type="button" onClick={() => isPreviewable(attachment.mimeType, attachment.originalName) ? loadPreview(attachment) : downloadAttachment(attachment)}>
                      <span className={styles.fileIcon}><FiFile /></span>
                      <span className={styles.fileInfo}><strong>{attachment.originalName}</strong><small>{formatFileSize(attachment.sizeBytes)} · {isPreviewable(attachment.mimeType, attachment.originalName) ? "Preview available" : "Download file"}</small></span>
                    </button>
                    <button className={styles.downloadButton} type="button" onClick={() => downloadAttachment(attachment)} aria-label={`Download ${attachment.originalName}`}><FiDownload /></button>
                  </div>
                )) : <div className={styles.noFiles}>This lesson has no attachments.</div>}

                {!isTeacherPreview && lesson.contentType === "assignment" && <AssignmentSubmissionPanel lesson={lesson} submission={submission} comment={submissionComment} setComment={setSubmissionComment} files={submissionFiles} uploadPolicy={uploadPolicy} submitting={submitting} onSubmit={submitWork} onDownload={downloadSubmissionFile} onFilesSelected={selectSubmissionFiles} />}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default ClassroomLessonPage;
