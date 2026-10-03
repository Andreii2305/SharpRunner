const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { after, afterEach, before, test } = require("node:test");

process.env.JWT_SECRET = "teacher-assessment-route-integration-secret";

const models = require("../src/models");
const User = require("../src/models/User");
const sequelize = require("../src/config/database");
const productionApp = require("../src/app");
const { createTeacherAssessmentService } = require("../src/services/teacherAssessmentService");
const { createAssessmentAttemptService } = require("../src/services/assessmentAttemptService");
const { createAssessmentAuthorizationService } = require("../src/services/assessmentAuthorizationService");
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require("../src/constants/policyVersions");

const restorations = [];
let server;
let baseUrl;

const stub = (target, property, replacement) => {
  restorations.push([target, property, target[property]]);
  target[property] = replacement;
};

const users = {
  5: { role: "teacher" },
  6: { role: "teacher" },
  9: { role: "admin" },
  42: { role: "student" },
};

const activeUser = (id) => ({
  id,
  role: users[id]?.role,
  status: "active",
  tokenVersion: 0,
  termsVersionAccepted: TERMS_VERSION,
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
});

const token = (id) => jwt.sign(
  { id, role: users[id]?.role, tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);

const request = async (path, { actorId, method = "GET", body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(actorId ? { Authorization: `Bearer ${token(actorId)}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
};

const baseAssessment = (overrides = {}) => ({
  id: 12,
  classroomId: 7,
  lessonKey: "arrays",
  type: "POST",
  title: "Arrays post-test",
  instructions: "Choose one answer.",
  isRequired: true,
  isPublished: false,
  publishedAt: null,
  passingPercentage: 75,
  maxAttempts: 3,
  gradeCalculation: "HIGHEST",
  requirePassingForCompletion: true,
  showScoreAfterSubmission: true,
  answerReviewPolicy: "AFTER_FINAL_ATTEMPT",
  shuffleQuestions: true,
  shuffleChoices: true,
  createdBy: 5,
  version: 1,
  ...overrides,
});

const baseQuestion = (overrides = {}) => ({
  id: 101,
  assessmentId: 12,
  questionText: "Which declaration is valid?",
  questionType: "MULTIPLE_CHOICE",
  displayOrder: 0,
  points: 2,
  explanation: "Arrays use brackets after the type.",
  objectiveKey: "array-declaration",
  ...overrides,
});

const baseChoices = () => [
  { id: 1001, questionId: 101, choiceText: "int[] values", displayOrder: 0, isCorrect: true },
  { id: 1002, questionId: 101, choiceText: "int values", displayOrder: 1, isCorrect: false },
];

const baseStudent = (overrides = {}) => ({
  id: 42,
  firstName: "Ada",
  lastName: "Learner",
  username: "ada",
  email: "ada@example.test",
  password: "private-password-hash",
  ...overrides,
});

const submittedAttempt = (overrides = {}) => ({
  id: 44,
  assessmentId: 12,
  classroomId: 7,
  studentId: 42,
  attemptNumber: 1,
  status: "SUBMITTED",
  submittedAt: new Date("2026-09-25T12:10:00.000Z"),
  pointsEarned: 8,
  maxPoints: 10,
  percentage: 80,
  passed: true,
  submissionKey: "private-submission-key",
  responses: [{ id: 501, isCorrect: true, pointsAwarded: 2 }],
  student: baseStudent(),
  ...overrides,
});

const exhaustedFailedAttempts = (count = 3) => Array.from({ length: count }, (_, index) => (
  submittedAttempt({
    id: 41 + index,
    attemptNumber: index + 1,
    percentage: 50 + index,
    passed: false,
    submittedAt: new Date(`2026-09-${String(index + 1).padStart(2, "0")}T12:10:00.000Z`),
  })
));

const cloneRows = (rows) => rows.map((row) => ({ ...row }));
const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
  if (Array.isArray(value)) return value.includes(row[key]);
  return row[key] === value;
});

const harness = ({ assessments, questions, choices, codingTests, attempts, responses, memberships, progress } = {}) => {
  const store = {
    classrooms: [{ id: 7, teacherId: 5 }, { id: 8, teacherId: 6 }],
    assessments: cloneRows(assessments || [baseAssessment()]),
    questions: cloneRows(questions || [baseQuestion()]),
    choices: cloneRows(choices || baseChoices()),
    codingTests: cloneRows(codingTests || []),
    attempts: cloneRows(attempts || []),
    responses: cloneRows(responses || []),
    memberships: cloneRows(memberships || [{ classroomId: 7, studentId: 42, status: "active" }]),
    progress: cloneRows(progress || []),
    listQueries: 0,
    attemptCounts: 0,
    questionDeletes: 0,
    choiceDeletes: 0,
    assessmentDeletes: 0,
    progressQueries: [],
    resultQueries: [],
    codingAnalyticsQueries: [],
    events: [],
    failChoiceCreate: false,
    failGraphReload: false,
    duplicateOnCreate: false,
    savedAssessmentStates: [],
  };

  const graph = (assessment) => ({
    ...assessment,
    questions: store.questions
      .filter((question) => question.assessmentId === assessment.id)
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((question) => ({
        ...question,
        choices: store.choices
          .filter((choice) => choice.questionId === question.id)
          .sort((left, right) => left.displayOrder - right.displayOrder),
        codingTestCases: store.codingTests
          .filter((testCase) => testCase.questionId === question.id)
          .sort((left, right) => left.displayOrder - right.displayOrder),
      })),
  });

  const persistedAssessment = (row) => {
    if (!row) return null;
    Object.defineProperty(row, "save", {
      configurable: true,
      enumerable: false,
      value: async () => {
        await models.LessonAssessment.build(row).validate();
        store.savedAssessmentStates.push({ ...row });
        return row;
      },
    });
    Object.defineProperty(row, "destroy", {
      configurable: true,
      enumerable: false,
      value: async () => {
        store.assessmentDeletes += 1;
        const retained = store.assessments.filter((assessment) => assessment.id !== row.id);
        store.assessments.splice(0, store.assessments.length, ...retained);
      },
    });
    return row;
  };

  const restoreSnapshot = (snapshot) => {
    for (const key of ["assessments", "questions", "choices", "codingTests", "attempts"]) {
      store[key].splice(0, store[key].length, ...cloneRows(snapshot[key]));
    }
  };

  stub(User, "findByPk", async (id) => users[Number(id)] ? activeUser(Number(id)) : null);
  stub(sequelize, "transaction", async (callback) => {
    const snapshot = {
      assessments: cloneRows(store.assessments),
      questions: cloneRows(store.questions),
      choices: cloneRows(store.choices),
      codingTests: cloneRows(store.codingTests),
      attempts: cloneRows(store.attempts),
    };
    try {
      return await callback({ LOCK: { UPDATE: "UPDATE" } });
    } catch (error) {
      restoreSnapshot(snapshot);
      throw error;
    }
  });
  stub(models.Classroom, "findByPk", async (id) => (
    store.classrooms.find((row) => row.id === Number(id)) || null
  ));
  stub(models.LessonAssessment, "findOne", async (options = {}) => {
    if (options.lock) store.events.push("assessment-lock");
    const found = store.assessments.find((row) => matches(row, options.where)) || null;
    if (found && options.include && store.failGraphReload) {
      throw new Error("final graph reload failed");
    }
    return found && options.include ? graph(found) : persistedAssessment(found);
  });
  stub(models.LessonAssessment, "findByPk", async (id, options = {}) => {
    if (options.lock) store.events.push("assessment-lock");
    const found = store.assessments.find((row) => row.id === Number(id)) || null;
    return found && options.include ? graph(found) : found;
  });
  stub(models.LessonAssessment, "findAll", async ({ where }) => {
    store.listQueries += 1;
    return store.assessments.filter((row) => matches(row, where)).map((row) => ({
      ...row,
      questionCount: store.questions.filter((question) => question.assessmentId === row.id).length,
      attemptCount: store.attempts.filter((attempt) => attempt.assessmentId === row.id).length,
    }));
  });
  stub(models.LessonAssessment, "create", async (values) => {
    await models.LessonAssessment.build(values).validate();
    if (store.duplicateOnCreate) {
      const error = new Error(
        "duplicate key violates unique constraint lesson_assessments_classroom_lesson_type",
      );
      error.name = "SequelizeUniqueConstraintError";
      error.constraint = "lesson_assessments_classroom_lesson_type";
      error.sql = "INSERT INTO lesson_assessments (private_column) VALUES ('private-value')";
      error.original = {
        constraint: "lesson_assessments_classroom_lesson_type",
        detail: "Key (classroom_id, lesson_key, type) already exists",
      };
      throw error;
    }
    const row = { id: Math.max(0, ...store.assessments.map(({ id }) => id)) + 1, ...values };
    store.assessments.push(row);
    return row;
  });
  stub(models.AssessmentAttempt, "count", async ({ where }) => {
    store.events.push("attempt-count");
    store.attemptCounts += 1;
    return store.attempts.filter((row) => matches(row, where)).length;
  });
  stub(models.AssessmentAttempt, "findOne", async ({ where }) => {
    store.events.push("attempt-findOne");
    return store.attempts.find((row) => matches(row, where)) || null;
  });
  stub(models.AssessmentAttempt, "findAll", async (options) => {
    store.events.push("attempt-findAll");
    store.resultQueries.push(options);
    return store.attempts.filter((row) => matches(row, options.where));
  });
  stub(models.AssessmentAttempt, "create", async (values) => {
    store.events.push("attempt-create");
    const row = { id: Math.max(0, ...store.attempts.map(({ id }) => id)) + 1, ...values };
    store.attempts.push(row);
    return row;
  });
  stub(models.ClassroomMembership, "findOne", async ({ where }) => (
    store.memberships.find((row) => matches(row, where)) || null
  ));
  stub(models.ClassroomMembership, "findAll", async ({ where }) => (
    store.memberships.filter((row) => matches(row, where))
  ));
  const progressWithEvidence = (row) => row.startedAt != null
    || Number(row.progressPercent) > 0
    || Number(row.attemptCount) > 0
    || row.isCompleted === true
    || Number(row.timeSpentSeconds) > 0;
  const matchingProgress = (where) => {
    const studentIds = where.userId?.[Op.in] || [];
    const levelKeys = where.levelKey?.[Op.in] || [];
    return store.progress.filter((row) => studentIds.includes(row.userId)
      && levelKeys.includes(row.levelKey) && progressWithEvidence(row));
  };
  stub(models.UserProgress, "count", async (options) => {
    store.progressQueries.push(options);
    return new Set(matchingProgress(options.where).map((row) => row.userId)).size;
  });
  stub(models.UserProgress, "findAll", async (options) => {
    store.progressQueries.push(options);
    return matchingProgress(options.where);
  });
  stub(models.AssessmentQuestion, "findAll", async ({ where }) => (
    store.questions.filter((row) => matches(row, where))
  ));
  stub(models.AssessmentResponse, "findAll", async (options) => {
    store.codingAnalyticsQueries.push(options);
    const questionIds = options.where.questionId?.[Op.in] || [];
    const attemptWhere = options.include?.[0]?.where || {};
    const submittedAttemptIds = new Set(store.attempts
      .filter((row) => matches(row, attemptWhere))
      .map((row) => row.id));
    return store.responses.filter((row) => questionIds.includes(row.questionId)
      && submittedAttemptIds.has(row.attemptId));
  });
  stub(models.AssessmentQuestion, "destroy", async ({ where }) => {
    store.questionDeletes += 1;
    const retained = store.questions.filter((row) => !matches(row, where));
    store.questions.splice(0, store.questions.length, ...retained);
  });
  stub(models.AssessmentQuestion, "create", async (values) => {
    await models.AssessmentQuestion.build(values).validate();
    const row = { id: Math.max(100, ...store.questions.map(({ id }) => id)) + 1, ...values };
    store.questions.push(row);
    return row;
  });
  stub(models.AssessmentChoice, "destroy", async ({ where }) => {
    store.choiceDeletes += 1;
    const retained = store.choices.filter((row) => !matches(row, where));
    store.choices.splice(0, store.choices.length, ...retained);
  });
  stub(models.AssessmentChoice, "create", async (values) => {
    await models.AssessmentChoice.build(values).validate();
    if (store.failChoiceCreate) {
      const error = new Error("database detail must not escape: SELECT private_answer_key");
      error.sql = "INSERT INTO assessment_choices (is_correct) VALUES (true)";
      error.constraint = "assessment_choices_question_id_fkey";
      throw error;
    }
    const row = { id: Math.max(1000, ...store.choices.map(({ id }) => id)) + 1, ...values };
    store.choices.push(row);
    return row;
  });
  stub(models.AssessmentCodingTestCase, "create", async (values) => {
    await models.AssessmentCodingTestCase.build(values).validate();
    const row = { id: Math.max(2000, ...store.codingTests.map(({ id }) => id)) + 1, ...values };
    store.codingTests.push(row);
    return row;
  });

  return {
    store,
    call: (path, options = {}) => request(`/api/teacher${path}`, { actorId: 5, ...options }),
  };
};

const postDraft = (overrides = {}) => ({
  lessonKey: "arrays",
  type: "POST",
  title: "Arrays post-test",
  ...overrides,
});

const saveBody = (overrides = {}) => ({
  version: 1,
  settings: {
    title: "Revised arrays post-test",
    instructions: "Choose carefully.",
    isRequired: true,
    passingPercentage: 75,
    maxAttempts: 3,
    requirePassingForCompletion: true,
    showScoreAfterSubmission: true,
    answerReviewPolicy: "AFTER_FINAL_ATTEMPT",
    shuffleQuestions: true,
    shuffleChoices: true,
  },
  questions: [],
  ...overrides,
});

before(async () => {
  server = await new Promise((resolve) => {
    const listening = productionApp.listen(0, "127.0.0.1", () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  while (restorations.length) {
    const [target, property, original] = restorations.pop();
    target[property] = original;
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("production app maps malformed teacher assessment JSON to the safe 400 contract", async () => {
  const response = await fetch(`${baseUrl}/api/teacher/classrooms/7/assessments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token(5)}`,
      "Content-Type": "application/json",
    },
    body: '{"lessonKey":',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "INVALID_REQUEST",
    message: "Malformed JSON request body",
  });
});

test("teacher service factory accepts the existing assessment dependency names", async () => {
  stub(models.Classroom, "findByPk", async () => ({ id: 7, teacherId: 5 }));
  let authorized = false;
  const service = createTeacherAssessmentService({
    models: {
      LessonAssessment: { findAll: async () => [baseAssessment({ type: "PRE" })] },
      AssessmentQuestion: {},
      AssessmentChoice: {},
      AssessmentAttempt: {},
    },
    authorizationService: {
      requireManagedClassroom: async () => { authorized = true; },
      assertAcademicLessonKey: () => {},
    },
    serializers: {
      serializeTeacherSummary: () => ({ injectedSerializer: true }),
    },
  });
  const result = await service.listAssessments({
    classroomId: 7,
    lessonKey: "arrays",
    actorId: 5,
    actorRole: "teacher",
  });
  assert.equal(authorized, true);
  assert.deepEqual(result.assessments.PRE, { injectedSerializer: true });
});

test("teacher assessment routes require authentication and teacher or admin role", async () => {
  harness();
  const unauthenticated = await request("/api/teacher/classrooms/7/assessments?lessonKey=arrays");
  assert.equal(unauthenticated.response.status, 401);
  const student = await request("/api/teacher/classrooms/7/assessments?lessonKey=arrays", { actorId: 42 });
  assert.equal(student.response.status, 403);
  assert.equal((await request("/api/teacher/classrooms/7/assessments?lessonKey=arrays", { actorId: 5 })).response.status, 200);
  assert.equal((await request("/api/teacher/classrooms/7/assessments?lessonKey=arrays", { actorId: 9 })).response.status, 200);
});

test("additional-attempt route requires authentication teacher role and exact classroom authority", async () => {
  const h = harness({
    assessments: [baseAssessment({ isPublished: true })],
    attempts: exhaustedFailedAttempts(),
  });
  const path = "/api/teacher/classrooms/7/assessments/12/students/42/additional-attempt";
  const unauthenticated = await request(path, { method: "POST" });
  assert.equal(unauthenticated.response.status, 401);
  const student = await request(path, { actorId: 42, method: "POST" });
  assert.equal(student.response.status, 403);
  const wrongTeacher = await request(path, { actorId: 6, method: "POST" });
  assert.equal(wrongTeacher.response.status, 403);
  const wrongClass = await request(
    "/api/teacher/classrooms/8/assessments/12/students/42/additional-attempt",
    { actorId: 5, method: "POST" },
  );
  assert.equal(wrongClass.response.status, 403);
  assert.equal(h.store.attempts.length, 3);
});

test("additional-attempt route rejects substituted assessment and inactive student", async () => {
  const substituted = harness({
    assessments: [baseAssessment({ classroomId: 8, isPublished: true })],
    attempts: exhaustedFailedAttempts().map((row) => ({ ...row, classroomId: 8 })),
  });
  const wrongAssessment = await substituted.call(
    "/classrooms/7/assessments/12/students/42/additional-attempt",
    { method: "POST" },
  );
  assert.equal(wrongAssessment.response.status, 404);
  assert.equal(wrongAssessment.payload.code, "ASSESSMENT_NOT_FOUND");

  while (restorations.length) {
    const [target, property, original] = restorations.pop();
    target[property] = original;
  }
  const inactive = harness({
    assessments: [baseAssessment({ isPublished: true })],
    attempts: exhaustedFailedAttempts(),
    memberships: [{ classroomId: 7, studentId: 42, status: "removed" }],
  });
  const denied = await inactive.call(
    "/classrooms/7/assessments/12/students/42/additional-attempt",
    { method: "POST" },
  );
  assert.equal(denied.response.status, 403);
  assert.equal(denied.payload.code, "FORBIDDEN");
  assert.equal(inactive.store.events.includes("attempt-findAll"), false);
});

test("additional-attempt route requires positive IDs and an exactly empty request", async () => {
  const h = harness({
    assessments: [baseAssessment({ isPublished: true })],
    attempts: exhaustedFailedAttempts(),
  });
  for (const path of [
    "/classrooms/no/assessments/12/students/42/additional-attempt",
    "/classrooms/7/assessments/0/students/42/additional-attempt",
    "/classrooms/7/assessments/12/students/1.5/additional-attempt",
    "/classrooms/7/assessments/12/students/42/additional-attempt?force=true",
  ]) {
    const result = await h.call(path, { method: "POST" });
    assert.equal(result.response.status, 400, path);
    assert.equal(result.payload.code, "INVALID_REQUEST", path);
  }
  const body = await h.call(
    "/classrooms/7/assessments/12/students/42/additional-attempt",
    { method: "POST", body: {} },
  );
  assert.equal(body.response.status, 400);
  assert.equal(body.payload.code, "INVALID_REQUEST");
  assert.equal(h.store.attempts.length, 3);
});

test("additional-attempt route exposes recovery policy conflicts in required precedence", async () => {
  const scenarios = [
    {
      assessment: baseAssessment({ type: "PRE", isPublished: true, maxAttempts: 1,
        requirePassingForCompletion: false }),
      attempts: exhaustedFailedAttempts(1),
      code: "POST_RECOVERY_NOT_ALLOWED",
      message: "An additional POST attempt cannot be granted for this assessment",
    },
    {
      assessment: baseAssessment({ isPublished: false }),
      attempts: exhaustedFailedAttempts(),
      code: "POST_RECOVERY_NOT_ALLOWED",
      message: "An additional POST attempt cannot be granted for this assessment",
    },
    {
      assessment: baseAssessment({ isPublished: true, requirePassingForCompletion: false }),
      attempts: exhaustedFailedAttempts(),
      code: "POST_RECOVERY_NOT_ALLOWED",
      message: "An additional POST attempt cannot be granted for this assessment",
    },
    {
      assessment: baseAssessment({ isPublished: true }),
      attempts: exhaustedFailedAttempts(2),
      code: "POST_ATTEMPTS_NOT_EXHAUSTED",
      message: "Ordinary POST attempts are not exhausted",
    },
    {
      assessment: baseAssessment({ isPublished: true }),
      attempts: exhaustedFailedAttempts().map((row, index) => index === 1
        ? { ...row, passed: true, percentage: 90 } : row),
      code: "POST_ALREADY_PASSED",
      message: "The student already has a passing POST result",
    },
    {
      assessment: baseAssessment({ isPublished: true }),
      attempts: [...exhaustedFailedAttempts(), {
        id: 99, assessmentId: 12, classroomId: 7, studentId: 42,
        attemptNumber: 4, status: "IN_PROGRESS", assessmentVersion: 1,
      }],
      code: "ACTIVE_ATTEMPT_EXISTS",
      message: "The student already has an active assessment attempt",
    },
  ];
  for (const scenario of scenarios) {
    const h = harness({ assessments: [scenario.assessment], attempts: scenario.attempts });
    const result = await h.call(
      "/classrooms/7/assessments/12/students/42/additional-attempt",
      { method: "POST" },
    );
    assert.equal(result.response.status, 409, scenario.code);
    assert.deepEqual(result.payload, {
      code: scenario.code,
      message: scenario.message,
    });
    while (restorations.length) {
      const [target, property, original] = restorations.pop();
      target[property] = original;
    }
  }
});

test("additional-attempt route returns 201 with an attempt envelope and eight-field allowlist", async () => {
  const h = harness({
    assessments: [baseAssessment({ isPublished: true, version: 4 })],
    attempts: exhaustedFailedAttempts(),
  });
  const result = await h.call(
    "/classrooms/7/assessments/12/students/42/additional-attempt",
    { method: "POST" },
  );
  assert.equal(result.response.status, 201);
  assert.deepEqual(Object.keys(result.payload), ["attempt"]);
  assert.deepEqual(Object.keys(result.payload.attempt), [
    "id", "assessmentId", "classroomId", "studentId", "attemptNumber",
    "status", "assessmentVersion", "startedAt",
  ]);
  assert.deepEqual({ ...result.payload.attempt, startedAt: "timestamp" }, {
    id: 44,
    assessmentId: 12,
    classroomId: 7,
    studentId: 42,
    attemptNumber: 4,
    status: "IN_PROGRESS",
    assessmentVersion: 4,
    startedAt: "timestamp",
  });
  for (const forbidden of [
    "questionOrder", "choiceOrder", "responses", "pointsEarned", "maxPoints",
    "percentage", "correctCount", "questionCount", "passed", "submissionKey",
    "questions", "choices", "isCorrect", "correctChoiceId", "explanation",
  ]) assert.equal(JSON.stringify(result.payload).includes(forbidden), false, forbidden);
  assert.deepEqual(h.store.events.slice(-3), ["assessment-lock", "attempt-findAll", "attempt-create"]);
  assert.equal(h.store.attemptCounts, 0);
  assert.equal(h.store.assessments[0].maxAttempts, 3);
});

test("teacher cannot access another teacher classroom", async () => {
  harness();
  const result = await request("/api/teacher/classrooms/8/assessments?lessonKey=arrays", { actorId: 5 });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.code, "FORBIDDEN");
});

test("admin uses the existing teacher-router classroom scope policy", async () => {
  harness();
  const result = await request("/api/teacher/classrooms/8/assessments?lessonKey=arrays", { actorId: 9 });
  assert.equal(result.response.status, 200);
});

test("assessment IDs are cross-checked against the path classroom", async () => {
  harness({ assessments: [baseAssessment({ classroomId: 8 })] });
  const result = await request("/api/teacher/classrooms/7/assessments/12", { actorId: 5 });
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.code, "ASSESSMENT_NOT_FOUND");
});

test("teacher cannot read results or mutate another teacher assessment by guessed ID", async () => {
  const h = harness({
    assessments: [baseAssessment({ classroomId: 8, createdBy: 6 })],
    attempts: [submittedAttempt({ classroomId: 8 })],
  });
  const results = await Promise.all([
    h.call("/classrooms/7/assessments/12/results"),
    h.call("/classrooms/7/assessments/12", { method: "PUT", body: saveBody() }),
    h.call("/classrooms/7/assessments/12/publish", { method: "POST", body: { version: 1 } }),
    h.call("/classrooms/7/assessments/12/unpublish", { method: "POST", body: { version: 1 } }),
    h.call("/classrooms/7/assessments/12", { method: "DELETE" }),
  ]);

  for (const result of results) {
    assert.equal(result.response.status, 404);
    assert.equal(result.payload.code, "ASSESSMENT_NOT_FOUND");
  }
  assert.equal(h.store.assessments.length, 1);
  assert.equal(h.store.assessments[0].classroomId, 8);
  assert.equal(h.store.resultQueries.length, 0);
  assert.equal(h.store.questionDeletes, 0);
  assert.equal(h.store.assessmentDeletes, 0);
});

test("lesson assessment list returns PRE and POST slots with bounded counts", async () => {
  const h = harness({
    assessments: [
      baseAssessment({ id: 11, type: "PRE", passingPercentage: null, maxAttempts: 1,
        gradeCalculation: "FIRST", requirePassingForCompletion: false, answerReviewPolicy: "NEVER",
        isPublished: true }),
      baseAssessment({ id: 12 }),
    ],
    questions: [
      baseQuestion({ id: 101, assessmentId: 11 }),
      baseQuestion({ id: 102, assessmentId: 11, displayOrder: 1 }),
      baseQuestion({ id: 201, assessmentId: 12 }),
      baseQuestion({ id: 202, assessmentId: 12, displayOrder: 1 }),
      baseQuestion({ id: 203, assessmentId: 12, displayOrder: 2 }),
    ],
    choices: [],
    attempts: [
      ...Array.from({ length: 20 }, (_, index) => ({ id: index + 1, assessmentId: 11 })),
      ...Array.from({ length: 25 }, (_, index) => ({ id: index + 21, assessmentId: 12 })),
    ],
  });
  const result = await h.call("/classrooms/7/assessments?lessonKey=arrays");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, { lessonKey: "arrays", assessments: {
    PRE: { exists: true, id: 11, published: true, questionCount: 2, attemptsExist: true },
    POST: { exists: true, id: 12, published: false, questionCount: 3, attemptsExist: true,
      passingPercentage: 75, maxAttempts: 3, requirePassingForCompletion: true },
  } });
  assert.equal(h.store.listQueries, 1);
  assert.equal(h.store.attemptCounts, 0);
});

test("tutorial and unknown lesson keys are rejected", async () => {
  harness();
  for (const lessonKey of ["tutorial", "not-a-lesson"]) {
    const result = await request(`/api/teacher/classrooms/7/assessments?lessonKey=${lessonKey}`, { actorId: 5 });
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.code, "INVALID_LESSON_KEY");
  }
});

test("PRE draft creation applies diagnostic invariants", async () => {
  harness({ assessments: [], questions: [], choices: [] });
  const result = await request("/api/teacher/classrooms/7/assessments", {
    actorId: 5, method: "POST", body: { lessonKey: "arrays", type: "PRE", title: "Arrays diagnostic" },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.assessment.type, "PRE");
  assert.equal(result.payload.assessment.maxAttempts, 1);
  assert.equal(result.payload.assessment.gradeCalculation, "FIRST");
  assert.equal(result.payload.assessment.passingPercentage, null);
  assert.equal(result.payload.assessment.requirePassingForCompletion, false);
  assert.equal(result.payload.assessment.answerReviewPolicy, "NEVER");
});

test("POST draft creation applies 75 percent three-attempt highest defaults", async () => {
  harness({ assessments: [], questions: [], choices: [] });
  const result = await request("/api/teacher/classrooms/7/assessments", {
    actorId: 5, method: "POST", body: postDraft(),
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.assessment.passingPercentage, 75);
  assert.equal(result.payload.assessment.maxAttempts, 3);
  assert.equal(result.payload.assessment.gradeCalculation, "HIGHEST");
});

test("creation is always unpublished version one", async () => {
  harness({ assessments: [], questions: [], choices: [] });
  const result = await request("/api/teacher/classrooms/7/assessments", {
    actorId: 5, method: "POST", body: postDraft(),
  });
  assert.equal(result.payload.assessment.isPublished, false);
  assert.equal(result.payload.assessment.publishedAt, null);
  assert.equal(result.payload.assessment.version, 1);
  assert.deepEqual(result.payload.assessment.questions, []);
  const injected = await request("/api/teacher/classrooms/7/assessments", {
    actorId: 5, method: "POST", body: postDraft({ isPublished: true }),
  });
  assert.equal(injected.response.status, 400);
  assert.equal(injected.payload.code, "INVALID_REQUEST");
});

test("duplicate classroom lesson type maps to ASSESSMENT_TYPE_EXISTS", async () => {
  const h = harness({ assessments: [], questions: [], choices: [] });
  h.store.duplicateOnCreate = true;
  const result = await h.call("/classrooms/7/assessments", { method: "POST", body: postDraft() });
  assert.equal(result.response.status, 409);
  assert.deepEqual(result.payload, {
    code: "ASSESSMENT_TYPE_EXISTS",
    message: "An assessment of this type already exists",
  });
});

for (const action of ["create", "save"]) {
  const invalidSettings = {
    text: [
      ...[{}, null, [], 7].map((value) => ["title", value]),
      ...[{}, [], 7].map((value) => ["instructions", value]),
    ],
    boolean: ["isRequired", "requirePassingForCompletion", "showScoreAfterSubmission",
      "shuffleQuestions", "shuffleChoices"].flatMap((field) => (
      [null, {}, [], 1, "true"].map((value) => [field, value])
    )),
    numeric: ["passingPercentage", "maxAttempts"].flatMap((field) => (
      [null, {}, [], true, "3"].map((value) => [field, value])
    )),
  };
  for (const [kind, cases] of Object.entries(invalidSettings)) {
    test(`${action} rejects malformed ${kind} settings before persistence`, async () => {
      const h = harness({ assessments: action === "create" ? [] : [baseAssessment()] });
      for (const [field, value] of cases) {
        const result = await h.call(`/classrooms/7/assessments${action === "save" ? "/12" : ""}`, {
          method: action === "create" ? "POST" : "PUT",
          body: action === "create" ? postDraft({ [field]: value })
            : saveBody({ settings: { [field]: value } }),
        });
        assert.equal(result.response.status, 400, `${field}=${JSON.stringify(value)}`);
        assert.equal(result.payload.code, "INVALID_REQUEST");
        assert.equal(h.store.questionDeletes, 0);
        assert.equal(h.store.savedAssessmentStates.length, 0);
        assert.equal(h.store.assessments.length, action === "create" ? 0 : 1);
        if (action === "save") assert.equal(h.store.assessments[0].version, 1);
      }
    });
  }
}

test("save rejects malformed persisted question and choice types before graph deletion", async () => {
  const h = harness();
  const question = { questionText: "Draft question", questionType: "MULTIPLE_CHOICE", points: 1,
    choices: [{ choiceText: "Draft answer" }] };
  const cases = [
    ...[{}, null, [], 7].map((questionText) => [{ ...question, questionText }, "INVALID_QUESTION"]),
    ...["explanation", "objectiveKey"].flatMap((field) => (
      [{}, [], 7].map((value) => [{ ...question, [field]: value }, "INVALID_QUESTION"])
    )),
    ...[null, {}, [], true, "1"].map((points) => [{ ...question, points }, "INVALID_QUESTION"]),
    ...[{}, null, [], 7].map((choiceText) => [
      { ...question, choices: [{ choiceText }] }, "INVALID_CHOICE",
    ]),
  ];
  for (const [invalidQuestion, code] of cases) {
    const result = await h.call("/classrooms/7/assessments/12", {
      method: "PUT", body: saveBody({ questions: [invalidQuestion] }),
    });
    assert.equal(result.response.status, 400, JSON.stringify(invalidQuestion));
    assert.equal(result.payload.code, code);
    assert.equal(h.store.questionDeletes, 0);
    assert.equal(h.store.assessments[0].version, 1);
  }
});

test("nullable text and omitted settings remain valid for incomplete teacher drafts", async () => {
  const h = harness({ assessments: [] });
  const created = await h.call("/classrooms/7/assessments", {
    method: "POST", body: postDraft({ instructions: null }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.assessment.showScoreAfterSubmission, true);
  const id = created.payload.assessment.id;
  const saved = await h.call(`/classrooms/7/assessments/${id}`, {
    method: "PUT", body: saveBody({ settings: { instructions: null }, questions: [{
      questionText: "Unfinished question", questionType: "MULTIPLE_CHOICE", points: 1,
      explanation: null, objectiveKey: null, choices: [{ choiceText: "Only one draft choice" }],
    }] }),
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.payload.assessment.version, 2);
  assert.equal(saved.payload.assessment.instructions, null);
  assert.equal(saved.payload.assessment.questions[0].explanation, null);
  assert.equal(saved.payload.assessment.questions[0].choices[0].isCorrect, false);
});

test("malformed settings preserve locked save version and attempt precedence", async () => {
  const h = harness({ attempts: [submittedAttempt()] });
  for (const [version, code] of [[2, "ASSESSMENT_VERSION_CONFLICT"], [1, "ASSESSMENT_LOCKED"]]) {
    const result = await h.call("/classrooms/7/assessments/12", {
      method: "PUT", body: saveBody({ version, settings: { showScoreAfterSubmission: null } }),
    });
    assert.equal(result.response.status, 409);
    assert.equal(result.payload.code, code);
    assert.equal(h.store.questionDeletes, 0);
  }
});

test("teacher editor exposes settings answers explanations and lock state", async () => {
  harness({ attempts: [{ id: 1, assessmentId: 12 }] });
  const result = await request("/api/teacher/classrooms/7/assessments/12", { actorId: 5 });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.assessment.questions[0].choices[0].isCorrect, true);
  assert.equal(result.payload.assessment.questions[0].explanation, "Arrays use brackets after the type.");
  assert.equal(result.payload.assessment.attemptsExist, true);
  assert.equal(result.payload.assessment.structureLocked, true);
});

test("incomplete graph saves as a draft and array position defines order", async () => {
  const h = harness();
  const result = await h.call("/classrooms/7/assessments/12", { method: "PUT", body: saveBody({
    questions: [
      { questionText: "Second?", questionType: "MULTIPLE_CHOICE", points: 1, choices: [] },
      { questionText: "First?", questionType: "TRUE_FALSE", points: 2, choices: [
        { choiceText: "Not yet complete" },
      ] },
    ],
  }) });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.assessment.questions.map(({ displayOrder }) => displayOrder), [0, 1]);
  assert.deepEqual(result.payload.assessment.questions[1].choices.map(({ displayOrder }) => displayOrder), [0]);
  assert.equal(result.payload.assessment.version, 2);
});

test("client IDs displayOrder and unknown fields are rejected", async () => {
  const cases = [
    saveBody({ id: 99 }),
    saveBody({ settings: { ...saveBody().settings, gradeCalculation: "FIRST" } }),
    saveBody({ questions: [{ id: 1, questionText: "Q", questionType: "MULTIPLE_CHOICE", points: 1, choices: [] }] }),
    saveBody({ questions: [{ displayOrder: 8, questionText: "Q", questionType: "MULTIPLE_CHOICE", points: 1, choices: [] }] }),
    saveBody({ questions: [{ questionText: "Q", questionType: "MULTIPLE_CHOICE", points: 1,
      choices: [{ id: 2, choiceText: "A", isCorrect: true }] }] }),
    saveBody({ questions: [{ questionText: "Q", questionType: "MULTIPLE_CHOICE", points: 1,
      choices: [{ choiceText: "A", isCorrect: true, displayOrder: 3 }] }] }),
  ];
  for (const body of cases) {
    const h = harness();
    const result = await request("/api/teacher/classrooms/7/assessments/12", { actorId: 5, method: "PUT", body });
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.code, "INVALID_REQUEST");
    if (Object.hasOwn(body, "id")) assert.deepEqual(h.store.events, []);
    while (restorations.length) {
      const [target, property, original] = restorations.pop();
      target[property] = original;
    }
  }
});

test("valid objective keys save and malformed keys fail", async () => {
  const h = harness();
  const question = (objectiveKey) => ({ questionText: "Objective question", questionType: "MULTIPLE_CHOICE",
    points: 1, objectiveKey, choices: [] });
  const valid = await h.call("/classrooms/7/assessments/12", {
    method: "PUT", body: saveBody({ questions: [question("array-declaration-2")] }),
  });
  assert.equal(valid.response.status, 200);
  for (const objectiveKey of ["Array-Key", "array_key", "-array", "array-", "array--key", "array key"]) {
    const invalid = await h.call("/classrooms/7/assessments/12", {
      method: "PUT", body: saveBody({ version: 2, questions: [question(objectiveKey)] }),
    });
    assert.equal(invalid.response.status, 400, objectiveKey);
    assert.equal(invalid.payload.code, "INVALID_QUESTION");
  }
});

test("draft save increments version and rejects stale versions before deletion", async () => {
  const h = harness();
  const saved = await h.call("/classrooms/7/assessments/12", { method: "PUT", body: saveBody() });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.payload.assessment.version, 2);
  assert.deepEqual(h.store.events.slice(0, 2), ["assessment-lock", "attempt-count"]);
  const deletes = [h.store.choiceDeletes, h.store.questionDeletes];
  const stale = await h.call("/classrooms/7/assessments/12", {
    method: "PUT",
    body: saveBody({ version: 1, settings: { ...saveBody().settings, injectedServerField: true } }),
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.payload.code, "ASSESSMENT_VERSION_CONFLICT");
  assert.equal(stale.payload.currentVersion, 2);
  assert.deepEqual([h.store.choiceDeletes, h.store.questionDeletes], deletes);
  assert.deepEqual(h.store.events.slice(-1), ["assessment-lock"]);
});

test("save rechecks mutability only after the assessment row lock", async () => {
  const h = harness({ attempts: [{ id: 1, assessmentId: 12 }] });
  const result = await h.call("/classrooms/7/assessments/12", {
    method: "PUT",
    body: saveBody({ settings: { ...saveBody().settings, injectedServerField: true } }),
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.code, "ASSESSMENT_LOCKED");
  assert.deepEqual(h.store.events, ["assessment-lock", "attempt-count"]);
  assert.equal(h.store.questionDeletes, 0);
});

test("published graph save performs full validation with server-derived identifiers", async () => {
  const h = harness({ assessments: [baseAssessment({ isPublished: true, publishedAt: new Date() })] });
  const validGraph = [{ questionText: "Pick one", questionType: "MULTIPLE_CHOICE", points: 1,
    choices: [{ choiceText: "A", isCorrect: true }, { choiceText: "B", isCorrect: false }] }];
  const valid = await h.call("/classrooms/7/assessments/12", {
    method: "PUT", body: saveBody({ questions: validGraph }),
  });
  assert.equal(valid.response.status, 200);
  const invalid = await h.call("/classrooms/7/assessments/12", {
    method: "PUT", body: saveBody({ version: 2, questions: [{ ...validGraph[0], choices: [
      { choiceText: "A", isCorrect: false }, { choiceText: "B", isCorrect: false },
    ] }] }),
  });
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.payload.code, "ASSESSMENT_INVALID");
});

test("published graph cannot be converted to CODING while the player release gate is off", async () => {
  const h = harness({ assessments: [baseAssessment({ isPublished: true, publishedAt: new Date() })] });
  const result = await h.call("/classrooms/7/assessments/12", {
    method: "PUT",
    body: saveBody({ questions: [{
      questionText: "Add", questionType: "CODING", points: 2, choices: [],
      starterCode: "public static class Solution { public static int Add(int a) => 0; }",
      referenceSolution: "public static class Solution { public static int Add(int a) => a + 1; }",
      methodContract: { typeName: "Solution", methodName: "Add", parameterTypes: ["int"], parameterNames: ["value"], returnType: "int" },
      codingTestCases: [{ visibility: "HIDDEN", input: [1], expectedOutput: 2, weight: 1 }],
    }] }),
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.code, "CODING_PLAYER_UNAVAILABLE");
  assert.equal(h.store.questionDeletes, 0);
});

test("authorized teacher CODING save reloads reference source and ordered public and hidden tests", async () => {
  const h = harness();
  const result = await h.call("/classrooms/7/assessments/12", {
    method: "PUT",
    body: saveBody({ questions: [{
      questionText: "Add", questionType: "CODING", points: 2, choices: [],
      starterCode: "public static class Solution { public static int Add(int a) => 0; }",
      referenceSolution: "public static class Solution { public static int Add(int a) => a + 1; }",
      methodContract: { typeName: "Solution", methodName: "Add", parameterTypes: ["int"], parameterNames: ["value"], returnType: "int" },
      codingTestCases: [
        { visibility: "PUBLIC", input: [1], expectedOutput: 2, weight: 1.25 },
        { visibility: "HIDDEN", input: [9], expectedOutput: 10, weight: 2.5 },
      ],
    }] }),
  });
  assert.equal(result.response.status, 200);
  const saved = result.payload.assessment.questions[0];
  assert.match(saved.referenceSolution, /a \+ 1/);
  assert.deepEqual(saved.methodContract.parameterTypes, ["int"]);
  assert.deepEqual(saved.methodContract.parameterNames, ["value"]);
  assert.deepEqual(h.store.questions[0].codingParameterNames, ["value"]);
  assert.deepEqual(saved.codingTestCases.map(({ visibility, input, expectedOutput, weight }) => (
    { visibility, input, expectedOutput, weight: Number(weight) }
  )), [
    { visibility: "PUBLIC", input: [1], expectedOutput: 2, weight: 1.25 },
    { visibility: "HIDDEN", input: [9], expectedOutput: 10, weight: 2.5 },
  ]);
});

test("teacher CODING save rejects malformed explicit parameter names before graph replacement", async () => {
  const invalidNames = [["value", "extra"], ["class"], ["value", "value"], [7]];
  for (const parameterNames of invalidNames) {
    const h = harness();
    const result = await h.call("/classrooms/7/assessments/12", {
      method: "PUT",
      body: saveBody({ questions: [{
        questionText: "Add", questionType: "CODING", points: 2, choices: [],
        starterCode: "", referenceSolution: "",
        methodContract: {
          typeName: "Solution", methodName: "Add", parameterTypes: ["int"], parameterNames, returnType: "int",
        },
        codingTestCases: [{ visibility: "PUBLIC", input: [1], expectedOutput: 2, weight: 1 }],
      }] }),
    });
    assert.equal(result.response.status, 400);
    assert.equal(h.store.questionDeletes, 0);
  }
  const h = harness();
  const programWithNames = await h.call("/classrooms/7/assessments/12", {
    method: "PUT",
    body: saveBody({ questions: [{
      questionText: "Print", questionType: "CODING", points: 2, choices: [], executionMode: "PROGRAM",
      methodContract: {
        typeName: "Solution", methodName: "Ignored", parameterTypes: ["int"], parameterNames: ["value"], returnType: "int",
      },
      codingTestCases: [{ visibility: "PUBLIC", input: "1\n", expectedOutput: "1\n", weight: 1 }],
    }] }),
  });
  assert.equal(programWithNames.response.status, 400);
  assert.equal(h.store.questionDeletes, 0);
});

test("blank optional CODING source saves canonically, reloads empty, and publishes", async () => {
  const previousGate = process.env.CODING_ASSESSMENT_PLAYER_ENABLED;
  process.env.CODING_ASSESSMENT_PLAYER_ENABLED = "true";
  try {
    const h = harness();
    const savedResult = await h.call("/classrooms/7/assessments/12", {
      method: "PUT",
      body: saveBody({ questions: [{
        questionText: "Add", questionType: "CODING", points: 2, choices: [],
        starterCode: null,
        referenceSolution: null,
        methodContract: { typeName: "Solution", methodName: "Add", parameterTypes: ["int"], returnType: "int" },
        codingTestCases: [
          { visibility: "PUBLIC", input: [1], expectedOutput: 2, weight: 1 },
        ],
      }] }),
    });
    assert.equal(savedResult.response.status, 200);
    assert.equal(savedResult.payload.assessment.questions[0].starterCode, "");
    assert.equal(savedResult.payload.assessment.questions[0].referenceSolution, "");

    const reloaded = await h.call("/classrooms/7/assessments/12");
    assert.equal(reloaded.response.status, 200);
    assert.equal(reloaded.payload.assessment.questions[0].starterCode, "");
    assert.equal(reloaded.payload.assessment.questions[0].referenceSolution, "");

    const published = await h.call("/classrooms/7/assessments/12/publish", {
      method: "POST", body: { version: 2 },
    });
    assert.equal(published.response.status, 200);
    assert.equal(published.payload.assessment.isPublished, true);
  } finally {
    if (previousGate === undefined) delete process.env.CODING_ASSESSMENT_PLAYER_ENABLED;
    else process.env.CODING_ASSESSMENT_PLAYER_ENABLED = previousGate;
  }
});

test("failed graph creation rolls back the replacement graph", async () => {
  const h = harness();
  const logged = [];
  stub(console, "error", (...args) => logged.push(args));
  const before = {
    assessment: { ...h.store.assessments[0] },
    questions: cloneRows(h.store.questions),
    choices: cloneRows(h.store.choices),
  };
  h.store.failChoiceCreate = true;
  const result = await h.call("/classrooms/7/assessments/12", { method: "PUT", body: saveBody({
    questions: [{ questionText: "Replacement", questionType: "MULTIPLE_CHOICE", points: 1,
      choices: [{ choiceText: "A", isCorrect: true }] }],
  }) });
  assert.equal(result.response.status, 500);
  assert.deepEqual(h.store.assessments[0], before.assessment);
  assert.deepEqual(h.store.questions, before.questions);
  assert.deepEqual(h.store.choices, before.choices);
  assert.deepEqual(result.payload, { code: "SERVER_ERROR", message: "Server error" });
  assert.equal(logged[0][0], "Unhandled assessment error");
  assert.match(logged[0][1].message, /private_answer_key/);
});

test("failed replacement rolls back settings graph and version", async () => {
  const h = harness();
  const logged = [];
  stub(console, "error", (...args) => logged.push(args));
  const before = {
    assessment: { ...h.store.assessments[0] },
    questions: cloneRows(h.store.questions),
    choices: cloneRows(h.store.choices),
  };
  h.store.failGraphReload = true;
  const result = await h.call("/classrooms/7/assessments/12", { method: "PUT", body: saveBody({
    questions: [{ questionText: "Replacement", questionType: "MULTIPLE_CHOICE", points: 1,
      choices: [{ choiceText: "A", isCorrect: true }, { choiceText: "B", isCorrect: false }] }],
  }) });
  assert.equal(result.response.status, 500);
  assert.equal(h.store.savedAssessmentStates.length, 1);
  assert.equal(h.store.savedAssessmentStates[0].title, "Revised arrays post-test");
  assert.equal(h.store.savedAssessmentStates[0].version, 2);
  assert.deepEqual(h.store.assessments[0], before.assessment);
  assert.deepEqual(h.store.questions, before.questions);
  assert.deepEqual(h.store.choices, before.choices);
  assert.equal(logged[0][0], "Unhandled assessment error");
});

test("valid complete graph publishes and increments version", async () => {
  const h = harness();
  const result = await h.call("/classrooms/7/assessments/12/publish", {
    method: "POST", body: { version: 1 },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.assessment.id, 12);
  assert.equal(result.payload.assessment.isPublished, true);
  assert.equal(result.payload.assessment.version, 2);
  assert.match(result.payload.assessment.publishedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(h.store.events.slice(0, 2), ["assessment-lock", "attempt-count"]);
  assert.equal(h.store.assessments[0].isPublished, true);
  assert.equal(h.store.assessments[0].version, 2);
});

test("invalid graph returns ASSESSMENT_INVALID 422 without partial publication", async () => {
  const h = harness({ questions: [], choices: [] });
  const before = { ...h.store.assessments[0] };
  const result = await h.call("/classrooms/7/assessments/12/publish", {
    method: "POST", body: { version: 1 },
  });
  assert.equal(result.response.status, 422);
  assert.equal(result.payload.code, "ASSESSMENT_INVALID");
  assert.deepEqual(h.store.assessments[0], before);
  assert.equal(h.store.savedAssessmentStates.length, 0);
});

test("stale publish and unpublish versions return currentVersion", async () => {
  const h = harness({ assessments: [baseAssessment({ isPublished: true, publishedAt: new Date(), version: 4 })] });
  for (const action of ["publish", "unpublish"]) {
    const result = await h.call(`/classrooms/7/assessments/12/${action}`, {
      method: "POST", body: { version: 3 },
    });
    assert.equal(result.response.status, 409, action);
    assert.equal(result.payload.code, "ASSESSMENT_VERSION_CONFLICT", action);
    assert.equal(result.payload.currentVersion, 4, action);
  }
  assert.deepEqual(h.store.events, ["assessment-lock", "assessment-lock"]);
});

test("PRE publication reports distinct active students with server progress evidence", async () => {
  const memberships = [42, 43, 44, 45, 46].map((studentId) => ({
    classroomId: 7, studentId, status: "active",
  }));
  memberships.push({ classroomId: 7, studentId: 47, status: "removed" });
  const progress = [
    { userId: 42, levelKey: "arrays-level-1", startedAt: new Date() },
    { userId: 42, levelKey: "arrays-level-2", progressPercent: 10 },
    { userId: 43, levelKey: "arrays-level-3", progressPercent: 1 },
    { userId: 44, levelKey: "arrays-level-4", attemptCount: 1 },
    { userId: 45, levelKey: "arrays-level-5", isCompleted: true },
    { userId: 46, levelKey: "arrays-level-6", timeSpentSeconds: 1 },
    { userId: 47, levelKey: "arrays-level-7", timeSpentSeconds: 10 },
    { userId: 48, levelKey: "arrays-level-8", isCompleted: true },
    { userId: 42, levelKey: "functions-level-1", isCompleted: true },
    { userId: 43, levelKey: "arrays-level-8", startedAt: null, progressPercent: 0,
      attemptCount: 0, isCompleted: false, timeSpentSeconds: 0 },
  ];
  const h = harness({
    assessments: [baseAssessment({ type: "PRE", title: "Arrays diagnostic",
      passingPercentage: null, maxAttempts: 1, gradeCalculation: "FIRST",
      requirePassingForCompletion: false, answerReviewPolicy: "NEVER" })],
    memberships,
    progress,
  });
  const result = await h.call("/classrooms/7/assessments/12/publish", {
    method: "POST", body: { version: 1 },
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.warnings, {
    existingStudentProgressCount: 5,
    grandfatheringRequiredLater: true,
  });
  assert.equal(h.store.progressQueries.length, 1);
  const query = h.store.progressQueries[0];
  assert.deepEqual(query.where.userId[Op.in], [42, 43, 44, 45, 46]);
  assert.deepEqual(query.where.levelKey[Op.in], Array.from({ length: 8 }, (_, index) => `arrays-level-${index + 1}`));
  assert.deepEqual(query.where[Op.or], [
    { startedAt: { [Op.ne]: null } },
    { progressPercent: { [Op.gt]: 0 } },
    { attemptCount: { [Op.gt]: 0 } },
    { isCompleted: true },
    { timeSpentSeconds: { [Op.gt]: 0 } },
  ]);
  assert.equal(query.distinct, true);
  assert.equal(query.col, "userId");
});

test("publication warning does not activate a progression gate", async () => {
  const h = harness({
    progress: [{ userId: 42, levelKey: "arrays-level-1", startedAt: new Date() }],
  });
  const before = cloneRows(h.store.progress);
  const result = await h.call("/classrooms/7/assessments/12/publish", {
    method: "POST", body: { version: 1 },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.assessment.isPublished, true);
  assert.deepEqual(result.payload.warnings, {
    existingStudentProgressCount: 1,
    grandfatheringRequiredLater: true,
  });
  assert.deepEqual(Object.keys(result.payload).sort(), ["assessment", "warnings"]);
  assert.deepEqual(h.store.progress, before);
});

test("unpublish with zero attempts clears publishedAt and increments version", async () => {
  const h = harness({ assessments: [baseAssessment({ isPublished: true, publishedAt: new Date(), version: 3 })] });
  const result = await h.call("/classrooms/7/assessments/12/unpublish", {
    method: "POST", body: { version: 3 },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.assessment.isPublished, false);
  assert.equal(result.payload.assessment.publishedAt, null);
  assert.equal(result.payload.assessment.version, 4);
  assert.deepEqual(h.store.events.slice(0, 2), ["assessment-lock", "attempt-count"]);
});

test("already-unpublished action is idempotent without a version increment", async () => {
  const h = harness({ assessments: [baseAssessment({ version: 3 })] });
  const result = await h.call("/classrooms/7/assessments/12/unpublish", {
    method: "POST", body: { version: 3 },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.assessment.isPublished, false);
  assert.equal(result.payload.assessment.version, 3);
  assert.equal(h.store.savedAssessmentStates.length, 0);
  assert.deepEqual(h.store.events.slice(0, 2), ["assessment-lock", "attempt-count"]);
});

test("any attempt locks every settings and graph edit", async () => {
  const h = harness({ attempts: [{ id: 1, assessmentId: 12 }] });
  const before = {
    assessment: { ...h.store.assessments[0] },
    questions: cloneRows(h.store.questions),
    choices: cloneRows(h.store.choices),
  };
  const result = await h.call("/classrooms/7/assessments/12", {
    method: "PUT",
    body: saveBody({
      settings: {
        title: "Changed", instructions: "Changed", isRequired: false,
        passingPercentage: 80, maxAttempts: 2, requirePassingForCompletion: false,
        showScoreAfterSubmission: false, answerReviewPolicy: "NEVER",
        shuffleQuestions: false, shuffleChoices: false,
      },
      questions: [{ questionText: "Changed", questionType: "MULTIPLE_CHOICE", points: 1,
        choices: [{ choiceText: "Yes", isCorrect: true }, { choiceText: "No", isCorrect: false }] }],
    }),
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.code, "ASSESSMENT_LOCKED");
  assert.deepEqual(h.store.assessments[0], before.assessment);
  assert.deepEqual(h.store.questions, before.questions);
  assert.deepEqual(h.store.choices, before.choices);
});

test("unpublish after any attempt returns ASSESSMENT_LOCKED", async () => {
  const h = harness({
    assessments: [baseAssessment({ isPublished: true, publishedAt: new Date() })],
    attempts: [{ id: 1, assessmentId: 12 }],
  });
  const result = await h.call("/classrooms/7/assessments/12/unpublish", {
    method: "POST", body: { version: 1 },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.code, "ASSESSMENT_LOCKED");
  assert.equal(h.store.assessments[0].isPublished, true);
});

test("unpublished untouched assessment deletes with 204", async () => {
  const h = harness();
  const result = await h.call("/classrooms/7/assessments/12", { method: "DELETE" });
  assert.equal(result.response.status, 204);
  assert.equal(result.payload, null);
  assert.equal(h.store.assessmentDeletes, 1);
  assert.equal(h.store.assessments.length, 0);
  assert.deepEqual(h.store.events.slice(0, 2), ["assessment-lock", "attempt-count"]);
});

test("published untouched assessment returns ASSESSMENT_PUBLISHED", async () => {
  const h = harness({ assessments: [baseAssessment({ isPublished: true, publishedAt: new Date() })] });
  const result = await h.call("/classrooms/7/assessments/12", { method: "DELETE" });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.code, "ASSESSMENT_PUBLISHED");
  assert.equal(h.store.assessmentDeletes, 0);
});

test("attempted assessment cannot be deleted", async () => {
  const h = harness({ attempts: [{ id: 1, assessmentId: 12 }] });
  const result = await h.call("/classrooms/7/assessments/12", { method: "DELETE" });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.code, "ASSESSMENT_LOCKED");
  assert.equal(h.store.assessmentDeletes, 0);
});

test("concurrent start versus teacher mutation is resolved by the assessment lock", async () => {
  let releaseStudentAfterTeacherWait;
  const allowStudentToContinue = new Promise((resolve) => { releaseStudentAfterTeacherWait = resolve; });
  let notifyStudentLock;
  const studentHasLock = new Promise((resolve) => { notifyStudentLock = resolve; });
  let notifyTeacherWait;
  const teacherIsWaiting = new Promise((resolve) => { notifyTeacherWait = resolve; });
  let lockOwner = null;
  const waiters = [];
  const acquireAssessmentLock = async (transaction, actor) => {
    if (lockOwner) {
      if (actor === "teacher") notifyTeacherWait();
      await new Promise((resolve) => waiters.push(resolve));
    }
    lockOwner = transaction;
    transaction.releaseLocks.push(() => {
      lockOwner = null;
      waiters.shift()?.();
    });
    if (actor === "student") {
      notifyStudentLock();
      await allowStudentToContinue;
    }
  };
  const transactional = {
    transaction: async (callback) => {
      const transaction = { LOCK: { UPDATE: "UPDATE" }, releaseLocks: [] };
      try {
        return await callback(transaction);
      } finally {
        for (const release of transaction.releaseLocks.reverse()) release();
      }
    },
  };
  const assessment = baseAssessment({ isPublished: true, publishedAt: new Date() });
  const question = { ...baseQuestion(), choices: baseChoices() };
  assessment.questions = [question];
  assessment.save = async () => assessment;
  const attempts = [];
  const sharedModels = {
    Classroom: { findByPk: async () => ({ id: 7, teacherId: 5 }) },
    ClassroomMembership: {
      findOne: async ({ where }) => (where.studentId === 42 ? { ...where } : null),
      findAll: async () => [{ classroomId: 7, studentId: 42, status: "active" }],
    },
    LessonAssessment: {
      findByPk: async (_id, options) => {
        if (options.lock) await acquireAssessmentLock(options.transaction, "student");
        return assessment;
      },
      findOne: async (options) => {
        if (options.lock) await acquireAssessmentLock(options.transaction, "teacher");
        return assessment;
      },
    },
    AssessmentQuestion: {},
    AssessmentChoice: {},
    AssessmentResponse: { findAll: async () => [] },
    AssessmentAttempt: {
      findOne: async ({ where }) => attempts.find((row) => matches(row, where)) || null,
      findAll: async ({ where }) => attempts.filter((row) => matches(row, where)),
      count: async ({ where }) => attempts.filter((row) => matches(row, where)).length,
      create: async (values) => {
        const created = { id: attempts.length + 1, ...values };
        attempts.push(created);
        return created;
      },
    },
    UserProgress: { count: async () => 0 },
  };
  const authorizationService = createAssessmentAuthorizationService({ models: sharedModels });
  const attemptService = createAssessmentAttemptService({
    sequelize: transactional,
    models: sharedModels,
    random: () => 0.5,
    now: () => new Date("2026-09-25T12:00:00.000Z"),
    progressionService: { assertAssessmentInteractionAllowed: async () => ({ allowed: true }) },
  });
  const teacherService = createTeacherAssessmentService({
    models: sharedModels,
    sequelize: transactional,
    authorizationService,
  });

  const studentStart = attemptService.startOrResumeAttempt({ assessmentId: 12, studentId: 42 });
  await studentHasLock;
  const teacherPublish = teacherService.publishAssessment({
    classroomId: 7, assessmentId: 12, actorId: 5, actorRole: "teacher", version: 1,
  });
  await teacherIsWaiting;
  assert.equal(attempts.length, 0);
  releaseStudentAfterTeacherWait();
  const started = await studentStart;
  assert.equal(started.resumed, false);
  await assert.rejects(teacherPublish, (error) => error.code === "ASSESSMENT_LOCKED");
  assert.equal(attempts.length, 1);
  assert.equal(assessment.version, 1);
});

test("teacher recovery races share the assessment lock with recovery and student start", async () => {
  let lockOwner = null;
  const waiters = [];
  const events = [];
  const transactionRunner = (actor) => ({
    transaction: async (callback) => {
      const transaction = { actor, LOCK: { UPDATE: "UPDATE" }, releaseLocks: [] };
      try {
        return await callback(transaction);
      } finally {
        for (const release of transaction.releaseLocks.reverse()) release();
      }
    },
  });
  const acquireAssessmentLock = async (transaction) => {
    if (lockOwner && lockOwner !== transaction) {
      await new Promise((resolve) => waiters.push(resolve));
    }
    lockOwner = transaction;
    events.push(`assessment-lock:${transaction.actor}`);
    transaction.releaseLocks.push(() => {
      lockOwner = null;
      waiters.shift()?.();
    });
  };
  const assessment = {
    ...baseAssessment({ isPublished: true, publishedAt: new Date() }),
    questions: [{ ...baseQuestion(), choices: baseChoices() }],
  };
  const attempts = exhaustedFailedAttempts();
  const sharedModels = {
    Classroom: { findByPk: async () => ({ id: 7, teacherId: 5 }) },
    ClassroomMembership: {
      findOne: async ({ where }) => (where.classroomId === 7 && where.studentId === 42
        && where.status === "active" ? { ...where } : null),
    },
    LessonAssessment: {
      findByPk: async (_id, options) => {
        if (options.lock) await acquireAssessmentLock(options.transaction);
        return assessment;
      },
    },
    AssessmentQuestion: {},
    AssessmentChoice: {},
    AssessmentResponse: { findAll: async () => [] },
    AssessmentAttempt: {
      findOne: async ({ where, transaction }) => {
        events.push(`attempt-findOne:${transaction.actor}`);
        return attempts.find((row) => matches(row, where)) || null;
      },
      findAll: async ({ where, transaction }) => {
        events.push(`attempt-findAll:${transaction.actor}`);
        return attempts.filter((row) => matches(row, where));
      },
      create: async (values, { transaction }) => {
        events.push(`attempt-create:${transaction.actor}`);
        const created = { id: Math.max(...attempts.map(({ id }) => id)) + 1, ...values };
        attempts.push(created);
        return created;
      },
    },
  };
  const authorizationService = createAssessmentAuthorizationService({ models: sharedModels });
  const teacherAttemptService = createAssessmentAttemptService({
    sequelize: transactionRunner("unused"), models: sharedModels,
    random: () => 0.5, now: () => new Date("2026-09-25T12:00:00.000Z"),
    progressionService: { assertAssessmentInteractionAllowed: async () => ({ allowed: true }) },
  });
  const teacherService = createTeacherAssessmentService({
    models: sharedModels,
    sequelize: transactionRunner("teacher"),
    authorizationService,
    assessmentAttemptService: teacherAttemptService,
  });
  const studentService = createAssessmentAttemptService({
    sequelize: transactionRunner("student"), models: sharedModels,
    random: () => 0.5, now: () => new Date("2026-09-25T12:00:00.000Z"),
    progressionService: { assertAssessmentInteractionAllowed: async () => ({ allowed: true }) },
  });
  const grant = () => teacherService.grantAdditionalPostAttempt({
    classroomId: 7, assessmentId: 12, studentId: 42, actorId: 5, actorRole: "teacher",
  });

  const duplicate = await Promise.allSettled([grant(), grant()]);
  assert.equal(duplicate.filter((item) => item.status === "fulfilled").length, 1);
  const granted = duplicate.find((item) => item.status === "fulfilled").value;
  assert.deepEqual(Object.keys(granted), ["attempt"]);
  assert.deepEqual(Object.keys(granted.attempt), [
    "id", "assessmentId", "classroomId", "studentId", "attemptNumber",
    "status", "assessmentVersion", "startedAt",
  ]);
  assert.equal(granted.attempt.attemptNumber, 4);
  assert.equal(duplicate.find((item) => item.status === "rejected").reason.code,
    "ACTIVE_ATTEMPT_EXISTS");
  assert.equal(attempts.filter((row) => row.status === "IN_PROGRESS").length, 1);
  for (const [index, event] of events.entries()) {
    if (event.startsWith("attempt-")) {
      const actor = event.split(":")[1];
      assert.ok(events.slice(0, index).includes(`assessment-lock:${actor}`), event);
    }
  }

  attempts.splice(3);
  events.splice(0);
  const mixed = await Promise.allSettled([
    grant(),
    studentService.startOrResumeAttempt({ assessmentId: 12, studentId: 42 }),
  ]);
  assert.equal(mixed.filter((item) => item.status === "fulfilled").length >= 1, true);
  assert.equal(attempts.filter((row) => row.status === "IN_PROGRESS").length, 1);
  for (const [index, event] of events.entries()) {
    if (event.startsWith("attempt-")) {
      const actor = event.split(":")[1];
      assert.ok(events.slice(0, index).includes(`assessment-lock:${actor}`), event);
    }
  }
});

test("save publish unpublish and delete never query attempts before acquiring the assessment lock", async () => {
  const cases = [
    ["save", (h) => h.call("/classrooms/7/assessments/12", { method: "PUT", body: saveBody() })],
    ["publish", (h) => h.call("/classrooms/7/assessments/12/publish", { method: "POST", body: { version: 1 } })],
    ["unpublish", (h) => {
      h.store.assessments[0].isPublished = true;
      h.store.assessments[0].publishedAt = new Date();
      return h.call("/classrooms/7/assessments/12/unpublish", { method: "POST", body: { version: 1 } });
    }],
    ["delete", (h) => h.call("/classrooms/7/assessments/12", { method: "DELETE" })],
  ];
  for (const [name, invoke] of cases) {
    const h = harness();
    const result = await invoke(h);
    assert.ok([200, 204].includes(result.response.status), name);
    assert.deepEqual(h.store.events.slice(0, 2), ["assessment-lock", "attempt-count"], name);
    const lockIndex = h.store.events.indexOf("assessment-lock");
    h.store.events.forEach((event, index) => {
      if (event.startsWith("attempt-")) assert.ok(index > lockIndex, `${name}: ${event} before lock`);
    });
    while (restorations.length) {
      const [target, property, original] = restorations.pop();
      target[property] = original;
    }
  }
});

test("teacher results enforce classroom ownership and assessment classroom identity", async () => {
  const h = harness({
    assessments: [baseAssessment({ classroomId: 8 })],
    attempts: [submittedAttempt({ classroomId: 8 })],
  });
  const foreignClassroom = await request(
    "/api/teacher/classrooms/8/assessments/12/results",
    { actorId: 5 },
  );
  assert.equal(foreignClassroom.response.status, 403);
  assert.equal(foreignClassroom.payload.code, "FORBIDDEN");

  const substitutedClassroom = await request(
    "/api/teacher/classrooms/7/assessments/12/results",
    { actorId: 5 },
  );
  assert.equal(substitutedClassroom.response.status, 404);
  assert.equal(substitutedClassroom.payload.code, "ASSESSMENT_NOT_FOUND");
  assert.equal(h.store.resultQueries.length, 0);
});

test("results query requests only submitted attempts and allowed student columns", async () => {
  const h = harness({ attempts: [submittedAttempt()] });
  const result = await h.call("/classrooms/7/assessments/12/results");
  assert.equal(result.response.status, 200);
  assert.equal(h.store.resultQueries.length, 1);
  const [options] = h.store.resultQueries;
  assert.deepEqual(options.where, {
    assessmentId: 12,
    classroomId: 7,
    status: "SUBMITTED",
  });
  assert.deepEqual(options.attributes, [
    "id",
    "studentId",
    "attemptNumber",
    "status",
    "submittedAt",
    "pointsEarned",
    "maxPoints",
    "percentage",
    "passed",
  ]);
  assert.equal(options.include.length, 1);
  assert.equal(options.include[0].as, "student");
  assert.deepEqual(options.include[0].attributes, ["id", "firstName", "lastName", "username"]);
});

test("POST rows mark official highest and first submitted independently", async () => {
  const h = harness({ attempts: [
    submittedAttempt({ id: 41, attemptNumber: 1, percentage: 60, pointsEarned: 6,
      submittedAt: new Date("2026-09-25T12:10:00.000Z") }),
    submittedAttempt({ id: 42, attemptNumber: 2, percentage: 90, pointsEarned: 9,
      submittedAt: new Date("2026-09-25T12:20:00.000Z") }),
  ] });
  const result = await h.call("/classrooms/7/assessments/12/results");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.results.map((row) => ({
    attemptId: row.attemptId,
    isOfficial: row.isOfficial,
    isFirstSubmittedPost: row.isFirstSubmittedPost,
  })), [
    { attemptId: 41, isOfficial: false, isFirstSubmittedPost: true },
    { attemptId: 42, isOfficial: true, isFirstSubmittedPost: false },
  ]);
});

test("PRE rows never receive an official highest marker", async () => {
  const h = harness({
    assessments: [baseAssessment({
      type: "PRE",
      title: "Arrays diagnostic",
      passingPercentage: null,
      maxAttempts: 1,
      gradeCalculation: "FIRST",
    })],
    attempts: [submittedAttempt({ percentage: 70, passed: null })],
  });
  const result = await h.call("/classrooms/7/assessments/12/results");
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.results[0].isOfficial, false);
  assert.equal(result.payload.results[0].isFirstSubmittedPost, false);
});

test("result payload excludes responses submission keys and private account fields", async () => {
  const h = harness({ attempts: [submittedAttempt()] });
  const result = await h.call("/classrooms/7/assessments/12/results");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.results[0].student, {
    id: 42,
    firstName: "Ada",
    lastName: "Learner",
    username: "ada",
  });
  const serialized = JSON.stringify(result.payload);
  for (const forbidden of [
    "responses",
    "submissionKey",
    "password",
    "email",
    "researchConsent",
    "questionOrder",
    "choiceOrder",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("result query count is constant as student and attempt counts grow", async () => {
  const attempts = Array.from({ length: 100 }, (_, studentIndex) => (
    Array.from({ length: 3 }, (_, attemptIndex) => submittedAttempt({
      id: studentIndex * 3 + attemptIndex + 1,
      studentId: studentIndex + 1,
      attemptNumber: attemptIndex + 1,
      percentage: 60 + attemptIndex * 10,
      student: baseStudent({ id: studentIndex + 1, username: `student-${studentIndex + 1}` }),
    }))
  )).flat();
  const h = harness({ attempts });
  const result = await h.call("/classrooms/7/assessments/12/results");
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.results.length, 300);
  assert.equal(h.store.resultQueries.length, 1);
  assert.equal(h.store.attemptCounts, 0);
});

test("coding analytics batches submitted response grades without loading source or hidden data", async () => {
  const codingQuestion = baseQuestion({
    id: 202,
    questionText: "Return the array length.",
    questionType: "CODING",
    displayOrder: 1,
    points: 4,
    referenceSolution: "return values.Length;",
  });
  const attempts = [
    submittedAttempt({ id: 44, studentId: 42 }),
    submittedAttempt({ id: 45, studentId: 43, student: baseStudent({ id: 43 }) }),
    submittedAttempt({ id: 46, studentId: 44, status: "IN_PROGRESS", student: baseStudent({ id: 44 }) }),
  ];
  const h = harness({
    questions: [baseQuestion(), codingQuestion],
    attempts,
    responses: [
      { id: 1, attemptId: 44, questionId: 202, sourceCode: "student secret one", isCorrect: true, pointsAwarded: 4 },
      { id: 2, attemptId: 45, questionId: 202, sourceCode: "student secret two", isCorrect: false, pointsAwarded: 2 },
      { id: 3, attemptId: 46, questionId: 202, sourceCode: "unfinished secret", isCorrect: true, pointsAwarded: 4 },
    ],
  });

  const result = await h.call("/classrooms/7/assessments/12/results");

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.codingQuestions, [{
    questionId: 202,
    questionOrder: 2,
    questionLabel: "Return the array length.",
    responseCount: 2,
    fullyCorrectCount: 1,
    fullyCorrectRate: 50,
    averageAwardedPoints: 3,
    maximumPoints: 4,
    averagePercentageEarned: 75,
  }]);
  assert.equal(h.store.codingAnalyticsQueries.length, 1);
  assert.deepEqual(h.store.codingAnalyticsQueries[0].attributes,
    ["questionId", "isCorrect", "pointsAwarded"]);
  assert.deepEqual(h.store.codingAnalyticsQueries[0].include[0].where, {
    assessmentId: 12,
    classroomId: 7,
    status: "SUBMITTED",
  });
  const serialized = JSON.stringify(result.payload);
  for (const forbidden of [
    "sourceCode", "referenceSolution", "codingTestCases", "expectedOutput",
    "gradingLeaseToken", "student secret", "hidden",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});
