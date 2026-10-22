const identity = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
};

const isCanceled = (error) => error?.code === "ERR_CANCELED" || error?.name === "AbortError";

const MESSAGES = Object.freeze({
  CLASSROOM_CAPACITY_REACHED: "This classroom is full. Free a seat or increase its capacity before approving this request.",
  CLASSROOM_INACTIVE: "This classroom is inactive. Reactivate it before approving requests.",
  CLASSROOM_MEMBERSHIP_DECISION_CONFLICT: "This request changed before your decision was applied. The pending list is being refreshed.",
  CLASSROOM_MEMBERSHIP_REQUEST_NOT_FOUND: "This join request is no longer available. Refreshing the pending list.",
});

export const normalizeJoinRequestError = (source) => {
  const status = Number(source?.response?.status) || 0;
  const payload = source?.response?.data ?? {};
  const code = typeof payload.code === "string" ? payload.code : (status ? "REQUEST_FAILED" : "NETWORK_ERROR");
  const fallback = payload.message
    || (status === 403 ? "You do not have permission to manage join requests for this classroom."
      : status === 404 ? "The classroom or join request could not be found."
        : status >= 500 ? "Join requests are temporarily unavailable."
          : source?.message || "Unable to complete the join-request action.");
  return { code, status, message: MESSAGES[code] ?? fallback };
};

const normalizePage = (payload, fallbackPage, fallbackLimit) => {
  if (!Array.isArray(payload?.requests)) throw new Error("The join-request response was incomplete.");
  const total = Number(payload.total);
  const page = Number(payload.page ?? fallbackPage);
  const limit = Number(payload.limit ?? fallbackLimit);
  if (![total, page, limit].every(Number.isSafeInteger) || total < 0 || page < 1 || limit < 1) {
    throw new Error("The join-request response was incomplete.");
  }
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    requests: payload.requests,
  };
};

export const getJoinRequestFocusTarget = (requests, previousIndex) => {
  if (!Array.isArray(requests) || requests.length === 0) return { type: "section" };
  const index = Math.min(Math.max(0, Number(previousIndex) || 0), requests.length - 1);
  return { type: "student", studentId: requests[index].studentId };
};

export const getDecisionRefreshNotice = (outcome, context) => {
  const action = context?.decision === "reject" ? "rejected" : "approved";
  if (outcome.pendingList && outcome.roster) {
    return {
      type: "success",
      retry: false,
      message: `The request was ${action} and classroom data was refreshed.`,
    };
  }
  if (outcome.pendingList) {
    return {
      type: "error",
      retry: true,
      message: `The request was ${action}. The pending list refreshed, but the classroom roster could not refresh. The decision was saved.`,
    };
  }
  if (outcome.roster) {
    return {
      type: "error",
      retry: true,
      message: `The request was ${action}. The roster refreshed, but the pending list could not refresh. The decision was saved.`,
    };
  }
  return {
    type: "error",
    retry: true,
    message: `The request was ${action}, but the pending list and classroom roster could not refresh. The decision was saved.`,
  };
};

export const createJoinRequestController = ({
  listRequests,
  decideRequest,
  onListLoading = () => {},
  onListSuccess = () => {},
  onListError = () => {},
  onPageChange = () => {},
  onDecisionPending = () => {},
  onDecisionConfirmed = () => {},
  onDecisionError = () => {},
  onRefreshAfterDecisionComplete = () => {},
  onRosterRefresh = () => {},
  onFocusTarget = () => {},
}) => {
  let classroom = null;
  let generation = 0;
  let listSequence = 0;
  let listAbort = null;
  const decisions = new Map();

  const isCurrent = (scope, expectedGeneration) => (
    scope != null && scope === classroom && expectedGeneration === generation
  );

  const setClassroom = (nextClassroom) => {
    classroom = identity(nextClassroom);
    generation += 1;
    listSequence += 1;
    listAbort?.abort();
    listAbort = null;
    decisions.clear();
  };

  const load = async ({ classroomId, page = 1, limit = 10, afterDecision = null } = {}) => {
    const scope = identity(classroomId);
    const requestGeneration = generation;
    if (!isCurrent(scope, requestGeneration)) return false;

    const sequence = ++listSequence;
    listAbort?.abort();
    const abort = new AbortController();
    listAbort = abort;
    onListLoading({ classroomId: scope, page, preserveData: Boolean(afterDecision) });

    try {
      const raw = await listRequests({ classroomId: scope, page, limit, signal: abort.signal });
      if (!isCurrent(scope, requestGeneration) || sequence !== listSequence) return false;
      const result = normalizePage(raw, page, limit);
      const validPage = Math.min(page, result.totalPages);
      if (validPage !== page) {
        onPageChange(validPage);
        return load({ classroomId: scope, page: validPage, limit, afterDecision });
      }
      onListSuccess(result, { afterDecision });
      if (afterDecision) onFocusTarget(getJoinRequestFocusTarget(result.requests, afterDecision.rowIndex));
      return true;
    } catch (source) {
      if (!isCurrent(scope, requestGeneration) || sequence !== listSequence || isCanceled(source)) return false;
      const error = normalizeJoinRequestError(source);
      if (!afterDecision) onListError(error);
      return false;
    } finally {
      if (listAbort === abort) listAbort = null;
    }
  };

  const refreshAfterDecision = async ({ context, page = 1, limit = 10 } = {}) => {
    const scope = identity(context?.classroomId);
    const requestGeneration = generation;
    if (!isCurrent(scope, requestGeneration)) return false;

    const rosterRefresh = Promise.resolve()
      .then(() => onRosterRefresh(scope))
      .then((result) => result !== false)
      .catch(() => false);
    const pendingListRefresh = load({ classroomId: scope, page, limit, afterDecision: context });
    const [roster, pendingList] = await Promise.all([rosterRefresh, pendingListRefresh]);

    if (!isCurrent(scope, requestGeneration)) return false;
    onRefreshAfterDecisionComplete({ pendingList, roster }, context);
    return pendingList && roster;
  };

  const decide = async ({ classroomId, studentId, decision, page = 1, limit = 10, rowIndex = 0 }) => {
    const scope = identity(classroomId);
    const requestGeneration = generation;
    if (!isCurrent(scope, requestGeneration) || decisions.has(studentId)) return false;
    const operation = Symbol("join-request-decision");
    decisions.set(studentId, operation);
    onDecisionPending(studentId, true);

    try {
      const result = await decideRequest({ classroomId: scope, studentId, decision });
      if (!isCurrent(scope, requestGeneration) || decisions.get(studentId) !== operation) return false;
      const context = { classroomId: scope, studentId, decision, rowIndex };
      onDecisionConfirmed(result, context);
      await refreshAfterDecision({ context, page, limit });
      return isCurrent(scope, requestGeneration) && decisions.get(studentId) === operation;
    } catch (source) {
      if (!isCurrent(scope, requestGeneration) || decisions.get(studentId) !== operation) return false;
      const error = normalizeJoinRequestError(source);
      onDecisionError(error, { classroomId: scope, studentId, decision, rowIndex });
      if (["CLASSROOM_MEMBERSHIP_DECISION_CONFLICT", "CLASSROOM_MEMBERSHIP_REQUEST_NOT_FOUND"].includes(error.code)) {
        await load({ classroomId: scope, page, limit });
      }
      return false;
    } finally {
      if (isCurrent(scope, requestGeneration) && decisions.get(studentId) === operation) {
        decisions.delete(studentId);
        onDecisionPending(studentId, false);
      }
    }
  };

  return { setClassroom, load, decide, refreshAfterDecision, dispose() { setClassroom(null); } };
};
