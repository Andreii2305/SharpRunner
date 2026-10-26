const MESSAGE_LIMIT = 1000;

export const normalizeCheckInMessage = (value) => typeof value === "string" ? value.trim() : "";
export const countMessageCharacters = (value) => [...(typeof value === "string" ? value : "")].length;

const initialState = () => ({
  open: false,
  target: null,
  message: "",
  characterCount: 0,
  phase: "editing",
  errorKind: "",
  error: "",
  retryAt: null,
  checkIn: null,
});
export const initialTeacherCheckInState = initialState;

const targetKey = (target) => `${target?.classroom?.id ?? ""}:${target?.student?.userId ?? ""}`;
const scopeIdentity = (value) => `${value ?? ""}`.trim();
const isPositiveSafeInteger = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const defaultKey = () => globalThis.crypto?.randomUUID?.()
  || `checkin_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
const retryAfterMs = (error) => {
  const raw = error?.response?.headers?.["retry-after"] ?? error?.response?.data?.retryAfter;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 60_000;
};
const canceled = (error) => error?.code === "ERR_CANCELED"
  || error?.name === "AbortError"
  || error?.name === "CanceledError";

const presentationFor = (error) => {
  const code = error?.response?.data?.code;
  if (code === "INVALID_REQUEST") return { kind: "validation", message: "Check the message and try again." };
  if (code === "ACTIVE_STUDENT_NOT_FOUND") return { kind: "unavailable", message: "This student is no longer available for a check-in in this classroom." };
  if (code === "CLASSROOM_INACTIVE" || code === "CLASSROOM_NOT_FOUND") return { kind: "unavailable", message: "This classroom is no longer available for sending check-ins." };
  if (code === "IDEMPOTENCY_KEY_CONFLICT") return { kind: "conflict", message: "This send could not be matched safely. Review the message before starting another send." };
  if (code === "FORBIDDEN" || error?.response?.status === 403) return { kind: "authorization", message: "You no longer have permission to send this check-in." };
  return { kind: "error", message: "The check-in could not be sent. Review the message and try again." };
};

export const createTeacherCheckInController = ({
  send,
  createKey = defaultKey,
  now = () => Date.now(),
  onChange = () => {},
} = {}) => {
  let state = initialState();
  let accountId = "";
  let classroomId = "";
  let generation = 0;
  let active = null;
  let disposed = false;
  const unresolved = new Map();

  const emit = (changes) => {
    state = { ...state, ...changes };
    onChange({ ...state });
  };
  const clearActive = ({ uncertain = false } = {}) => {
    if (!active) return;
    if (uncertain) {
      active.operation.status = "uncertain";
      unresolved.set(active.operation.targetKey, active.operation);
    }
    generation += 1;
    active.abort.abort();
    active = null;
  };
  const resetPrivateState = () => {
    clearActive();
    unresolved.clear();
    emit(initialState());
  };
  const isCurrent = (token, operation) => !disposed
    && token === generation
    && active?.operation === operation
    && state.open
    && targetKey(state.target) === operation.targetKey
    && accountId === operation.accountId
    && classroomId === `${operation.classroomId}`;
  const validResult = (result, operation) => (
    (result?.changed === true || result?.changed === false)
    && Number(result?.checkIn?.classroomId) === Number(operation.classroomId)
    && Number(result?.checkIn?.recipientStudentId) === Number(operation.studentId)
    && result?.checkIn?.message === operation.message
  );

  const execute = (operation) => {
    if (active?.operation === operation) return active.promise;
    generation += 1;
    const token = generation;
    const abort = new AbortController();
    operation.status = "sending";
    emit({ phase: "sending", errorKind: "", error: "", retryAt: null });
    const promise = (async () => {
      try {
        const result = await send({
          classroomId: operation.classroomId,
          studentId: operation.studentId,
          message: operation.message,
          idempotencyKey: operation.idempotencyKey,
          signal: abort.signal,
        });
        if (!isCurrent(token, operation)) return false;
        if (!validResult(result, operation)) throw new Error("Incomplete check-in response");
        unresolved.delete(operation.targetKey);
        active = null;
        emit({ phase: "success", errorKind: "", error: "", retryAt: null, checkIn: result.checkIn });
        return true;
      } catch (error) {
        if (!isCurrent(token, operation) || canceled(error)) return false;
        active = null;
        const responseStatus = Number(error?.response?.status);
        if (!error?.response || (responseStatus >= 500 && responseStatus <= 599)) {
          operation.status = "uncertain";
          unresolved.set(operation.targetKey, operation);
          emit({
            phase: "uncertain",
            errorKind: "uncertain",
            error: "The result is uncertain. Retry the same message to confirm whether it was saved.",
          });
          return false;
        }
        if (error.response.status === 429 || error.response.data?.code === "CHECK_IN_RATE_LIMITED") {
          const retryAt = now() + retryAfterMs(error);
          operation.status = "rate-limited";
          operation.retryAt = retryAt;
          unresolved.set(operation.targetKey, operation);
          emit({
            phase: "rate-limited",
            errorKind: "rate-limit",
            error: "Too many check-in requests. Wait before retrying this same message.",
            retryAt,
          });
          return false;
        }
        unresolved.delete(operation.targetKey);
        const presentation = presentationFor(error);
        emit({ phase: "error", errorKind: presentation.kind, error: presentation.message, retryAt: null });
        return false;
      } finally {
        if (active?.promise === promise) active = null;
      }
    })();
    active = { operation, abort, promise };
    return promise;
  };

  const controller = {
    getState: () => ({ ...state }),
    activate() {
      disposed = false;
    },
    setScope(next = {}) {
      if (disposed) return false;
      const nextAccount = scopeIdentity(next.accountId);
      const nextClassroom = scopeIdentity(next.classroomId);
      if (nextAccount === accountId && nextClassroom === classroomId) return false;
      accountId = nextAccount;
      classroomId = nextClassroom;
      resetPrivateState();
      return true;
    },
    open(target) {
      if (disposed || !accountId || !isPositiveSafeInteger(target?.classroom?.id)
        || `${target.classroom.id}` !== classroomId || !isPositiveSafeInteger(target?.student?.userId)) return false;
      const nextKey = targetKey(target);
      if (active && active.operation.targetKey !== nextKey) clearActive({ uncertain: true });
      const operation = unresolved.get(nextKey);
      emit({
        ...initialState(),
        open: true,
        target,
        message: operation?.message ?? "",
        characterCount: countMessageCharacters(operation?.message ?? ""),
        phase: operation?.status ?? "editing",
        errorKind: operation?.status === "uncertain" ? "uncertain" : operation?.status === "rate-limited" ? "rate-limit" : "",
        error: operation?.status === "uncertain"
          ? "The result is uncertain. Retry the same message to confirm whether it was saved."
          : operation?.status === "rate-limited"
            ? "Too many check-in requests. Wait before retrying this same message."
            : "",
        retryAt: operation?.retryAt ?? null,
      });
      return true;
    },
    close() {
      if (!state.open) return false;
      if (active) clearActive({ uncertain: true });
      emit({ open: false });
      return true;
    },
    updateMessage(value) {
      if (!state.open || !["editing", "error"].includes(state.phase)) return false;
      emit({
        message: typeof value === "string" ? value : "",
        characterCount: countMessageCharacters(value),
        phase: "editing",
        errorKind: "",
        error: "",
        retryAt: null,
      });
      return true;
    },
    send() {
      if (!state.open) return false;
      if (active) return active.promise;
      const message = normalizeCheckInMessage(state.message);
      const count = countMessageCharacters(message);
      if (!message || count > MESSAGE_LIMIT) {
        emit({
          characterCount: countMessageCharacters(state.message),
          phase: "error",
          errorKind: "validation",
          error: !message ? "Enter a message before sending." : "Message must be 1,000 characters or fewer.",
        });
        return false;
      }
      const operation = {
        accountId,
        classroomId: Number(state.target.classroom.id),
        studentId: Number(state.target.student.userId),
        message,
        idempotencyKey: createKey(),
        targetKey: targetKey(state.target),
        status: "sending",
        retryAt: null,
      };
      unresolved.set(operation.targetKey, operation);
      emit({ message, characterCount: count });
      return execute(operation);
    },
    retry() {
      if (!state.open || active) return active?.promise ?? false;
      const operation = unresolved.get(targetKey(state.target));
      if (!operation || !["uncertain", "rate-limited"].includes(operation.status)) return false;
      if (operation.status === "rate-limited" && now() < operation.retryAt) return false;
      return execute(operation);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      accountId = "";
      classroomId = "";
      clearActive();
      unresolved.clear();
      state = initialState();
    },
  };
  return controller;
};
