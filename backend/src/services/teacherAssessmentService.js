const { fn, col, Op } = require("sequelize");
const defaultSequelize = require("../config/database");
const defaultModels = require("../models");
const defaultAuthorization = require("./assessmentAuthorizationService");
const defaultPolicy = require("./assessmentPolicyService");
const defaultSerialization = require("./assessmentSerializationService");
const defaultAttemptService = require("./assessmentAttemptService");
const { AssessmentApiError } = require("./assessmentErrorService");
const {
  ASSESSMENT_TYPES,
  ATTEMPT_STATUSES,
  QUESTION_TYPES,
} = require("../constants/assessmentConfig");
const { LESSON_DEFINITIONS, PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const { isCodingAssessmentPlayerEnabled } = require("./codingAssessmentService");
const { validateExplicitCodingParameterNames } = require("./codingParameterNameService");

const CREATE_FIELDS = new Set([
  "lessonKey",
  "type",
  "title",
  "instructions",
  "isRequired",
  "passingPercentage",
  "maxAttempts",
  "requirePassingForCompletion",
  "showScoreAfterSubmission",
  "answerReviewPolicy",
  "shuffleQuestions",
  "shuffleChoices",
]);

const SETTING_FIELDS = new Set([
  "title",
  "instructions",
  "isRequired",
  "passingPercentage",
  "maxAttempts",
  "requirePassingForCompletion",
  "showScoreAfterSubmission",
  "answerReviewPolicy",
  "shuffleQuestions",
  "shuffleChoices",
]);

const QUESTION_FIELDS = new Set([
  "questionText",
  "questionType",
  "points",
  "explanation",
  "objectiveKey",
  "choices",
  "starterCode",
  "referenceSolution",
  "executionMode",
  "methodContract",
  "codingTestCases",
]);

const CHOICE_FIELDS = new Set(["choiceText", "isCorrect"]);
const METHOD_CONTRACT_FIELDS = new Set(["typeName", "methodName", "parameterTypes", "parameterNames", "returnType"]);
const CODING_TEST_FIELDS = new Set(["visibility", "input", "expectedOutput", "weight"]);
const SAVE_FIELDS = new Set(["version", "settings", "questions"]);
const BOOLEAN_SETTINGS = ["isRequired", "requirePassingForCompletion",
  "showScoreAfterSubmission", "shuffleQuestions", "shuffleChoices"];

// Validate HTTP primitives before Phase B normalization/coercion. Persisted
// DECIMAL values may be strings, so validate supplied input, not model values.
const validateInputTypes = (input, { strings = [], nullableStrings = [],
  numbers = [], nullableNumbers = [], booleans = [], code = "INVALID_REQUEST" } = {}) => {
  const invalid = (fields, type, nullable = false) => fields.some((field) => (
    Object.hasOwn(input, field)
    && !(nullable && input[field] === null)
    && (typeof input[field] !== type || (type === "number" && !Number.isFinite(input[field])))
  ));
  if (invalid(strings, "string") || invalid(nullableStrings, "string", true)
    || invalid(numbers, "number") || invalid(nullableNumbers, "number", true)
    || invalid(booleans, "boolean")) {
    throw new AssessmentApiError(400, code, "Invalid request");
  }
};

const validateSettingTypes = (input, type) => validateInputTypes(input, {
  strings: ["title", "answerReviewPolicy"],
  nullableStrings: ["instructions"],
  numbers: ["maxAttempts", ...(type === ASSESSMENT_TYPES.PRE ? [] : ["passingPercentage"])],
  nullableNumbers: type === ASSESSMENT_TYPES.PRE ? ["passingPercentage"] : [],
  booleans: BOOLEAN_SETTINGS,
});

const plain = (value) => value?.toJSON ? value.toJSON() : (value || {});

const rejectUnknownFields = (input, allowed) => {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !allowed.has(key))) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
};

const mapValidationError = (source, fallbackCode = "INVALID_REQUEST") => {
  if (source instanceof AssessmentApiError) return source;
  const message = String(source?.message || "");
  if (/lessonKey|lesson key/i.test(message)) {
    return new AssessmentApiError(400, "INVALID_LESSON_KEY", "Invalid lesson key");
  }
  if (/assessment type/i.test(message)) {
    return new AssessmentApiError(400, "INVALID_ASSESSMENT_TYPE", "Invalid assessment type");
  }
  if (fallbackCode === "ASSESSMENT_INVALID") {
    return new AssessmentApiError(422, "ASSESSMENT_INVALID", "Assessment graph is invalid");
  }
  if (/choice/i.test(message)) {
    return new AssessmentApiError(400, "INVALID_CHOICE", "Invalid choice");
  }
  if (/question|objective|points/i.test(message)) {
    return new AssessmentApiError(400, "INVALID_QUESTION", "Invalid question");
  }
  return new AssessmentApiError(400, fallbackCode, "Invalid request");
};

const readAggregate = (row, field) => {
  const value = typeof row?.get === "function" ? row.get(field) : row?.[field];
  return Number(value || 0);
};

const roundMetric = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const createTeacherAssessmentService = (dependencies = {}) => {
  const {
    models = defaultModels,
    sequelize = defaultSequelize,
  } = dependencies;
  const authorization = dependencies.authorizationService
    || dependencies.authorization
    || defaultAuthorization;
  const policy = dependencies.policyService || dependencies.policy || defaultPolicy;
  const serialization = dependencies.serializers
    || dependencies.serialization
    || defaultSerialization;
  const attemptService = dependencies.assessmentAttemptService
    || dependencies.attemptService
    || defaultAttemptService;
  const environment = dependencies.environment || process.env;
  const {
    LessonAssessment,
    AssessmentQuestion,
    AssessmentChoice,
    AssessmentCodingTestCase,
    AssessmentAttempt,
    AssessmentResponse,
    ClassroomMembership,
    UserProgress,
    User,
  } = models;

  const loadGraph = (assessmentId, transaction) => LessonAssessment.findOne({
    where: { id: assessmentId },
    include: [{
      model: AssessmentQuestion,
      as: "questions",
      include: [
        { model: AssessmentChoice, as: "choices" },
        { model: AssessmentCodingTestCase, as: "codingTestCases" },
      ],
    }],
    order: [
      [{ model: AssessmentQuestion, as: "questions" }, "displayOrder", "ASC"],
      [
        { model: AssessmentQuestion, as: "questions" },
        { model: AssessmentChoice, as: "choices" },
        "displayOrder",
        "ASC",
      ],
      [
        { model: AssessmentQuestion, as: "questions" },
        { model: AssessmentCodingTestCase, as: "codingTestCases" },
        "displayOrder",
        "ASC",
      ],
    ],
    ...(transaction ? { transaction } : {}),
  });

  const listAssessments = async ({ classroomId, lessonKey, actorId, actorRole }) => {
    await authorization.requireManagedClassroom({ classroomId, actorId, actorRole });
    authorization.assertAcademicLessonKey(lessonKey);
    const rows = await LessonAssessment.findAll({
      where: { classroomId, lessonKey },
      attributes: {
        include: [
          [fn("COUNT", fn("DISTINCT", col("questions.id"))), "questionCount"],
          [fn("COUNT", fn("DISTINCT", col("attempts.id"))), "attemptCount"],
        ],
      },
      include: [
        { model: AssessmentQuestion, as: "questions", attributes: [], required: false },
        { model: AssessmentAttempt, as: "attempts", attributes: [], required: false },
      ],
      group: ["LessonAssessment.id"],
      order: [["type", "ASC"]],
    });
    const assessments = {
      [ASSESSMENT_TYPES.PRE]: { exists: false },
      [ASSESSMENT_TYPES.POST]: { exists: false },
    };
    for (const row of rows) {
      const assessment = plain(row);
      assessments[assessment.type] = serialization.serializeTeacherSummary({
        assessment,
        questionCount: readAggregate(row, "questionCount"),
        attemptsExist: readAggregate(row, "attemptCount") > 0,
      });
    }
    return { lessonKey, assessments };
  };

  const createAssessment = async ({ classroomId, actorId, actorRole, input }) => sequelize.transaction(
    async (transaction) => {
      await authorization.requireManagedClassroom({
        classroomId,
        actorId,
        actorRole,
        transaction,
      });
      rejectUnknownFields(input, CREATE_FIELDS);
      authorization.assertAcademicLessonKey(input.lessonKey);
      let normalized;
      try {
        normalized = policy.normalizeAssessmentConfiguration(input);
        validateSettingTypes(input, normalized.type);
        policy.validateAssessmentDraft({ assessment: normalized, questions: [] });
      } catch (error) {
        throw mapValidationError(error);
      }
      const created = await LessonAssessment.create({
        ...normalized,
        classroomId,
        createdBy: actorId,
        isPublished: false,
        publishedAt: null,
        version: 1,
      }, { transaction });
      return {
        assessment: serialization.serializeTeacherEditor(
          { ...plain(created), questions: [] },
          { attemptsExist: false, structureLocked: false },
        ),
      };
    },
  );

  const getEditorAssessment = async ({ classroomId, assessmentId, actorId, actorRole }) => {
    await authorization.requireManagedClassroom({ classroomId, actorId, actorRole });
    await authorization.requireAssessmentInClassroom({ classroomId, assessmentId });
    const [assessment, attemptCount] = await Promise.all([
      loadGraph(assessmentId),
      AssessmentAttempt.count({ where: { assessmentId } }),
    ]);
    return {
      assessment: serialization.serializeTeacherEditor(assessment, {
        attemptsExist: Number(attemptCount) > 0,
        structureLocked: Number(attemptCount) > 0,
      }),
    };
  };

  const getAssessmentResults = async ({
    classroomId,
    assessmentId,
    actorId,
    actorRole,
  }) => {
    await authorization.requireManagedClassroom({ classroomId, actorId, actorRole });
    const assessment = await authorization.requireAssessmentInClassroom({
      classroomId,
      assessmentId,
    });
    const [attempts, codingQuestionRows] = await Promise.all([
      AssessmentAttempt.findAll({
      where: {
        assessmentId,
        classroomId,
        status: ATTEMPT_STATUSES.SUBMITTED,
      },
      attributes: [
        "id",
        "studentId",
        "attemptNumber",
        "status",
        "submittedAt",
        "pointsEarned",
        "maxPoints",
        "percentage",
        "passed",
      ],
      include: [{
        model: User,
        as: "student",
        attributes: ["id", "firstName", "lastName", "username"],
      }],
      order: [
        ["studentId", "ASC"],
        ["attemptNumber", "ASC"],
        ["submittedAt", "ASC"],
        ["id", "ASC"],
      ],
      }),
      AssessmentQuestion.findAll({
        where: { assessmentId, questionType: QUESTION_TYPES.CODING },
        attributes: ["id", "questionText", "displayOrder", "points"],
        order: [["displayOrder", "ASC"], ["id", "ASC"]],
      }),
    ]);

    const codingQuestions = codingQuestionRows.map(plain);
    const codingQuestionIds = codingQuestions.map((question) => question.id);
    const codingResponses = codingQuestionIds.length
      ? await AssessmentResponse.findAll({
        where: { questionId: { [Op.in]: codingQuestionIds } },
        attributes: ["questionId", "isCorrect", "pointsAwarded"],
        include: [{
          model: AssessmentAttempt,
          as: "attempt",
          attributes: [],
          required: true,
          where: { assessmentId, classroomId, status: ATTEMPT_STATUSES.SUBMITTED },
        }],
      })
      : [];
    const codingResponsesByQuestion = new Map();
    for (const responseInput of codingResponses) {
      const response = plain(responseInput);
      const group = codingResponsesByQuestion.get(response.questionId) || [];
      group.push(response);
      codingResponsesByQuestion.set(response.questionId, group);
    }
    const codingAnalytics = codingQuestions.map((question) => {
      const responses = codingResponsesByQuestion.get(question.id) || [];
      const responseCount = responses.length;
      const fullyCorrectCount = responses.filter((response) => response.isCorrect === true).length;
      const maximumPoints = Number(question.points);
      const averageAwardedPoints = responseCount
        ? roundMetric(responses.reduce((sum, response) => sum + Number(response.pointsAwarded), 0)
          / responseCount)
        : 0;
      return {
        questionId: question.id,
        questionOrder: Number(question.displayOrder) + 1,
        questionLabel: question.questionText,
        responseCount,
        fullyCorrectCount,
        fullyCorrectRate: responseCount ? roundMetric((fullyCorrectCount / responseCount) * 100) : 0,
        averageAwardedPoints,
        maximumPoints,
        averagePercentageEarned: responseCount && maximumPoints > 0
          ? roundMetric((averageAwardedPoints / maximumPoints) * 100)
          : 0,
      };
    });

    const attemptsByStudent = new Map();
    for (const attemptInput of attempts) {
      const attempt = plain(attemptInput);
      const group = attemptsByStudent.get(attempt.studentId) || [];
      group.push(attempt);
      attemptsByStudent.set(attempt.studentId, group);
    }

    const markersByStudent = new Map();
    if (plain(assessment).type === ASSESSMENT_TYPES.POST) {
      for (const [studentId, studentAttempts] of attemptsByStudent) {
        markersByStudent.set(studentId, {
          officialId: policy.selectOfficialPostAttempt(studentAttempts)?.id,
          firstSubmittedId: policy.selectFirstSubmittedPostAttempt(studentAttempts)?.id,
        });
      }
    }

    const results = attempts.map((attemptInput) => {
      const attempt = plain(attemptInput);
      const markers = markersByStudent.get(attempt.studentId);
      return {
        attempt,
        student: attempt.student,
        isOfficial: markers?.officialId === attempt.id,
        isFirstSubmittedPost: markers?.firstSubmittedId === attempt.id,
      };
    });
    return serialization.serializeTeacherResults({
      assessment,
      results,
      codingQuestions: codingAnalytics,
    });
  };

  const validateSaveInput = (input) => {
    rejectUnknownFields(input, SAVE_FIELDS);
    if (!Number.isSafeInteger(input.version) || input.version < 1
      || !Array.isArray(input.questions)) {
      throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
    }
    rejectUnknownFields(input.settings, SETTING_FIELDS);
    for (const question of input.questions) {
      rejectUnknownFields(question, QUESTION_FIELDS);
      validateInputTypes(question, {
        strings: ["questionText", "questionType"],
        nullableStrings: ["explanation", "objectiveKey", "starterCode", "referenceSolution"],
        numbers: ["points"],
        code: "INVALID_QUESTION",
      });
      if (question.executionMode !== undefined && !["METHOD", "PROGRAM"].includes(question.executionMode)) {
        throw new AssessmentApiError(400, "INVALID_QUESTION", "Invalid question");
      }
      if (question.choices !== undefined && !Array.isArray(question.choices)) {
        throw new AssessmentApiError(400, "INVALID_QUESTION", "Invalid question");
      }
      for (const choice of question.choices || []) {
        rejectUnknownFields(choice, CHOICE_FIELDS);
        validateInputTypes(choice, {
          strings: ["choiceText"], booleans: ["isCorrect"], code: "INVALID_CHOICE",
        });
      }
      if (question.methodContract !== undefined) {
        rejectUnknownFields(question.methodContract, METHOD_CONTRACT_FIELDS);
        if ((question.executionMode || "METHOD") === "PROGRAM"
          && question.methodContract.parameterNames !== undefined) {
          throw new AssessmentApiError(400, "INVALID_QUESTION", "Invalid question");
        }
        validateInputTypes(question.methodContract, {
          strings: ["typeName", "methodName", "returnType"], code: "INVALID_QUESTION",
        });
        if (!Array.isArray(question.methodContract.parameterTypes)
          || question.methodContract.parameterTypes.some((type) => typeof type !== "string")) {
          throw new AssessmentApiError(400, "INVALID_QUESTION", "Invalid question");
        }
        try {
          validateExplicitCodingParameterNames(
            question.methodContract.parameterTypes,
            question.methodContract.parameterNames,
          );
        } catch {
          throw new AssessmentApiError(400, "INVALID_QUESTION", "Invalid question");
        }
      }
      if (question.codingTestCases !== undefined && !Array.isArray(question.codingTestCases)) {
        throw new AssessmentApiError(400, "INVALID_QUESTION", "Invalid question");
      }
      for (const testCase of question.codingTestCases || []) {
        rejectUnknownFields(testCase, CODING_TEST_FIELDS);
        validateInputTypes(testCase, {
          strings: ["visibility"], numbers: ["weight"], code: "INVALID_QUESTION",
        });
        const mode = question.executionMode || "METHOD";
        if ((mode === "METHOD" && !Array.isArray(testCase.input))
          || (mode === "PROGRAM" && (typeof testCase.input !== "string" || typeof testCase.expectedOutput !== "string"))
          || !Object.hasOwn(testCase, "expectedOutput")) {
          throw new AssessmentApiError(400, "INVALID_QUESTION", "Invalid question");
        }
      }
    }
  };

  const assertVersion = (assessment, version) => {
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
    }
    const currentVersion = Number(assessment.version);
    if (version !== currentVersion) {
      throw new AssessmentApiError(
        409,
        "ASSESSMENT_VERSION_CONFLICT",
        "Assessment version conflict",
        { currentVersion },
      );
    }
    return currentVersion;
  };

  const assertNoAttempts = async (assessmentId, transaction) => {
    const attemptCount = await AssessmentAttempt.count({ where: { assessmentId }, transaction });
    if (Number(attemptCount) > 0) {
      throw new AssessmentApiError(409, "ASSESSMENT_LOCKED", "Assessment is locked");
    }
  };

  const serializePublicationState = (assessmentInput) => {
    const assessment = plain(assessmentInput);
    return {
      id: assessment.id,
      isPublished: Boolean(assessment.isPublished),
      publishedAt: assessment.publishedAt ?? null,
      version: Number(assessment.version),
    };
  };

  const calculatePublicationWarnings = async (assessmentInput, transaction) => {
    const assessment = plain(assessmentInput);
    const memberships = await ClassroomMembership.findAll({
      where: { classroomId: assessment.classroomId, status: "active" },
      attributes: ["studentId"],
      transaction,
    });
    const studentIds = [...new Set(memberships.map((row) => Number(plain(row).studentId)))];
    const lesson = LESSON_DEFINITIONS.find((item) => item.lessonKey === assessment.lessonKey);
    const levelKeys = lesson
      ? PLAYABLE_LEVEL_KEYS.filter((levelKey) => levelKey.startsWith(`${lesson.lessonKey}-level-`))
      : [];
    const existingStudentProgressCount = studentIds.length && levelKeys.length
      ? Number(await UserProgress.count({
        where: {
          userId: { [Op.in]: studentIds },
          levelKey: { [Op.in]: levelKeys },
          [Op.or]: [
            { startedAt: { [Op.ne]: null } },
            { progressPercent: { [Op.gt]: 0 } },
            { attemptCount: { [Op.gt]: 0 } },
            { isCompleted: true },
            { timeSpentSeconds: { [Op.gt]: 0 } },
          ],
        },
        distinct: true,
        col: "userId",
        transaction,
      }))
      : 0;
    return {
      existingStudentProgressCount,
      grandfatheringRequiredLater: existingStudentProgressCount > 0,
    };
  };

  const saveAssessmentGraph = async ({
    classroomId,
    assessmentId,
    actorId,
    actorRole,
    input,
  }) => sequelize.transaction(async (transaction) => {
    await authorization.requireManagedClassroom({
      classroomId,
      actorId,
      actorRole,
      transaction,
    });
    const assessment = await authorization.requireAssessmentInClassroom({
      classroomId,
      assessmentId,
      transaction,
      lock: true,
    });
    if (!input || typeof input !== "object" || Array.isArray(input)
      || !Number.isSafeInteger(input.version) || input.version < 1) {
      throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
    }
    const currentVersion = Number(assessment.version);
    if (input.version !== currentVersion) {
      throw new AssessmentApiError(
        409,
        "ASSESSMENT_VERSION_CONFLICT",
        "Assessment version conflict",
        { currentVersion },
      );
    }
    const attemptCount = await AssessmentAttempt.count({ where: { assessmentId }, transaction });
    if (Number(attemptCount) > 0) {
      throw new AssessmentApiError(409, "ASSESSMENT_LOCKED", "Assessment is locked");
    }
    validateSaveInput(input);
    validateSettingTypes(input.settings, assessment.type);

    const normalizedQuestions = input.questions.map((question) => ({
      ...question,
      starterCode: question.questionType === "CODING" ? question.starterCode ?? "" : null,
      referenceSolution: question.questionType === "CODING" ? question.referenceSolution ?? "" : null,
      codingExecutionMode: question.questionType === "CODING" ? (question.executionMode || "METHOD") : null,
      codingTypeName: question.questionType === "CODING" && (question.executionMode || "METHOD") === "METHOD" ? question.methodContract?.typeName ?? null : null,
      codingMethodName: question.questionType === "CODING" && (question.executionMode || "METHOD") === "METHOD" ? question.methodContract?.methodName ?? null : null,
      codingParameterTypes: question.questionType === "CODING" && (question.executionMode || "METHOD") === "METHOD" ? question.methodContract?.parameterTypes ?? null : null,
      codingParameterNames: question.questionType === "CODING" && (question.executionMode || "METHOD") === "METHOD" ? question.methodContract?.parameterNames ?? null : null,
      codingReturnType: question.questionType === "CODING" && (question.executionMode || "METHOD") === "METHOD" ? question.methodContract?.returnType ?? null : null,
      codingTestCases: (question.codingTestCases || []).map((testCase, displayOrder) => ({
        ...testCase,
        displayOrder,
      })),
    }));
    let normalized;
    try {
      normalized = policy.normalizeAssessmentConfiguration({
        ...plain(assessment),
        ...input.settings,
      });
      policy.validateAssessmentDraft({ assessment: normalized, questions: normalizedQuestions });
    } catch (error) {
      throw mapValidationError(error);
    }
    if (assessment.isPublished
      && normalizedQuestions.some((question) => question.questionType === "CODING")
      && !isCodingAssessmentPlayerEnabled(environment)) {
      throw new AssessmentApiError(
        409,
        "CODING_PLAYER_UNAVAILABLE",
        "Coding assessments cannot be published until the coding player is available",
      );
    }
    if (assessment.isPublished) {
      const validationQuestions = normalizedQuestions.map((question, questionIndex) => ({
        ...question,
        id: `validation-question-${questionIndex}`,
        choices: (question.choices || []).map((choice, choiceIndex) => ({
          ...choice,
          id: `validation-choice-${questionIndex}-${choiceIndex}`,
        })),
      }));
      try {
        policy.validateAssessmentForPublish({
          assessment: normalized,
          questions: validationQuestions,
        });
      } catch (error) {
        throw mapValidationError(error, "ASSESSMENT_INVALID");
      }
    }

    const oldQuestions = await AssessmentQuestion.findAll({
      where: { assessmentId },
      attributes: ["id"],
      transaction,
    });
    const oldQuestionIds = oldQuestions.map((question) => plain(question).id);
    if (oldQuestionIds.length) {
      await AssessmentChoice.destroy({ where: { questionId: oldQuestionIds }, transaction });
    }
    await AssessmentQuestion.destroy({ where: { assessmentId }, transaction });

    for (let questionIndex = 0; questionIndex < normalizedQuestions.length; questionIndex += 1) {
      const question = normalizedQuestions[questionIndex];
      const createdQuestion = await AssessmentQuestion.create({
        assessmentId,
        questionText: String(question.questionText).trim(),
        questionType: question.questionType,
        displayOrder: questionIndex,
        points: Number(question.points),
        explanation: question.explanation ?? null,
        objectiveKey: question.objectiveKey || null,
        starterCode: question.questionType === "CODING" ? question.starterCode : null,
        referenceSolution: question.questionType === "CODING" ? question.referenceSolution : null,
        codingExecutionMode: question.questionType === "CODING" ? question.codingExecutionMode : null,
        codingTypeName: question.questionType === "CODING" ? question.codingTypeName : null,
        codingMethodName: question.questionType === "CODING" ? question.codingMethodName : null,
        codingParameterTypes: question.questionType === "CODING" ? question.codingParameterTypes : null,
        codingParameterNames: question.questionType === "CODING" ? question.codingParameterNames : null,
        codingReturnType: question.questionType === "CODING" ? question.codingReturnType : null,
      }, { transaction });
      for (let choiceIndex = 0; choiceIndex < (question.choices || []).length; choiceIndex += 1) {
        const choice = question.choices[choiceIndex];
        await AssessmentChoice.create({
          questionId: createdQuestion.id,
          choiceText: String(choice.choiceText).trim(),
          displayOrder: choiceIndex,
          isCorrect: choice.isCorrect ?? false,
        }, { transaction });
      }
      for (let testIndex = 0; testIndex < (question.codingTestCases || []).length; testIndex += 1) {
        const testCase = question.codingTestCases[testIndex];
        await AssessmentCodingTestCase.create({
          questionId: createdQuestion.id,
          displayOrder: testIndex,
          visibility: testCase.visibility,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          weight: Number(testCase.weight),
        }, { transaction });
      }
    }

    for (const field of SETTING_FIELDS) {
      if (Object.hasOwn(input.settings, field)) assessment[field] = normalized[field];
    }
    assessment.version = currentVersion + 1;
    await assessment.save({ transaction });
    const reloaded = await loadGraph(assessmentId, transaction);
    return {
      assessment: serialization.serializeTeacherEditor(reloaded, {
        attemptsExist: false,
        structureLocked: false,
      }),
    };
  });

  const publishAssessment = async ({
    classroomId,
    assessmentId,
    actorId,
    actorRole,
    version,
  }) => sequelize.transaction(async (transaction) => {
    await authorization.requireManagedClassroom({
      classroomId,
      actorId,
      actorRole,
      transaction,
    });
    const assessment = await authorization.requireAssessmentInClassroom({
      classroomId,
      assessmentId,
      transaction,
      lock: true,
    });
    const currentVersion = assertVersion(assessment, version);
    await assertNoAttempts(assessmentId, transaction);
    const graph = await loadGraph(assessmentId, transaction);
    if (plain(graph).questions?.some((question) => question.questionType === "CODING")
      && !isCodingAssessmentPlayerEnabled(environment)) {
      throw new AssessmentApiError(
        409,
        "CODING_PLAYER_UNAVAILABLE",
        "Coding assessments cannot be published until the coding player is available",
      );
    }
    try {
      policy.validateAssessmentForPublish({
        assessment: plain(graph),
        questions: plain(graph).questions || [],
      });
    } catch (error) {
      throw mapValidationError(error, "ASSESSMENT_INVALID");
    }
    const warnings = await calculatePublicationWarnings(assessment, transaction);
    assessment.isPublished = true;
    assessment.publishedAt = new Date();
    assessment.version = currentVersion + 1;
    await assessment.save({ transaction });
    return { assessment: serializePublicationState(assessment), warnings };
  });

  const unpublishAssessment = async ({
    classroomId,
    assessmentId,
    actorId,
    actorRole,
    version,
  }) => sequelize.transaction(async (transaction) => {
    await authorization.requireManagedClassroom({
      classroomId,
      actorId,
      actorRole,
      transaction,
    });
    const assessment = await authorization.requireAssessmentInClassroom({
      classroomId,
      assessmentId,
      transaction,
      lock: true,
    });
    const currentVersion = assertVersion(assessment, version);
    await assertNoAttempts(assessmentId, transaction);
    if (!assessment.isPublished) {
      return { assessment: serializePublicationState(assessment) };
    }
    assessment.isPublished = false;
    assessment.publishedAt = null;
    assessment.version = currentVersion + 1;
    await assessment.save({ transaction });
    return { assessment: serializePublicationState(assessment) };
  });

  const deleteAssessment = async ({
    classroomId,
    assessmentId,
    actorId,
    actorRole,
  }) => sequelize.transaction(async (transaction) => {
    await authorization.requireManagedClassroom({
      classroomId,
      actorId,
      actorRole,
      transaction,
    });
    const assessment = await authorization.requireAssessmentInClassroom({
      classroomId,
      assessmentId,
      transaction,
      lock: true,
    });
    await assertNoAttempts(assessmentId, transaction);
    if (assessment.isPublished) {
      throw new AssessmentApiError(
        409,
        "ASSESSMENT_PUBLISHED",
        "Published assessments cannot be deleted",
      );
    }
    await assessment.destroy({ transaction });
  });

  const grantAdditionalPostAttempt = async ({
    classroomId,
    assessmentId,
    studentId,
    actorId,
    actorRole,
  }) => sequelize.transaction(async (transaction) => {
    await authorization.requireManagedClassroom({
      classroomId,
      actorId,
      actorRole,
      transaction,
    });
    const attempt = await attemptService.createTeacherGrantedPostAttempt({
      classroomId,
      assessmentId,
      studentId,
      transaction,
    });
    return { attempt: serialization.serializeTeacherGrantedAttempt(attempt) };
  });

  return {
    listAssessments,
    createAssessment,
    deleteAssessment,
    getAssessmentResults,
    getEditorAssessment,
    grantAdditionalPostAttempt,
    publishAssessment,
    saveAssessmentGraph,
    unpublishAssessment,
  };
};

const defaultService = createTeacherAssessmentService();

module.exports = {
  createTeacherAssessmentService,
  ...defaultService,
};
