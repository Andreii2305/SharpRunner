const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const progressionService = require("../src/services/lessonProgressionService");
const { buildProgressSummary } = require("../src/services/progressService");
const { evaluateStudentLevelAccess } = require("../src/services/levelAccessService");
const { DEFAULT_LEVEL_PROGRESS, PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require("../src/constants/policyVersions");
const {
  User, UserProgress, ClassroomMembership, LevelContentOverride,
  LessonAssessment, AssessmentAttempt,
} = require("../src/models");

process.env.JWT_SECRET = "lesson-progression-route-test-secret";
const stateCalls = [];
const loadStates = progressionService.getLessonProgressionStates;
// Observe the route boundary while exercising the real default loader/reducer.
progressionService.getLessonProgressionStates = async (options) => {
  stateCalls.push(options);
  return loadStates(options);
};
const app = require("../src/app");
progressionService.getLessonProgressionStates = loadStates;
let server;
let baseUrl;
before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve, reject) => {
  if (!server) return resolve();
  server.close((error) => error ? reject(error) : resolve());
}));

const LEGACY_LESSON_FIELDS = new Set([
  "lessonKey", "lessonTitle", "progressPercent", "completedLevels", "totalLevels",
  "isCompleted", "levelsCleared", "timeSpent",
]);
const CANONICAL_LESSON_OVERLAY_FIELDS = [
  "prerequisiteLessonKey", "curriculumPrerequisiteSatisfied", "preRequired",
  "preAssessmentId", "preUnlocked", "preAttemptInProgress", "preCompleted",
  "moduleUnlocked", "gameUnlocked", "gameStarted", "gameCompleted", "postRequired",
  "postAssessmentId", "postUnlocked", "postAttemptInProgress", "postCompleted",
  "postPassingRequired", "postPassed", "postAttemptsUsed", "postAttemptsRemaining",
  "postAttemptsExhausted", "assessmentCompleted", "lessonCompleted", "nextAction",
].sort();
const CANONICAL_SUMMARY_FIELDS = [
  "gameCompletedLessons", "assessmentCompletedLessons", "lessonCompletedLessons",
  "nextAction", "nextActionLessonKey",
].sort();
const LEGACY_SUMMARY_FIELDS = new Set([
  "overallProgress", "completedLessons", "totalLessons", "completedLevels",
  "totalLevelsCleared", "totalLevels", "currentLesson", "currentLessonKey",
  "currentLevelKey", "currentLevelName", "currentLevelHint", "xp", "xpToNextLevel",
  "classRank", "classSize", "totalTimePlayed", "commonMistakes",
]);
const forbiddenProgressionKeys = new Set([
  "percentage", "pointsEarned", "score", "finalScore", "maxScore", "passingScore",
  "passingPercentage", "passingThreshold", "requirePassingForCompletion", "gradingKey",
  "gradingReference", "gradeReference", "gradeReferenceId", "correctChoiceId", "isCorrect",
  "answerKey", "answerKeyId", "explanation", "questions", "choices", "answers",
  "reviewPolicy", "allowReview", "reviewAnswers", "showAnswers",
  "scoreVisibility", "showScore", "shuffleQuestions", "shuffleChoices", "questionOrder",
  "choiceOrder", "displayOrder", "orderIndex", "assessmentOrder", "maxAttempts", "isRequired",
  "isPublished", "assessmentId", "attemptNumber", "submittedAt", "status",
  "attemptIdempotencyKey", "idempotencyKey", "submissionKey", "submissionToken",
  "submissionSignature",
]);
const assertNoProgressionLeaks = (value, path = "progression") => {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(forbiddenProgressionKeys.has(key), false, `${path}.${key} must not leak`);
    assertNoProgressionLeaks(nested, `${path}.${key}`);
  }
};

const assertCanonicalProgressionEnvelope = (payload, classroomId = 9) => {
  assert.equal(payload.classroomId, classroomId);
  assert.deepEqual(
    Object.keys(payload).sort(),
    ["classroomId", "lessons", "levels", "summary"],
  );
  assert.deepEqual(
    Object.keys(payload.summary)
      .filter((key) => !LEGACY_SUMMARY_FIELDS.has(key))
      .sort(),
    CANONICAL_SUMMARY_FIELDS,
  );
  for (const lesson of payload.lessons) {
    const overlayKeys = Object.keys(lesson)
      .filter((key) => !LEGACY_LESSON_FIELDS.has(key))
      .sort();
    assert.deepEqual(overlayKeys, CANONICAL_LESSON_OVERLAY_FIELDS);
  }
  assertNoProgressionLeaks({
    classroomId: payload.classroomId,
    summary: Object.fromEntries(
      CANONICAL_SUMMARY_FIELDS.map((key) => [key, payload.summary[key]]),
    ),
    lessons: payload.lessons.map((lesson) => Object.fromEntries(
      CANONICAL_LESSON_OVERLAY_FIELDS.map((key) => [key, lesson[key]]),
    )),
  });
};

const progressRows = () => DEFAULT_LEVEL_PROGRESS.map((level, index) => ({
  ...level,
  id: index + 1,
  userId: 7,
  progressPercent: /^(tutorial|arrays)-/.test(level.levelKey) ? 100 : 0,
  isCompleted: /^(tutorial|arrays)-/.test(level.levelKey),
  completedAt: null,
}));
const playableRows = (rows) => rows.filter((row) => PLAYABLE_LEVEL_KEYS.includes(row.levelKey));
const pendingPost = {
  id: 92, classroomId: 9, lessonKey: "arrays", type: "POST",
  isPublished: true, isRequired: true, maxAttempts: 2,
  requirePassingForCompletion: true,
  passingThreshold: 75, reviewPolicy: "AFTER_SUBMISSION", scoreVisibility: "TEACHER_ONLY",
  shuffleQuestions: true, shuffleChoices: true, questionOrder: [2, 1], choiceOrder: [4, 3],
  displayOrder: 3, gradingReference: "internal-rubric", gradeReferenceId: "rubric-7",
  gradingKey: "internal-key", attemptIdempotencyKey: "attempt-secret",
  submissionKey: "submission-secret", submissionToken: "submission-token",
};
const progressionMap = (rows = progressRows()) => progressionService.buildLessonProgressionStates({
  publishedAssessments: [pendingPost],
  progressRows: rows,
});

const committedVisibilityHarness = (initial) => {
  let committed = structuredClone(initial);
  let staged = null;
  const service = progressionService.createLessonProgressionService({
    models: {
      LessonAssessment: { findAll: async () => structuredClone(committed.assessments) },
      AssessmentAttempt: { findAll: async () => structuredClone(committed.attempts) },
      UserProgress: { findAll: async () => structuredClone(committed.progressRows) },
    },
    authorizationService: {
      requireActiveStudentMembership: async () => assert.fail("authorized membership must be reused"),
    },
    levelSettingsLoader: async () => [],
  });
  return {
    service,
    committed: () => structuredClone(committed),
    stage(update) {
      staged = update(structuredClone(committed));
      return () => {
        committed = staged;
        staged = null;
      };
    },
  };
};

const raceMembership = {
  id: 301, classroomId: 9, studentId: 7, status: "active",
};

const raceProgressRows = ({ arraysCompleted = false } = {}) => DEFAULT_LEVEL_PROGRESS.map(
  (level) => ({
    levelKey: level.levelKey,
    isCompleted: level.levelKey.startsWith("tutorial-")
      || (arraysCompleted && level.levelKey.startsWith("arrays-")),
  }),
);

test("game-complete required-POST-pending lesson preserves isCompleted but is not lessonCompleted", () => {
  const rows = progressRows();
  const payload = buildProgressSummary(playableRows(rows), { lessonProgressionByKey: progressionMap(rows) });
  const arrays = payload.lessons.find((lesson) => lesson.lessonKey === "arrays");
  assert.equal(arrays.isCompleted, true);
  assert.equal(arrays.gameCompleted, true);
  assert.equal(arrays.assessmentCompleted, false);
  assert.equal(arrays.lessonCompleted, false);
  assert.equal(arrays.progressPercent, 100);
  assert.equal(arrays.completedLevels, 8);
  assert.equal(arrays.postAssessmentId, 92);
  assert.equal(arrays.nextAction, "TAKE_POST");
  assertNoProgressionLeaks(payload.lessons);
});

test("canonical lesson overlays whitelist public fields and exclude injected assessment internals", () => {
  const rows = progressRows();
  const states = progressionMap(rows);
  const arraysState = states.get("arrays");
  states.set("arrays", {
    ...arraysState,
    passingThreshold: 75,
    reviewPolicy: "AFTER_SUBMISSION",
    scoreVisibility: "TEACHER_ONLY",
    shuffleQuestions: true,
    questionOrder: [2, 1],
    displayOrder: 3,
    gradingReference: "internal-rubric",
    gradeReferenceId: "rubric-7",
    idempotencyKey: "attempt-secret",
    submissionKey: "submission-secret",
    submissionSignature: "signature-secret",
    grading: { answerKey: "private", choices: [{ correctChoiceId: 42 }] },
  });
  const payload = buildProgressSummary(playableRows(rows), { lessonProgressionByKey: states });
  const arrays = payload.lessons.find((lesson) => lesson.lessonKey === "arrays");
  const overlayKeys = Object.keys(arrays)
    .filter((key) => !LEGACY_LESSON_FIELDS.has(key))
    .sort();
  assert.deepEqual(overlayKeys, CANONICAL_LESSON_OVERLAY_FIELDS);
  assertNoProgressionLeaks(Object.fromEntries(
    CANONICAL_LESSON_OVERLAY_FIELDS.map((key) => [key, arrays[key]]),
  ));
});

test("summary exposes separate game assessment and canonical completion counts", () => {
  const rows = progressRows();
  const { summary } = buildProgressSummary(playableRows(rows), {
    classRank: 2, classSize: 6, xpTotal: 75,
    lessonProgressionByKey: progressionMap(rows),
  });
  assert.equal(summary.gameCompletedLessons, 2);
  assert.equal(summary.assessmentCompletedLessons, 4);
  assert.equal(summary.lessonCompletedLessons, 1);
  assert.equal(summary.nextAction, "TAKE_POST");
  assert.equal(summary.nextActionLessonKey, "arrays");
  assert.equal(summary.completedLessons, 2);
  assert.equal(summary.completedLevels, 13);
  assert.equal(summary.totalLevelsCleared, 13);
  assert.equal(summary.currentLevelKey, "functions-level-1");
  assert.equal(summary.currentLevelName, "Functions and Methods 1");
  assert.equal(summary.currentLessonKey, "functions");
  assert.equal(summary.xp, 75);
  assert.equal(summary.classRank, 2);
  assert.equal(summary.classSize, 6);
  assertNoProgressionLeaks(summary);
});

test("canonical summary uses curriculum order and reports all lessons complete", () => {
  const rows = progressRows().map((row) => ({ ...row, isCompleted: true, progressPercent: 100 }));
  const states = progressionService.buildLessonProgressionStates({ progressRows: rows });
  const { summary } = buildProgressSummary(playableRows(rows).reverse(), {
    lessonProgressionByKey: new Map([...states].reverse()),
  });
  assert.equal(summary.gameCompletedLessons, 5);
  assert.equal(summary.assessmentCompletedLessons, 5);
  assert.equal(summary.lessonCompletedLessons, 5);
  assert.equal(summary.nextAction, "LESSON_COMPLETE");
  assert.equal(summary.nextActionLessonKey, null);
  const pending = buildProgressSummary(playableRows(progressRows()).reverse(), {
    lessonProgressionByKey: new Map([...progressionMap()].reverse()),
  });
  assert.equal(pending.summary.nextActionLessonKey, "arrays");
});

test("legacy summary call without progression state remains byte-shape compatible", () => {
  const payload = buildProgressSummary([{
    id: 1, levelKey: "arrays-level-1", orderIndex: 6,
    progressPercent: 100, isCompleted: true, completedAt: null,
  }]);
  const expected = {
    summary: {
      overallProgress: 100, completedLessons: 1, totalLessons: 1,
      completedLevels: 1, totalLevelsCleared: 1, totalLevels: 1,
      currentLesson: "Arrays", currentLessonKey: "arrays", currentLevelKey: "arrays-level-1",
      currentLevelName: "Arrays 1", currentLevelHint: "Continue Arrays 1 to keep progressing.",
      xp: 0, xpToNextLevel: 250, classRank: null, classSize: null, totalTimePlayed: 0, commonMistakes: [],
    },
    lessons: [{
      lessonKey: "arrays", lessonTitle: "Arrays", progressPercent: 100,
      completedLevels: 1, totalLevels: 1, isCompleted: true, levelsCleared: 1, timeSpent: "-",
    }],
    levels: [{
      id: 1, levelKey: "arrays-level-1", lessonKey: "arrays", lessonTitle: "Arrays", levelNumber: 1,
      orderIndex: 6, progressPercent: 100, isCompleted: true, completedAt: null,
      attemptCount: 0, timeSpentSeconds: 0, finalScore: null, grade: "B",
      hintUsed: false, hintUsedAt: null, hintType: null, attemptCountAtHintUnlock: null,
      detailedHintUnlocked: false, detailedHintPurchasedAt: null, detailedHintUsedAt: null,
      detailedHintXpCost: null, detailedHintAttemptCount: null,
      latestFailureCode: null, latestFailureCategory: null, latestFailureMetadata: {},
      latestFailureAt: null, latestFailureAttemptCount: null, xpAwarded: 0, xpAwardedAt: null,
    }],
  };
  assert.equal(JSON.stringify(payload), JSON.stringify(expected));
});

test("PRE submission unlocks Level 1 only after the submitted attempt is committed", async () => {
  const pre = {
    id: 91, classroomId: 9, lessonKey: "arrays", type: "PRE",
    isPublished: true, isRequired: true, maxAttempts: 1,
    requirePassingForCompletion: false,
  };
  const h = committedVisibilityHarness({
    assessments: [pre],
    attempts: [{
      id: 501, assessmentId: 91, classroomId: 9, studentId: 7,
      attemptNumber: 1, status: "IN_PROGRESS", submittedAt: null,
    }],
    progressRows: raceProgressRows(),
  });
  const commitSubmission = h.stage((working) => {
    working.attempts[0].status = "SUBMITTED";
    working.attempts[0].submittedAt = "2026-09-27T01:00:00.000Z";
    return working;
  });
  const readAccess = async () => {
    const state = await h.service.getLessonProgressionState({
      classroomId: 9,
      studentId: 7,
      lessonKey: "arrays",
      authorizedMembership: raceMembership,
    });
    return evaluateStudentLevelAccess({
      levelKey: "arrays-level-1",
      settings: [{ levelKey: "arrays-level-1", isEnabled: true }],
      progressByKey: new Map(h.committed().progressRows.map((row) => [row.levelKey, row])),
      lessonProgressionState: state,
    });
  };

  const beforeCommit = await readAccess();
  assert.equal(beforeCommit.allowed, false);
  assert.equal(beforeCommit.reason, "PRE_ASSESSMENT_REQUIRED");

  commitSubmission();

  const afterCommit = await readAccess();
  assert.equal(afterCommit.allowed, true);
  assert.equal(afterCommit.reason, null);
});

test("final required game completion unlocks POST discovery and start only after commit", async () => {
  const post = {
    id: 92, classroomId: 9, lessonKey: "arrays", type: "POST",
    isPublished: true, isRequired: true, maxAttempts: 3,
    requirePassingForCompletion: true,
  };
  const progressRows = raceProgressRows({ arraysCompleted: true });
  const finalArrayLevel = progressRows.findLast((row) => row.levelKey.startsWith("arrays-"));
  finalArrayLevel.isCompleted = false;
  const h = committedVisibilityHarness({ assessments: [post], attempts: [], progressRows });
  const commitCompletion = h.stage((working) => {
    working.progressRows.find((row) => row.levelKey === finalArrayLevel.levelKey).isCompleted = true;
    return working;
  });
  const readDiscovery = () => h.service.getLessonProgressionState({
    classroomId: 9,
    studentId: 7,
    lessonKey: "arrays",
    authorizedMembership: raceMembership,
  });
  const start = () => h.service.assertAssessmentInteractionAllowed({
    assessment: post,
    studentId: 7,
    authorizedMembership: raceMembership,
  });

  const beforeCommit = await readDiscovery();
  assert.equal(beforeCommit.postUnlocked, false);
  await assert.rejects(start(), (error) => error?.code === "POST_ASSESSMENT_LOCKED");

  commitCompletion();

  const afterCommit = await readDiscovery();
  assert.equal(afterCommit.postUnlocked, true);
  assert.equal((await start()).allowed, true);
});

const withProgressRoute = async (callback) => {
  stateCalls.length = 0;
  const rows = progressRows();
  const membership = { id: 3, classroomId: 9, studentId: 7, status: "active" };
  const queries = { assessments: [], attempts: [], progress: [], settings: [], memberships: [] };
  const stubs = [
    [User, "findByPk", async () => ({
      id: 7, role: "student", status: "active", xpTotal: 75,
      termsVersionAccepted: TERMS_VERSION, privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
    })],
    [ClassroomMembership, "findOne", async (options) => {
      queries.memberships.push(options);
      // The middleware's generic membership is deliberately another classroom.
      return options.include ? membership : { id: 4, classroomId: 10, studentId: 7, status: "active" };
    }],
    [ClassroomMembership, "findAll", async () => []],
    [UserProgress, "findAll", async (options) => { queries.progress.push(options); return rows; }],
    [UserProgress, "bulkCreate", async () => assert.fail("all default rows already exist")],
    [LevelContentOverride, "findAll", async (options) => { queries.settings.push(options); return []; }],
    [LessonAssessment, "findAll", async (options) => {
      queries.assessments.push(options);
      return [pendingPost, {
        id: 91, classroomId: 9, lessonKey: "arrays", type: "PRE",
        isPublished: true, isRequired: true, maxAttempts: 1,
        questions: [{ choices: [{ correctChoiceId: 42, isCorrect: true }], explanation: "secret" }],
      }, { ...pendingPost, id: 999, classroomId: 10 }];
    }],
    [AssessmentAttempt, "findAll", async (options) => {
      queries.attempts.push(options);
      return [{
        id: 101, classroomId: 9, studentId: 7, assessmentId: 91,
        status: "SUBMITTED", submittedAt: "2026-09-27T00:00:00Z", attemptNumber: 1,
        percentage: 95, pointsEarned: 19, passed: true,
        answers: [{ correctChoiceId: 42, isCorrect: true, explanation: "secret" }],
      }, {
        id: 102, classroomId: 10, studentId: 7, assessmentId: 92,
        status: "SUBMITTED", percentage: 100, passed: true,
      }];
    }],
  ];
  const originals = stubs.map(([target, key]) => [target, key, target[key]]);
  for (const [target, key, replacement] of stubs) target[key] = replacement;
  try {
    const token = jwt.sign({ id: 7, role: "student" }, process.env.JWT_SECRET, { expiresIn: "5m" });
    const response = await fetch(`${baseUrl}/api/progress/me`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    assert.equal(response.status, 200);
    await callback({ payload, queries, membership, rows });
  } finally {
    for (const [target, key, original] of originals) target[key] = original;
  }
};

const withMultipleClassroomProgressRoutes = async (callback) => {
  stateCalls.length = 0;
  const rows = progressRows();
  const primaryMembership = {
    id: 3,
    classroomId: 9,
    studentId: 7,
    status: "active",
    classroom: { id: 9, isActive: true },
  };
  const secondMembership = {
    id: 5,
    classroomId: 12,
    studentId: 7,
    status: "active",
    classroom: { id: 12, isActive: true },
  };
  const membershipRows = [
    primaryMembership,
    secondMembership,
    {
      id: 6,
      classroomId: 31,
      studentId: 7,
      status: "inactive",
      classroom: { id: 31, isActive: true },
    },
    {
      id: 7,
      classroomId: 32,
      studentId: 7,
      status: "active",
      classroom: { id: 32, isActive: false },
    },
  ];
  const assessmentsByClassroom = new Map([
    [9, [
      pendingPost,
      {
        id: 91,
        classroomId: 9,
        lessonKey: "arrays",
        type: "PRE",
        isPublished: true,
        isRequired: true,
        maxAttempts: 1,
      },
    ]],
    [12, [{
      id: 191,
      classroomId: 12,
      lessonKey: "arrays",
      type: "PRE",
      isPublished: true,
      isRequired: true,
      maxAttempts: 1,
    }]],
  ]);
  const queries = {
    assessments: [],
    attempts: [],
    progress: [],
    settings: [],
    memberships: [],
  };
  const stubs = [
    [User, "findByPk", async () => ({
      id: 7,
      role: "student",
      status: "active",
      xpTotal: 75,
      termsVersionAccepted: TERMS_VERSION,
      privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
    })],
    [ClassroomMembership, "findOne", async (options) => {
      queries.memberships.push(options);
      if (!options.include) return secondMembership;
      if (options.where.classroomId == null) return primaryMembership;
      return membershipRows.find((row) => (
        row.studentId === options.where.studentId
        && row.classroomId === options.where.classroomId
        && row.status === options.where.status
        && row.classroom.isActive === options.include[0].where.isActive
      )) ?? null;
    }],
    [ClassroomMembership, "findAll", async () => []],
    [UserProgress, "findAll", async (options) => {
      queries.progress.push(options);
      return rows;
    }],
    [UserProgress, "bulkCreate", async () => assert.fail("all default rows already exist")],
    [LevelContentOverride, "findAll", async (options) => {
      queries.settings.push(options);
      return [];
    }],
    [LessonAssessment, "findAll", async (options) => {
      queries.assessments.push(options);
      return assessmentsByClassroom.get(options.where.classroomId) ?? [];
    }],
    [AssessmentAttempt, "findAll", async (options) => {
      queries.attempts.push(options);
      return options.where.classroomId === 9 ? [{
        id: 101,
        classroomId: 9,
        studentId: 7,
        assessmentId: 91,
        status: "SUBMITTED",
        submittedAt: "2026-09-27T00:00:00Z",
        attemptNumber: 1,
      }] : [];
    }],
  ];
  const originals = stubs.map(([target, key]) => [target, key, target[key]]);
  for (const [target, key, replacement] of stubs) target[key] = replacement;
  try {
    const authToken = jwt.sign(
      { id: 7, role: "student" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );
    const request = async (path) => {
      const before = Object.fromEntries(
        Object.entries(queries).map(([key, calls]) => [key, calls.length]),
      );
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const payload = await response.json();
      const queryDelta = Object.fromEntries(
        Object.entries(queries).map(([key, calls]) => [key, calls.length - before[key]]),
      );
      return { response, payload, queryDelta };
    };
    await callback({
      primaryMembership,
      queries,
      request,
      rows,
      secondMembership,
    });
  } finally {
    for (const [target, key, original] of originals) target[key] = original;
  }
};

test("progress me reports selected classroom and an allowlisted canonical progression envelope", async () => {
  await withProgressRoute(async ({ payload }) => {
    const arrays = payload.lessons.find((lesson) => lesson.lessonKey === "arrays");
    assert.equal(arrays.isCompleted, true);
    assert.equal(arrays.gameCompleted, true);
    assert.equal(arrays.assessmentCompleted, false);
    assert.equal(arrays.lessonCompleted, false);
    assert.equal(arrays.preCompleted, true);
    assert.equal(arrays.postCompleted, false);
    assert.equal(arrays.nextAction, "TAKE_POST");
    assert.equal(payload.summary.nextActionLessonKey, "arrays");
    assert.equal(payload.summary.currentLevelKey, "functions-level-1");
    assert.equal(payload.levels.length, 29);
    const completedArraysLevel = payload.levels.find(
      (level) => level.levelKey === "arrays-level-1",
    );
    const blockedFunctionsLevel = payload.levels.find(
      (level) => level.levelKey === "functions-level-1",
    );
    assert.equal(completedArraysLevel.isAccessible, true);
    assert.equal(completedArraysLevel.accessReason, "COMPLETED");
    assert.equal(blockedFunctionsLevel.isAccessible, false);
    assert.equal(blockedFunctionsLevel.accessReason, "LESSON_PREREQUISITE_REQUIRED");
    assertCanonicalProgressionEnvelope(payload);
  });
});

test("progress me batches one state map instead of querying assessments per level", async () => {
  await withProgressRoute(async ({ queries, membership, rows }) => {
    assert.equal(stateCalls.length, 1);
    const call = stateCalls[0];
    assert.equal(call.classroomId, 9);
    assert.equal(call.studentId, 7);
    assert.equal(call.authorizedMembership, membership);
    assert.deepEqual(call.progressRows, rows);
    assert.equal(call.levelSettings.length, 29);
    assert.equal(queries.assessments.length, 1);
    assert.equal(queries.attempts.length, 1);
    assert.equal(queries.settings.length, 1);
    assert.equal(queries.settings[0].where.classroomId, 9);
    assert.equal(queries.progress.length, 2, "only existing-key and full progress reads");
    assert.equal(queries.memberships.length, 2, "middleware and selected membership only");
    assert.equal(queries.assessments[0].where.classroomId, 9);
    assert.equal(queries.assessments[0].where.isPublished, true);
    assert.equal(queries.assessments[0].include, undefined);
    assert.equal(queries.attempts[0].where.classroomId, 9);
    assert.equal(queries.attempts[0].where.studentId, 7);
    assert.deepEqual(queries.attempts[0].where.assessmentId[Op.in], [92, 91]);
  });
});

test("progress me preserves primary selection and honors either exact active classroom", async () => {
  await withMultipleClassroomProgressRoutes(async ({
    primaryMembership,
    request,
    secondMembership,
  }) => {
    const primary = await request("/api/progress/me");
    const explicitPrimary = await request("/api/progress/me?classroomId=9");
    const explicitSecond = await request("/api/progress/me?classroomId=12");

    for (const result of [primary, explicitPrimary, explicitSecond]) {
      assert.equal(result.response.status, 200);
      assert.deepEqual(Object.keys(result.payload).sort(), [
        "classroomId", "lessons", "levels", "summary",
      ]);
    }
    assert.equal(primary.payload.classroomId, 9);
    assert.equal(explicitPrimary.payload.classroomId, 9);
    assert.equal(explicitSecond.payload.classroomId, 12);
    assert.equal(
      explicitPrimary.payload.lessons.find(({ lessonKey }) => lessonKey === "arrays").preCompleted,
      true,
    );
    const secondArrays = explicitSecond.payload.lessons.find(
      ({ lessonKey }) => lessonKey === "arrays",
    );
    assert.equal(secondArrays.preAssessmentId, 191);
    assert.equal(secondArrays.preCompleted, false);
    assert.equal(secondArrays.moduleUnlocked, false);
    assert.equal(secondArrays.nextAction, "TAKE_PRE");
    assert.equal(explicitSecond.payload.summary.nextActionLessonKey, "arrays");
    assertCanonicalProgressionEnvelope(explicitSecond.payload, 12);

    assert.equal(stateCalls.length, 3);
    assert.equal(stateCalls[0].authorizedMembership, primaryMembership);
    assert.equal(stateCalls[1].authorizedMembership, primaryMembership);
    assert.equal(stateCalls[2].authorizedMembership, secondMembership);
  });
});

test("explicit classroom progress denies non-member former-member and inactive-classroom targets", async () => {
  await withMultipleClassroomProgressRoutes(async ({ request }) => {
    for (const classroomId of [30, 31, 32]) {
      const result = await request(`/api/progress/me?classroomId=${classroomId}`);
      assert.equal(result.response.status, 403);
      assert.deepEqual(result.payload, { code: "FORBIDDEN", message: "Forbidden" });
      assert.deepEqual(result.queryDelta, {
        assessments: 0,
        attempts: 0,
        progress: 0,
        settings: 0,
        memberships: 2,
      });
    }
    assert.equal(stateCalls.length, 0);
  });
});

test("explicit classroom progress rejects malformed IDs and remains query-bounded", async () => {
  await withMultipleClassroomProgressRoutes(async ({ request }) => {
    for (const classroomId of ["0", "-1", "abc", "1.5", "9007199254740992", "9&classroomId=12"]) {
      const result = await request(`/api/progress/me?classroomId=${classroomId}`);
      assert.equal(result.response.status, 400);
      assert.deepEqual(result.payload, { code: "INVALID_REQUEST", message: "Invalid request" });
      assert.deepEqual(result.queryDelta, {
        assessments: 0,
        attempts: 0,
        progress: 0,
        settings: 0,
        memberships: 1,
      });
    }

    const primary = await request("/api/progress/me");
    const exact = await request("/api/progress/me?classroomId=12");
    assert.equal(primary.response.status, 200);
    assert.equal(exact.response.status, 200);
    assert.deepEqual(primary.queryDelta, {
      assessments: 1,
      attempts: 1,
      progress: 2,
      settings: 1,
      memberships: 2,
    });
    assert.deepEqual(exact.queryDelta, primary.queryDelta);
  });
});
