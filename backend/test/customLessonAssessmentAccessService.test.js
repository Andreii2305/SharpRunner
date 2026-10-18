const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Op } = require("sequelize");

const {
  createCustomLessonAssessmentAccessService,
  CustomLessonAssessmentAccessError,
} = require("../src/services/customLessonAssessmentAccessService");

const transaction = { LOCK: { UPDATE: "UPDATE" } };
const placement = {
  id: 31,
  classroomId: 7,
  lessonId: 9,
  accessPolicyEstablishedAt: new Date("2026-10-01T00:00:00.000Z"),
  lesson: { id: 9, contentVersion: 4 },
};

const assessment = (overrides = {}) => ({
  id: 71,
  classroomId: 7,
  targetKind: "CLASSROOM_LESSON_PLACEMENT",
  classroomLessonPlacementId: 31,
  targetLessonVersion: 4,
  type: "PRE",
  isRequired: true,
  isPublished: true,
  accessGateEstablishedAt: new Date("2026-10-10T00:00:00.000Z"),
  ...overrides,
});

const harness = ({ pre = null, originalAttempt = null, priorAccess = null } = {}) => {
  const calls = { accessWhere: null };
  const service = createCustomLessonAssessmentAccessService({
    models: {
      LessonAssessment: { findOne: async () => pre },
      AssessmentAttempt: { findOne: async () => originalAttempt },
      ClassroomLessonContentAccess: {
        findOne: async ({ where }) => {
          calls.accessWhere = where;
          return priorAccess;
        },
      },
    },
    lifecycleService: {
      loadAvailablePlacement: async () => placement,
    },
    now: () => new Date("2026-10-18T02:00:00.000Z"),
  });
  return { calls, service };
};

test("custom lesson access remains open without a published required PRE", async () => {
  for (const pre of [null, assessment({ isRequired: false })]) {
    const { service } = harness({ pre });
    const result = await service.evaluateStudentContentAccess({
      lessonId: 9,
      placementId: 31,
      classroomId: 7,
      studentId: 22,
      transaction,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.gate, null);
  }
});

test("submitted original PRE satisfies a required custom lesson gate", async () => {
  const { service } = harness({
    pre: assessment(),
    originalAttempt: { id: 101, attemptNumber: 1, status: "SUBMITTED" },
  });
  const result = await service.evaluateStudentContentAccess({
    lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, transaction,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.satisfiedBy, "ORIGINAL_PRE_SUBMISSION");
});

test("a supplemental diagnostic cannot satisfy the original required PRE gate", async () => {
  const { service } = harness({
    pre: assessment(),
    originalAttempt: {
      id: 102,
      attemptNumber: 1,
      status: "SUBMITTED",
      preBaselineStatus: "SUPPLEMENTAL",
    },
  });
  const result = await service.evaluateStudentContentAccess({
    lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, transaction,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.gate.code, "CUSTOM_PRE_REQUIRED");
});

test("prior access is recognized only for the gated assessment revision and cutoff", async () => {
  const { calls, service } = harness({
    pre: assessment(),
    priorAccess: { id: 201, lessonVersion: 4, accessedAt: new Date("2026-10-09T23:59:59.000Z") },
  });
  const result = await service.evaluateStudentContentAccess({
    lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, transaction,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.satisfiedBy, "RECOGNIZED_PRIOR_ACCESS");
  assert.equal(calls.accessWhere.classroomLessonPlacementId, 31);
  assert.equal(calls.accessWhere.studentId, 22);
  assert.equal(calls.accessWhere.lessonVersion, 4);
  assert.deepEqual(calls.accessWhere.accessedAt[Op.lte], new Date("2026-10-10T00:00:00.000Z"));
});

test("access after a requirement cutoff does not bypass that required PRE", async () => {
  const { service } = harness({ pre: assessment(), priorAccess: null });
  const result = await service.evaluateStudentContentAccess({
    lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, transaction,
  });

  assert.equal(result.allowed, false);
  assert.deepEqual(result.gate, {
    code: "CUSTOM_PRE_REQUIRED",
    assessmentId: 71,
    assessmentType: "PRE",
    required: true,
  });
  assert.equal(Object.hasOwn(result.gate, "questions"), false);
  assert.equal(Object.hasOwn(result.gate, "score"), false);
});

test("required gate fails closed when its bound content revision is stale", async () => {
  const { service } = harness({ pre: assessment({ targetLessonVersion: 3 }) });
  await assert.rejects(service.evaluateStudentContentAccess({
    lessonId: 9, placementId: 31, classroomId: 7, studentId: 22, transaction,
  }), (error) => error instanceof CustomLessonAssessmentAccessError
    && error.code === "CUSTOM_PRE_TARGET_MISMATCH");
});

test("required PRE publication policy rejects uncertain placement coverage", () => {
  const { service } = harness();
  assert.throws(
    () => service.assertRequiredPrePublicationAllowed({
      assessment: assessment(),
      placement: { ...placement, accessPolicyEstablishedAt: null },
    }),
    (error) => error instanceof CustomLessonAssessmentAccessError
      && error.code === "CUSTOM_PRE_ACCESS_HISTORY_UNCERTAIN",
  );
  assert.doesNotThrow(() => service.assertRequiredPrePublicationAllowed({
    assessment: assessment({ isRequired: false }),
    placement: { ...placement, accessPolicyEstablishedAt: null },
  }));
});

test("publication policy requires exact assessment placement, classroom, and revision identity", () => {
  const { service } = harness();
  for (const invalid of [
    assessment({ classroomId: 8 }),
    assessment({ classroomLessonPlacementId: 32 }),
    assessment({ targetLessonVersion: 5 }),
  ]) {
    assert.throws(
      () => service.assertRequiredPrePublicationAllowed({ assessment: invalid, placement }),
      (error) => error.code === "CUSTOM_PRE_TARGET_MISMATCH",
    );
  }
});

test("first required-PRE enforcement timestamp is set once and retained across republishing", () => {
  const { service } = harness();
  const fresh = assessment({ accessGateEstablishedAt: null });
  assert.deepEqual(
    service.establishRequiredPreAccessGate({ assessment: fresh, placement }),
    new Date("2026-10-18T02:00:00.000Z"),
  );
  assert.deepEqual(fresh.accessGateEstablishedAt, new Date("2026-10-18T02:00:00.000Z"));

  const firstEnforcement = new Date("2026-10-11T00:00:00.000Z");
  const republished = assessment({ accessGateEstablishedAt: firstEnforcement });
  assert.equal(
    service.establishRequiredPreAccessGate({ assessment: republished, placement }),
    firstEnforcement,
  );

  const optional = assessment({ isRequired: false, accessGateEstablishedAt: null });
  assert.equal(service.establishRequiredPreAccessGate({ assessment: optional, placement }), null);
  assert.equal(optional.accessGateEstablishedAt, null);
});
