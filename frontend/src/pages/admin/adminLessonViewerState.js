import { createDialogFocusSession } from "../../utils/dialogFocus.js";

export const lessonDetailPath = (lessonId) => `/api/teacher/lesson-library/${encodeURIComponent(lessonId)}`;
export const lessonAttachmentPath = (attachmentId) => `/api/lesson-content/classroom-files/${encodeURIComponent(attachmentId)}`;
export const lessonPublicationLabel = (lesson) => lesson?.archivedAt ? "Archived" : lesson?.status === "scheduled" ? "Scheduled" : lesson?.status === "published" ? "Published" : "Draft";
export const formatScheduledRelease = (value) => value ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value)) : "—";

const downloadUnavailableMessage = "This file is no longer available. The lesson details remain open.";

export const createAdminLessonDownloadController = ({
  request,
  setError,
  setLoading,
  createObjectUrl = (blob) => URL.createObjectURL(blob),
  revokeObjectUrl = (url) => URL.revokeObjectURL(url),
  createLink = () => document.createElement("a"),
  attachLink = (link) => document.body.appendChild(link),
  removeLink = (link) => link.remove(),
}) => {
  let generation = 0;
  let abortController = null;
  let disposed = false;
  const cancelPending = () => {
    generation += 1;
    abortController?.abort();
    abortController = null;
  };
  const isCurrent = (requestGeneration) => !disposed && requestGeneration === generation;

  const download = async (file) => {
    if (disposed || file?.available !== true) return false;
    cancelPending();
    const requestGeneration = generation;
    abortController = new AbortController();
    const signal = abortController.signal;
    let objectUrl = null;
    let link = null;
    setError("");
    setLoading(true);
    try {
      const blob = await request(lessonAttachmentPath(file.id), { signal });
      if (!isCurrent(requestGeneration)) return false;
      objectUrl = createObjectUrl(blob);
      if (!isCurrent(requestGeneration)) return false;
      link = createLink();
      link.href = objectUrl;
      link.download = file.originalName || "lesson-file";
      attachLink(link);
      if (!isCurrent(requestGeneration)) return false;
      link.click();
      return true;
    } catch (error) {
      if (!isCurrent(requestGeneration) || error?.code === "ERR_CANCELED" || error?.name === "AbortError") return false;
      setError(downloadUnavailableMessage);
      return false;
    } finally {
      if (link) {
        try { removeLink(link); } catch { /* Best-effort DOM cleanup. */ }
      }
      if (objectUrl) {
        try { revokeObjectUrl(objectUrl); } catch { /* Best-effort browser resource cleanup. */ }
      }
      if (isCurrent(requestGeneration)) {
        abortController = null;
        setLoading(false);
      }
    }
  };

  return {
    download,
    invalidate() {
      cancelPending();
      if (!disposed) setLoading(false);
    },
    dispose() {
      disposed = true;
      cancelPending();
    },
  };
};

export const createAdminLessonViewerController = ({ request, setDetail, focusSession = createDialogFocusSession() }) => {
  let generation = 0;
  let currentItem = null;
  let abortController = null;
  let disposed = false;
  const invalidate = () => { generation += 1; abortController?.abort(); abortController = null; };
  const load = async (item, opener, captureFocus) => {
    invalidate(); disposed = false; currentItem = item;
    if (captureFocus) focusSession.begin(opener);
    const requestGeneration = generation;
    abortController = new AbortController();
    setDetail({ type: "lesson", status: "loading", sourceItem: item, error: "" });
    try {
      const payload = await request(lessonDetailPath(item.id), { signal: abortController.signal });
      if (disposed || requestGeneration !== generation) return false;
      setDetail({ type: "lesson", status: "success", sourceItem: item, lesson: payload.lesson, uploadPolicy: payload.uploadPolicy, error: "" });
      return true;
    } catch (error) {
      if (disposed || requestGeneration !== generation || error?.code === "ERR_CANCELED" || error?.name === "AbortError") return false;
      setDetail({ type: "lesson", status: "error", sourceItem: item, error: error?.response?.data?.message || "Unable to load lesson details." });
      return false;
    } finally { if (requestGeneration === generation) abortController = null; }
  };
  return {
    open: (item, opener) => load(item, opener, true),
    retry: () => currentItem ? load(currentItem, null, false) : Promise.resolve(false),
    close({ restoreFocus = true } = {}) {
      invalidate(); currentItem = null; setDetail(null);
      if (restoreFocus) focusSession.end();
      else focusSession.cancel?.();
    },
    dispose() { disposed = true; invalidate(); currentItem = null; focusSession.cancel?.(); },
  };
};
