export const BUILT_IN_LESSON_CATALOGUE_PATH = "/api/admin/built-in-lessons";

export const INITIAL_BUILT_IN_CATALOGUE_STATE = Object.freeze({
  lessons: [],
  schemaVersion: null,
  contentRevision: null,
  status: "idle",
  error: "",
});

const loadingState = () => ({
  ...INITIAL_BUILT_IN_CATALOGUE_STATE,
  status: "loading",
});

export const createAdminBuiltInCatalogueController = ({ request, setState }) => {
  let generation = 0;
  let lifecycle = "idle";
  let abortController = null;
  let disposed = false;

  const isCurrent = (requestGeneration) => !disposed && requestGeneration === generation;
  const cancelPending = () => {
    generation += 1;
    abortController?.abort();
    abortController = null;
  };

  const load = async () => {
    if (disposed) return false;
    cancelPending();
    const requestGeneration = generation;
    abortController = new AbortController();
    lifecycle = "loading";
    setState(loadingState());

    try {
      const response = await request(BUILT_IN_LESSON_CATALOGUE_PATH, {
        signal: abortController.signal,
      });
      if (!isCurrent(requestGeneration)) return false;
      lifecycle = "success";
      setState({
        lessons: Array.isArray(response.lessons) ? response.lessons : [],
        schemaVersion: response.schemaVersion ?? null,
        contentRevision: response.contentRevision ?? null,
        status: "success",
        error: "",
      });
      return true;
    } catch (error) {
      if (!isCurrent(requestGeneration) || error?.code === "ERR_CANCELED" || error?.name === "AbortError") return false;
      lifecycle = "error";
      setState({
        ...INITIAL_BUILT_IN_CATALOGUE_STATE,
        status: "error",
        error: error?.response?.data?.message || "Unable to load built-in lessons.",
      });
      return false;
    } finally {
      if (isCurrent(requestGeneration)) abortController = null;
    }
  };

  return {
    load,
    loadIfNeeded() {
      return lifecycle === "idle" ? load() : Promise.resolve(false);
    },
    deactivate() {
      const interrupted = lifecycle === "loading";
      cancelPending();
      if (interrupted && !disposed) {
        lifecycle = "idle";
        setState(INITIAL_BUILT_IN_CATALOGUE_STATE);
      }
    },
    dispose() {
      disposed = true;
      cancelPending();
    },
  };
};

export const createAdminContentSourceTransitions = ({
  deactivateTeacher,
  activateTeacher,
  deactivateBuiltIn,
  activateBuiltIn,
  closeTeacherDetail,
  closeBuiltInDetail,
  setSource,
}) => ({
  changeSource(nextSource, currentSource) {
    if (nextSource === currentSource) return false;
    if (nextSource === "built-in") deactivateTeacher();
    else deactivateBuiltIn();
    closeTeacherDetail();
    closeBuiltInDetail?.();
    setSource(nextSource);
    if (nextSource === "built-in") activateBuiltIn();
    else activateTeacher();
    return true;
  },
  changeView(nextView, currentView, source) {
    if (nextView === currentView) return false;
    if (currentView === "content" && nextView !== "content" && source === "built-in") {
      deactivateBuiltIn();
      closeBuiltInDetail?.();
    }
    return true;
  },
});
