const { Op } = require("sequelize");
const defaultModels = require("../models");
const { ATTEMPT_STATUSES, ASSESSMENT_TYPES } = require("../constants/assessmentConfig");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const {
  ASSESSMENT_GATED_LESSON_KEYS,
  CANONICAL_LESSON_ORDER,
  LESSON_NEXT_ACTIONS,
  PROGRESSION_DENIAL_REASONS,
} = require("../constants/lessonProgressionConfig");
const defaultAuthorizationService = require("./assessmentAuthorizationService");
const { AssessmentApiError } = require("./assessmentErrorService");
const { selectOfficialPostAttempt } = require("./assessmentPolicyService");
const {
  getClassroomLevelSettings: defaultLevelSettingsLoader,
} = require("./classroomLevelSettingsService");

const GATED_LESSON_KEY_SET = new Set(ASSESSMENT_GATED_LESSON_KEYS);
const ASSESSMENT_ATTRIBUTES = Object.freeze([
  "id",
  "classroomId",
  "lessonKey",
  "type",
  "isRequired",
  "isPublished",
  "maxAttempts",
  "requirePassingForCompletion",
]);
const ATTEMPT_ATTRIBUTES = Object.freeze([
  "id",
  "assessmentId",
  "classroomId",
  "studentId",
  "attemptNumber",
  "status",
  "submittedAt",
  "percentage",
  "passed",
]);
const PROGRESS_ATTRIBUTES = Object.freeze([
  "levelKey",
  "isCompleted",
  "startedAt",
  "progressPercent",
  "attemptCount",
]);
const plain = (value) => value?.toJSON ? value.toJSON() : value;
const list = (value) => Array.isArray(value) ? value.map(plain) : [];
const sameId = (left, right) => String(left) === String(right);

const attemptsFor = (assessment, attemptsByAssessmentId) => assessment
  ? attemptsByAssessmentId.get(String(assessment.id)) || []
  : [];

const hasGameActivity = (progress) => Boolean(
  progress?.isCompleted
  || progress?.startedAt
  || Number(progress?.progressPercent) > 0
  || Number(progress?.attemptCount) > 0,
);

const nextActionFor = ({
  curriculumPrerequisiteSatisfied,
  preRequired,
  preCompleted,
  preAttemptInProgress,
  gameCompleted,
  postRequired,
  postCompleted,
  postPassingRequired,
  postPassed,
  postAttemptInProgress,
  postAttemptsRemaining,
  lessonCompleted,
}) => {
  if (lessonCompleted) return LESSON_NEXT_ACTIONS.LESSON_COMPLETE;
  if (!curriculumPrerequisiteSatisfied) {
    return LESSON_NEXT_ACTIONS.COMPLETE_PREREQUISITE_LESSON;
  }
  if (preRequired && !preCompleted) {
    return preAttemptInProgress
      ? LESSON_NEXT_ACTIONS.RESUME_PRE
      : LESSON_NEXT_ACTIONS.TAKE_PRE;
  }
  if (!gameCompleted) return LESSON_NEXT_ACTIONS.PLAY_GAME;
  if (postRequired && (!postCompleted || (postPassingRequired && !postPassed))) {
    if (postAttemptInProgress) return LESSON_NEXT_ACTIONS.RESUME_POST;
    if (!postCompleted) return LESSON_NEXT_ACTIONS.TAKE_POST;
    if (postAttemptsRemaining > 0) return LESSON_NEXT_ACTIONS.RETRY_POST;
    return LESSON_NEXT_ACTIONS.POST_RECOVERY_REQUIRED;
  }
  return LESSON_NEXT_ACTIONS.LESSON_COMPLETE;
};

const invalidAssessmentDebt = (lessonKey) => ({
  kind: "invalid",
  lessonKey,
  accessReason: "ASSESSMENT_STATE_INVALID",
  routable: false,
});

const positiveAssessmentId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const resolveRequiredAssessmentDebt = (lessonState) => {
  const state = lessonState || {};
  const { lessonKey, nextAction } = state;
  if (!GATED_LESSON_KEY_SET.has(lessonKey)) return null;

  const preUnsatisfied = state.preRequired === true && state.preCompleted !== true;
  const postSatisfied = state.postRequired !== true || (
    state.postCompleted === true
    && (state.postPassingRequired !== true || state.postPassed === true)
  );
  const postEligible = state.curriculumPrerequisiteSatisfied === true
    && !preUnsatisfied
    && state.gameCompleted === true;
  const postUnsatisfied = state.postRequired === true && !postSatisfied;

  if ([LESSON_NEXT_ACTIONS.TAKE_PRE, LESSON_NEXT_ACTIONS.RESUME_PRE].includes(nextAction)) {
    const assessmentId = positiveAssessmentId(state.preAssessmentId);
    const resumeMatches = state.preAttemptInProgress === (
      nextAction === LESSON_NEXT_ACTIONS.RESUME_PRE
    );
    if (!preUnsatisfied || state.curriculumPrerequisiteSatisfied !== true
      || !assessmentId || !resumeMatches) {
      return invalidAssessmentDebt(lessonKey);
    }
    return {
      kind: "required-assessment",
      lessonKey,
      assessmentType: ASSESSMENT_TYPES.PRE,
      assessmentId,
      assessmentAction: nextAction,
      accessReason: "PRE_ASSESSMENT_REQUIRED",
      routable: true,
    };
  }

  const postActions = [
    LESSON_NEXT_ACTIONS.TAKE_POST,
    LESSON_NEXT_ACTIONS.RESUME_POST,
    LESSON_NEXT_ACTIONS.RETRY_POST,
    LESSON_NEXT_ACTIONS.POST_RECOVERY_REQUIRED,
  ];
  if (postActions.includes(nextAction)) {
    const assessmentId = positiveAssessmentId(state.postAssessmentId);
    const active = state.postAttemptInProgress === true;
    const remaining = Number(state.postAttemptsRemaining);
    const actionMatches = (
      (nextAction === LESSON_NEXT_ACTIONS.TAKE_POST && !active && state.postCompleted !== true)
      || (nextAction === LESSON_NEXT_ACTIONS.RESUME_POST && active)
      || (nextAction === LESSON_NEXT_ACTIONS.RETRY_POST
        && !active
        && state.postCompleted === true
        && state.postPassingRequired === true
        && state.postPassed !== true
        && remaining > 0)
      || (nextAction === LESSON_NEXT_ACTIONS.POST_RECOVERY_REQUIRED
        && !active
        && state.postCompleted === true
        && state.postPassingRequired === true
        && state.postPassed !== true
        && remaining === 0)
    );
    if (!postEligible || !postUnsatisfied || !assessmentId || !actionMatches) {
      return invalidAssessmentDebt(lessonKey);
    }
    return {
      kind: "required-assessment",
      lessonKey,
      assessmentType: ASSESSMENT_TYPES.POST,
      assessmentId,
      assessmentAction: nextAction,
      accessReason: "POST_ASSESSMENT_REQUIRED",
      routable: nextAction !== LESSON_NEXT_ACTIONS.POST_RECOVERY_REQUIRED,
    };
  }

  const consistentNoDebt = (
    (nextAction === LESSON_NEXT_ACTIONS.COMPLETE_PREREQUISITE_LESSON
      && state.curriculumPrerequisiteSatisfied !== true)
    || (nextAction === LESSON_NEXT_ACTIONS.PLAY_GAME
      && state.curriculumPrerequisiteSatisfied === true
      && !preUnsatisfied
      && state.gameCompleted !== true)
    || (nextAction === LESSON_NEXT_ACTIONS.LESSON_COMPLETE
      && state.curriculumPrerequisiteSatisfied === true
      && !preUnsatisfied
      && state.gameCompleted === true
      && postSatisfied)
  );
  return consistentNoDebt ? null : invalidAssessmentDebt(lessonKey);
};

const buildLessonProgressionStates = ({
  publishedAssessments = [],
  attempts = [],
  progressRows = [],
  levelSettings = [],
} = {}) => {
  const publishedByLessonAndType = new Map();
  for (const assessment of list(publishedAssessments)) {
    if (assessment?.isPublished === true && GATED_LESSON_KEY_SET.has(assessment.lessonKey)) {
      publishedByLessonAndType.set(`${assessment.lessonKey}:${assessment.type}`, assessment);
    }
  }

  const attemptsByAssessmentId = new Map();
  for (const attempt of list(attempts)) {
    const key = String(attempt?.assessmentId);
    if (!attemptsByAssessmentId.has(key)) attemptsByAssessmentId.set(key, []);
    attemptsByAssessmentId.get(key).push(attempt);
  }

  const progressByKey = new Map(list(progressRows).map((row) => [row.levelKey, row]));
  const settingsByKey = new Map(list(levelSettings).map((setting) => [setting.levelKey, setting]));
  const states = new Map();

  for (let index = 0; index < CANONICAL_LESSON_ORDER.length; index += 1) {
    const lessonKey = CANONICAL_LESSON_ORDER[index];
    const prerequisiteLessonKey = CANONICAL_LESSON_ORDER[index - 1] ?? null;
    const curriculumPrerequisiteSatisfied = prerequisiteLessonKey == null
      || states.get(prerequisiteLessonKey).lessonCompleted;
    const assessmentGated = GATED_LESSON_KEY_SET.has(lessonKey);
    const preAssessment = assessmentGated
      ? publishedByLessonAndType.get(`${lessonKey}:${ASSESSMENT_TYPES.PRE}`) ?? null
      : null;
    const postAssessment = assessmentGated
      ? publishedByLessonAndType.get(`${lessonKey}:${ASSESSMENT_TYPES.POST}`) ?? null
      : null;
    const preAttempts = attemptsFor(preAssessment, attemptsByAssessmentId);
    const postAttempts = attemptsFor(postAssessment, attemptsByAssessmentId);
    const preAttemptInProgress = preAttempts.some(
      (attempt) => attempt.status === ATTEMPT_STATUSES.IN_PROGRESS,
    );
    const preCompleted = preAttempts.some(
      (attempt) => attempt.status === ATTEMPT_STATUSES.SUBMITTED,
    );
    const preRequired = preAssessment?.isRequired === true;
    const preSatisfied = !preRequired || preCompleted;

    const requiredLevelKeys = PLAYABLE_LEVEL_KEYS.filter((levelKey) => (
      levelKey.startsWith(`${lessonKey}-level-`)
      && settingsByKey.get(levelKey)?.isEnabled !== false
    ));
    const gameStarted = requiredLevelKeys.some(
      (levelKey) => hasGameActivity(progressByKey.get(levelKey)),
    );
    const gameCompleted = requiredLevelKeys.every(
      (levelKey) => progressByKey.get(levelKey)?.isCompleted === true,
    );

    const submittedPostAttempts = postAttempts.filter(
      (attempt) => attempt.status === ATTEMPT_STATUSES.SUBMITTED,
    );
    const postAttemptInProgress = postAttempts.some(
      (attempt) => attempt.status === ATTEMPT_STATUSES.IN_PROGRESS,
    );
    const officialPostAttempt = selectOfficialPostAttempt(postAttempts);
    const postCompleted = submittedPostAttempts.length > 0;
    const postRequired = postAssessment?.isRequired === true;
    const postPassingRequired = postRequired
      && postAssessment?.requirePassingForCompletion === true;
    const postPassed = officialPostAttempt?.passed === true;
    const postAttemptsUsed = submittedPostAttempts.length;
    const postAttemptsRemaining = postAssessment
      ? Math.max(0, Number(postAssessment.maxAttempts) - postAttemptsUsed)
      : 0;
    const postAttemptsExhausted = Boolean(
      postAssessment
      && postAttemptsUsed >= Number(postAssessment.maxAttempts)
      && !postAttemptInProgress,
    );
    const postSatisfied = !postRequired
      || (postCompleted && (!postPassingRequired || postPassed));
    const assessmentCompleted = preSatisfied && postSatisfied;
    const lessonCompleted = assessmentGated
      ? preSatisfied && gameCompleted && postSatisfied
      : gameCompleted;

    const state = {
      lessonKey,
      prerequisiteLessonKey,
      curriculumPrerequisiteSatisfied,
      preRequired,
      preAssessmentId: preAssessment?.id ?? null,
      preUnlocked: Boolean(preAssessment && curriculumPrerequisiteSatisfied),
      preAttemptInProgress,
      preCompleted,
      moduleUnlocked: curriculumPrerequisiteSatisfied && preSatisfied,
      gameUnlocked: curriculumPrerequisiteSatisfied && preSatisfied,
      gameStarted,
      gameCompleted,
      postRequired,
      postAssessmentId: postAssessment?.id ?? null,
      postUnlocked: Boolean(
        postAssessment
        && curriculumPrerequisiteSatisfied
        && preSatisfied
        && gameCompleted,
      ),
      postAttemptInProgress,
      postCompleted,
      postPassingRequired,
      postPassed,
      postAttemptsUsed,
      postAttemptsRemaining,
      postAttemptsExhausted,
      assessmentCompleted,
      lessonCompleted,
      nextAction: null,
    };
    state.nextAction = nextActionFor(state);
    states.set(lessonKey, state);
  }

  return states;
};

const evaluateAssessmentInteraction = ({ assessment: assessmentInput, state }) => {
  const assessment = plain(assessmentInput) || {};
  if (assessment.isPublished !== true) {
    return { allowed: true, reason: null };
  }
  if (!GATED_LESSON_KEY_SET.has(assessment.lessonKey)) {
    return { allowed: true, reason: null };
  }
  if (!state?.curriculumPrerequisiteSatisfied) {
    return {
      allowed: false,
      reason: PROGRESSION_DENIAL_REASONS.LESSON_PREREQUISITE_REQUIRED,
    };
  }
  if (assessment.type === ASSESSMENT_TYPES.POST) {
    if (state.preRequired && !state.preCompleted) {
      return {
        allowed: false,
        reason: PROGRESSION_DENIAL_REASONS.PRE_ASSESSMENT_REQUIRED,
      };
    }
    if (!state.gameCompleted) {
      return { allowed: false, reason: PROGRESSION_DENIAL_REASONS.GAME_INCOMPLETE };
    }
  }
  return { allowed: true, reason: null };
};

class LessonProgressionError extends Error {
  constructor({
    code,
    message,
    lessonKey,
    assessmentId,
    prerequisiteLessonKey,
    nextAction,
  }) {
    super(message);
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LessonProgressionError",
      writable: true,
    });
    this.code = code;
    this.lessonKey = lessonKey;
    if (assessmentId != null) this.assessmentId = assessmentId;
    if (prerequisiteLessonKey != null) this.prerequisiteLessonKey = prerequisiteLessonKey;
    this.nextAction = nextAction;
  }
}

const progressionDenial = ({ reason, state }) => {
  if (reason === PROGRESSION_DENIAL_REASONS.LESSON_PREREQUISITE_REQUIRED) {
    return new LessonProgressionError({
      code: reason,
      message: "Complete the prerequisite lesson before opening this lesson.",
      lessonKey: state.lessonKey,
      prerequisiteLessonKey: state.prerequisiteLessonKey,
      nextAction: state.nextAction,
    });
  }
  if (reason === PROGRESSION_DENIAL_REASONS.PRE_ASSESSMENT_REQUIRED) {
    return new LessonProgressionError({
      code: reason,
      message: "Complete the required pre-test before opening this lesson.",
      lessonKey: state.lessonKey,
      assessmentId: state.preAssessmentId,
      nextAction: state.nextAction,
    });
  }
  return new LessonProgressionError({
    code: "POST_ASSESSMENT_LOCKED",
    message: "Complete the lesson game progression before opening the post-test.",
    lessonKey: state.lessonKey,
    nextAction: state.nextAction,
  });
};

const createLessonProgressionService = ({
  models = defaultModels,
  authorizationService = defaultAuthorizationService,
  levelSettingsLoader = defaultLevelSettingsLoader,
} = {}) => {
  const { AssessmentAttempt, LessonAssessment, UserProgress } = models;

  const requireExactMembership = async ({
    classroomId,
    studentId,
    authorizedMembership,
    transaction,
  }) => {
    const membership = plain(authorizedMembership) ?? plain(
      await authorizationService.requireActiveStudentMembership({
        classroomId,
        studentId,
        transaction,
      }),
    );
    if (
      membership?.status !== "active"
      || !sameId(membership.classroomId, classroomId)
      || !sameId(membership.studentId, studentId)
    ) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    return membership;
  };

  const loadStates = async ({
    classroomId,
    studentId,
    authorizedMembership = null,
    progressRows = null,
    levelSettings = null,
    transaction = null,
    lessonKeys,
  }) => {
    await requireExactMembership({
      classroomId,
      studentId,
      authorizedMembership,
      transaction,
    });

    const relevantLessonKeys = ASSESSMENT_GATED_LESSON_KEYS.filter(
      (lessonKey) => lessonKeys.includes(lessonKey),
    );
    const relevantLevelKeys = PLAYABLE_LEVEL_KEYS.filter((levelKey) => (
      lessonKeys.some((lessonKey) => levelKey.startsWith(`${lessonKey}-level-`))
    ));
    const transactionOption = transaction ? { transaction } : {};
    const [assessmentRows, loadedProgressRows, loadedLevelSettings] = await Promise.all([
      LessonAssessment.findAll({
        where: {
          classroomId,
          isPublished: true,
          lessonKey: { [Op.in]: relevantLessonKeys },
          type: { [Op.in]: [ASSESSMENT_TYPES.PRE, ASSESSMENT_TYPES.POST] },
        },
        attributes: [...ASSESSMENT_ATTRIBUTES],
        ...transactionOption,
      }),
      progressRows === null
        ? UserProgress.findAll({
            where: { userId: studentId, levelKey: { [Op.in]: relevantLevelKeys } },
            attributes: [...PROGRESS_ATTRIBUTES],
            ...transactionOption,
          })
        : progressRows,
      levelSettings === null ? levelSettingsLoader(classroomId, transactionOption) : levelSettings,
    ]);

    const lessonKeySet = new Set(relevantLessonKeys);
    const exactAssessments = list(assessmentRows).filter((assessment) => (
      sameId(assessment.classroomId, classroomId)
      && assessment.isPublished === true
      && lessonKeySet.has(assessment.lessonKey)
      && (assessment.type === ASSESSMENT_TYPES.PRE || assessment.type === ASSESSMENT_TYPES.POST)
    ));
    const assessmentIds = exactAssessments.map((assessment) => assessment.id);
    let exactAttempts = [];
    if (assessmentIds.length > 0) {
      const assessmentIdSet = new Set(assessmentIds.map(String));
      const attemptRows = await AssessmentAttempt.findAll({
        where: {
          classroomId,
          studentId,
          assessmentId: { [Op.in]: assessmentIds },
        },
        attributes: [...ATTEMPT_ATTRIBUTES],
        ...transactionOption,
      });
      exactAttempts = list(attemptRows).filter((attempt) => (
        sameId(attempt.classroomId, classroomId)
        && sameId(attempt.studentId, studentId)
        && assessmentIdSet.has(String(attempt.assessmentId))
      ));
    }

    return buildLessonProgressionStates({
      publishedAssessments: exactAssessments,
      attempts: exactAttempts,
      progressRows: loadedProgressRows,
      levelSettings: loadedLevelSettings,
    });
  };

  const getLessonProgressionStates = ({
    classroomId,
    studentId,
    authorizedMembership = null,
    progressRows = null,
    levelSettings = null,
    transaction = null,
  }) => loadStates({
    classroomId,
    studentId,
    authorizedMembership,
    progressRows,
    levelSettings,
    transaction,
    lessonKeys: CANONICAL_LESSON_ORDER,
  });

  const getLessonProgressionState = async ({
    classroomId,
    studentId,
    lessonKey,
    authorizedMembership = null,
    progressRows = null,
    levelSettings = null,
    transaction = null,
  }) => {
    const lessonIndex = CANONICAL_LESSON_ORDER.indexOf(lessonKey);
    if (lessonIndex < 0) throw new TypeError("Invalid canonical lesson key");
    const states = await loadStates({
      classroomId,
      studentId,
      authorizedMembership,
      progressRows,
      levelSettings,
      transaction,
      lessonKeys: CANONICAL_LESSON_ORDER.slice(0, lessonIndex + 1),
    });
    return states.get(lessonKey);
  };

  const assertAssessmentInteractionAllowed = async ({
    assessment: assessmentInput,
    studentId,
    authorizedMembership = null,
    transaction = null,
  }) => {
    const assessment = plain(assessmentInput);
    const state = await getLessonProgressionState({
      classroomId: assessment.classroomId,
      studentId,
      lessonKey: assessment.lessonKey,
      authorizedMembership,
      transaction,
    });
    const decision = evaluateAssessmentInteraction({ assessment, state });
    if (!decision.allowed) throw progressionDenial({ reason: decision.reason, state });
    return { ...decision, state };
  };

  const assertModuleAccessAllowed = async ({
    classroomId,
    studentId,
    lessonKey,
    authorizedMembership = null,
    transaction = null,
  }) => {
    const state = await getLessonProgressionState({
      classroomId,
      studentId,
      lessonKey,
      authorizedMembership,
      transaction,
    });
    if (state.moduleUnlocked) return state;
    const reason = state.curriculumPrerequisiteSatisfied
      ? PROGRESSION_DENIAL_REASONS.PRE_ASSESSMENT_REQUIRED
      : PROGRESSION_DENIAL_REASONS.LESSON_PREREQUISITE_REQUIRED;
    throw progressionDenial({ reason, state });
  };

  return {
    assertAssessmentInteractionAllowed,
    assertModuleAccessAllowed,
    getLessonProgressionState,
    getLessonProgressionStates,
  };
};

const defaultService = createLessonProgressionService();

module.exports = {
  buildLessonProgressionStates,
  createLessonProgressionService,
  evaluateAssessmentInteraction,
  LessonProgressionError,
  resolveRequiredAssessmentDebt,
  ...defaultService,
};
