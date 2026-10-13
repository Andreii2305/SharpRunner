export const createLevelAccessErrorState = (levelKey, requestedClassroomId) => ({
  levelKey,
  status: "error",
  classroomId: requestedClassroomId ?? null,
  entry: null,
});
