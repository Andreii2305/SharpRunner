export const isLessonResourceAvailable = (resource, enforceAvailability = false) => !enforceAvailability || resource?.available === true;

export const lessonImageDeliveryPath = (image, classroomId = null, enforceAvailability = false) => {
  if (!isLessonResourceAvailable(image, enforceAvailability)) return null;
  const query = classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : "";
  return `/api/lesson-content/classroom-files/${image.id}${query}`;
};
