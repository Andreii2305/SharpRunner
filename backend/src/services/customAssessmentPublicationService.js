const {
  ASSESSMENT_TARGET_KINDS,
  ASSESSMENT_TYPES,
} = require("../constants/assessmentConfig");
const { AssessmentApiError } = require("./assessmentErrorService");
const defaultAccessPolicy = require("./customLessonAssessmentAccessService");

const PUBLICATION_SWITCH = "CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED";

const switchEnabled = (environment) => String(environment?.[PUBLICATION_SWITCH] || "")
  .trim().toLowerCase() === "true";

const createCustomAssessmentPublicationService = ({
  environment = process.env,
  accessPolicy = defaultAccessPolicy,
  now = () => new Date(),
} = {}) => {
  const availability = ({ assessment, target }) => {
    const enabled = switchEnabled(environment);
    if (assessment?.isPublished === true) {
      return { enabled, canPublish: false, reason: "ALREADY_PUBLISHED" };
    }
    if (target?.placement?.archivedAt || target?.lesson?.archivedAt) {
      return { enabled, canPublish: false, reason: "PLACEMENT_ARCHIVED" };
    }
    if (target?.classroom?.isActive === false) {
      return { enabled, canPublish: false, reason: "CLASSROOM_INACTIVE" };
    }
    if (target?.lesson?.isPublished !== true) {
      return { enabled, canPublish: false, reason: "LESSON_UNPUBLISHED" };
    }
    if (target?.lesson?.publishAt && Number.isNaN(new Date(target.lesson.publishAt).getTime())) {
      return { enabled, canPublish: false, reason: "LESSON_SCHEDULE_INVALID" };
    }
    if (Number(assessment?.targetLessonVersion) !== Number(target?.lesson?.contentVersion)) {
      return { enabled, canPublish: false, reason: "REVISION_REVIEW_REQUIRED" };
    }
    if (assessment?.targetKind !== ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT) {
      return { enabled, canPublish: false, reason: "TARGET_INVALID" };
    }
    if (assessment.type === ASSESSMENT_TYPES.PRE
      && assessment.isRequired === true
      && !target?.placement?.accessPolicyEstablishedAt) {
      return { enabled, canPublish: false, reason: "ACCESS_HISTORY_UNCERTAIN" };
    }
    return enabled
      ? { enabled: true, canPublish: true, reason: null }
      : { enabled: false, canPublish: false, reason: "PUBLICATION_DISABLED" };
  };

  const assertCanPublish = ({ assessment, target }) => {
    const state = availability({ assessment, target });
    const errors = {
      PUBLICATION_DISABLED: [403, "CUSTOM_ASSESSMENT_PUBLICATION_DISABLED", "Custom lesson assessment publication is disabled"],
      PLACEMENT_ARCHIVED: [409, "ASSESSMENT_TARGET_ARCHIVED", "Restore this lesson placement before publishing its assessment"],
      CLASSROOM_INACTIVE: [409, "CLASSROOM_INACTIVE", "Activate this classroom before publishing its assessment"],
      LESSON_UNPUBLISHED: [409, "CUSTOM_LESSON_UNPUBLISHED", "Publish or schedule this lesson before publishing its assessment"],
      LESSON_SCHEDULE_INVALID: [409, "CUSTOM_LESSON_SCHEDULE_INVALID", "Fix the lesson schedule before publishing its assessment"],
      REVISION_REVIEW_REQUIRED: [409, "CUSTOM_ASSESSMENT_REVISION_REVIEW_REQUIRED", "Review the current lesson revision before publishing this assessment"],
      ACCESS_HISTORY_UNCERTAIN: [409, "CUSTOM_PRE_ACCESS_HISTORY_UNCERTAIN", "A required PRE cannot be attached because prior lesson access cannot be determined safely. Use an optional PRE or an independent lesson copy."],
      TARGET_INVALID: [404, "ASSESSMENT_NOT_FOUND", "Assessment was not found"],
    };
    if (!state.enabled) {
      throw new AssessmentApiError(
        403,
        "CUSTOM_ASSESSMENT_PUBLICATION_DISABLED",
        "Custom lesson assessment publication is disabled",
      );
    }
    if (!state.canPublish && state.reason !== "ALREADY_PUBLISHED") {
      const [status, code, message] = errors[state.reason] || [409, "CUSTOM_ASSESSMENT_PUBLICATION_UNAVAILABLE", "Custom lesson assessment publication is unavailable"];
      throw new AssessmentApiError(status, code, message, {
        ...(state.reason === "REVISION_REVIEW_REQUIRED"
          ? { currentVersion: target?.lesson?.contentVersion }
          : {}),
      });
    }
    return state;
  };

  const activateRequiredPre = ({ assessment, target }) => {
    if (assessment?.type !== ASSESSMENT_TYPES.PRE || assessment?.isRequired !== true) {
      return assessment?.accessGateEstablishedAt ?? null;
    }
    try {
      return accessPolicy.establishRequiredPreAccessGate({
        assessment,
        placement: { ...target.placement, lesson: target.lesson },
      });
    } catch (error) {
      throw new AssessmentApiError(
        Number(error.status) || 409,
        error.code || "CUSTOM_PRE_ACCESS_HISTORY_UNCERTAIN",
        error.message || "Required PRE publication is unavailable",
      );
    }
  };

  const publish = ({ assessment, target }) => {
    assertCanPublish({ assessment, target });
    activateRequiredPre({ assessment, target });
    assessment.isPublished = true;
    assessment.publishedAt = now();
  };

  return { availability, assertCanPublish, publish, switchEnabled: () => switchEnabled(environment) };
};

module.exports = {
  PUBLICATION_SWITCH,
  createCustomAssessmentPublicationService,
  switchEnabled,
};
