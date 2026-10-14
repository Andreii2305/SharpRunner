const normalizeIdentity = (value) => {
  const text = `${value ?? ""}`.trim();
  return text || null;
};

const finiteProgress = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
};

export const getFiniteMetric = (value) => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);

export const getRequiredCollection = (payload, field) => (
  Array.isArray(payload?.[field]) ? payload[field] : null
);

export const getAuthoritativeClassroomId = (classroom) => {
  const classId = classroom?.classId;
  return Number.isInteger(classId) && classId > 0 ? classId : null;
};

export const filterClassrooms = (classrooms, query) => {
  if (!Array.isArray(classrooms)) return [];
  const normalizedQuery = `${query ?? ""}`.trim().toLocaleLowerCase();
  if (!normalizedQuery) return classrooms;

  return classrooms.filter((classroom) => [
    classroom?.className,
    classroom?.section,
    classroom?.schoolYear,
    classroom?.classCode,
  ].some((value) => `${value ?? ""}`.toLocaleLowerCase().includes(normalizedQuery)));
};

export const getNextClassroomTab = (tabs, currentTab, key) => {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;
  if (key === "Home") return tabs[0];
  if (key === "End") return tabs.at(-1);
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;

  const currentIndex = Math.max(0, tabs.indexOf(currentTab));
  const offset = key === "ArrowRight" ? 1 : -1;
  return tabs[(currentIndex + offset + tabs.length) % tabs.length];
};

export const removeStudentFromRoster = (students, targetId) => {
  if (!Array.isArray(students) || !students.some((student) => student?.userId === targetId)) return students;
  return students.filter((student) => student?.userId !== targetId);
};

export const createClassroomIdentityTracker = (initialIdentity) => {
  let current = null;

  const enter = (nextIdentity) => {
    current = Object.freeze({ identity: normalizeIdentity(nextIdentity), generation: Symbol("classroom-generation") });
    return current;
  };

  enter(initialIdentity);
  return {
    enter,
    capture() {
      return current;
    },
    isCurrent(scope) {
      return scope === current && scope?.identity != null;
    },
  };
};

export const mergeClassroomPerformance = (classrooms, performanceRows) => {
  const performanceById = new Map(
    (Array.isArray(performanceRows) ? performanceRows : [])
      .map((row) => [Number(row?.classId), row]),
  );

  return (Array.isArray(classrooms) ? classrooms : []).map((classroom) => {
    const classId = Number(classroom?.id ?? classroom?.classId);
    const performance = performanceById.get(classId);
    return {
      ...classroom,
      classId,
      averageProgressPercent: finiteProgress(performance?.averageProgressPercent),
    };
  });
};

export const getRemoteCollectionView = ({ status, data }) => {
  const hasData = Array.isArray(data) && data.length > 0;
  return {
    showLoading: status === "loading" && !hasData,
    showError: status === "error",
    showEmpty: status === "success" && Array.isArray(data) && data.length === 0,
    showData: hasData,
  };
};

export const isExactClassroomPayload = (payload, expectedClassroomId) => {
  const expected = normalizeIdentity(expectedClassroomId);
  const actual = normalizeIdentity(payload?.classroom?.id);
  return expected != null && actual === expected;
};

export const isSameClassroomIdentity = (currentClassroomId, expectedClassroomId) => {
  const current = normalizeIdentity(currentClassroomId);
  const expected = normalizeIdentity(expectedClassroomId);
  return current != null && current === expected;
};

export const createExactClassroomRequestFence = () => {
  let identity = null;
  let sequence = 0;

  return {
    reset(nextIdentity) {
      identity = normalizeIdentity(nextIdentity);
      sequence += 1;
    },
    begin(requestIdentity) {
      const normalized = normalizeIdentity(requestIdentity);
      sequence += 1;
      return { identity: normalized, sequence };
    },
    isCurrent(token) {
      return Boolean(
        token
        && token.identity != null
        && token.identity === identity
        && token.sequence === sequence,
      );
    },
  };
};

export const createSingleFlightGuard = () => {
  let active = null;

  return {
    begin(classroomId, targetId) {
      if (active) return null;
      active = {
        classroomId: normalizeIdentity(classroomId),
        targetId,
        operation: Symbol("single-flight-operation"),
      };
      return active;
    },
    finish(token) {
      if (token !== active) return false;
      active = null;
      return true;
    },
    isCurrent(token) {
      return token === active;
    },
    reset() {
      active = null;
    },
  };
};
