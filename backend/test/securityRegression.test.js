const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../src/models/User");
const authMiddleware = require("../src/middleware/authMiddleware");
const models = require("../src/models");
const LevelContentOverride = require("../src/models/LevelContentOverride");
const { getClassroomLevelSettings } = require("../src/services/classroomLevelSettingsService");
const assessmentSerializers = require("../src/services/assessmentSerializationService");
const { createAssessmentRouter } = require("../src/routes/assessments");
const { restrictionPayload } = require("../src/services/levelAccessService");
const {
  buildLessonProgressionStates,
  LessonProgressionError,
} = require("../src/services/lessonProgressionService");

const {
  hasDangerousSignature,
  isAllowedLearningResource,
  isDangerousFilename,
} = require("../src/services/fileSecurityService");
const { PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require("../src/constants/policyVersions");
const {
  getDefaultValidatorConfig,
  validateLevelCode,
} = require("../src/services/levelCodeValidationService");

const ASSESSMENT_FORBIDDEN_KEYS = new Set([
  "answerReviewPolicy",
  "choiceOrder",
  "correctChoiceId",
  "createdBy",
  "explanation",
  "gradeCalculation",
  "isCorrect",
  "passingPercentage",
  "passingPercentageApplied",
  "pointsAwarded",
  "questionOrder",
  "studentId",
  "submissionKey",
  "referenceSolution",
  "codingTestCases",
  "visibility",
  "weight",
  "gradingLeaseToken",
  "gradingLeaseExpiresAt",
  "internalHarness",
  "harnessSource",
  "containerId",
  "runnerConfig",
]);

const findForbiddenAssessmentPath = (value, forbidden = ASSESSMENT_FORBIDDEN_KEYS, trail = []) => {
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (forbidden.has(key)) return nextTrail.join(".");
    const found = findForbiddenAssessmentPath(nested, forbidden, nextTrail);
    if (found) return found;
  }
  return null;
};

const assertNoForbiddenAssessmentKeys = (value, label, forbidden) => {
  assert.equal(
    findForbiddenAssessmentPath(value, forbidden),
    null,
    `${label} exposed a forbidden assessment key`,
  );
};

test("game access restrictions expose only safe lesson progression context", () => {
  const preRestriction = restrictionPayload({
    reason: "PRE_ASSESSMENT_REQUIRED",
    effectiveDueAt: null,
    lessonKey: "arrays",
    assessmentId: 81,
    nextAction: "TAKE_PRE",
    passingThreshold: 75,
    requirePassingForCompletion: true,
    percentage: 0,
    score: 0,
  });
  assert.deepEqual(preRestriction, {
    code: "PRE_ASSESSMENT_REQUIRED",
    effectiveDueAt: null,
    message: "Complete the required pre-test before opening this lesson.",
    lessonKey: "arrays",
    assessmentId: 81,
    nextAction: "TAKE_PRE",
  });

  const lessonRestriction = restrictionPayload({
    reason: "LESSON_PREREQUISITE_REQUIRED",
    effectiveDueAt: null,
    lessonKey: "functions",
    prerequisiteLessonKey: "arrays",
    nextAction: "COMPLETE_PREREQUISITE_LESSON",
    assessmentSettings: { maxAttempts: 3 },
    finalScore: 100,
  });
  assert.deepEqual(lessonRestriction, {
    code: "LESSON_PREREQUISITE_REQUIRED",
    effectiveDueAt: null,
    message: "Complete the prerequisite lesson before opening this lesson.",
    lessonKey: "functions",
    prerequisiteLessonKey: "arrays",
    nextAction: "COMPLETE_PREREQUISITE_LESSON",
  });
});

test("dangerous upload extensions and executable signatures are rejected", async () => {
  assert.equal(isDangerousFilename("homework.pdf.exe"), true);
  assert.equal(isDangerousFilename("homework.pdf"), false);

  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sharprunner-security-"));
  const executable = path.join(directory, "renamed.pdf");
  const document = path.join(directory, "document.txt");
  try {
    await fs.promises.writeFile(executable, Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
    await fs.promises.writeFile(document, "class Notes { }");
    assert.equal(await hasDangerousSignature(executable), true);
    assert.equal(await hasDangerousSignature(document), false);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test("learning resource uploads require a matching extension and MIME type", () => {
  assert.equal(isAllowedLearningResource({ originalname: "diagram.jpg", mimetype: "image/jpeg" }), true);
  assert.equal(isAllowedLearningResource({ originalname: "lesson.docx", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), true);
  assert.equal(isAllowedLearningResource({ originalname: "diagram.jpg", mimetype: "image/svg+xml" }), false);
  assert.equal(isAllowedLearningResource({ originalname: "notes.txt", mimetype: "application/octet-stream" }), false);
});

test("the latest RLS migration covers every Sequelize model table", async () => {
  const migrationDirectory = path.resolve(__dirname, "../../supabase/migrations");
  const migrationFiles = (await fs.promises.readdir(migrationDirectory))
    .filter((filename) => filename.endsWith(".sql"));
  const migration = (await Promise.all(migrationFiles.map((filename) =>
    fs.promises.readFile(path.join(migrationDirectory, filename), "utf8")
  ))).join("\n");
  const requiredTables = [
    ...new Set(
      Object.values(models)
        .filter((model) => typeof model?.getTableName === "function")
        .map((model) => model.getTableName()),
    ),
    "SharpRunnerMigrations",
  ];

  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`["']${table}["']`), `${table} must be protected`);
  }
});

test("every playable level has a server-side validator", async () => {
  for (const levelKey of PLAYABLE_LEVEL_KEYS) {
    assert.ok(getDefaultValidatorConfig(levelKey), `${levelKey} needs a validator config`);
    const result = await validateLevelCode({ levelKey, sourceCode: "invalid code" });
    assert.equal(result.isCorrect, false, `${levelKey} must reject invalid source`);
  }
});

test("authentication uses the current database role and rejects inactive users", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindByPk = User.findByPk;
  process.env.JWT_SECRET = "test-secret-that-is-not-used-in-production";
  const token = jwt.sign({ id: 42, role: "admin" }, process.env.JWT_SECRET);
  const request = { headers: { authorization: `Bearer ${token}` } };
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  try {
    User.findByPk = async () => ({
      id: 42,
      role: "student",
      status: "active",
      termsVersionAccepted: TERMS_VERSION,
      privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
    });
    let calledNext = false;
    await authMiddleware(request, response, () => { calledNext = true; });
    assert.equal(calledNext, true);
    assert.equal(request.userRole, "student");

    User.findByPk = async () => ({ id: 42, role: "admin", status: "inactive" });
    response.statusCode = 200;
    response.body = null;
    await authMiddleware(request, response, () => assert.fail("inactive account reached next"));
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.message, "Account is not active");
  } finally {
    User.findByPk = originalFindByPk;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("classroom settings preserve trusted teacher validator overrides", async () => {
  const originalFindAll = LevelContentOverride.findAll;
  const validatorConfig = {
    type: "singleInteger",
    variableName: "customSteps",
    minValue: 2,
    maxValue: 2,
  };
  try {
    LevelContentOverride.findAll = async () => [{
      levelKey: "tutorial-level-1",
      validatorConfig,
    }];
    const settings = await getClassroomLevelSettings(99);
    assert.deepEqual(settings[0].validatorConfig, validatorConfig);
  } finally {
    LevelContentOverride.findAll = originalFindAll;
  }
});

test("student assessment serializers recursively strip answer keys from every pre-review fixture", () => {
  const assessment = {
    id: 12,
    classroomId: 7,
    lessonKey: "arrays",
    type: "POST",
    title: "Arrays post-test",
    instructions: "Choose one answer.",
    isRequired: true,
    isPublished: true,
    maxAttempts: 3,
    showScoreAfterSubmission: true,
    passingPercentage: 75,
    gradeCalculation: "HIGHEST",
    answerReviewPolicy: "AFTER_FINAL_ATTEMPT",
    createdBy: 5,
    version: 3,
    questions: [{
      id: 101,
      questionText: "Which declaration is valid?",
      questionType: "MULTIPLE_CHOICE",
      displayOrder: 0,
      points: 2,
      explanation: "Arrays use brackets.",
      objectiveKey: "array-declaration",
      choices: [
        { id: 1001, choiceText: "int[] values", displayOrder: 0, isCorrect: true },
        { id: 1002, choiceText: "int values[]()", displayOrder: 1, isCorrect: false },
      ],
    }],
    nestedAssociation: {
      correctChoiceId: 1001,
      submissionKey: "must-not-escape",
    },
  };
  const attempt = {
    id: 44,
    assessmentId: 12,
    classroomId: 7,
    studentId: 42,
    attemptNumber: 1,
    status: "SUBMITTED",
    assessmentVersion: 3,
    startedAt: "2026-09-25T12:00:00.000Z",
    submittedAt: "2026-09-25T12:10:00.000Z",
    pointsEarned: 2,
    maxPoints: 2,
    percentage: 100,
    passed: true,
    passingPercentageApplied: 75,
    submissionKey: "must-not-escape",
  };
  const response = {
    questionId: 101,
    selectedChoiceId: 1001,
    isCorrect: true,
    pointsAwarded: 2,
  };
  const playerAttempt = (resumed) => assessmentSerializers.serializePlayerAttempt({
    assessment,
    attempt: { ...attempt, status: "IN_PROGRESS", submittedAt: null, resumed },
    responses: resumed ? [response] : [],
    attemptsUsed: resumed ? 1 : 0,
    maxAttempts: 3,
  });
  const preAssessment = {
    ...assessment,
    type: "PRE",
    maxAttempts: 1,
    passingPercentage: null,
    gradeCalculation: "FIRST",
    answerReviewPolicy: "NEVER",
  };
  const fixtures = {
    discovery: assessmentSerializers.serializeDiscoveryStatus({
      assessment,
      available: true,
      unlocked: false,
      lockReason: "GAME_INCOMPLETE",
      attemptStatus: "SUBMITTED",
      attemptsUsed: 1,
      attemptsRemaining: 2,
      hasSubmittedAttempt: true,
      latestSubmitted: attempt,
      officialPost: attempt,
    }),
    playerGraph: { assessment: assessmentSerializers.serializePlayerAssessment(assessment) },
    start: playerAttempt(false),
    resume: playerAttempt(true),
    activeAttempt: playerAttempt(true),
    preNever: {
      ...assessmentSerializers.serializeStudentResult({ assessment: preAssessment, attempt }),
      ...assessmentSerializers.serializeAllowedReview({
        reviewAvailable: false,
        questions: assessment.questions,
        responses: [response],
      }),
    },
    postBeforeFinalAttempt: {
      ...assessmentSerializers.serializeStudentResult({
        assessment,
        attempt,
        officialGrade: attempt,
        firstPost: attempt,
      }),
      ...assessmentSerializers.serializeAllowedReview({
        reviewAvailable: false,
        questions: assessment.questions,
        responses: [response],
      }),
    },
  };

  for (const [label, fixture] of Object.entries(fixtures)) {
    assertNoForbiddenAssessmentKeys(fixture, label);
  }
  assert.equal(fixtures.preNever.reviewAvailable, false);
  assert.equal(fixtures.postBeforeFinalAttempt.reviewAvailable, false);
  assert.equal(fixtures.discovery.status.unlocked, false);
  assert.equal(fixtures.discovery.status.lockReason, "GAME_INCOMPLETE");
});

test("hidden-score progression may expose postPassed without numeric result fields", () => {
  const assessmentId = 812;
  const completedRows = PLAYABLE_LEVEL_KEYS
    .filter((levelKey) => levelKey.startsWith("tutorial-") || levelKey.startsWith("arrays-"))
    .map((levelKey) => ({ levelKey, isCompleted: true }));
  const state = buildLessonProgressionStates({
    publishedAssessments: [{
      id: assessmentId,
      classroomId: 7,
      lessonKey: "arrays",
      type: "POST",
      isRequired: true,
      isPublished: true,
      maxAttempts: 3,
      requirePassingForCompletion: true,
      showScoreAfterSubmission: false,
      passingPercentage: 75,
    }],
    attempts: [{
      id: 901,
      assessmentId,
      classroomId: 7,
      studentId: 42,
      attemptNumber: 1,
      status: "SUBMITTED",
      passed: true,
      percentage: 100,
      pointsEarned: 2,
      maxPoints: 2,
    }],
    progressRows: completedRows,
  }).get("arrays");

  assert.equal(state.postPassed, true);
  assertNoForbiddenAssessmentKeys(state, "hidden-score progression", new Set([
    "percentage",
    "pointsEarned",
    "maxPoints",
    "correctCount",
    "questionCount",
    "passingPercentage",
  ]));
});

test("student assessment HTTP boundary strips autosave grading data and rejects malicious fields", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindByPk = User.findByPk;
  process.env.JWT_SECRET = "security-assessment-boundary-secret";
  User.findByPk = async () => ({
    id: 42,
    role: "student",
    status: "active",
    tokenVersion: 0,
    termsVersionAccepted: TERMS_VERSION,
    privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
  });
  const unexpected = async () => assert.fail("rejected malicious body reached a domain service");
  const router = createAssessmentRouter({
    readService: {
      startOrResumeAttempt: unexpected,
      getStudentResult: unexpected,
      discoverAssessment: unexpected,
      getActiveAttempt: unexpected,
      getPlayerAssessment: unexpected,
    },
    attemptService: {
      saveResponse: async () => ({
        attemptId: 44,
        questionId: 101,
        selectedChoiceId: 1001,
        isCorrect: true,
        pointsAwarded: 2,
        correctChoiceId: 1001,
        explanation: "must not escape",
      }),
      submitAttempt: unexpected,
    },
  });
  const app = express();
  app.use(express.json());
  app.use("/api/assessments", router);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const authToken = jwt.sign(
    { id: 42, role: "student", tokenVersion: 0 },
    process.env.JWT_SECRET,
    { expiresIn: "5m" },
  );
  const request = async (requestPath, { method, body, headers = {} }) => {
    const result = await fetch(`${baseUrl}${requestPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
    return { status: result.status, payload: await result.json() };
  };

  try {
    const autosave = await request("/api/assessments/attempts/44/responses/101", {
      method: "PUT",
      body: { selectedChoiceId: 1001 },
    });
    assert.equal(autosave.status, 200);
    assert.deepEqual(autosave.payload, {
      response: { attemptId: 44, questionId: 101, selectedChoiceId: 1001 },
    });
    assertNoForbiddenAssessmentKeys(autosave.payload, "autosave");

    const maliciousCases = [
      ["/api/assessments/12/attempts", "POST", { isCorrect: true }],
      ["/api/assessments/12/attempts", "POST", { classroomId: 8 }],
      ["/api/assessments/attempts/44/responses/101", "PUT", {
        selectedChoiceId: 1001,
        correctChoiceId: 1001,
      }],
      ["/api/assessments/attempts/44/submit", "POST", { percentage: 100 }],
    ];
    const gradingKeys = new Set([
      ...ASSESSMENT_FORBIDDEN_KEYS,
      "classroomId",
      "passed",
      "percentage",
      "pointsEarned",
    ]);
    for (const [requestPath, method, body] of maliciousCases) {
      const rejected = await request(requestPath, {
        method,
        body,
        headers: { "Idempotency-Key": "security_key_123" },
      });
      assert.equal(rejected.status, 400);
      assert.deepEqual(rejected.payload, {
        code: "INVALID_REQUEST",
        message: "Invalid request",
      });
      assertNoForbiddenAssessmentKeys(rejected.payload, requestPath, gradingKeys);
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    User.findByPk = originalFindByPk;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("active assessment gate denials expose only safe progression context", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindByPk = User.findByPk;
  process.env.JWT_SECRET = "security-active-assessment-gate-secret";
  User.findByPk = async () => ({
    id: 42,
    role: "student",
    status: "active",
    tokenVersion: 0,
    termsVersionAccepted: TERMS_VERSION,
    privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
  });
  const denied = async () => {
    throw new LessonProgressionError({
      code: "POST_ASSESSMENT_LOCKED",
      message: "database row and grading secret",
      lessonKey: "arrays",
      assessmentId: 12,
      nextAction: "PLAY_GAME",
    });
  };
  const unexpected = async () => assert.fail("denied interaction reached result loading");
  const router = createAssessmentRouter({
    readService: {
      startOrResumeAttempt: unexpected,
      getStudentResult: unexpected,
      discoverAssessment: unexpected,
      getActiveAttempt: denied,
      getPlayerAssessment: unexpected,
    },
    attemptService: { saveResponse: denied, submitAttempt: denied },
  });
  const app = express();
  app.use(express.json());
  app.use("/api/assessments", router);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const authToken = jwt.sign(
    { id: 42, role: "student", tokenVersion: 0 },
    process.env.JWT_SECRET,
    { expiresIn: "5m" },
  );
  const cases = [
    ["/attempts/44", { method: "GET" }],
    ["/attempts/44/responses/101", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedChoiceId: 1001 }),
    }],
    ["/attempts/44/submit", {
      method: "POST",
      headers: { "Idempotency-Key": "security_gate_key" },
    }],
  ];

  try {
    for (const [requestPath, options] of cases) {
      const response = await fetch(`${baseUrl}/api/assessments${requestPath}`, {
        ...options,
        headers: { Authorization: `Bearer ${authToken}`, ...options.headers },
      });
      const payload = await response.json();
      assert.equal(response.status, 403);
      assert.deepEqual(payload, {
        code: "POST_ASSESSMENT_LOCKED",
        message: "Complete the lesson game progression before opening the post-test.",
        lessonKey: "arrays",
        assessmentId: 12,
        nextAction: "PLAY_GAME",
      });
      assert.equal(JSON.stringify(payload).includes("grading secret"), false);
      assertNoForbiddenAssessmentKeys(payload, requestPath);
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    User.findByPk = originalFindByPk;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
