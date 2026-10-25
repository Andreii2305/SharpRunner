const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { after, afterEach, before, test } = require("node:test");

process.env.JWT_SECRET = "teacher-assessment-attention-integration-secret";

const models = require("../src/models");
const app = require("../src/app");
const progressionService = require("../src/services/lessonProgressionService");
const { PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require("../src/constants/policyVersions");

const restorations = [];
let server;
let baseUrl;

const stub = (target, property, replacement) => {
  restorations.push([target, property, target[property]]);
  target[property] = replacement;
};

const withStubs = async (pairs, callback) => {
  const originals = pairs.map(([target, property]) => [target, property, target[property]]);
  for (const [target, property, replacement] of pairs) target[property] = replacement;
  try {
    return await callback();
  } finally {
    for (const [target, property, original] of originals.reverse()) target[property] = original;
  }
};

const activeUser = (id, role) => ({
  id,
  role,
  status: "active",
  tokenVersion: 0,
  termsVersionAccepted: TERMS_VERSION,
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
});

const token = (id, role) => jwt.sign(
  { id, role, tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);

const request = async (path, { id, role = "teacher" } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: id ? { Authorization: `Bearer ${token(id, role)}` } : {},
  });
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
};

const inValues = (value) => value?.[Op.in] ?? null;
const matches = (row, where = {}) => Object.entries(where).every(([key, expected]) => {
  const values = inValues(expected);
  return values ? values.includes(row[key]) : row[key] === expected;
});

const completedProgress = (studentId, lessonKeys = ["tutorial", "arrays"]) => (
  PLAYABLE_LEVEL_KEYS
    .filter((levelKey) => lessonKeys.some((lessonKey) => levelKey.startsWith(`${lessonKey}-level-`)))
    .map((levelKey) => ({
      userId: studentId,
      levelKey,
      isCompleted: true,
      startedAt: new Date("2026-10-01T00:00:00.000Z"),
      progressPercent: 100,
      attemptCount: 1,
    }))
);

const postAssessment = (overrides = {}) => ({
  id: 20,
  classroomId: 7,
  targetKind: "BUILT_IN",
  lessonKey: "arrays",
  type: "POST",
  title: "Arrays post-assessment",
  isRequired: true,
  isPublished: true,
  maxAttempts: 2,
  requirePassingForCompletion: true,
  ...overrides,
});

const submittedAttempt = ({ studentId, attemptNumber, id, assessmentId = 20, passed = false }) => ({
  id,
  assessmentId,
  classroomId: 7,
  studentId,
  attemptNumber,
  status: "SUBMITTED",
  submittedAt: new Date(`2026-10-${String(attemptNumber).padStart(2, "0")}T00:00:00.000Z`),
  percentage: passed ? 90 : 50 + attemptNumber,
  passed,
});

const membership = (student) => ({
  classroomId: 7,
  studentId: student.id,
  status: "active",
  student,
});

const installAttentionStore = ({
  classroom = {
    id: 7,
    teacherId: 5,
    className: "Algorithms",
    section: "A",
    schoolYear: "2026-2027",
    isActive: true,
  },
  memberships = [],
  assessments = [],
  attempts = [],
  grants = [],
  progress = [],
  overrides = [],
} = {}) => {
  const calls = {
    classrooms: 0,
    memberships: 0,
    assessments: 0,
    attempts: 0,
    grants: 0,
    progress: 0,
    settings: 0,
    queries: {},
  };

  const filterAssessments = (options = {}) => assessments
    .filter((row) => matches(row, options.where))
    .map((row) => ({
      ...row,
      ...(options.include ? {
        attemptGrants: grants.filter((grant) => (
          grant.assessmentId === row.id
          && matches(grant, options.include[0].where)
        )),
      } : {}),
    }));

  const pairs = [
    [models.User, "findByPk", async (id) => {
      const roles = { 5: "teacher", 6: "teacher", 9: "admin", 42: "student" };
      return roles[Number(id)] ? activeUser(Number(id), roles[Number(id)]) : null;
    }],
    [models.Classroom, "findByPk", async (id) => {
      calls.classrooms += 1;
      return Number(id) === Number(classroom?.id) ? classroom : null;
    }],
    [models.ClassroomMembership, "findAll", async (options = {}) => {
      calls.memberships += 1;
      calls.queries.memberships = options;
      return memberships.filter((row) => matches(row, options.where));
    }],
    [models.LessonAssessment, "findAll", async (options = {}) => {
      calls.assessments += 1;
      calls.queries.assessments = options;
      return filterAssessments(options);
    }],
    [models.AssessmentAttempt, "findAll", async (options = {}) => {
      calls.attempts += 1;
      calls.queries.attempts = options;
      return attempts.filter((row) => matches(row, options.where));
    }],
    [models.AssessmentAttemptGrant, "findAll", async (options = {}) => {
      calls.grants += 1;
      calls.queries.grants = options;
      return grants.filter((row) => matches(row, options.where));
    }],
    [models.UserProgress, "findAll", async (options = {}) => {
      calls.progress += 1;
      calls.queries.progress = options;
      return progress.filter((row) => matches(row, options.where));
    }],
    [models.LevelContentOverride, "findAll", async (options = {}) => {
      calls.settings += 1;
      calls.queries.settings = options;
      return overrides.filter((row) => matches(row, options.where));
    }],
  ];

  return { calls, pairs };
};

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterEach(() => {
  while (restorations.length) {
    const [target, property, original] = restorations.pop();
    target[property] = original;
  }
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("assessment-recovery attention batches exact-scope inputs and matches the production progression path", async () => {
  const students = [
    { id: 48, firstName: "Aaron", lastName: "Young", username: "aaron", role: "student", status: "active" },
    { id: 42, firstName: "ada", lastName: "Zeal", username: "ada", role: "student", status: "active" },
    { id: 43, firstName: "Bea", lastName: "Remaining", username: "bea", role: "student", status: "active" },
    { id: 44, firstName: "Cal", lastName: "Granted", username: "cal", role: "student", status: "active" },
    { id: 45, firstName: "Dee", lastName: "Active", username: "dee", role: "student", status: "active" },
    { id: 46, firstName: "Eli", lastName: "Grading", username: "eli", role: "student", status: "active" },
    { id: 47, firstName: "Fay", lastName: "Passed", username: "fay", role: "student", status: "active" },
    { id: 49, firstName: "Gia", lastName: "Blocked", username: "gia", role: "student", status: "active" },
  ];
  const attempts = [
    submittedAttempt({ studentId: 42, attemptNumber: 1, id: 421 }),
    submittedAttempt({ studentId: 42, attemptNumber: 2, id: 422 }),
    submittedAttempt({ studentId: 48, attemptNumber: 1, id: 481 }),
    submittedAttempt({ studentId: 48, attemptNumber: 2, id: 482 }),
    submittedAttempt({ studentId: 48, attemptNumber: 3, id: 483 }),
    submittedAttempt({ studentId: 43, attemptNumber: 1, id: 431 }),
    submittedAttempt({ studentId: 44, attemptNumber: 1, id: 441 }),
    submittedAttempt({ studentId: 44, attemptNumber: 2, id: 442 }),
    submittedAttempt({ studentId: 45, attemptNumber: 1, id: 451 }),
    submittedAttempt({ studentId: 45, attemptNumber: 2, id: 452 }),
    { ...submittedAttempt({ studentId: 45, attemptNumber: 3, id: 453 }), status: "IN_PROGRESS", submittedAt: null, percentage: null, passed: null },
    submittedAttempt({ studentId: 46, attemptNumber: 1, id: 461 }),
    submittedAttempt({ studentId: 46, attemptNumber: 2, id: 462 }),
    { ...submittedAttempt({ studentId: 46, attemptNumber: 3, id: 463 }), status: "GRADING", submittedAt: null, percentage: null, passed: null },
    submittedAttempt({ studentId: 47, attemptNumber: 1, id: 471 }),
    submittedAttempt({ studentId: 47, attemptNumber: 2, id: 472, passed: true }),
    submittedAttempt({ studentId: 49, attemptNumber: 1, id: 491 }),
    submittedAttempt({ studentId: 49, attemptNumber: 2, id: 492 }),
  ];
  const grants = [
    { id: 1, assessmentId: 20, classroomId: 7, studentId: 48, consumedByAttemptId: 483 },
    { id: 2, assessmentId: 20, classroomId: 7, studentId: 44, consumedByAttemptId: null },
  ];
  const progress = students
    .filter((student) => student.id !== 49)
    .flatMap((student) => completedProgress(student.id));
  const store = installAttentionStore({
    memberships: students.map(membership),
    assessments: [postAssessment()],
    attempts,
    grants,
    progress,
  });

  await withStubs(store.pairs, async () => {
    const result = await request(
      "/api/teacher/classrooms/7/students-needing-attention?limit=1",
      { id: 5 },
    );

    assert.equal(result.response.status, 200);
    assert.deepEqual(result.payload, {
      classroom: {
        id: 7,
        className: "Algorithms",
        section: "A",
        schoolYear: "2026-2027",
      },
      students: [{
        id: 48,
        firstName: "Aaron",
        lastName: "Young",
        username: "aaron",
        reasons: [{
          code: "POST_RECOVERY_REQUIRED",
          assessment: { id: 20, title: "Arrays post-assessment", type: "POST" },
          target: { kind: "BUILT_IN", lessonKey: "arrays", lessonTitle: "Arrays" },
          message: "No POST attempts remain for Arrays post-assessment; teacher recovery is required.",
        }],
      }],
      total: 2,
      limit: 1,
    });

    assert.deepEqual({
      memberships: store.calls.memberships,
      assessments: store.calls.assessments,
      attempts: store.calls.attempts,
      grants: store.calls.grants,
      progress: store.calls.progress,
      settings: store.calls.settings,
    }, { memberships: 1, assessments: 1, attempts: 1, grants: 1, progress: 1, settings: 1 });
    assert.deepEqual(store.calls.queries.memberships.where, { classroomId: 7, status: "active" });
    assert.deepEqual(store.calls.queries.memberships.include[0].where, {
      role: "student",
      status: "active",
    });
    assert.deepEqual(store.calls.queries.memberships.include[0].attributes, [
      "id",
      "firstName",
      "lastName",
      "username",
    ]);
    assert.equal(store.calls.queries.assessments.where.classroomId, 7);
    assert.equal(store.calls.queries.assessments.where.targetKind, "BUILT_IN");
    assert.equal(store.calls.queries.attempts.where.classroomId, 7);
    assert.equal(store.calls.queries.grants.where.classroomId, 7);
    assert.deepEqual(store.calls.queries.settings.where, { classroomId: 7 });

    const settings = PLAYABLE_LEVEL_KEYS.map((levelKey) => ({ levelKey, isEnabled: true }));
    const states = await progressionService.getLessonProgressionStates({
      classroomId: 7,
      studentId: 48,
      authorizedMembership: { classroomId: 7, studentId: 48, status: "active" },
      progressRows: progress.filter((row) => row.userId === 48),
      levelSettings: settings,
    });
    const debt = progressionService.resolveRequiredAssessmentDebt(states.get("arrays"));
    assert.equal(debt.assessmentAction, result.payload.students[0].reasons[0].code);
    assert.equal(debt.assessmentId, result.payload.students[0].reasons[0].assessment.id);
  });
});

test("attention preserves historical selection while excluding unpublished optional custom and blocked progression", async () => {
  const student = {
    id: 42,
    firstName: "Ada",
    lastName: "Learner",
    username: "ada",
    role: "student",
    status: "active",
  };
  const assessments = [
    postAssessment({ id: 19, type: "PRE", title: "Required PRE", maxAttempts: 1, requirePassingForCompletion: false }),
    postAssessment(),
    postAssessment({ id: 30, lessonKey: "functions", title: "Optional POST", isRequired: false }),
    postAssessment({ id: 40, lessonKey: "functions-with-arrays", title: "Old unpublished POST", isPublished: false }),
    postAssessment({
      id: 50,
      targetKind: "CLASSROOM_LESSON_PLACEMENT",
      lessonKey: null,
      classroomLessonPlacementId: 71,
      title: "Custom POST",
    }),
    postAssessment({ id: 60, classroomId: 8, title: "Foreign classroom POST" }),
  ];
  const attempts = [
    submittedAttempt({ studentId: 42, attemptNumber: 1, id: 421 }),
    submittedAttempt({ studentId: 42, attemptNumber: 2, id: 422 }),
    submittedAttempt({ studentId: 42, attemptNumber: 1, id: 401, assessmentId: 40 }),
    submittedAttempt({ studentId: 42, attemptNumber: 2, id: 402, assessmentId: 40 }),
  ];
  const store = installAttentionStore({
    memberships: [membership(student)],
    assessments,
    attempts,
    progress: completedProgress(42, ["tutorial", "arrays", "functions", "functions-with-arrays"]),
  });

  await withStubs(store.pairs, async () => {
    const result = await request(
      "/api/teacher/classrooms/7/students-needing-attention",
      { id: 5 },
    );
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.payload.students, []);
    assert.equal(result.payload.total, 0);
    assert.equal(result.payload.limit, 5);

    assert.equal(Object.hasOwn(store.calls.queries.assessments.where, "isPublished"), false);
    assert.equal(store.calls.queries.assessments.where.targetKind, "BUILT_IN");
    assert.deepEqual(inValues(store.calls.queries.attempts.where.assessmentId).sort((a, b) => a - b), [19, 20, 30, 40]);
  });
});

test("attention validates strictly and authorizes before inactive or downstream classroom data", async () => {
  const downstream = { memberships: 0, assessments: 0 };
  const users = { 5: "teacher", 6: "teacher", 9: "admin", 42: "student" };
  const classroom = {
    id: 7,
    teacherId: 5,
    className: "Algorithms",
    section: "A",
    schoolYear: "2026-2027",
    isActive: false,
  };

  await withStubs([
    [models.User, "findByPk", async (id) => users[Number(id)] ? activeUser(Number(id), users[Number(id)]) : null],
    [models.Classroom, "findByPk", async (id) => Number(id) === 7 ? classroom : null],
    [models.ClassroomMembership, "findAll", async () => { downstream.memberships += 1; return []; }],
    [models.LessonAssessment, "findAll", async () => { downstream.assessments += 1; return []; }],
  ], async () => {
    for (const path of [
      "/api/teacher/classrooms/0/students-needing-attention",
      "/api/teacher/classrooms/1.5/students-needing-attention",
      "/api/teacher/classrooms/9007199254740992/students-needing-attention",
      "/api/teacher/classrooms/7/students-needing-attention?limit=0",
      "/api/teacher/classrooms/7/students-needing-attention?limit=101",
      "/api/teacher/classrooms/7/students-needing-attention?limit=1.5",
      "/api/teacher/classrooms/7/students-needing-attention?limit=5&limit=6",
      "/api/teacher/classrooms/7/students-needing-attention?page=1",
    ]) {
      const invalid = await request(path, { id: 5 });
      assert.equal(invalid.response.status, 400, path);
      assert.deepEqual(invalid.payload, { code: "INVALID_REQUEST", message: "Invalid request" }, path);
    }

    const unauthenticated = await request("/api/teacher/classrooms/7/students-needing-attention");
    assert.equal(unauthenticated.response.status, 401);

    const student = await request(
      "/api/teacher/classrooms/7/students-needing-attention",
      { id: 42, role: "student" },
    );
    assert.equal(student.response.status, 403);

    const foreign = await request(
      "/api/teacher/classrooms/7/students-needing-attention",
      { id: 6 },
    );
    assert.equal(foreign.response.status, 403);
    assert.deepEqual(foreign.payload, { code: "FORBIDDEN", message: "Forbidden" });

    const inactive = await request(
      "/api/teacher/classrooms/7/students-needing-attention",
      { id: 5 },
    );
    assert.equal(inactive.response.status, 409);
    assert.deepEqual(inactive.payload, {
      code: "CLASSROOM_INACTIVE",
      message: "Classroom is inactive",
    });

    const missing = await request(
      "/api/teacher/classrooms/8/students-needing-attention",
      { id: 5 },
    );
    assert.equal(missing.response.status, 404);
    assert.deepEqual(missing.payload, {
      code: "CLASSROOM_NOT_FOUND",
      message: "Classroom was not found",
    });

    assert.deepEqual(downstream, { memberships: 0, assessments: 0 });
  });
});

test("admin can read an active empty classroom without running assessment queries", async () => {
  const store = installAttentionStore({ memberships: [] });
  await withStubs(store.pairs, async () => {
    const result = await request(
      "/api/teacher/classrooms/7/students-needing-attention?limit=100",
      { id: 9, role: "admin" },
    );
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.payload.students, []);
    assert.equal(result.payload.total, 0);
    assert.equal(result.payload.limit, 100);
    assert.equal(store.calls.memberships, 1);
    assert.deepEqual({
      assessments: store.calls.assessments,
      attempts: store.calls.attempts,
      grants: store.calls.grants,
      progress: store.calls.progress,
      settings: store.calls.settings,
    }, { assessments: 0, attempts: 0, grants: 0, progress: 0, settings: 0 });
  });
});
