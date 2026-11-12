const MESSAGE_LIMIT = 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STALE_CODES = new Set([
  "CONSENT_VERSION_STALE",
  "PUBLIC_NAME_PREVIEW_STALE",
  "REVISION_CHANGED",
]);

const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0
  ? Number(value)
  : null;
const characterCount = (value) => [...value].length;
const normalizeMessage = (value) => typeof value === "string" ? value.trim() : "";
const canceled = (error) => error?.name === "AbortError" || error?.code === "ERR_CANCELED";
const errorCode = (error) => error?.response?.data?.code;
const errorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

const retryAfterMs = (error) => {
  const raw = error?.response?.headers?.["retry-after"]
    ?? error?.response?.headers?.get?.("retry-after");
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 60_000;
};

const createOperationKey = () => {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "");
  return `testimonial_${random || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
};

export const initialTestimonialAuthorState = () => ({
  status: "idle",
  loading: false,
  testimonials: [],
  page: 1,
  limit: 20,
  total: null,
  totalPages: null,
  error: "",
  optionsStatus: "idle",
  options: null,
  optionsError: "",
  selectedSubmissionId: null,
  detailStatus: "idle",
  detailLoading: false,
  detail: null,
  detailError: "",
  revisionPage: 1,
  draftMode: "create",
  message: "",
  characterCount: 0,
  attributionMode: "named",
  consentConfirmed: false,
  baseRevisionId: null,
  mutationPhase: "editing",
  mutationErrorKind: "",
  mutationError: "",
  mutationRetryAt: null,
  withdrawalPhase: "idle",
  withdrawalError: "",
  withdrawalRetryAt: null,
});

const validRevision = (value) => positiveId(value?.id)
  && Number.isSafeInteger(value?.revisionNumber)
  && value.revisionNumber > 0
  && typeof value.message === "string"
  && ["named", "anonymous"].includes(value.attributionMode)
  && ["pending", "approved", "rejected", "revoked"].includes(value.moderationStatus)
  && typeof value.consentVersion === "string"
  && typeof value.createdAt === "string";

const validTestimonial = (value) => positiveId(value?.id)
  && typeof value.createdAt === "string"
  && (value.currentRevision === null || validRevision(value.currentRevision));

const validateOptions = (payload) => {
  if (!payload
    || typeof payload.consentVersion !== "string"
    || !payload.consentVersion
    || typeof payload.consentText !== "string"
    || !payload.consentText.trim()
    || !TOKEN_PATTERN.test(payload.consentBinding)
    || typeof payload.namedDisplayPreview !== "string"
    || !payload.namedDisplayPreview.trim()
    || !TOKEN_PATTERN.test(payload.publicNamePreviewVersion)) {
    throw new Error("The testimonial consent options were incomplete.");
  }
  return {
    consentVersion: payload.consentVersion,
    consentText: payload.consentText,
    consentBinding: payload.consentBinding,
    namedDisplayPreview: payload.namedDisplayPreview,
    publicNamePreviewVersion: payload.publicNamePreviewVersion,
  };
};

const validateList = (payload, page) => {
  if (!Array.isArray(payload?.testimonials)
    || payload.page !== page
    || payload.limit !== 20
    || !Number.isSafeInteger(payload.total)
    || payload.total < payload.testimonials.length
    || !Number.isSafeInteger(payload.totalPages)
    || payload.totalPages < 0
    || payload.testimonials.some((item) => !validTestimonial(item))) {
    throw new Error("The testimonial history response was incomplete.");
  }
  return payload;
};

const validateDetail = (payload, submissionId, revisionPage) => {
  if (!validTestimonial(payload?.testimonial)
    || Number(payload.testimonial.id) !== submissionId
    || !Array.isArray(payload.revisions)
    || payload.revisions.some((item) => !validRevision(item))
    || payload.revisionPage !== revisionPage
    || payload.revisionLimit !== 20
    || !Number.isSafeInteger(payload.revisionTotal)
    || payload.revisionTotal < payload.revisions.length
    || !Number.isSafeInteger(payload.revisionTotalPages)
    || payload.revisionTotalPages < 0) {
    throw new Error("The testimonial detail response was incomplete.");
  }
  return payload;
};

const invalidAcknowledgement = () => {
  const error = new Error("The testimonial confirmation could not be verified.");
  error.invalidAcknowledgement = true;
  return error;
};

const validateOperation = (payload, operation) => {
  const submissionId = operation.submissionId;
  if (typeof payload?.changed !== "boolean"
    || !validTestimonial(payload.testimonial)
    || !validRevision(payload.revision)
    || (submissionId && Number(payload.testimonial.id) !== submissionId)) {
    throw invalidAcknowledgement();
  }
  const acknowledged = payload.revision;
  const expected = operation.payload;
  const immutableFieldsMatch = acknowledged.message === expected.message
    && acknowledged.attributionMode === expected.attributionMode
    && acknowledged.consentVersion === expected.consentVersion
    && (expected.attributionMode === "named"
      ? acknowledged.publicDisplayName === operation.expectedPublicDisplayName
      : acknowledged.publicDisplayName === null);
  const newRevisionIsCurrent = payload.changed !== true
    || Number(payload.testimonial.currentRevision?.id) === Number(acknowledged.id);
  if (!immutableFieldsMatch || !newRevisionIsCurrent) throw invalidAcknowledgement();
  return payload;
};

export const createTestimonialAuthorController = ({
  getOptions,
  list,
  detail,
  create,
  revise,
  withdraw,
  createKey = createOperationKey,
  now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancelSchedule = (timer) => clearTimeout(timer),
  onChange = () => {},
}) => {
  let state = initialTestimonialAuthorState();
  let accountId = null;
  let eligible = false;
  let active = true;
  let generation = 0;
  let listRequest = null;
  let optionsRequest = null;
  let detailRequest = null;
  let mutationRequest = null;
  let withdrawalRequest = null;
  let operation = null;
  let withdrawalOperation = null;
  let withdrawalTimer = null;

  const snapshot = () => ({
    ...state,
    testimonials: [...state.testimonials],
    options: state.options ? { ...state.options } : null,
    detail: state.detail ? {
      ...state.detail,
      revisions: [...state.detail.revisions],
    } : null,
  });
  const publish = (patch) => {
    state = { ...state, ...patch };
    if (active) onChange(snapshot());
  };
  const current = (token, requestedAccount) => active
    && token === generation
    && requestedAccount === accountId
    && eligible;
  const clearWithdrawalTimer = () => {
    if (withdrawalTimer !== null) cancelSchedule(withdrawalTimer);
    withdrawalTimer = null;
  };
  const abortRequests = () => {
    for (const request of [listRequest, optionsRequest, detailRequest, mutationRequest, withdrawalRequest]) {
      request?.abort.abort();
    }
    listRequest = null;
    optionsRequest = null;
    detailRequest = null;
    mutationRequest = null;
    withdrawalRequest = null;
  };

  const scheduleWithdrawalAvailability = (currentOperation) => {
    clearWithdrawalTimer();
    if (!active || withdrawalOperation !== currentOperation
      || currentOperation.status !== "rate-limited") return;
    const remaining = currentOperation.retryAt - now();
    if (remaining <= 0) {
      currentOperation.status = "uncertain";
      publish({
        withdrawalPhase: "uncertain",
        withdrawalError: "Withdrawal is ready to retry with the same submission.",
        withdrawalRetryAt: currentOperation.retryAt,
      });
      return;
    }
    const token = generation;
    const requestedAccount = accountId;
    withdrawalTimer = schedule(() => {
      withdrawalTimer = null;
      if (!current(token, requestedAccount)
        || withdrawalOperation !== currentOperation
        || currentOperation.status !== "rate-limited") return;
      if (now() < currentOperation.retryAt) {
        scheduleWithdrawalAvailability(currentOperation);
        return;
      }
      currentOperation.status = "uncertain";
      publish({
        withdrawalPhase: "uncertain",
        withdrawalError: "Withdrawal is ready to retry with the same submission.",
        withdrawalRetryAt: currentOperation.retryAt,
      });
    }, remaining);
  };

  const loadOptions = ({ force = false } = {}) => {
    if (!active || !eligible || !accountId) return Promise.resolve(false);
    if (optionsRequest) return optionsRequest.promise;
    if (!force && state.optionsStatus === "success") return Promise.resolve(true);
    const token = generation;
    const requestedAccount = accountId;
    const abort = new AbortController();
    publish({ optionsStatus: "loading", options: null, optionsError: "", consentConfirmed: false });
    const promise = (async () => {
      try {
        const nextOptions = validateOptions(await getOptions({ signal: abort.signal }));
        if (!current(token, requestedAccount)) return false;
        publish({ optionsStatus: "success", options: nextOptions, optionsError: "", consentConfirmed: false });
        return true;
      } catch (error) {
        if (!current(token, requestedAccount) || canceled(error)) return false;
        if (error?.response?.status === 503 || errorCode(error) === "TESTIMONIAL_CONSENT_UNAVAILABLE") {
          publish({
            optionsStatus: "unavailable",
            options: null,
            optionsError: "Public testimonial submission is not available right now.",
            consentConfirmed: false,
          });
          return false;
        }
        publish({
          optionsStatus: "error",
          options: null,
          optionsError: errorMessage(error, "Unable to load testimonial consent options."),
          consentConfirmed: false,
        });
        return false;
      } finally {
        if (optionsRequest?.promise === promise) optionsRequest = null;
      }
    })();
    optionsRequest = { abort, promise };
    return promise;
  };

  const loadList = () => {
    if (!active || !eligible || !accountId) return Promise.resolve(false);
    if (listRequest) return listRequest.promise;
    const requestedPage = state.page;
    const token = generation;
    const requestedAccount = accountId;
    const abort = new AbortController();
    publish({ status: "loading", loading: true, testimonials: [], total: null, totalPages: null, error: "" });
    const promise = (async () => {
      try {
        const payload = validateList(await list({ page: requestedPage, limit: 20, signal: abort.signal }), requestedPage);
        if (!current(token, requestedAccount)) return false;
        publish({
          status: "success",
          loading: false,
          testimonials: payload.testimonials,
          page: payload.page,
          limit: payload.limit,
          total: payload.total,
          totalPages: payload.totalPages,
          error: "",
        });
        return true;
      } catch (error) {
        if (!current(token, requestedAccount) || canceled(error)) return false;
        publish({ status: "error", loading: false, testimonials: [], total: null, totalPages: null, error: errorMessage(error, "Unable to load testimonial history.") });
        return false;
      } finally {
        if (listRequest?.promise === promise) listRequest = null;
      }
    })();
    listRequest = { abort, promise };
    return promise;
  };

  const loadDetail = ({ submissionId = state.selectedSubmissionId, revisionPage = state.revisionPage } = {}) => {
    const requestedSubmission = positiveId(submissionId);
    if (!active || !eligible || !accountId || !requestedSubmission) return Promise.resolve(false);
    detailRequest?.abort.abort();
    const token = generation;
    const requestedAccount = accountId;
    const abort = new AbortController();
    const request = {
      abort,
      submissionId: requestedSubmission,
      revisionPage,
      promise: null,
    };
    detailRequest = request;
    publish({
      selectedSubmissionId: requestedSubmission,
      revisionPage,
      detailStatus: "loading",
      detailLoading: true,
      detail: null,
      detailError: "",
    });
    const promise = (async () => {
      try {
        const payload = validateDetail(await detail({
          submissionId: requestedSubmission,
          revisionPage,
          revisionLimit: 20,
          signal: abort.signal,
        }), requestedSubmission, revisionPage);
        if (!current(token, requestedAccount)
          || detailRequest !== request
          || state.selectedSubmissionId !== requestedSubmission
          || state.revisionPage !== revisionPage) return false;
        publish({ detailStatus: "success", detailLoading: false, detail: payload, detailError: "" });
        return true;
      } catch (error) {
        if (!current(token, requestedAccount)
          || detailRequest !== request
          || state.selectedSubmissionId !== requestedSubmission
          || state.revisionPage !== revisionPage
          || canceled(error)) return false;
        publish({ detailStatus: "error", detailLoading: false, detail: null, detailError: errorMessage(error, "Unable to load testimonial details.") });
        return false;
      } finally {
        if (detailRequest === request) detailRequest = null;
      }
    })();
    request.promise = promise;
    return promise;
  };

  const executeMutation = (currentOperation) => {
    if (mutationRequest) return mutationRequest.promise;
    const token = generation;
    const requestedAccount = accountId;
    const abort = new AbortController();
    currentOperation.status = "sending";
    publish({ mutationPhase: "sending", mutationErrorKind: "", mutationError: "", mutationRetryAt: null });
    const promise = (async () => {
      try {
        const response = currentOperation.mode === "create"
          ? await create({ payload: currentOperation.payload, idempotencyKey: currentOperation.idempotencyKey, signal: abort.signal })
          : await revise({ submissionId: currentOperation.submissionId, payload: currentOperation.payload, idempotencyKey: currentOperation.idempotencyKey, signal: abort.signal });
        if (!current(token, requestedAccount) || operation !== currentOperation) return false;
        const result = validateOperation(response, currentOperation);
        operation = null;
        publish({
          mutationPhase: "success",
          mutationErrorKind: "",
          mutationError: "",
          mutationRetryAt: null,
          consentConfirmed: false,
          selectedSubmissionId: result.testimonial.id,
          revisionPage: 1,
          detailStatus: "success",
          detailLoading: false,
          detail: {
            testimonial: result.testimonial,
            revisions: [result.revision],
            revisionPage: 1,
            revisionLimit: 20,
            revisionTotal: result.revision.revisionNumber,
            revisionTotalPages: Math.ceil(result.revision.revisionNumber / 20),
          },
        });
        const historyRefresh = loadDetail({ submissionId: result.testimonial.id, revisionPage: 1 });
        await Promise.all([loadList(), historyRefresh]);
        return true;
      } catch (error) {
        if (!current(token, requestedAccount) || operation !== currentOperation || canceled(error)) return false;
        if (error?.invalidAcknowledgement) {
          currentOperation.status = "uncertain";
          publish({
            mutationPhase: "uncertain",
            mutationErrorKind: "invalid-acknowledgement",
            mutationError: "The server confirmation could not be verified. Retry the identical operation.",
            mutationRetryAt: null,
          });
          return false;
        }
        const status = Number(error?.response?.status);
        const code = errorCode(error);
        if (!error?.response || (status >= 500 && status <= 599)) {
          currentOperation.status = "uncertain";
          publish({ mutationPhase: "uncertain", mutationErrorKind: "uncertain", mutationError: "The result is uncertain. Retry the same testimonial without changing it." });
          return false;
        }
        if (status === 429) {
          currentOperation.status = "rate-limited";
          currentOperation.retryAt = now() + retryAfterMs(error);
          publish({ mutationPhase: "rate-limited", mutationErrorKind: "rate-limit", mutationError: "Too many testimonial requests. Retry this same operation after the waiting period.", mutationRetryAt: currentOperation.retryAt });
          return false;
        }
        operation = null;
        if (STALE_CODES.has(code)) {
          publish({
            mutationPhase: "error",
            mutationErrorKind: code === "REVISION_CHANGED" ? "stale-revision" : "stale-consent",
            mutationError: code === "REVISION_CHANGED"
              ? "This testimonial changed. Review the latest revision and consent again."
              : "The disclosure or public name preview changed. Review the refreshed information and consent again.",
            mutationRetryAt: null,
            consentConfirmed: false,
          });
          await loadOptions({ force: true });
          if (current(token, requestedAccount) && currentOperation.submissionId) {
            await loadDetail({ submissionId: currentOperation.submissionId, revisionPage: 1 });
          }
          return false;
        }
        publish({ mutationPhase: "error", mutationErrorKind: "definitive", mutationError: errorMessage(error, "Unable to save the testimonial."), mutationRetryAt: null, consentConfirmed: false });
        return false;
      } finally {
        if (mutationRequest?.operation === currentOperation) mutationRequest = null;
      }
    })();
    mutationRequest = { abort, promise, operation: currentOperation };
    return promise;
  };

  const executeWithdrawal = (currentOperation) => {
    if (withdrawalRequest) return withdrawalRequest.promise;
    const token = generation;
    const requestedAccount = accountId;
    const abort = new AbortController();
    currentOperation.status = "sending";
    publish({ withdrawalPhase: "sending", withdrawalError: "", withdrawalRetryAt: null });
    const request = { abort, operation: currentOperation, promise: null };
    const promise = (async () => {
      try {
        const result = await withdraw({ submissionId: currentOperation.submissionId, signal: abort.signal });
        if (!current(token, requestedAccount)
          || withdrawalOperation !== currentOperation
          || state.selectedSubmissionId !== currentOperation.submissionId) return false;
        if (typeof result?.changed !== "boolean"
          || !validTestimonial(result.testimonial)
          || Number(result.testimonial.id) !== currentOperation.submissionId
          || !result.testimonial.withdrawnAt) {
          throw new Error("The withdrawal confirmation was incomplete.");
        }
        withdrawalOperation = null;
        clearWithdrawalTimer();
        const nextDetail = state.detail ? { ...state.detail, testimonial: result.testimonial } : null;
        publish({ withdrawalPhase: "success", withdrawalError: "", withdrawalRetryAt: null, detail: nextDetail });
        await loadList();
        return true;
      } catch (error) {
        if (!current(token, requestedAccount)
          || withdrawalOperation !== currentOperation
          || state.selectedSubmissionId !== currentOperation.submissionId
          || canceled(error)) return false;
        const status = Number(error?.response?.status);
        if (status === 429) {
          currentOperation.status = "rate-limited";
          currentOperation.retryAt = now() + retryAfterMs(error);
          publish({
            withdrawalPhase: "rate-limited",
            withdrawalError: "Too many requests. Withdrawal retry will be available shortly.",
            withdrawalRetryAt: currentOperation.retryAt,
          });
          scheduleWithdrawalAvailability(currentOperation);
          return false;
        }
        if (!error?.response || (status >= 500 && status <= 599)) {
          currentOperation.status = "uncertain";
          publish({
            withdrawalPhase: "uncertain",
            withdrawalError: "The withdrawal result is uncertain. Retry withdrawal to confirm it.",
            withdrawalRetryAt: null,
          });
          return false;
        }
        withdrawalOperation = null;
        clearWithdrawalTimer();
        publish({
          withdrawalPhase: "error",
          withdrawalError: errorMessage(error, "Unable to withdraw the testimonial."),
          withdrawalRetryAt: null,
        });
        return false;
      } finally {
        if (withdrawalRequest === request) withdrawalRequest = null;
      }
    })();
    request.promise = promise;
    withdrawalRequest = request;
    return promise;
  };

  const controller = {
    getState: snapshot,
    activate() {
      active = true;
      if (operation?.status === "sending") operation.status = "uncertain";
      if (operation?.status === "uncertain") {
        state = { ...state, mutationPhase: "uncertain", mutationErrorKind: "uncertain", mutationError: "The result is uncertain. Retry the same testimonial without changing it." };
      }
      if (withdrawalOperation?.status === "sending") withdrawalOperation.status = "uncertain";
      if (withdrawalOperation?.status === "uncertain") {
        state = {
          ...state,
          withdrawalPhase: "uncertain",
          withdrawalError: "The withdrawal result is uncertain. Retry withdrawal to confirm it.",
          withdrawalRetryAt: withdrawalOperation.retryAt ?? null,
        };
      }
      if (withdrawalOperation?.status === "rate-limited") {
        state = {
          ...state,
          withdrawalPhase: "rate-limited",
          withdrawalError: "Too many requests. Withdrawal retry will be available shortly.",
          withdrawalRetryAt: withdrawalOperation.retryAt,
        };
        scheduleWithdrawalAvailability(withdrawalOperation);
      }
      onChange(snapshot());
    },
    deactivate() {
      if (!active) return;
      if (withdrawalOperation?.status === "sending") {
        withdrawalOperation.status = "uncertain";
        state = {
          ...state,
          withdrawalPhase: "uncertain",
          withdrawalError: "The withdrawal result is uncertain. Retry withdrawal to confirm it.",
          withdrawalRetryAt: null,
        };
      }
      active = false;
      generation += 1;
      if (operation?.status === "sending") operation.status = "uncertain";
      clearWithdrawalTimer();
      abortRequests();
    },
    setScope(next = {}) {
      const nextAccount = positiveId(next.accountId);
      const nextEligible = next.eligible === true;
      if (nextAccount === accountId && nextEligible === eligible) return false;
      generation += 1;
      clearWithdrawalTimer();
      abortRequests();
      accountId = nextAccount;
      eligible = nextEligible;
      operation = null;
      withdrawalOperation = null;
      state = initialTestimonialAuthorState();
      onChange(snapshot());
      return true;
    },
    loadOptions,
    loadList,
    retryList: loadList,
    setPage(page) {
      if (!active || !positiveId(page) || listRequest || page === state.page) return false;
      publish({ status: "idle", loading: false, testimonials: [], page: Number(page), total: null, totalPages: null, error: "" });
      return true;
    },
    selectSubmission(submissionId) {
      if (operation || withdrawalRequest) return Promise.resolve(false);
      return loadDetail({ submissionId, revisionPage: 1 });
    },
    closeDetail() {
      detailRequest?.abort.abort();
      detailRequest = null;
      publish({ selectedSubmissionId: null, detailStatus: "idle", detailLoading: false, detail: null, detailError: "", revisionPage: 1, withdrawalPhase: "idle", withdrawalError: "" });
    },
    setRevisionPage(page) {
      const normalized = positiveId(page);
      if (!normalized || !state.selectedSubmissionId || detailRequest) return Promise.resolve(false);
      return loadDetail({ submissionId: state.selectedSubmissionId, revisionPage: normalized });
    },
    startCreate() {
      if (operation || mutationRequest || withdrawalOperation || withdrawalRequest) return false;
      publish({ draftMode: "create", message: "", characterCount: 0, attributionMode: "named", consentConfirmed: false, baseRevisionId: null, mutationPhase: "editing", mutationErrorKind: "", mutationError: "", mutationRetryAt: null });
      return true;
    },
    startEdit() {
      const item = state.detail?.testimonial;
      const currentRevision = item?.currentRevision;
      if (!item || !currentRevision || item.withdrawnAt || operation || mutationRequest || withdrawalOperation || withdrawalRequest) return false;
      publish({ draftMode: "edit", message: currentRevision.message, characterCount: characterCount(currentRevision.message), attributionMode: currentRevision.attributionMode, consentConfirmed: false, baseRevisionId: currentRevision.id, mutationPhase: "editing", mutationErrorKind: "", mutationError: "", mutationRetryAt: null });
      return true;
    },
    updateMessage(value) {
      if (operation || mutationRequest) return false;
      const message = typeof value === "string" ? value : "";
      publish({ message, characterCount: characterCount(normalizeMessage(message)), consentConfirmed: false, mutationPhase: "editing", mutationErrorKind: "", mutationError: "" });
      return true;
    },
    setAttribution(value) {
      if (operation || mutationRequest || !["named", "anonymous"].includes(value)) return false;
      publish({ attributionMode: value, consentConfirmed: false, mutationPhase: "editing", mutationErrorKind: "", mutationError: "" });
      return true;
    },
    setConsent(value) {
      if (operation || mutationRequest || state.optionsStatus !== "success") return false;
      publish({ consentConfirmed: value === true, mutationErrorKind: "", mutationError: "" });
      return true;
    },
    submitDraft() {
      if (!active || !eligible || !accountId) return Promise.resolve(false);
      if (mutationRequest) return mutationRequest.promise;
      if (operation || withdrawalOperation) return Promise.resolve(false);
      const message = normalizeMessage(state.message);
      const count = characterCount(message);
      if (state.optionsStatus !== "success" || !state.options) {
        publish({ mutationPhase: "error", mutationErrorKind: "configuration", mutationError: "Testimonial consent options are unavailable.", consentConfirmed: false });
        return Promise.resolve(false);
      }
      if (!message || count > MESSAGE_LIMIT || !state.consentConfirmed) {
        publish({ mutationPhase: "error", mutationErrorKind: "validation", mutationError: !message ? "Enter a testimonial before submitting." : count > MESSAGE_LIMIT ? "Testimonials must be 1,000 characters or fewer." : "Review the disclosure and provide fresh consent before submitting." });
        return Promise.resolve(false);
      }
      const payload = {
        ...(state.draftMode === "edit" ? { baseRevisionId: state.baseRevisionId } : {}),
        message,
        attributionMode: state.attributionMode,
        consent: true,
        consentVersion: state.options.consentVersion,
        consentBinding: state.options.consentBinding,
        ...(state.attributionMode === "named"
          ? { publicNamePreviewVersion: state.options.publicNamePreviewVersion }
          : {}),
      };
      operation = {
        mode: state.draftMode,
        submissionId: state.draftMode === "edit" ? state.selectedSubmissionId : null,
        payload: Object.freeze({ ...payload }),
        expectedPublicDisplayName: state.attributionMode === "named"
          ? state.options.namedDisplayPreview
          : null,
        idempotencyKey: createKey(),
        status: "sending",
        retryAt: null,
      };
      publish({ message, characterCount: count });
      return executeMutation(operation);
    },
    retryMutation() {
      if (!active || !operation || mutationRequest || !["uncertain", "rate-limited"].includes(operation.status)) {
        return mutationRequest?.promise ?? Promise.resolve(false);
      }
      if (operation.status === "rate-limited" && now() < operation.retryAt) return Promise.resolve(false);
      return executeMutation(operation);
    },
    withdrawSelected() {
      const submissionId = positiveId(state.selectedSubmissionId);
      if (!active || !eligible || !accountId || !submissionId || mutationRequest) return Promise.resolve(false);
      if (withdrawalRequest) return withdrawalRequest.promise;
      if (withdrawalOperation && withdrawalOperation.submissionId !== submissionId) return Promise.resolve(false);
      if (withdrawalOperation?.status === "rate-limited" && now() < withdrawalOperation.retryAt) {
        return Promise.resolve(false);
      }
      if (!withdrawalOperation) {
        withdrawalOperation = { submissionId, status: "idle", retryAt: null };
      }
      return executeWithdrawal(withdrawalOperation);
    },
  };
  return controller;
};
