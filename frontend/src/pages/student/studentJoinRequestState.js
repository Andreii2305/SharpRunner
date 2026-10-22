const identity = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
};

const isCanceled = (error) => (
  error?.code === "ERR_CANCELED" || error?.name === "AbortError"
);

export const normalizeStudentClassroomError = (source) => ({
  code: source?.response?.data?.code ?? (source?.response ? "REQUEST_FAILED" : "NETWORK_ERROR"),
  status: Number(source?.response?.status) || 0,
  message: source?.response?.data?.message
    ?? source?.message
    ?? "Unable to check your classroom status.",
});

export const getSubmissionNotice = (result) => {
  const name = result?.classroom?.className ?? "this classroom";
  if (result?.membership?.status === "active") {
    return { type: "success", message: `You are already an active member of ${name}.` };
  }
  return {
    type: "success",
    message: result?.changed
      ? `Join request submitted for ${name}. Awaiting teacher approval.`
      : `Your request for ${name} is already awaiting teacher approval.`,
  };
};

const normalizeSummary = (payload) => {
  if (!Array.isArray(payload?.classrooms) || !Array.isArray(payload?.pendingRequests)) {
    throw new Error("The classroom status response was incomplete.");
  }
  return payload;
};

export const reconcileMembershipSummary = (payload, previouslyObserved = new Map()) => {
  const normalized = normalizeSummary(payload);
  const activeIds = new Set(
    normalized.classrooms.map((item) => identity(item?.id)).filter(Boolean),
  );
  const currentPending = new Map();

  for (const request of normalized.pendingRequests) {
    const classroomId = identity(request?.classroom?.id);
    if (classroomId) currentPending.set(classroomId, request);
  }

  const observed = new Map(previouslyObserved);
  for (const [classroomId, request] of currentPending) {
    observed.set(classroomId, request.classroom);
  }

  const requestStates = [...observed.entries()].map(([classroomId, classroom]) => {
    const current = currentPending.get(classroomId);
    if (current) {
      return {
        classroom: current.classroom,
        requestedAt: current.requestedAt ?? null,
        state: "pending",
      };
    }
    return {
      classroom,
      requestedAt: null,
      state: activeIds.has(classroomId) ? "approved" : "no-longer-pending",
    };
  });

  return { ...normalized, requestStates, observed };
};

export const createStudentJoinRequestController = ({
  getMembershipSummary,
  submitJoinRequest,
  onReset = () => {},
  onLoading = () => {},
  onSummary = () => {},
  onLoadError = () => {},
  onSubmitPending = () => {},
  onSubmitConfirmed = () => {},
  onSubmitError = () => {},
  onRefreshAfterSubmitError = () => {},
}) => {
  let account = null;
  let generation = 0;
  let loadSequence = 0;
  let listAbort = null;
  let submission = null;
  let observed = new Map();

  const isCurrent = (scope, requestGeneration) => (
    scope != null && scope === account && requestGeneration === generation
  );

  const setAccount = (nextAccount) => {
    account = identity(nextAccount);
    generation += 1;
    loadSequence += 1;
    listAbort?.abort();
    listAbort = null;
    submission = null;
    observed = new Map();
    onReset(account);
  };

  const load = async ({ reason = "check", afterSubmit = null } = {}) => {
    const scope = account;
    const requestGeneration = generation;
    if (!scope) return false;

    const sequence = ++loadSequence;
    listAbort?.abort();
    const abort = new AbortController();
    listAbort = abort;
    onLoading(true, reason);

    try {
      const payload = await getMembershipSummary({ signal: abort.signal });
      if (!isCurrent(scope, requestGeneration) || sequence !== loadSequence) return false;
      const result = reconcileMembershipSummary(payload, observed);
      observed = result.observed;
      onSummary(result, { reason, afterSubmit });
      return true;
    } catch (source) {
      if (!isCurrent(scope, requestGeneration) || sequence !== loadSequence || isCanceled(source)) {
        return false;
      }
      const error = normalizeStudentClassroomError(source);
      if (afterSubmit) onRefreshAfterSubmitError(error, afterSubmit);
      else onLoadError(error, { reason });
      return false;
    } finally {
      if (isCurrent(scope, requestGeneration) && sequence === loadSequence) {
        listAbort = null;
        onLoading(false, reason);
      }
    }
  };

  const submit = async ({ classCode }) => {
    const scope = account;
    const requestGeneration = generation;
    if (!scope || submission) return false;

    const operation = Symbol("student-join-request");
    submission = operation;
    onSubmitPending(true);
    try {
      const result = await submitJoinRequest({ classCode });
      if (!isCurrent(scope, requestGeneration) || submission !== operation) return false;
      const classroomId = identity(result?.classroom?.id);
      if (classroomId && result?.membership?.status === "pending") {
        observed.set(classroomId, result.classroom);
      }
      onSubmitConfirmed(result);
      await load({ reason: "after-submit", afterSubmit: result });
      return true;
    } catch (source) {
      if (!isCurrent(scope, requestGeneration) || submission !== operation) return false;
      onSubmitError(normalizeStudentClassroomError(source));
      return false;
    } finally {
      if (isCurrent(scope, requestGeneration) && submission === operation) {
        submission = null;
        onSubmitPending(false);
      }
    }
  };

  return {
    setAccount,
    load,
    submit,
    dispose() {
      generation += 1;
      loadSequence += 1;
      account = null;
      listAbort?.abort();
      listAbort = null;
      submission = null;
      observed = new Map();
    },
  };
};
