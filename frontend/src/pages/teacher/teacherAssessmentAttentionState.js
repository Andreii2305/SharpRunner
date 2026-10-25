const identity = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
};

const classroomIdentity = (value) => {
  const normalized = identity(value);
  if (!normalized || !/^[1-9][0-9]*$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? normalized : null;
};

const canceled = (error) => error?.code === "ERR_CANCELED" || error?.name === "AbortError";
const classroomName = (classroom) => `${classroom?.className ?? ""}`.trim().toLocaleLowerCase();
const classroomSection = (classroom) => `${classroom?.section ?? ""}`.trim().toLocaleLowerCase();

export const initialTeacherAssessmentAttentionState = () => ({
  status: "idle",
  loading: false,
  students: [],
  total: null,
  limit: 5,
  error: "",
});

export const chooseAttentionClassroomId = (classrooms, currentClassroomId) => {
  const active = (Array.isArray(classrooms) ? classrooms : [])
    .filter((classroom) => classroom?.isActive !== false && classroomIdentity(classroom?.id))
    .slice()
    .sort((left, right) => (
      classroomName(left).localeCompare(classroomName(right))
      || classroomSection(left).localeCompare(classroomSection(right))
      || Number(left.id) - Number(right.id)
    ));
  const current = classroomIdentity(currentClassroomId);
  if (current && active.some((classroom) => classroomIdentity(classroom.id) === current)) return current;
  return active.length > 0 ? classroomIdentity(active[0].id) : null;
};

const normalizePayload = (payload, requestedClassroomId) => {
  if (classroomIdentity(payload?.classroom?.id) !== requestedClassroomId) {
    throw new Error("The attention response did not match the selected classroom.");
  }
  if (!Array.isArray(payload?.students)
    || !Number.isSafeInteger(payload?.total)
    || payload.total < payload.students.length
    || !Number.isSafeInteger(payload?.limit)
    || payload.limit < 1
    || payload.limit > 100) {
    throw new Error("The attention response was incomplete.");
  }
  return {
    classroom: payload.classroom,
    students: payload.students,
    total: payload.total,
    limit: payload.limit,
  };
};

const errorMessage = (error) => error?.response?.data?.message
  || error?.message
  || "Unable to load students needing attention.";

export const createTeacherAssessmentAttentionController = ({
  request,
  onReset = () => {},
  onLoading = () => {},
  onSuccess = () => {},
  onError = () => {},
  onFinish = () => {},
}) => {
  let accountId = null;
  let classroomId = null;
  let generation = 0;
  let sequence = 0;
  let abortController = null;
  let disposed = false;

  const invalidate = () => {
    generation += 1;
    sequence += 1;
    abortController?.abort();
    abortController = null;
  };
  const isCurrent = (requestGeneration, requestSequence, requestedClassroomId) => (
    !disposed
    && requestGeneration === generation
    && requestSequence === sequence
    && requestedClassroomId === classroomId
  );

  const controller = {
    activate() {
      disposed = false;
    },
    setScope(nextScope = {}) {
      if (disposed) return false;
      const nextAccountId = identity(nextScope.accountId);
      const nextClassroomId = classroomIdentity(nextScope.classroomId);
      if (nextAccountId === accountId && nextClassroomId === classroomId) return false;
      invalidate();
      accountId = nextAccountId;
      classroomId = nextClassroomId;
      onReset();
      return true;
    },
    async load() {
      if (disposed || !accountId || !classroomId) return false;
      sequence += 1;
      const requestSequence = sequence;
      const requestGeneration = generation;
      const requestedClassroomId = classroomId;
      abortController?.abort();
      const abort = new AbortController();
      abortController = abort;
      onLoading(true);
      try {
        const response = await request({
          classroomId: requestedClassroomId,
          limit: 5,
          signal: abort.signal,
        });
        if (!isCurrent(requestGeneration, requestSequence, requestedClassroomId)) return false;
        onSuccess(normalizePayload(response, requestedClassroomId));
        return true;
      } catch (error) {
        if (!isCurrent(requestGeneration, requestSequence, requestedClassroomId) || canceled(error)) return false;
        onError(errorMessage(error));
        return false;
      } finally {
        if (isCurrent(requestGeneration, requestSequence, requestedClassroomId)) {
          abortController = null;
          onFinish();
        }
      }
    },
    retry() {
      return controller.load();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
    },
  };
  return controller;
};
