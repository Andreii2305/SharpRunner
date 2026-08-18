import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft, FiBookOpen, FiCalendar, FiDownload, FiFile,
  FiFileText, FiPaperclip,
} from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import styles from "./ClassroomLessonPage.module.css";

const isPreviewable = (mimeType = "") => /^(video\/|audio\/|image\/|application\/pdf$|text\/)/i.test(mimeType);

const formatFileSize = (value) => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

function ClassroomLessonPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const previewUrlRef = useRef(null);
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState({ attachment: null, url: "", loading: false, error: "" });

  const loadPreview = useCallback(async (attachment) => {
    if (!attachment || !isPreviewable(attachment.mimeType)) return;
    setPreview({ attachment, url: "", loading: true, error: "" });
    try {
      const response = await axios.get(
        buildApiUrl(`/api/lesson-content/classroom-files/${attachment.id}`),
        { headers: getAuthHeaders(), responseType: "blob" },
      );
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(response.data);
      previewUrlRef.current = url;
      setPreview({ attachment, url, loading: false, error: "" });
    } catch {
      setPreview({ attachment, url: "", loading: false, error: "Unable to preview this file." });
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
        const firstPreviewable = loadedLesson?.attachments?.find((attachment) => isPreviewable(attachment.mimeType));
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
    } catch {
      toast.error("Unable to download attachment.");
    }
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
          <button type="button" className={styles.backButton} onClick={() => navigate("/lesson")}><FiArrowLeft /> Back to lessons</button>
          <span className={styles.headerType}><FiBookOpen /> Class lesson</span>
        </header>

        {loading ? <div className={styles.status}>Loading lesson…</div> : error || !lesson ? (
          <div className={styles.status}><h1>Lesson unavailable</h1><p>{error || "This lesson could not be found."}</p><button type="button" onClick={() => navigate("/lesson")}>Return to lessons</button></div>
        ) : (
          <>
            <section className={styles.hero}>
              <div className={styles.heroIcon}><FiBookOpen /></div>
              <div className={styles.heroCopy}>
                <span>Assigned by your teacher</span>
                <h1>{lesson.title}</h1>
                <div className={styles.heroMeta}>
                  {lesson.dueAt && <span><FiCalendar /> Due {new Date(lesson.dueAt).toLocaleString()}</span>}
                  <span><FiPaperclip /> {lesson.attachments?.length ?? 0} attachment{lesson.attachments?.length === 1 ? "" : "s"}</span>
                </div>
              </div>
            </section>

            <div className={styles.contentGrid}>
              <section className={styles.lessonContent}>
                <div className={styles.sectionLabel}>Lesson instructions</div>
                <div className={styles.instructions}>{lesson.description || "No additional instructions were provided."}</div>

                {lesson.attachments?.some((attachment) => isPreviewable(attachment.mimeType)) && (
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
                    <button className={styles.fileMain} type="button" onClick={() => isPreviewable(attachment.mimeType) ? loadPreview(attachment) : downloadAttachment(attachment)}>
                      <span className={styles.fileIcon}><FiFile /></span>
                      <span className={styles.fileInfo}><strong>{attachment.originalName}</strong><small>{formatFileSize(attachment.sizeBytes)} · {isPreviewable(attachment.mimeType) ? "Preview available" : "Download file"}</small></span>
                    </button>
                    <button className={styles.downloadButton} type="button" onClick={() => downloadAttachment(attachment)} aria-label={`Download ${attachment.originalName}`}><FiDownload /></button>
                  </div>
                )) : <div className={styles.noFiles}>This lesson has no attachments.</div>}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default ClassroomLessonPage;
