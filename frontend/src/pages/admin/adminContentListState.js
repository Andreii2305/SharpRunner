import { buildQueryString, createLatestRequestController } from "./adminStudentClassroomFilterState.js";

export const buildAdminContentListPath = (filters, page) => (
  `/api/admin/content?${buildQueryString(filters, page)}`
);

export const createAdminContentRequestController = ({
  setContent,
  setMeta,
  setError,
  setLoading,
}) => {
  let lifecycle = "idle";
  const controller = createLatestRequestController({
    onStart() {
      lifecycle = "loading";
      setContent([]);
      setMeta({ total: null, totalPages: null });
      setError("");
      setLoading(true);
    },
    onSuccess(response) {
      lifecycle = "success";
      setContent(response.content || []);
      setMeta({ total: response.total, totalPages: response.totalPages });
    },
    onError(message) {
      lifecycle = "error";
      setError(message);
    },
    onFinish() {
      setLoading(false);
    },
  });

  return {
    ...controller,
    deactivate() {
      const interrupted = lifecycle === "loading";
      controller.invalidate();
      setLoading(false);
      if (interrupted) lifecycle = "idle";
    },
    needsLoad() {
      return lifecycle === "idle";
    },
  };
};

export const createAdminContentTransitions = ({ requests, setFilters, setPage }) => ({
  changeFilter(name, value) {
    requests.replace();
    setFilters((current) => {
      const next = { ...current, [name]: value };
      delete next.published;
      return next;
    });
    setPage(1);
  },
  changePage(page) {
    requests.replace();
    setPage(page);
  },
  changeView(view, currentView) {
    if (view === currentView) return false;
    requests.replace();
    return true;
  },
});
