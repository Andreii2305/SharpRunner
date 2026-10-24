import { createDialogFocusSession } from "../../utils/dialogFocus.js";

export const builtInLessonDetailPath = (lessonKey) => (
  `/api/admin/built-in-lessons/${encodeURIComponent(lessonKey)}`
);

const loadingDetail = (sourceItem) => ({
  type: "built-in-lesson",
  status: "loading",
  lessonKey: sourceItem.lessonKey,
  sourceItem,
  error: "",
});

export const createAdminBuiltInLessonDetailController = ({ request, setDetail, focusSession = createDialogFocusSession() }) => {
  let generation = 0;
  let abortController = null;
  let selectedItem = null;
  let disposed = false;

  const isCurrent = (requestGeneration, lessonKey) => !disposed
    && requestGeneration === generation
    && selectedItem?.lessonKey === lessonKey;
  const invalidateRequest = () => {
    generation += 1;
    abortController?.abort();
    abortController = null;
  };
  const loadSelected = async () => {
    if (disposed || !selectedItem) return false;
    invalidateRequest();
    const sourceItem = selectedItem;
    const lessonKey = sourceItem.lessonKey;
    const requestGeneration = generation;
    abortController = new AbortController();
    setDetail(loadingDetail(sourceItem));
    try {
      const response = await request(builtInLessonDetailPath(lessonKey), { signal: abortController.signal });
      if (!isCurrent(requestGeneration, lessonKey)) return false;
      if (response?.lesson?.lessonKey !== lessonKey) {
        setDetail({ ...loadingDetail(sourceItem), status: "error", error: "Unable to load the selected built-in lesson." });
        return false;
      }
      setDetail({ type: "built-in-lesson", status: "success", lessonKey, sourceItem, response, error: "" });
      return true;
    } catch (error) {
      if (!isCurrent(requestGeneration, lessonKey) || error?.code === "ERR_CANCELED" || error?.name === "AbortError") return false;
      setDetail({ ...loadingDetail(sourceItem), status: "error", error: error?.response?.data?.message || "Unable to load built-in lesson details." });
      return false;
    } finally {
      if (isCurrent(requestGeneration, lessonKey)) abortController = null;
    }
  };
  const release = ({ restoreFocus, updateState }) => {
    invalidateRequest();
    selectedItem = null;
    if (updateState) setDetail(null);
    if (restoreFocus) focusSession.end();
    else focusSession.cancel();
  };

  return {
    open(sourceItem, opener) {
      if (disposed || !sourceItem?.lessonKey) return Promise.resolve(false);
      if (selectedItem) focusSession.cancel();
      selectedItem = sourceItem;
      focusSession.begin(opener);
      return loadSelected();
    },
    retry: loadSelected,
    close() { release({ restoreFocus: true, updateState: true }); },
    cancel() { release({ restoreFocus: false, updateState: true }); },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidateRequest();
      selectedItem = null;
      focusSession.cancel();
    },
  };
};
