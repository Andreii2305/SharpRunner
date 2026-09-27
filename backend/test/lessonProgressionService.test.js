const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Op } = require("sequelize");

let config = null;
let progression = null;

try {
  config = require("../src/constants/lessonProgressionConfig");
  progression = require("../src/services/lessonProgressionService");
} catch {
  // The first TDD run intentionally reaches the assertions before the
  // progression constants and reducer exist.
}

const playableRows = (lessonKey, count, overrides = {}) => Array.from(
  { length: count },
  (_, index) => ({
    levelKey: `${lessonKey}-level-${index + 1}`,
    isCompleted: true,
    ...overrides,
  }),
);

const assessment = (overrides = {}) => ({
  id: 101,
  lessonKey: "arrays",
  type: "PRE",
  isRequired: true,
  isPublished: true,
  maxAttempts: 1,
  requirePassingForCompletion: false,
  ...overrides,
});

const attempt = (overrides = {}) => ({
  id: 1001,
  assessmentId: 101,
  attemptNumber: 1,
  status: "SUBMITTED",
  submittedAt: new Date("2026-09-01T00:00:00.000Z"),
  passed: null,
  ...overrides,
});

const build = ({
  publishedAssessments = [],
  attempts = [],
  progressRows = [],
  levelSettings = [],
} = {}) => {
  assert.ok(config, "lessonProgressionConfig must exist");
  assert.ok(progression, "lessonProgressionService must exist");
  return progression.buildLessonProgressionStates({
    publishedAssessments,
    attempts,
    progressRows,
    levelSettings,
  });
};

test("absent draft and unpublished assessments do not gate legacy progression", () => {
  assert.ok(config, "lessonProgressionConfig must exist");
  assert.deepEqual(config.CANONICAL_LESSON_ORDER, [
    "tutorial",
    "arrays",
    "functions",
    "functions-with-arrays",
    "final",
  ]);
  assert.deepEqual([...config.ASSESSMENT_GATED_LESSON_KEYS], [
    "arrays",
    "functions",
    "functions-with-arrays",
  ]);

  const unpublishedPre = assessment({ id: 11, isPublished: false });
  const unpublishedPost = assessment({ id: 12, type: "POST", isPublished: false });
  const states = build({
    publishedAssessments: [
      unpublishedPre,
      unpublishedPost,
      assessment({ id: 13, lessonKey: "functions", isPublished: undefined }),
    ],
    progressRows: playableRows("tutorial", 5),
  });
  const arrays = states.get("arrays");

  assert.equal(arrays.preRequired, false);
  assert.equal(arrays.preAssessmentId, null);
  assert.equal(arrays.postRequired, false);
  assert.equal(arrays.postAssessmentId, null);
  assert.equal(arrays.moduleUnlocked, true);
  assert.equal(arrays.gameUnlocked, true);
  assert.equal(arrays.nextAction, "PLAY_GAME");
  assert.deepEqual(progression.evaluateAssessmentInteraction({
    assessment: unpublishedPost,
    state: arrays,
  }), { allowed: true, reason: null });
});

test("required PRE is satisfied only by a submitted diagnostic attempt", () => {
  const requiredPre = assessment();
  const base = {
    publishedAssessments: [requiredPre],
    progressRows: playableRows("tutorial", 5),
  };
  const untouched = build(base).get("arrays");
  assert.equal(untouched.preCompleted, false);
  assert.equal(untouched.moduleUnlocked, false);
  assert.equal(untouched.gameUnlocked, false);
  assert.equal(untouched.nextAction, "TAKE_PRE");

  const inProgress = build({
    ...base,
    attempts: [attempt({ status: "IN_PROGRESS", submittedAt: null })],
  }).get("arrays");
  assert.equal(inProgress.preAttemptInProgress, true);
  assert.equal(inProgress.preCompleted, false);
  assert.equal(inProgress.moduleUnlocked, false);
  assert.equal(inProgress.nextAction, "RESUME_PRE");

  const submitted = build({ ...base, attempts: [attempt()] }).get("arrays");
  assert.equal(submitted.preCompleted, true);
  assert.equal(submitted.moduleUnlocked, true);
  assert.equal(submitted.gameUnlocked, true);
  assert.equal(submitted.nextAction, "PLAY_GAME");

  assert.deepEqual(progression.evaluateAssessmentInteraction({
    assessment: requiredPre,
    state: { ...untouched, curriculumPrerequisiteSatisfied: false },
  }), {
    allowed: false,
    reason: "LESSON_PREREQUISITE_REQUIRED",
  });
});

test("required passing POST distinguishes submitted failed passed and exhausted states", () => {
  const requiredPost = assessment({
    id: 202,
    type: "POST",
    maxAttempts: 3,
    requirePassingForCompletion: true,
  });
  const base = {
    publishedAssessments: [requiredPost],
    progressRows: [
      ...playableRows("tutorial", 5),
      ...playableRows("arrays", 8),
    ],
  };

  const notStarted = build(base).get("arrays");
  assert.equal(notStarted.postCompleted, false);
  assert.equal(notStarted.postPassed, false);
  assert.equal(notStarted.postAttemptsUsed, 0);
  assert.equal(notStarted.postAttemptsRemaining, 3);
  assert.equal(notStarted.nextAction, "TAKE_POST");

  const failed = build({
    ...base,
    attempts: [attempt({ assessmentId: 202, passed: false })],
  }).get("arrays");
  assert.equal(failed.postCompleted, true);
  assert.equal(failed.postPassed, false);
  assert.equal(failed.lessonCompleted, false);
  assert.equal(failed.postAttemptsUsed, 1);
  assert.equal(failed.postAttemptsRemaining, 2);
  assert.equal(failed.postAttemptsExhausted, false);
  assert.equal(failed.nextAction, "RETRY_POST");

  const passed = build({
    ...base,
    attempts: [attempt({ assessmentId: 202, passed: true })],
  }).get("arrays");
  assert.equal(passed.postPassed, true);
  assert.equal(passed.assessmentCompleted, true);
  assert.equal(passed.lessonCompleted, true);
  assert.equal(passed.nextAction, "LESSON_COMPLETE");

  const exhausted = build({
    ...base,
    attempts: [1, 2, 3].map((attemptNumber) => attempt({
      id: 210 + attemptNumber,
      assessmentId: 202,
      attemptNumber,
      submittedAt: new Date(`2026-09-0${attemptNumber}T00:00:00.000Z`),
      passed: false,
    })),
  }).get("arrays");
  assert.equal(exhausted.postAttemptsRemaining, 0);
  assert.equal(exhausted.postAttemptsExhausted, true);
  assert.equal(exhausted.nextAction, "POST_RECOVERY_REQUIRED");

  assert.deepEqual(progression.evaluateAssessmentInteraction({
    assessment: requiredPost,
    state: { ...notStarted, gameCompleted: false },
  }), { allowed: false, reason: "GAME_INCOMPLETE" });
});

test("passing-not-required POST is satisfied by any submitted attempt", () => {
  const optionalPassPost = assessment({
    id: 303,
    type: "POST",
    maxAttempts: 2,
    requirePassingForCompletion: false,
  });
  const state = build({
    publishedAssessments: [optionalPassPost],
    attempts: [attempt({ assessmentId: 303, passed: false })],
    progressRows: [
      ...playableRows("tutorial", 5),
      ...playableRows("arrays", 8),
    ],
  }).get("arrays");

  assert.equal(state.postRequired, true);
  assert.equal(state.postPassingRequired, false);
  assert.equal(state.postCompleted, true);
  assert.equal(state.postPassed, false);
  assert.equal(state.assessmentCompleted, true);
  assert.equal(state.lessonCompleted, true);
  assert.equal(state.nextAction, "LESSON_COMPLETE");
});

test("teacher-created active recovery reports zero remaining and RESUME_POST", () => {
  const requiredPost = assessment({
    id: 404,
    type: "POST",
    maxAttempts: 2,
    requirePassingForCompletion: true,
  });
  const state = build({
    publishedAssessments: [requiredPost],
    attempts: [
      attempt({ id: 41, assessmentId: 404, attemptNumber: 1, passed: false }),
      attempt({
        id: 42,
        assessmentId: 404,
        attemptNumber: 2,
        passed: false,
        submittedAt: new Date("2026-09-02T00:00:00.000Z"),
      }),
      attempt({
        id: 43,
        assessmentId: 404,
        attemptNumber: 3,
        status: "IN_PROGRESS",
        submittedAt: null,
        passed: null,
      }),
    ],
    progressRows: [
      ...playableRows("tutorial", 5),
      ...playableRows("arrays", 8),
    ],
  }).get("arrays");

  assert.equal(state.postAttemptsUsed, 2);
  assert.equal(state.postAttemptsRemaining, 0);
  assert.equal(state.postAttemptInProgress, true);
  assert.equal(state.postAttemptsExhausted, false);
  assert.equal(state.nextAction, "RESUME_POST");

  const failedRecovery = build({
    publishedAssessments: [requiredPost],
    attempts: [
      attempt({ id: 41, assessmentId: 404, attemptNumber: 1, passed: false }),
      attempt({ id: 42, assessmentId: 404, attemptNumber: 2, passed: false }),
      attempt({ id: 43, assessmentId: 404, attemptNumber: 3, passed: false }),
    ],
    progressRows: [
      ...playableRows("tutorial", 5),
      ...playableRows("arrays", 8),
    ],
  }).get("arrays");
  assert.equal(failedRecovery.postAttemptsUsed, 3);
  assert.equal(failedRecovery.postAttemptsRemaining, 0);
  assert.equal(failedRecovery.postAttemptsExhausted, true);
  assert.equal(failedRecovery.nextAction, "POST_RECOVERY_REQUIRED");
});

test("official POST pass uses the Phase B highest-attempt selector", () => {
  const requiredPost = assessment({
    id: 505,
    type: "POST",
    maxAttempts: 3,
    requirePassingForCompletion: true,
  });
  const state = build({
    publishedAssessments: [requiredPost],
    attempts: [
      attempt({
        id: 51,
        assessmentId: 505,
        attemptNumber: 1,
        percentage: 90,
        passed: true,
        submittedAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
      attempt({
        id: 52,
        assessmentId: 505,
        attemptNumber: 2,
        percentage: 90,
        passed: false,
        submittedAt: new Date("2026-09-02T00:00:00.000Z"),
      }),
      attempt({
        id: 53,
        assessmentId: 505,
        attemptNumber: 3,
        percentage: 80,
        passed: false,
        submittedAt: new Date("2026-09-03T00:00:00.000Z"),
      }),
      attempt({
        id: 54,
        assessmentId: 505,
        attemptNumber: 4,
        percentage: 95,
        passed: true,
        submittedAt: new Date("2026-09-04T00:00:00.000Z"),
      }),
    ],
    progressRows: [
      ...playableRows("tutorial", 5),
      ...playableRows("arrays", 8),
    ],
  }).get("arrays");

  assert.equal(state.postPassed, true);
  assert.equal(state.lessonCompleted, true);
  assert.equal(state.postAttemptsUsed, 4);
  assert.equal(state.postAttemptsRemaining, 0);
  for (const forbidden of [
    "score",
    "percentage",
    "passingPercentage",
    "questions",
    "answers",
    "answerReviewPolicy",
  ]) {
    assert.equal(Object.hasOwn(state, forbidden), false);
  }
});

test("Functions completion uses 11 playable keys and ignores progress row 12", () => {
  const priorRows = [
    ...playableRows("tutorial", 5),
    ...playableRows("arrays", 8),
  ];
  const elevenComplete = build({
    progressRows: [
      ...priorRows,
      ...playableRows("functions", 11),
      { levelKey: "functions-level-12", isCompleted: false },
    ],
  }).get("functions");
  assert.equal(elevenComplete.gameCompleted, true);

  const tenComplete = build({
    progressRows: [
      ...priorRows,
      ...playableRows("functions", 10),
      { levelKey: "functions-level-11", isCompleted: false },
      { levelKey: "functions-level-12", isCompleted: true },
    ],
  }).get("functions");
  assert.equal(tenComplete.gameCompleted, false);
});

test("tutorial and final remain assessment-exempt with approved completion semantics", () => {
  const finalPre = assessment({ id: 701, lessonKey: "final" });
  const finalPost = assessment({ id: 702, lessonKey: "final", type: "POST", maxAttempts: 3 });
  const states = build({
    publishedAssessments: [finalPre, finalPost],
    attempts: [
      attempt({ assessmentId: 701 }),
      attempt({ assessmentId: 702, passed: false }),
    ],
    progressRows: [
      ...playableRows("tutorial", 5),
      ...playableRows("arrays", 8),
      ...playableRows("functions", 11),
      ...playableRows("functions-with-arrays", 4),
      ...playableRows("final", 1),
    ],
  });
  const tutorial = states.get("tutorial");
  const final = states.get("final");

  assert.deepEqual(tutorial, {
    lessonKey: "tutorial",
    prerequisiteLessonKey: null,
    curriculumPrerequisiteSatisfied: true,
    preRequired: false,
    preAssessmentId: null,
    preUnlocked: false,
    preAttemptInProgress: false,
    preCompleted: false,
    moduleUnlocked: true,
    gameUnlocked: true,
    gameStarted: true,
    gameCompleted: true,
    postRequired: false,
    postAssessmentId: null,
    postUnlocked: false,
    postAttemptInProgress: false,
    postCompleted: false,
    postPassingRequired: false,
    postPassed: false,
    postAttemptsUsed: 0,
    postAttemptsRemaining: 0,
    postAttemptsExhausted: false,
    assessmentCompleted: true,
    lessonCompleted: true,
    nextAction: "LESSON_COMPLETE",
  });
  assert.equal(final.prerequisiteLessonKey, "functions-with-arrays");
  assert.equal(final.curriculumPrerequisiteSatisfied, true);
  assert.equal(final.preRequired, false);
  assert.equal(final.preAssessmentId, null);
  assert.equal(final.postRequired, false);
  assert.equal(final.postAssessmentId, null);
  assert.equal(final.assessmentCompleted, true);
  assert.equal(final.lessonCompleted, true);
  assert.equal(final.nextAction, "LESSON_COMPLETE");

  assert.deepEqual(progression.evaluateAssessmentInteraction({
    assessment: finalPost,
    state: { ...final, curriculumPrerequisiteSatisfied: false, gameCompleted: false },
  }), { allowed: true, reason: null });
});

test("all disabled playable keys form an intentionally complete empty game requirement", () => {
  const state = build({
    progressRows: playableRows("tutorial", 5),
    levelSettings: Array.from({ length: 8 }, (_, index) => ({
      levelKey: `arrays-level-${index + 1}`,
      isEnabled: false,
    })),
  }).get("arrays");

  assert.equal(state.curriculumPrerequisiteSatisfied, true);
  assert.equal(state.gameStarted, false);
  assert.equal(state.gameCompleted, true);
  assert.equal(state.assessmentCompleted, true);
  assert.equal(state.lessonCompleted, true);
  assert.equal(state.nextAction, "LESSON_COMPLETE");
});

const createLoaderHarness = ({
  publishedAssessments = [],
  attempts = [],
  progressRows = [],
  levelSettings = [],
} = {}) => {
  const calls = {
    authorization: [],
    assessments: [],
    attempts: [],
    progress: [],
    settings: [],
  };
  const models = {
    LessonAssessment: {
      findAll: async (options) => {
        calls.assessments.push(options);
        return publishedAssessments;
      },
    },
    AssessmentAttempt: {
      findAll: async (options) => {
        calls.attempts.push(options);
        return attempts;
      },
    },
    UserProgress: {
      findAll: async (options) => {
        calls.progress.push(options);
        return progressRows;
      },
    },
  };
  const authorizationService = {
    requireActiveStudentMembership: async (input) => {
      calls.authorization.push(input);
      return {
        classroomId: input.classroomId,
        studentId: input.studentId,
        status: "active",
      };
    },
  };
  const levelSettingsLoader = async (classroomId, options) => {
    calls.settings.push({ classroomId, options });
    return levelSettings;
  };
  const service = progression.createLessonProgressionService({
    models,
    authorizationService,
    levelSettingsLoader,
  });
  return { calls, service };
};

test("loader requires or validates the exact active classroom membership", async () => {
  const { calls, service } = createLoaderHarness();
  const transaction = { id: "progression-transaction" };

  await service.getLessonProgressionStates({
    classroomId: 7,
    studentId: 42,
    progressRows: [],
    levelSettings: [],
    transaction,
  });
  assert.deepEqual(calls.authorization, [{ classroomId: 7, studentId: 42, transaction }]);

  const membership = { classroomId: 7, studentId: 42, status: "active" };
  await service.getLessonProgressionStates({
    classroomId: 7,
    studentId: 42,
    authorizedMembership: membership,
    progressRows: [],
    levelSettings: [],
  });
  assert.equal(calls.authorization.length, 1);

  for (const invalidMembership of [
    { classroomId: 8, studentId: 42, status: "active" },
    { classroomId: 7, studentId: 43, status: "active" },
    { classroomId: 7, studentId: 42, status: "removed" },
  ]) {
    await assert.rejects(
      service.getLessonProgressionStates({
        classroomId: 7,
        studentId: 42,
        authorizedMembership: invalidMembership,
        progressRows: [],
        levelSettings: [],
      }),
      (error) => error?.code === "FORBIDDEN" && error?.message === "Forbidden",
    );
  }
});

test("full-map loading batches exact-class assessments and attempts with safe columns", async () => {
  const publishedAssessments = [
    assessment({ id: 101, classroomId: 7 }),
    assessment({ id: 102, classroomId: 7, type: "POST", maxAttempts: 3 }),
  ];
  const { calls, service } = createLoaderHarness({
    publishedAssessments,
    attempts: [attempt({ assessmentId: 101, classroomId: 7, studentId: 42 })],
  });
  const transaction = { id: "batch-transaction" };

  await service.getLessonProgressionStates({
    classroomId: 7,
    studentId: 42,
    authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
    transaction,
  });

  assert.equal(calls.assessments.length, 1);
  assert.equal(calls.attempts.length, 1);
  assert.equal(calls.progress.length, 1);
  assert.equal(calls.settings.length, 1);
  assert.deepEqual(calls.assessments[0].where, {
    classroomId: 7,
    isPublished: true,
    lessonKey: { [Op.in]: ["arrays", "functions", "functions-with-arrays"] },
    type: { [Op.in]: ["PRE", "POST"] },
  });
  assert.deepEqual(calls.assessments[0].attributes, [
    "id",
    "classroomId",
    "lessonKey",
    "type",
    "isRequired",
    "isPublished",
    "maxAttempts",
    "requirePassingForCompletion",
  ]);
  assert.equal(Object.hasOwn(calls.assessments[0], "include"), false);
  assert.deepEqual(calls.attempts[0].where, {
    classroomId: 7,
    studentId: 42,
    assessmentId: { [Op.in]: [101, 102] },
  });
  assert.deepEqual(calls.attempts[0].attributes, [
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
  assert.equal(Object.hasOwn(calls.attempts[0], "include"), false);
  assert.equal(calls.assessments[0].transaction, transaction);
  assert.equal(calls.attempts[0].transaction, transaction);
  assert.equal(calls.progress[0].transaction, transaction);
  assert.deepEqual(calls.settings, [{ classroomId: 7, options: { transaction } }]);
});

test("real settings helper forwards the caller transaction and preserves one-argument calls", async (t) => {
  const LevelContentOverride = require("../src/models/LevelContentOverride");
  const { getClassroomLevelSettings } = require("../src/services/classroomLevelSettingsService");
  const queries = [];
  t.mock.method(LevelContentOverride, "findAll", async (options) => {
    queries.push(options);
    return [{ levelKey: "arrays-level-1", isEnabled: false }];
  });
  const transaction = { id: "settings-transaction" };
  const settings = await getClassroomLevelSettings(7, { transaction });
  assert.equal(queries[0].transaction, transaction);
  assert.deepEqual(queries[0].where, { classroomId: 7 });
  assert.equal(settings.find(({ levelKey }) => levelKey === "arrays-level-1").isEnabled, false);
  assert.deepEqual(await getClassroomLevelSettings(7), settings);
  assert.equal(queries[1].transaction, undefined);
});

test("progression settings use held transaction connections when all five pool slots are occupied", async (t) => {
  const { Pool } = require("sequelize-pool");
  const sequelize = require("../src/config/database");
  let connectionId = 0;
  const pool = new Pool({
    name: "progression-regression", min: 0, max: 5, acquireTimeoutMillis: 30,
    create: async () => ({ id: ++connectionId }), destroy: async () => {}, validate: () => true,
  });
  const held = await Promise.all(Array.from({ length: 5 }, () => pool.acquire()));
  const transactions = held.map((connection) => ({ connection }));
  let extraAcquisitions = 0;
  const usedConnections = [];
  t.mock.method(sequelize.connectionManager, "getConnection", async () => {
    extraAcquisitions += 1;
    return pool.acquire();
  });
  t.mock.method(sequelize.dialect.Query.prototype, "run", async function run() {
    usedConnections.push(this.connection);
    return [];
  });
  const service = progression.createLessonProgressionService({
    models: { LessonAssessment: { findAll: async () => [] } },
  });
  try {
    assert.equal(pool.available, 0);
    const results = await Promise.allSettled(transactions.map((transaction) => (
      service.getLessonProgressionStates({
        classroomId: 7, studentId: 42, transaction,
        authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
        progressRows: playableRows("tutorial", 5),
      })
    )));
    assert.deepEqual(results.map(({ status }) => status), Array(5).fill("fulfilled"));
    assert.equal(extraAcquisitions, 0);
    assert.deepEqual(new Set(usedConnections), new Set(held));
    for (const { value } of results) assert.equal(value.get("arrays").gameUnlocked, true);
  } finally {
    for (const connection of held) pool.release(connection);
    await pool.drain();
    await pool.destroyAllNow();
  }
});

test("empty assessment sets skip attempts and supplied progress/settings skip duplicate reads", async () => {
  const { calls, service } = createLoaderHarness();
  const suppliedProgress = playableRows("tutorial", 5);
  const suppliedSettings = [{ levelKey: "arrays-level-1", isEnabled: false }];

  const states = await service.getLessonProgressionStates({
    classroomId: 7,
    studentId: 42,
    authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
    progressRows: suppliedProgress,
    levelSettings: suppliedSettings,
  });

  assert.equal(calls.assessments.length, 1);
  assert.equal(calls.attempts.length, 0);
  assert.equal(calls.progress.length, 0);
  assert.equal(calls.settings.length, 0);
  assert.equal(states.get("tutorial").gameCompleted, true);
});

test("one-lesson loading set-queries only the target canonical prefix", async () => {
  const prefixAssessments = [assessment({ id: 201, classroomId: 7, lessonKey: "arrays" })];
  const { calls, service } = createLoaderHarness({ publishedAssessments: prefixAssessments });

  const state = await service.getLessonProgressionState({
    classroomId: 7,
    studentId: 42,
    lessonKey: "functions",
    authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
  });

  assert.equal(state.lessonKey, "functions");
  assert.equal(calls.assessments.length, 1);
  assert.equal(calls.attempts.length, 1);
  assert.equal(calls.progress.length, 1);
  assert.equal(calls.settings.length, 1);
  assert.deepEqual(calls.assessments[0].where.lessonKey[Op.in], ["arrays", "functions"]);
  assert.deepEqual(calls.progress[0].where, {
    userId: 42,
    levelKey: {
      [Op.in]: [
        ...Array.from({ length: 5 }, (_, index) => `tutorial-level-${index + 1}`),
        ...Array.from({ length: 8 }, (_, index) => `arrays-level-${index + 1}`),
        ...Array.from({ length: 11 }, (_, index) => `functions-level-${index + 1}`),
      ],
    },
  });
});

test("account-global game completion survives transfer while foreign assessment state is ignored", async () => {
  const localPre = assessment({ id: 301, classroomId: 7 });
  const foreignPre = assessment({ id: 302, classroomId: 8 });
  const { calls, service } = createLoaderHarness({
    publishedAssessments: [localPre, foreignPre],
    attempts: [
      attempt({ id: 3001, assessmentId: 301, classroomId: 8, studentId: 42 }),
      attempt({ id: 3002, assessmentId: 301, classroomId: 7, studentId: 99 }),
      attempt({ id: 3003, assessmentId: 302, classroomId: 8, studentId: 42 }),
    ],
    progressRows: [
      ...playableRows("tutorial", 5),
      ...playableRows("arrays", 8),
    ],
  });

  const states = await service.getLessonProgressionStates({
    classroomId: 7,
    studentId: 42,
    authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
    levelSettings: [],
  });
  const arrays = states.get("arrays");

  assert.deepEqual(calls.attempts[0].where.assessmentId[Op.in], [301]);
  assert.equal(arrays.gameCompleted, true);
  assert.equal(arrays.preRequired, true);
  assert.equal(arrays.preCompleted, false);
  assert.equal(arrays.lessonCompleted, false);
});

test("assessment guard throws only safe progression context", async () => {
  const publishedPost = assessment({
    id: 401,
    classroomId: 7,
    type: "POST",
    maxAttempts: 3,
    secretAnswer: "must never escape",
  });
  const { service } = createLoaderHarness({
    publishedAssessments: [publishedPost],
    progressRows: playableRows("tutorial", 5),
  });

  await assert.rejects(
    service.assertAssessmentInteractionAllowed({
      assessment: publishedPost,
      studentId: 42,
      authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
    }),
    (error) => {
      assert.equal(error.code, "POST_ASSESSMENT_LOCKED");
      assert.equal(error.message, "Complete the lesson game progression before opening the post-test.");
      assert.equal(error.lessonKey, "arrays");
      assert.equal(error.nextAction, "PLAY_GAME");
      assert.deepEqual(Object.keys(error).sort(), [
        "code",
        "lessonKey",
        "nextAction",
      ]);
      assert.equal(error.assessment, undefined);
      assert.equal(error.state, undefined);
      assert.equal(error.details, undefined);
      assert.equal(error.secretAnswer, undefined);
      return true;
    },
  );
});

test("assessment guard preserves prerequisite denial with only its applicable identifier", async () => {
  const functionsPre = assessment({
    id: 501,
    classroomId: 7,
    lessonKey: "functions",
    secretAnswer: "must never escape",
  });
  const { service } = createLoaderHarness({
    publishedAssessments: [functionsPre],
    progressRows: playableRows("tutorial", 5),
  });

  await assert.rejects(
    service.assertAssessmentInteractionAllowed({
      assessment: functionsPre,
      studentId: 42,
      authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
    }),
    (error) => {
      assert.equal(error.code, "LESSON_PREREQUISITE_REQUIRED");
      assert.equal(error.message, "Complete the prerequisite lesson before opening this lesson.");
      assert.equal(error.lessonKey, "functions");
      assert.equal(error.prerequisiteLessonKey, "arrays");
      assert.equal(error.assessmentId, undefined);
      assert.equal(error.nextAction, "COMPLETE_PREREQUISITE_LESSON");
      assert.deepEqual(Object.keys(error).sort(), [
        "code",
        "lessonKey",
        "nextAction",
        "prerequisiteLessonKey",
      ]);
      return true;
    },
  );
});

test("assessment guard preserves required-PRE denial with only the PRE assessment identifier", async () => {
  const requiredPre = assessment({ id: 601, classroomId: 7 });
  const arraysPost = assessment({
    id: 602,
    classroomId: 7,
    type: "POST",
    maxAttempts: 3,
    secretAnswer: "must never escape",
  });
  const { service } = createLoaderHarness({
    publishedAssessments: [requiredPre, arraysPost],
    progressRows: [
      ...playableRows("tutorial", 5),
      ...playableRows("arrays", 8),
    ],
  });

  await assert.rejects(
    service.assertAssessmentInteractionAllowed({
      assessment: arraysPost,
      studentId: 42,
      authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
    }),
    (error) => {
      assert.equal(error.code, "PRE_ASSESSMENT_REQUIRED");
      assert.equal(error.message, "Complete the required pre-test before opening this lesson.");
      assert.equal(error.lessonKey, "arrays");
      assert.equal(error.assessmentId, 601);
      assert.equal(error.prerequisiteLessonKey, undefined);
      assert.equal(error.nextAction, "TAKE_PRE");
      assert.deepEqual(Object.keys(error).sort(), [
        "assessmentId",
        "code",
        "lessonKey",
        "nextAction",
      ]);
      return true;
    },
  );
});

test("assessment guard permits unlocked published PRE and unpublished assessment paths", async () => {
  const publishedPre = assessment({ id: 701, classroomId: 7 });
  const publishedHarness = createLoaderHarness({
    publishedAssessments: [publishedPre],
    progressRows: playableRows("tutorial", 5),
  });

  const publishedDecision = await publishedHarness.service.assertAssessmentInteractionAllowed({
    assessment: publishedPre,
    studentId: 42,
    authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
  });
  assert.equal(publishedDecision.allowed, true);
  assert.equal(publishedDecision.reason, null);
  assert.equal(publishedDecision.state.lessonKey, "arrays");

  const unpublishedPost = assessment({
    id: 702,
    classroomId: 7,
    lessonKey: "functions",
    type: "POST",
    isPublished: false,
    secretAnswer: "must never escape",
  });
  const unpublishedHarness = createLoaderHarness();
  const unpublishedDecision = await unpublishedHarness.service.assertAssessmentInteractionAllowed({
    assessment: unpublishedPost,
    studentId: 42,
    authorizedMembership: { classroomId: 7, studentId: 42, status: "active" },
  });
  assert.equal(unpublishedDecision.allowed, true);
  assert.equal(unpublishedDecision.reason, null);
  assert.equal(unpublishedDecision.state.lessonKey, "functions");
});
