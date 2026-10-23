const PAGE_SIZE = 20;

export const buildQueryString = (values, page, limit = PAGE_SIZE) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  Object.entries(values).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) params.set(key, String(value));
  });
  return params.toString();
};

export const buildAdminUserFilterSnapshot = ({ activeView, userFilters, selectedClassroom }) => {
  const snapshot = {
    ...userFilters,
    role: activeView === "teachers"
      ? "teacher"
      : activeView === "students"
        ? "student"
        : userFilters.role,
  };
  if (activeView === "students" && selectedClassroom?.id) {
    snapshot.classroomId = selectedClassroom.id;
  }
  return snapshot;
};

export const buildUserListPath = (filterSnapshot, page) => (
  `/api/admin/users?${buildQueryString(filterSnapshot, page)}`
);

export const buildUserExportPath = (filterSnapshot) => (
  `/api/admin/users/export.csv?${buildQueryString(filterSnapshot, 1)}`
);

export const buildClassroomLookupPath = ({ search, page }) => (
  `/api/admin/classrooms?${buildQueryString({ search }, page)}`
);

export const classroomOptionLabel = (classroom) => {
  const identity = [classroom?.className, classroom?.section].filter(Boolean).join(" · ") || "Classroom";
  return classroom?.isActive === false ? `${identity} (Archived)` : identity;
};

export const createRequestFence = () => {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(requestGeneration) {
      return requestGeneration === generation;
    },
  };
};

export const createLatestRequestController = ({
  onStart,
  onSuccess,
  onError,
  onFinish = () => {},
}) => {
  const fence = createRequestFence();
  const apply = (requestGeneration, update) => {
    if (!fence.isCurrent(requestGeneration)) return false;
    update();
    return true;
  };

  const controller = {
    begin() {
      const requestGeneration = fence.begin();
      onStart();
      return requestGeneration;
    },
    replace() {
      fence.invalidate();
      onStart();
    },
    invalidate() {
      fence.invalidate();
    },
    succeed(requestGeneration, response) {
      return apply(requestGeneration, () => onSuccess(response));
    },
    fail(requestGeneration, error) {
      return apply(requestGeneration, () => onError(error));
    },
    finish(requestGeneration) {
      return apply(requestGeneration, onFinish);
    },
    async run(request, { mapError = (error) => error } = {}) {
      const requestGeneration = controller.begin();
      try {
        const response = await request();
        return controller.succeed(requestGeneration, response);
      } catch (error) {
        controller.fail(requestGeneration, mapError(error));
        return false;
      } finally {
        controller.finish(requestGeneration);
      }
    },
  };
  return controller;
};

export const createAdminFilterTransitions = ({
  userRequests,
  classroomRequests,
  setActiveView = () => {},
  setUserFilters,
  setUserPage,
  setSelectedClassroom,
  setClassroomLookup,
}) => ({
  changeUserFilter(name, value) {
    userRequests.replace();
    setUserFilters((current) => ({ ...current, [name]: value }));
    setUserPage(1);
  },
  changeUserPage(page) {
    userRequests.replace();
    setUserPage(page);
  },
  changeView(view, currentView) {
    if (view === currentView) return false;
    userRequests.replace();
    if (view !== "students") classroomRequests.replace();
    setUserPage(1);
    setActiveView(view);
    return true;
  },
  changeAppliedClassroom(classroom) {
    userRequests.replace();
    setSelectedClassroom(classroom);
    setUserPage(1);
  },
  changeClassroomSearch(search) {
    classroomRequests.replace();
    setClassroomLookup((current) => ({ ...current, search, page: 1 }));
  },
  changeClassroomLookupPage(page) {
    classroomRequests.replace();
    setClassroomLookup((current) => ({ ...current, page }));
  },
  retryClassroomLookup() {
    classroomRequests.replace();
    setClassroomLookup((current) => ({ ...current, retry: current.retry + 1 }));
  },
});
