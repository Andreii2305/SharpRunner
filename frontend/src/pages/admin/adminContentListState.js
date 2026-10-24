import { buildQueryString, createLatestRequestController } from "./adminStudentClassroomFilterState.js";

export const buildAdminContentListPath = (filters, page) => (
  `/api/admin/content?${buildQueryString(filters, page)}`
);

export const createAdminContentRequestController = ({
  setContent,
  setMeta,
  setError,
  setLoading,
}) => createLatestRequestController({
  onStart() {
    setContent([]);
    setMeta({ total: null, totalPages: null });
    setError("");
    setLoading(true);
  },
  onSuccess(response) {
    setContent(response.content || []);
    setMeta({ total: response.total, totalPages: response.totalPages });
  },
  onError(message) {
    setError(message);
  },
  onFinish() {
    setLoading(false);
  },
});

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
