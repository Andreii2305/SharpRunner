const identity = (value) => `${value ?? ""}`.trim() || null;
const isCanceled = (error) => error?.code === "ERR_CANCELED"
  || error?.name === "AbortError"
  || error?.name === "CanceledError";
const messageFor = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

export const initialStudentCheckInState = (page = 1) => ({
  status: "idle",
  loading: false,
  refreshing: false,
  checkIns: [],
  page,
  limit: 20,
  total: null,
  totalPages: null,
  unreadTotal: null,
  error: "",
  refreshError: "",
  markInFlight: [],
  markErrors: {},
});

const normalizePayload = (payload, requestedPage, confirmedReadIds) => {
  if (!Array.isArray(payload?.checkIns)
    || payload.page !== requestedPage
    || payload.limit !== 20
    || !Number.isSafeInteger(payload.total) || payload.total < 0
    || !Number.isSafeInteger(payload.totalPages) || payload.totalPages < 1
    || !Number.isSafeInteger(payload.unreadTotal) || payload.unreadTotal < 0) {
    throw new Error("The check-in response was incomplete.");
  }
  return {
    ...payload,
    checkIns: payload.checkIns.map((item) => (
      confirmedReadIds.has(item?.id) ? { ...item, isRead: true } : item
    )),
  };
};

export const createStudentCheckInController = ({
  list,
  mark,
  onReset = () => {},
  onListLoading = () => {},
  onListSuccess = () => {},
  onListError = () => {},
  onListFinish = () => {},
  onMarkStart = () => {},
  onMarkSuccess = () => {},
  onMarkError = () => {},
  onRefreshStart = () => {},
  onRefreshError = () => {},
  onRefreshFinish = () => {},
}) => {
  let accountId = null;
  let page = 1;
  let generation = 0;
  let listSequence = 0;
  let listAbort = null;
  let activeList = null;
  let loadedKey = null;
  let disposed = false;
  const readOperations = new Map();
  const confirmedReadIds = new Set();

  const key = () => `${accountId ?? ""}:${page}`;
  const invalidate = ({ reads = true } = {}) => {
    generation += 1;
    listSequence += 1;
    listAbort?.abort();
    listAbort = null;
    activeList = null;
    if (reads) {
      for (const operation of readOperations.values()) operation.abort.abort();
      readOperations.clear();
    }
  };
  const current = (requestGeneration, requestSequence, requestAccount, requestPage) => (
    !disposed
    && generation === requestGeneration
    && listSequence === requestSequence
    && accountId === requestAccount
    && page === requestPage
  );

  const controller = {
    activate() {
      disposed = false;
    },
    setAccount(nextValue) {
      if (disposed) return false;
      const next = identity(nextValue);
      if (next === accountId) return false;
      invalidate();
      accountId = next;
      page = 1;
      loadedKey = null;
      confirmedReadIds.clear();
      onReset({ page });
      return true;
    },
    setPage(nextPage) {
      if (disposed || !Number.isSafeInteger(nextPage) || nextPage < 1 || nextPage === page) return false;
      invalidate();
      page = nextPage;
      loadedKey = null;
      onReset({ page });
      return true;
    },
    load({ force = false, refresh = false } = {}) {
      if (disposed || !accountId) return Promise.resolve(false);
      const requestKey = key();
      if (activeList?.key === requestKey) return activeList.promise;
      if (!force && loadedKey === requestKey) return Promise.resolve(true);

      listSequence += 1;
      const requestSequence = listSequence;
      const requestGeneration = generation;
      const requestAccount = accountId;
      const requestPage = page;
      listAbort?.abort();
      const abort = new AbortController();
      listAbort = abort;
      if (refresh) onRefreshStart();
      else onListLoading();

      const promise = (async () => {
        try {
          const response = await list({ page: requestPage, limit: 20, signal: abort.signal });
          if (!current(requestGeneration, requestSequence, requestAccount, requestPage)) return false;
          const normalized = normalizePayload(response, requestPage, confirmedReadIds);
          loadedKey = requestKey;
          onListSuccess(normalized);
          return true;
        } catch (error) {
          if (!current(requestGeneration, requestSequence, requestAccount, requestPage) || isCanceled(error)) return false;
          if (refresh) {
            onRefreshError("The change was saved, but updated check-ins could not be refreshed.");
          } else {
            onListError(messageFor(error, "Unable to load check-ins."));
          }
          return false;
        } finally {
          if (current(requestGeneration, requestSequence, requestAccount, requestPage)) {
            listAbort = null;
            activeList = null;
            if (refresh) onRefreshFinish();
            else onListFinish();
          }
        }
      })();
      activeList = { key: requestKey, promise };
      return promise;
    },
    retry() {
      return controller.load({ force: true });
    },
    refresh() {
      return controller.load({ force: true, refresh: true });
    },
    markAsRead(notificationId) {
      const id = identity(notificationId);
      if (disposed || !accountId || !/^check-in-[1-9][0-9]*$/.test(id || "")) return Promise.resolve(false);
      if (confirmedReadIds.has(id)) return Promise.resolve(true);
      if (readOperations.has(id)) return readOperations.get(id).promise;

      const requestGeneration = generation;
      const requestAccount = accountId;
      const requestPage = page;
      const abort = new AbortController();
      onMarkStart(id);
      const isCurrentRead = () => !disposed
        && generation === requestGeneration
        && accountId === requestAccount
        && page === requestPage;
      const promise = (async () => {
        try {
          await mark({ notificationId: id, signal: abort.signal });
          if (!isCurrentRead()) return false;
          confirmedReadIds.add(id);
          listSequence += 1;
          listAbort?.abort();
          listAbort = null;
          activeList = null;
          loadedKey = null;
          onMarkSuccess(id);
          await controller.refresh();
          return true;
        } catch (error) {
          if (!isCurrentRead() || isCanceled(error)) return false;
          onMarkError(id, messageFor(error, "Unable to mark this check-in as read."));
          return false;
        } finally {
          if (readOperations.get(id)?.promise === promise) readOperations.delete(id);
        }
      })();
      readOperations.set(id, { abort, promise });
      return promise;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
    },
  };
  return controller;
};
