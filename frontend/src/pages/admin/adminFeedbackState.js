const FILTERS = new Set(["pending", "approved", "rejected", "revoked", "all"]);
const ACTIONS = new Set(["approve", "reject", "revoke"]);
const EXPLANATION_LIMIT = 500;

export const INITIAL_ADMIN_FEEDBACK_STATE = Object.freeze({
  section: "platform",
  platformStatus: "idle",
  platformFeedback: [],
  platformPage: 1,
  platformTotal: null,
  platformTotalPages: null,
  platformError: "",
  queueStatus: "idle",
  testimonials: [],
  queueFilter: "pending",
  queuePage: 1,
  queueTotal: null,
  queueTotalPages: null,
  queueError: "",
  selectedSubmissionId: null,
  detailStatus: "idle",
  detail: null,
  revisionPage: 1,
  detailError: "",
  decision: null,
  decisionError: "",
  mutationPhase: "idle",
  mutationError: "",
  mutationRetryAt: null,
  refreshError: "",
});

const freshState = () => ({
  ...INITIAL_ADMIN_FEEDBACK_STATE,
  platformFeedback: [],
  testimonials: [],
});
const positiveId = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const validPage = (value) => Number.isSafeInteger(value) && value > 0;
const canceled = (error) => error?.name === "AbortError" || error?.code === "ERR_CANCELED";
const errorCode = (error) => String(error?.response?.data?.code || "");
const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;
const retryAfterMs = (error) => {
  const value = error?.response?.headers?.["retry-after"] ?? error?.response?.headers?.get?.("Retry-After");
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 60_000;
};
const plainText = (value) => typeof value === "string" ? value : "";

const validAuthor = (author) => positiveId(author?.id)
  && ["student", "teacher"].includes(author.role)
  && typeof author.username === "string"
  && typeof author.status === "string";
const validRevision = (revision) => positiveId(revision?.id)
  && validPage(revision.revisionNumber)
  && typeof revision.message === "string"
  && ["named", "anonymous"].includes(revision.attributionMode)
  && ["pending", "approved", "rejected", "revoked"].includes(revision.moderationStatus)
  && typeof revision.consentVersion === "string";
const validTestimonial = (item) => positiveId(item?.id)
  && validAuthor(item.author)
  && validRevision(item.currentRevision);
const validatePlatform = (payload, page) => {
  if (!Array.isArray(payload?.feedback)
    || payload.feedback.some((item) => !positiveId(item?.id) || typeof item.message !== "string" || !validAuthor(item.author))
    || payload.page !== page || payload.limit !== 20
    || !Number.isSafeInteger(payload.total) || payload.total < 0
    || !validPage(payload.totalPages)) throw new Error("Invalid private feedback response");
  return payload;
};
const validateQueue = (payload, status, page) => {
  if (!Array.isArray(payload?.testimonials) || payload.testimonials.some((item) => !validTestimonial(item))
    || payload.status !== status || payload.page !== page || payload.limit !== 20
    || !Number.isSafeInteger(payload.total) || payload.total < 0
    || !validPage(payload.totalPages)) throw new Error("Invalid testimonial queue response");
  return payload;
};
const validateDetail = (payload, submissionId, revisionPage) => {
  if (!validTestimonial(payload?.testimonial) || payload.testimonial.id !== submissionId
    || !Array.isArray(payload.revisions) || payload.revisions.some((item) => !validRevision(item))
    || payload.revisionPage !== revisionPage || payload.revisionLimit !== 20
    || !Number.isSafeInteger(payload.revisionTotal) || payload.revisionTotal < 0
    || !validPage(payload.revisionTotalPages)) throw new Error("Invalid testimonial detail response");
  return payload;
};

const decisionEvidenceMatches = (revision, operation) => {
  if (!validRevision(revision) || revision.id !== operation.revisionId) return false;
  if (operation.action === "approve") {
    return ["approved", "revoked"].includes(revision.moderationStatus)
      && revision.approvedByUserId === operation.actorId
      && revision.approvedAt != null;
  }
  if (operation.action === "reject") {
    return revision.moderationStatus === "rejected"
      && revision.moderationExplanation === operation.explanation
      && revision.rejectedByUserId === operation.actorId
      && revision.rejectedAt != null;
  }
  return revision.moderationStatus === "revoked"
    && revision.moderationExplanation === operation.explanation
    && revision.revokedByUserId === operation.actorId
    && revision.revokedAt != null;
};

const validateAcknowledgement = (payload, operation) => {
  if (typeof payload?.changed !== "boolean"
    || !validTestimonial(payload.testimonial)
    || payload.testimonial.id !== operation.submissionId
    || !decisionEvidenceMatches(payload.revision, operation)) return null;
  if (payload.changed && (payload.testimonial.currentRevision.id !== operation.revisionId
    || payload.testimonial.currentRevision.moderationStatus !== payload.revision.moderationStatus)) return null;
  return payload;
};

export const createAdminFeedbackController = ({
  listPlatform,
  listTestimonials,
  getTestimonial,
  moderate,
  onChange = () => {},
  now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancelSchedule = (timer) => clearTimeout(timer),
} = {}) => {
  let state = freshState();
  let active = false;
  let generation = 0;
  let accountId = null;
  let role = null;
  let platformRequest = null;
  let queueRequest = null;
  let detailRequest = null;
  let refreshRequest = null;
  let mutationRequest = null;
  let operation = null;
  let retryTimer = null;

  const snapshot = () => ({ ...state, platformFeedback: [...state.platformFeedback], testimonials: [...state.testimonials] });
  const publish = (patch) => {
    state = { ...state, ...patch };
    if (active) onChange(snapshot());
  };
  const current = (token, actor) => active && token === generation && actor === accountId && role === "admin";
  const clearRetryTimer = () => {
    if (retryTimer != null) cancelSchedule(retryTimer);
    retryTimer = null;
  };
  const abortRequest = (request) => request?.abort?.abort();
  const abortReads = () => {
    for (const request of [platformRequest, queueRequest, detailRequest, refreshRequest]) abortRequest(request);
    platformRequest = null;
    queueRequest = null;
    detailRequest = null;
    refreshRequest = null;
  };
  const scheduleRetry = (currentOperation) => {
    clearRetryTimer();
    const delay = Math.max(0, currentOperation.retryAt - now());
    retryTimer = schedule(() => {
      retryTimer = null;
      if (!active || operation !== currentOperation || currentOperation.status !== "rate-limited") return;
      currentOperation.status = "uncertain";
      publish({ mutationPhase: "uncertain", mutationError: "The decision is ready to retry with the same revision.", mutationRetryAt: currentOperation.retryAt });
    }, delay);
  };

  const loadPlatform = async () => {
    if (!active || role !== "admin" || platformRequest) return false;
    const token = generation;
    const actor = accountId;
    const page = state.platformPage;
    const abort = new AbortController();
    const request = { abort };
    platformRequest = request;
    publish({ platformStatus: "loading", platformFeedback: [], platformTotal: null, platformTotalPages: null, platformError: "" });
    try {
      const payload = validatePlatform(await listPlatform({ page, limit: 20, signal: abort.signal }), page);
      if (!current(token, actor) || platformRequest !== request || state.platformPage !== page) return false;
      publish({ platformStatus: "success", platformFeedback: payload.feedback, platformTotal: payload.total, platformTotalPages: payload.totalPages });
      return true;
    } catch (error) {
      if (!current(token, actor) || platformRequest !== request || canceled(error)) return false;
      publish({ platformStatus: "error", platformError: errorMessage(error, "Unable to load private platform feedback.") });
      return false;
    } finally {
      if (platformRequest === request) platformRequest = null;
    }
  };

  const loadQueue = async () => {
    if (!active || role !== "admin" || queueRequest) return false;
    const token = generation;
    const actor = accountId;
    const status = state.queueFilter;
    const page = state.queuePage;
    const abort = new AbortController();
    const request = { abort };
    queueRequest = request;
    publish({ queueStatus: "loading", testimonials: [], queueTotal: null, queueTotalPages: null, queueError: "" });
    try {
      const payload = validateQueue(await listTestimonials({ status, page, limit: 20, signal: abort.signal }), status, page);
      if (!current(token, actor) || queueRequest !== request || state.queueFilter !== status || state.queuePage !== page) return false;
      publish({ queueStatus: "success", testimonials: payload.testimonials, queueTotal: payload.total, queueTotalPages: payload.totalPages });
      return true;
    } catch (error) {
      if (!current(token, actor) || queueRequest !== request || canceled(error)) return false;
      publish({ queueStatus: "error", queueError: errorMessage(error, "Unable to load the testimonial queue.") });
      return false;
    } finally {
      if (queueRequest === request) queueRequest = null;
    }
  };

  const loadDetail = async ({ submissionId, revisionPage }) => {
    if (!active || role !== "admin" || operation) return false;
    const id = positiveId(submissionId);
    if (!id || !validPage(revisionPage)) return false;
    abortRequest(detailRequest);
    const token = generation;
    const actor = accountId;
    const abort = new AbortController();
    const request = { abort, submissionId: id, revisionPage };
    detailRequest = request;
    publish({ selectedSubmissionId: id, revisionPage, detailStatus: "loading", detail: null, detailError: "", decision: null, decisionError: "" });
    try {
      const payload = validateDetail(await getTestimonial({ submissionId: id, revisionPage, revisionLimit: 20, signal: abort.signal }), id, revisionPage);
      if (!current(token, actor) || detailRequest !== request || state.selectedSubmissionId !== id || state.revisionPage !== revisionPage) return false;
      publish({ detailStatus: "success", detail: payload });
      return true;
    } catch (error) {
      if (!current(token, actor) || detailRequest !== request || canceled(error)) return false;
      publish({ detailStatus: "error", detailError: errorMessage(error, "Unable to load testimonial details.") });
      return false;
    } finally {
      if (detailRequest === request) detailRequest = null;
    }
  };

  const refreshAfterCommit = async (currentOperation, acknowledgement) => {
    const token = generation;
    const actor = accountId;
    const abort = new AbortController();
    const request = { abort };
    refreshRequest = request;
    try {
      const [detailResult, queueResult] = await Promise.allSettled([
        getTestimonial({ submissionId: currentOperation.submissionId, revisionPage: state.revisionPage, revisionLimit: 20, signal: abort.signal }),
        listTestimonials({ status: state.queueFilter, page: state.queuePage, limit: 20, signal: abort.signal }),
      ]);
      if (!current(token, actor) || refreshRequest !== request) return;
      let failed = false;
      if (detailResult.status === "fulfilled") {
        try {
          const detail = validateDetail(detailResult.value, currentOperation.submissionId, state.revisionPage);
          publish({ detailStatus: "success", detail, detailError: "" });
        } catch { failed = true; }
      } else failed = true;
      if (queueResult.status === "fulfilled") {
        try {
          const queue = validateQueue(queueResult.value, state.queueFilter, state.queuePage);
          publish({ queueStatus: "success", testimonials: queue.testimonials, queueTotal: queue.total, queueTotalPages: queue.totalPages, queueError: "" });
        } catch { failed = true; }
      } else failed = true;
      publish({
        refreshError: failed ? "The moderation decision was saved, but the latest feedback view could not be refreshed." : "",
        ...(!failed ? {} : { detail: state.detail ?? { testimonial: acknowledgement.testimonial, revisions: [acknowledgement.revision], revisionPage: 1, revisionLimit: 20, revisionTotal: 1, revisionTotalPages: 1 } }),
      });
    } finally {
      abort.abort();
      if (refreshRequest === request) refreshRequest = null;
    }
  };

  const executeDecision = (currentOperation) => {
    if (mutationRequest) return mutationRequest.promise;
    const token = generation;
    const actor = accountId;
    const abort = new AbortController();
    const request = { abort, operation: currentOperation, promise: null };
    currentOperation.status = "sending";
    publish({ decision: null, decisionError: "", mutationPhase: "sending", mutationError: "", mutationRetryAt: null, refreshError: "" });
    const promise = (async () => {
      try {
        const response = await moderate({
          action: currentOperation.action,
          submissionId: currentOperation.submissionId,
          revisionId: currentOperation.revisionId,
          explanation: currentOperation.explanation,
          signal: abort.signal,
        });
        if (!current(token, actor) || operation !== currentOperation) return false;
        const acknowledgement = validateAcknowledgement(response, currentOperation);
        if (!acknowledgement) {
          currentOperation.status = "uncertain";
          publish({ mutationPhase: "uncertain", mutationError: "The moderation confirmation could not be verified. Retry the identical decision." });
          return false;
        }
        operation = null;
        clearRetryTimer();
        publish({
          mutationPhase: "success",
          mutationError: "",
          mutationRetryAt: null,
          decision: null,
          decisionError: "",
          detailStatus: "success",
          detail: state.detail ? { ...state.detail, testimonial: acknowledgement.testimonial } : state.detail,
        });
        await refreshAfterCommit(currentOperation, acknowledgement);
        return true;
      } catch (error) {
        if (!current(token, actor) || operation !== currentOperation || canceled(error)) return false;
        const status = Number(error?.response?.status);
        const code = errorCode(error);
        if (!error?.response || (status >= 500 && status <= 599)) {
          currentOperation.status = "uncertain";
          publish({ mutationPhase: "uncertain", mutationError: "The decision result is uncertain. Retry the identical revision and explanation." });
          return false;
        }
        if (status === 429) {
          currentOperation.status = "rate-limited";
          currentOperation.retryAt = now() + retryAfterMs(error);
          publish({ mutationPhase: "rate-limited", mutationError: "Moderation is temporarily rate limited. Retry will be available after the waiting period.", mutationRetryAt: currentOperation.retryAt });
          scheduleRetry(currentOperation);
          return false;
        }
        operation = null;
        clearRetryTimer();
        if (["REVISION_CHANGED", "TESTIMONIAL_NOT_MODERATABLE", "MODERATION_CONFLICT"].includes(code)) {
          publish({ mutationPhase: "conflict", mutationError: "This testimonial changed or is no longer actionable. Review the refreshed record before making another decision.", decision: null });
          await Promise.allSettled([loadQueue(), loadDetail({ submissionId: currentOperation.submissionId, revisionPage: 1 })]);
          return false;
        }
        publish({ mutationPhase: "error", mutationError: errorMessage(error, "Unable to save the moderation decision."), decision: null });
        return false;
      } finally {
        if (mutationRequest === request) mutationRequest = null;
      }
    })();
    request.promise = promise;
    mutationRequest = request;
    return promise;
  };

  const controller = {
    getState: snapshot,
    isNavigationBlocked: () => Boolean(operation),
    activate() {
      active = true;
      if (operation?.status === "sending") operation.status = "uncertain";
      if (operation?.status === "uncertain") state = { ...state, mutationPhase: "uncertain", mutationError: "The decision result is uncertain. Retry the identical revision and explanation." };
      if (operation?.status === "rate-limited") scheduleRetry(operation);
      onChange(snapshot());
    },
    deactivate() {
      if (!active) return;
      if (operation?.status === "sending") {
        operation.status = "uncertain";
        state = { ...state, mutationPhase: "uncertain", mutationError: "The decision result is uncertain. Retry the identical revision and explanation." };
      }
      active = false;
      generation += 1;
      clearRetryTimer();
      abortReads();
      if (state.platformStatus === "loading") state = { ...state, platformStatus: "idle", platformFeedback: [], platformTotal: null, platformTotalPages: null };
      if (state.queueStatus === "loading") state = { ...state, queueStatus: "idle", testimonials: [], queueTotal: null, queueTotalPages: null };
      if (state.detailStatus === "loading") state = { ...state, detailStatus: "idle", detail: null };
      abortRequest(mutationRequest);
      mutationRequest = null;
    },
    setScope(next = {}) {
      const nextAccount = positiveId(next.accountId);
      const nextRole = String(next.role || "").toLowerCase();
      if (nextAccount === accountId && nextRole === role) return false;
      generation += 1;
      clearRetryTimer();
      abortReads();
      abortRequest(mutationRequest);
      mutationRequest = null;
      operation = null;
      accountId = nextAccount;
      role = nextRole;
      state = freshState();
      onChange(snapshot());
      return true;
    },
    loadPlatform,
    loadQueue,
    setSection(section) {
      if (!active || operation || !["platform", "testimonials"].includes(section) || section === state.section) return false;
      abortReads();
      publish({ section, decision: null, decisionError: "", refreshError: "" });
      return true;
    },
    setPlatformPage(page) {
      if (!validPage(page) || platformRequest || operation || page === state.platformPage) return false;
      publish({ platformPage: page, platformStatus: "idle", platformFeedback: [], platformTotal: null, platformTotalPages: null, platformError: "" });
      return true;
    },
    setQueueFilter(status) {
      if (!FILTERS.has(status) || queueRequest || operation || status === state.queueFilter) return false;
      abortRequest(detailRequest);
      detailRequest = null;
      publish({ queueFilter: status, queuePage: 1, queueStatus: "idle", testimonials: [], queueTotal: null, queueTotalPages: null, queueError: "", selectedSubmissionId: null, detailStatus: "idle", detail: null, detailError: "", decision: null });
      return true;
    },
    setQueuePage(page) {
      if (!validPage(page) || queueRequest || operation || page === state.queuePage) return false;
      publish({ queuePage: page, queueStatus: "idle", testimonials: [], queueTotal: null, queueTotalPages: null, queueError: "" });
      return true;
    },
    selectSubmission(submissionId) {
      if (operation) return Promise.resolve(false);
      return loadDetail({ submissionId, revisionPage: 1 });
    },
    closeDetail() {
      if (operation) return false;
      abortRequest(detailRequest);
      detailRequest = null;
      publish({ selectedSubmissionId: null, detailStatus: "idle", detail: null, revisionPage: 1, detailError: "", decision: null, decisionError: "", mutationPhase: "idle", mutationError: "", refreshError: "" });
      return true;
    },
    setRevisionPage(page) {
      if (operation) return Promise.resolve(false);
      return loadDetail({ submissionId: state.selectedSubmissionId, revisionPage: page });
    },
    prepareDecision({ action, submissionId, revisionId }) {
      if (operation || !ACTIONS.has(action)) return false;
      const item = state.detail?.testimonial;
      const currentRevision = item?.currentRevision;
      const expectedStatus = action === "revoke" ? "approved" : "pending";
      if (!item || item.id !== positiveId(submissionId) || currentRevision?.id !== positiveId(revisionId)
        || currentRevision.moderationStatus !== expectedStatus || item.withdrawnAt || item.publicationSuspendedAt
        || item.author?.status !== "active") return false;
      publish({
        decision: { action, submissionId: item.id, revisionId: currentRevision.id, revisionNumber: currentRevision.revisionNumber, explanation: "" },
        decisionError: "",
        mutationPhase: "confirming",
        mutationError: "",
        refreshError: "",
      });
      return true;
    },
    setDecisionExplanation(value) {
      if (!state.decision || operation) return false;
      publish({ decision: { ...state.decision, explanation: plainText(value) }, decisionError: "" });
      return true;
    },
    cancelDecision() {
      if (!state.decision || operation) return false;
      publish({ decision: null, decisionError: "", mutationPhase: "idle", mutationError: "" });
      return true;
    },
    confirmDecision() {
      if (mutationRequest) return mutationRequest.promise;
      if (operation) return Promise.resolve(false);
      const decision = state.decision;
      if (!decision) return Promise.resolve(false);
      const explanation = decision.action === "approve" ? null : decision.explanation.trim();
      if (decision.action !== "approve" && (!explanation || [...explanation].length > EXPLANATION_LIMIT)) {
        publish({ decisionError: !explanation ? "An explanation is required." : "The explanation must be 500 characters or fewer." });
        return Promise.resolve(false);
      }
      const identity = Object.freeze({
        actorId: accountId,
        action: decision.action,
        submissionId: decision.submissionId,
        revisionId: decision.revisionId,
        revisionNumber: decision.revisionNumber,
        explanation,
      });
      operation = {
        ...identity,
        identity,
        status: "sending",
        retryAt: null,
      };
      return executeDecision(operation);
    },
    retryDecision() {
      if (!operation || mutationRequest || !["uncertain", "rate-limited"].includes(operation.status)) return mutationRequest?.promise ?? Promise.resolve(false);
      if (operation.status === "rate-limited" && now() < operation.retryAt) return Promise.resolve(false);
      return executeDecision(operation);
    },
  };
  return controller;
};
