const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCustomLessonLifecycleService,
  LessonLifecycleError,
} = require("../src/services/customLessonLifecycleService");

const transaction = { LOCK: { UPDATE: "UPDATE" } };

const modelSet = (overrides = {}) => ({
  ClassroomLesson: {},
  ClassroomLessonPlacement: {},
  ClassroomLessonProgress: {},
  ClassroomLessonContentAccess: {},
  ClassroomLessonReadingCompletion: {},
  ClassroomLessonSubmission: {},
  ClassroomMembership: {},
  Classroom: {},
  LessonAssessment: {},
  AssessmentAttempt: {},
  ...overrides,
});

test("content edits are blocked when any shared placement assessment has attempts", async () => {
  const lesson = { id: 9, contentVersion: 4 };
  const service = createCustomLessonLifecycleService({
    models: modelSet({
      ClassroomLesson: { findByPk: async () => lesson },
      ClassroomLessonPlacement: { findAll: async () => [{ id: 31 }, { id: 32 }] },
      LessonAssessment: { findAll: async () => [{ id: 71, isPublished: false, publishedAt: null }] },
      AssessmentAttempt: { count: async ({ where }) => {
        assert.deepEqual(where.assessmentId[Object.getOwnPropertySymbols(where.assessmentId)[0]], [71]);
        return 1;
      } },
    }),
  });

  await assert.rejects(
    service.lockContentRevisionForEdit({ lessonId: 9, transaction }),
    (error) => error instanceof LessonLifecycleError
      && error.code === "LESSON_CONTENT_LOCKED_BY_ASSESSMENT_HISTORY",
  );
});

test("content edits require linked assessments to be unpublished but permit drafts without attempts", async () => {
  const lesson = { id: 9, contentVersion: 4 };
  let assessments = [{ id: 71, isPublished: true, publishedAt: new Date() }];
  const service = createCustomLessonLifecycleService({
    models: modelSet({
      ClassroomLesson: { findByPk: async () => lesson },
      ClassroomLessonPlacement: { findAll: async () => [{ id: 31 }] },
      LessonAssessment: { findAll: async () => assessments },
      AssessmentAttempt: { count: async () => 0 },
    }),
  });

  await assert.rejects(
    service.lockContentRevisionForEdit({ lessonId: 9, transaction }),
    (error) => error.code === "LESSON_ASSESSMENTS_MUST_BE_UNPUBLISHED",
  );

  assessments = [{ id: 71, isPublished: false, publishedAt: null }];
  assert.equal(
    await service.lockContentRevisionForEdit({ lessonId: 9, transaction }),
    lesson,
  );
});

test("placement removal archives history and hard-deletes only an unused placement", async () => {
  const placement = {
    id: 31,
    lessonId: 9,
    classroomId: 7,
    archivedAt: null,
    saveCalls: 0,
    destroyCalls: 0,
    async save() { this.saveCalls += 1; },
    async destroy() { this.destroyCalls += 1; },
  };
  const counts = { assessments: 0, accesses: 0, completions: 0, progress: 1, submissions: 0 };
  const service = createCustomLessonLifecycleService({
    models: modelSet({
      ClassroomLesson: { findByPk: async () => ({ id: 9 }) },
      ClassroomLessonPlacement: { findOne: async () => placement },
      LessonAssessment: { count: async () => counts.assessments },
      ClassroomLessonContentAccess: { count: async () => counts.accesses },
      ClassroomLessonReadingCompletion: { count: async () => counts.completions },
      ClassroomLessonProgress: { count: async () => counts.progress },
      ClassroomLessonSubmission: { count: async () => counts.submissions },
    }),
  });

  const archived = await service.removeOrArchivePlacement({ lessonId: 9, classroomId: 7, transaction });
  assert.equal(archived.archived, true);
  assert.ok(placement.archivedAt instanceof Date);
  assert.equal(placement.saveCalls, 1);
  assert.equal(placement.destroyCalls, 0);

  placement.archivedAt = null;
  counts.progress = 0;
  counts.submissions = 1;
  const archivedForSubmission = await service.removeOrArchivePlacement({ lessonId: 9, classroomId: 7, transaction });
  assert.equal(archivedForSubmission.archived, true);
  assert.equal(placement.destroyCalls, 0);

  placement.archivedAt = null;
  counts.submissions = 0;
  const removed = await service.removeOrArchivePlacement({ lessonId: 9, classroomId: 7, transaction });
  assert.equal(removed.archived, false);
  assert.equal(placement.destroyCalls, 1);
});

test("reading acknowledgement requires exact current revision access and is idempotent", async () => {
  const lesson = {
    id: 9,
    contentType: "lesson",
    contentVersion: 4,
    archivedAt: null,
    isPublished: true,
    publishAt: null,
    assignedStudentIds: [],
  };
  const placement = { id: 31, lessonId: 9, classroomId: 7, archivedAt: null, lesson };
  let access = null;
  const completion = { id: 81, lessonVersion: 4, completedAt: new Date("2026-10-17T00:00:00Z") };
  const service = createCustomLessonLifecycleService({
    models: modelSet({
      ClassroomLesson: { findByPk: async () => lesson },
      ClassroomLessonPlacement: { findOne: async () => placement },
      Classroom: { findOne: async () => ({ id: 7, isActive: true }) },
      ClassroomMembership: { findOne: async () => ({ classroomId: 7, studentId: 22, status: "active" }) },
      ClassroomLessonContentAccess: { findOne: async () => access },
      ClassroomLessonReadingCompletion: { findOrCreate: async ({ where, defaults }) => {
        assert.deepEqual(where, {
          classroomLessonPlacementId: 31,
          studentId: 22,
          lessonVersion: 4,
        });
        assert.equal(defaults.classroomId, 7);
        assert.equal(defaults.lessonId, 9);
        return [completion, false];
      } },
    }),
    sequelize: { transaction: async (callback) => callback(transaction) },
  });

  await assert.rejects(
    service.acknowledgeReading({
      lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, lessonVersion: 3,
    }),
    (error) => error.code === "STALE_LESSON_REVISION" && error.details.currentVersion === 4,
  );

  await assert.rejects(
    service.acknowledgeReading({
      lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, lessonVersion: 4,
    }),
    (error) => error.code === "LESSON_REVISION_NOT_ACCESSED",
  );

  access = { id: 61, lessonVersion: 4 };
  const result = await service.acknowledgeReading({
    lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, lessonVersion: 4,
  });
  assert.equal(result.created, false);
  assert.equal(result.completion, completion);
});

test("archived, scheduled, inactive, or unassigned placements cannot be acknowledged", async () => {
  const lesson = {
    id: 9,
    contentType: "lesson",
    contentVersion: 4,
    archivedAt: null,
    isPublished: true,
    publishAt: null,
    assignedStudentIds: [99],
  };
  const service = createCustomLessonLifecycleService({
    models: modelSet({
      ClassroomLesson: { findByPk: async () => lesson },
      ClassroomLessonPlacement: { findOne: async () => ({ id: 31, lessonId: 9, classroomId: 7, archivedAt: null, lesson }) },
      Classroom: { findOne: async () => ({ id: 7, isActive: true }) },
      ClassroomMembership: { findOne: async () => ({ classroomId: 7, studentId: 22, status: "active" }) },
      ClassroomLessonContentAccess: { findOne: async () => ({ id: 61 }) },
      ClassroomLessonReadingCompletion: { findOrCreate: async () => assert.fail("completion must not be written") },
    }),
    sequelize: { transaction: async (callback) => callback(transaction) },
  });

  await assert.rejects(
    service.acknowledgeReading({
      lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, lessonVersion: 4,
    }),
    (error) => error.code === "LESSON_NOT_AVAILABLE",
  );
});

test("reading acknowledgement locks shared content before its placement", async () => {
  const lockOrder = [];
  const lesson = {
    id: 9, contentType: "lesson", contentVersion: 4, archivedAt: null,
    isPublished: true, publishAt: null, assignedStudentIds: [],
  };
  const service = createCustomLessonLifecycleService({
    models: modelSet({
      ClassroomLesson: { findByPk: async () => { lockOrder.push("lesson"); return lesson; } },
      ClassroomLessonPlacement: { findOne: async () => {
        lockOrder.push("placement");
        return { id: 31, lessonId: 9, classroomId: 7, archivedAt: null };
      } },
      Classroom: { findOne: async () => ({ id: 7, isActive: true }) },
      ClassroomMembership: { findOne: async () => ({ classroomId: 7, studentId: 22, status: "active" }) },
      ClassroomLessonContentAccess: { findOne: async () => ({ id: 61 }) },
      ClassroomLessonReadingCompletion: { findOrCreate: async () => [{ id: 81 }, true] },
    }),
    sequelize: { transaction: async (callback) => callback(transaction) },
  });

  await service.acknowledgeReading({
    lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, lessonVersion: 4,
  });
  assert.deepEqual(lockOrder, ["lesson", "placement"]);
});

test("lesson deletion is blocked by placements or legacy student history", async () => {
  const lesson = { id: 9 };
  let placements = [];
  let progressCount = 1;
  const service = createCustomLessonLifecycleService({
    models: modelSet({
      ClassroomLesson: { findByPk: async () => lesson },
      ClassroomLessonPlacement: { findAll: async () => placements },
      ClassroomLessonProgress: { count: async () => progressCount },
      ClassroomLessonSubmission: { count: async () => 0 },
    }),
  });

  await assert.rejects(
    service.lockLessonForDeletion({ lessonId: 9, transaction }),
    (error) => error.code === "LESSON_HISTORY_PROTECTED",
  );
  progressCount = 0;
  placements = [{ id: 31 }];
  await assert.rejects(
    service.lockLessonForDeletion({ lessonId: 9, transaction }),
    (error) => error.code === "LESSON_HISTORY_PROTECTED",
  );
  placements = [];
  assert.equal(await service.lockLessonForDeletion({ lessonId: 9, transaction }), lesson);
});
