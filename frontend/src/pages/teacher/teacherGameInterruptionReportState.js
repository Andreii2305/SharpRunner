const PAGE_LIMIT = 20;

const identity = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
};

const positiveSafeIdentity = (value) => {
  const normalized = identity(value);
  if (!normalized || !/^[1-9][0-9]*$/.test(normalized)) return null;
  return Number.isSafeInteger(Number(normalized)) ? normalized : null;
};

const canceled = (error) => error?.code === "ERR_CANCELED" || error?.name === "AbortError";
const nonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const nonNegativeNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

export const initialTeacherGameInterruptionReportState = ({ sessionPage = 1, eventPage = 1 } = {}) => ({
  status: "idle",
  loading: false,
  report: null,
  sessionPage,
  eventPage,
  error: "",
});

const normalizePage = (page, requestedPage) => {
  if (!page
    || !Array.isArray(page.items)
    || page.page !== requestedPage
    || page.limit !== PAGE_LIMIT
    || !nonNegativeInteger(page.total)
    || !nonNegativeInteger(page.totalPages)
    || page.total < page.items.length
    || page.totalPages !== (page.total === 0 ? 0 : Math.ceil(page.total / PAGE_LIMIT))) {
    throw new Error("Recorded interruption response could not be verified.");
  }
  return page;
};

const normalizeReport = (payload, requested) => {
  const classroomId = positiveSafeIdentity(payload?.scope?.classroom?.id);
  const studentId = positiveSafeIdentity(payload?.scope?.student?.id);
  const levelKey = identity(payload?.scope?.level?.levelKey);
  const summary = payload?.summary;
  if (classroomId !== requested.classroomId
    || studentId !== requested.studentId
    || levelKey !== requested.levelKey
    || !summary
    || !nonNegativeInteger(summary.recordedEventCount)
    || !nonNegativeInteger(summary.appliedEventCount)
    || !nonNegativeInteger(summary.unappliedEventCount)
    || summary.recordedEventCount !== summary.appliedEventCount + summary.unappliedEventCount
    || !nonNegativeNumber(summary.actualScoreDeduction)
    || !nonNegativeInteger(summary.actualXpDeduction)
    || !new Set(["available", "unavailable"]).has(payload?.completionEvidence?.availability)) {
    throw new Error("Recorded interruption response could not be verified.");
  }
  const sessions = normalizePage(payload.sessions, requested.sessionPage);
  const events = normalizePage(payload.events, requested.eventPage);
  for (const event of events.items) {
    const applied = event?.applicationStatus === "applied";
    const unapplied = event?.applicationStatus === "unapplied";
    if ((!applied && !unapplied)
      || !positiveSafeIdentity(event?.id)
      || !positiveSafeIdentity(event?.sessionId)
      || !new Set(["fullscreen_exit", "hidden"]).has(event?.type)
      || (applied && (!nonNegativeNumber(event.actualScoreDeduction) || !nonNegativeInteger(event.actualXpDeduction)))
      || (unapplied && (event.actualScoreDeduction !== null || event.actualXpDeduction !== null))) {
      throw new Error("Recorded interruption response could not be verified.");
    }
  }
  return { ...payload, sessions, events };
};

const errorState = (error) => {
  if (error?.response?.status === 403) {
    return { status: "inaccessible", error: "Recorded interruptions are not accessible for this classroom and student." };
  }
  if (error?.response?.status === 409 && error?.response?.data?.code === "REPORT_INTEGRITY_ERROR") {
    return { status: "integrity-error", error: "Recorded interruption data could not be verified." };
  }
  return {
    status: "error",
    error: error?.response?.data?.message || error?.message || "Unable to load recorded interruptions.",
  };
};

export const createTeacherGameInterruptionReportController = ({ request, onChange = () => {} }) => {
  let state = initialTeacherGameInterruptionReportState();
  let scope = { accountId: null, classroomId: null, studentId: null, levelKey: null };
  let active = false;
  let disposed = false;
  let generation = 0;
  let sequence = 0;
  let abortController = null;

  const publish = (nextState) => {
    state = nextState;
    onChange(nextState);
  };
  const invalidate = () => {
    generation += 1;
    sequence += 1;
    abortController?.abort();
    abortController = null;
  };
  const validScope = () => scope.accountId && scope.classroomId && scope.studentId && scope.levelKey;
  const isCurrent = (operation) => !disposed
    && active
    && operation.generation === generation
    && operation.sequence === sequence
    && operation.accountId === scope.accountId
    && operation.classroomId === scope.classroomId
    && operation.studentId === scope.studentId
    && operation.levelKey === scope.levelKey
    && operation.sessionPage === state.sessionPage
    && operation.eventPage === state.eventPage;

  const controller = {
    activate() {
      if (!disposed) return;
      disposed = false;
      active = false;
    },
    setScope(next = {}) {
      if (disposed) return false;
      const normalized = {
        accountId: positiveSafeIdentity(next.accountId),
        classroomId: positiveSafeIdentity(next.classroomId),
        studentId: positiveSafeIdentity(next.studentId),
        levelKey: identity(next.levelKey),
      };
      if (Object.keys(normalized).every((key) => normalized[key] === scope[key])) return false;
      invalidate();
      scope = normalized;
      active = false;
      publish(initialTeacherGameInterruptionReportState());
      return true;
    },
    async load() {
      if (disposed || !active) return false;
      if (!validScope()) {
        publish({
          ...initialTeacherGameInterruptionReportState({ sessionPage: state.sessionPage, eventPage: state.eventPage }),
          status: "inaccessible",
          error: "Select one classroom to view recorded interruptions.",
        });
        return false;
      }
      sequence += 1;
      const operation = { ...scope, generation, sequence, sessionPage: state.sessionPage, eventPage: state.eventPage };
      abortController?.abort();
      const abort = new AbortController();
      abortController = abort;
      publish({ ...state, status: "loading", loading: true, report: null, error: "" });
      try {
        const payload = await request({
          classroomId: operation.classroomId,
          studentId: operation.studentId,
          levelKey: operation.levelKey,
          sessionPage: operation.sessionPage,
          eventPage: operation.eventPage,
          signal: abort.signal,
        });
        if (!isCurrent(operation)) return false;
        publish({ ...state, status: "success", loading: false, report: normalizeReport(payload, operation), error: "" });
        return true;
      } catch (error) {
        if (!isCurrent(operation) || canceled(error)) return false;
        const next = errorState(error);
        publish({ ...state, ...next, loading: false, report: null });
        return false;
      } finally {
        if (isCurrent(operation)) {
          abortController = null;
          if (state.loading) publish({ ...state, loading: false });
        }
      }
    },
    open() {
      if (disposed || active) return Promise.resolve(false);
      active = true;
      return controller.load();
    },
    close() {
      if (disposed) return;
      invalidate();
      active = false;
      publish(initialTeacherGameInterruptionReportState());
    },
    setSessionPage(page) {
      if (disposed || !active || !Number.isSafeInteger(page) || page < 1 || page === state.sessionPage) return Promise.resolve(false);
      invalidate();
      publish(initialTeacherGameInterruptionReportState({ sessionPage: page, eventPage: state.eventPage }));
      return controller.load();
    },
    setEventPage(page) {
      if (disposed || !active || !Number.isSafeInteger(page) || page < 1 || page === state.eventPage) return Promise.resolve(false);
      invalidate();
      publish(initialTeacherGameInterruptionReportState({ sessionPage: state.sessionPage, eventPage: page }));
      return controller.load();
    },
    retry() {
      return controller.load();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      active = false;
      state = initialTeacherGameInterruptionReportState();
    },
  };
  return controller;
};
