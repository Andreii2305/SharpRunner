const isStudentAssigned = (lesson, studentId) => (
  !Array.isArray(lesson?.assignedStudentIds)
  || lesson.assignedStudentIds.length === 0
  || lesson.assignedStudentIds.map(Number).includes(Number(studentId))
);

const submissionPolicyError = (lesson, submission, now = new Date()) => {
  if (!lesson?.allowLateSubmissions && lesson?.dueAt && new Date(lesson.dueAt) < now) {
    return "This assignment no longer accepts late submissions";
  }
  if (lesson?.maxAttempts > 0 && submission && Number(submission.attemptCount || 0) >= Number(lesson.maxAttempts)) {
    return "You have used all submission attempts";
  }
  return null;
};

module.exports = { isStudentAssigned, submissionPolicyError };
