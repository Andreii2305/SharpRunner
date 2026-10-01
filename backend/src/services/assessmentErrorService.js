class AssessmentApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = "AssessmentApiError";
    this.status = status;
    this.code = code;
    this.details = {};
    if (Number.isInteger(Number(details.currentVersion))) {
      this.details.currentVersion = Number(details.currentVersion);
    }
    if (typeof details.lessonKey === "string") this.details.lessonKey = details.lessonKey;
    if (Number.isSafeInteger(Number(details.assessmentId)) && Number(details.assessmentId) > 0) {
      this.details.assessmentId = Number(details.assessmentId);
    }
    if (typeof details.prerequisiteLessonKey === "string") {
      this.details.prerequisiteLessonKey = details.prerequisiteLessonKey;
    }
    if (typeof details.nextAction === "string") this.details.nextAction = details.nextAction;
  }
}

const error = (status, code, message, details) => new AssessmentApiError(status, code, message, details);

const PHASE_B_ERRORS = Object.freeze({
  ASSESSMENT_NOT_FOUND: [404, "ASSESSMENT_NOT_FOUND", "Assessment was not found"],
  ASSESSMENT_UNAVAILABLE: [404, "ASSESSMENT_NOT_PUBLISHED", "Assessment is not published"],
  ATTEMPT_NOT_FOUND: [404, "ATTEMPT_NOT_FOUND", "Assessment attempt was not found"],
  NOT_ENROLLED: [403, "FORBIDDEN", "Forbidden"],
  ATTEMPT_FORBIDDEN: [403, "FORBIDDEN", "Forbidden"],
  QUESTION_NOT_PRESENTED: [400, "INVALID_QUESTION", "Invalid question"],
  CHOICE_NOT_IN_QUESTION: [400, "INVALID_CHOICE", "Invalid choice"],
  INVALID_RESPONSE: [400, "INVALID_CHOICE", "Invalid choice"],
  INVALID_CODING_RESPONSE: [400, "INVALID_CODING_RESPONSE", "Invalid coding response"],
  CODING_SOURCE_TOO_LARGE: [413, "CODING_SOURCE_TOO_LARGE", "Coding response exceeds the source limit"],
  CODING_EXECUTION_UNAVAILABLE: [503, "CODING_EXECUTION_UNAVAILABLE", "Secure coding assessment execution is temporarily unavailable"],
  CODING_PLAYER_UNAVAILABLE: [409, "CODING_PLAYER_UNAVAILABLE", "Coding assessment player is unavailable"],
  INVALID_SUBMISSION_KEY: [400, "INVALID_SUBMISSION_KEY", "Invalid submission key"],
  ASSESSMENT_INVALID: [422, "ASSESSMENT_INVALID", "Assessment graph is invalid"],
  ATTEMPT_SUBMITTED: [409, "ATTEMPT_ALREADY_SUBMITTED", "Assessment attempt was already submitted"],
  MAX_ATTEMPTS: [409, "MAX_ATTEMPTS_REACHED", "Maximum assessment attempts reached"],
  ASSESSMENT_IMMUTABLE: [409, "ASSESSMENT_LOCKED", "Assessment is locked"],
  ASSESSMENT_VERSION_MISMATCH: [409, "ASSESSMENT_VERSION_CONFLICT", "Assessment version conflict"],
  SUBMISSION_KEY_CONFLICT: [409, "SUBMISSION_CONFLICT", "Submission key conflict"],
  TRANSACTION_REQUIRED: [500, "SERVER_ERROR", "Server error"],
  POST_RECOVERY_NOT_ALLOWED: [409, "POST_RECOVERY_NOT_ALLOWED", "An additional POST attempt cannot be granted for this assessment"],
  POST_ATTEMPTS_NOT_EXHAUSTED: [409, "POST_ATTEMPTS_NOT_EXHAUSTED", "Ordinary POST attempts are not exhausted"],
  POST_ALREADY_PASSED: [409, "POST_ALREADY_PASSED", "The student already has a passing POST result"],
  ACTIVE_ATTEMPT_EXISTS: [409, "ACTIVE_ATTEMPT_EXISTS", "The student already has an active assessment attempt"],
});

const PROGRESSION_ERRORS = Object.freeze({
  LESSON_PREREQUISITE_REQUIRED: [
    403,
    "LESSON_PREREQUISITE_REQUIRED",
    "Complete the prerequisite lesson before opening this lesson.",
  ],
  PRE_ASSESSMENT_REQUIRED: [
    403,
    "PRE_ASSESSMENT_REQUIRED",
    "Complete the required pre-test before opening this lesson.",
  ],
  POST_ASSESSMENT_LOCKED: [
    403,
    "POST_ASSESSMENT_LOCKED",
    "Complete the lesson game progression before opening the post-test.",
  ],
});

const translateAssessmentError = (source) => {
  if (source instanceof AssessmentApiError) return source;
  const progression = source?.name === "LessonProgressionError"
    ? PROGRESSION_ERRORS[source.code]
    : null;
  if (progression) {
    return error(progression[0], progression[1], progression[2], {
      lessonKey: source.lessonKey,
      assessmentId: source.assessmentId,
      prerequisiteLessonKey: source.prerequisiteLessonKey,
      nextAction: source.nextAction,
    });
  }
  const mapped = PHASE_B_ERRORS[source?.code];
  if (mapped) return error(mapped[0], mapped[1], mapped[2], source.details);
  if (source?.name === "SequelizeUniqueConstraintError") {
    const constraint = [
      source.constraint,
      source.parent?.constraint,
      source.original?.constraint,
      source.index,
      source.parent?.detail,
      source.original?.detail,
      ...Object.keys(source.fields || {}),
      ...(source.errors || []).flatMap((item) => [item.constraint, item.path, item.message]),
    ].filter(Boolean).join(" ").toLowerCase();
    if (constraint.includes("submission_key") || constraint.includes("submissionkey")) {
      return error(409, "SUBMISSION_CONFLICT", "Submission key conflict");
    }
    if (constraint.includes("assessment_attempts_one_in_progress")
      || constraint.includes("one_in_progress")) {
      return error(409, "ACTIVE_ATTEMPT_EXISTS", "The student already has an active assessment attempt");
    }
    return error(409, "ASSESSMENT_TYPE_EXISTS", "An assessment of this type already exists");
  }
  return null;
};

const sendAssessmentError = (res, source) => {
  const translated = translateAssessmentError(source);
  if (!translated) {
    // Keep the original error on the server; clients receive no implementation details.
    console.error("Unhandled assessment error", source);
    return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
  }
  const body = { code: translated.code, message: translated.message };
  if (Object.keys(translated.details).length) Object.assign(body, translated.details);
  return res.status(translated.status).json(body);
};

module.exports = { AssessmentApiError, sendAssessmentError, translateAssessmentError };
