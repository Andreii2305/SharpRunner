const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createCustomAssessmentStudentPolicyService } = require("../src/services/customAssessmentStudentPolicyService");
const { serializeDiscoveryStatus } = require("../src/services/assessmentSerializationService");

const assessment = (overrides = {}) => ({
  id: 91,
  classroomId: 7,
  targetKind: "CLASSROOM_LESSON_PLACEMENT",
  classroomLessonPlacementId: 31,
  targetLessonVersion: 4,
  type: "POST",
  ...overrides,
});

const harness = ({ archived = false, completion = { id: 5 }, membership = { id: 2 } } = {}) => {
  const placement = {
    id: 31, classroomId: 7, lessonId: 9, archivedAt: archived ? new Date() : null,
    lesson: { id: 9, contentVersion: 4, contentType: "lesson", archivedAt: null,
      isPublished: true, publishAt: null, assignedStudentIds: [] },
  };
  const service = createCustomAssessmentStudentPolicyService({
    models: {
      ClassroomLessonPlacement: {
        findOne: async ({ where }) => Number(where.id) === placement.id
          && Number(where.classroomId) === placement.classroomId ? placement : null,
      },
      ClassroomMembership: { findOne: async () => membership },
      Classroom: { findOne: async () => ({ id: 7, isActive: true }) },
      ClassroomLessonReadingCompletion: { findOne: async () => completion },
    },
    now: () => new Date("2026-10-18T00:00:00Z"),
  });
  return { service, placement };
};

test("custom POST readiness requires exact revision reading acknowledgement", async () => {
  const ready = await harness().service.evaluate({ assessment: assessment(), studentId: 22, operation: "START" });
  assert.equal(ready.allowed, true);

  const blocked = await harness({ completion: null }).service.evaluate({ assessment: assessment(), studentId: 22, operation: "START" });
  assert.deepEqual(blocked, { allowed: false, reason: "READING_ACKNOWLEDGEMENT_REQUIRED" });
});

test("custom PRE does not require reading acknowledgement", async () => {
  const result = await harness({ completion: null }).service.evaluate({
    assessment: assessment({ type: "PRE" }), studentId: 22, operation: "START",
  });
  assert.equal(result.allowed, true);
});

test("archive blocks discovery and new starts but permits an existing attempt lifecycle", async () => {
  const { service } = harness({ archived: true });
  assert.equal((await service.evaluate({ assessment: assessment(), studentId: 22, operation: "START" })).reason, "PLACEMENT_ARCHIVED");
  assert.equal((await service.evaluate({ assessment: assessment(), studentId: 22, operation: "ACTIVE_ATTEMPT" })).allowed, true);
  assert.equal((await service.evaluate({ assessment: assessment(), studentId: 22, operation: "RESULT" })).allowed, true);
});

test("custom policy fails closed for cross-placement identity and inactive membership", async () => {
  const exact = harness();
  await assert.rejects(
    exact.service.evaluate({ assessment: assessment({ classroomLessonPlacementId: 32 }), studentId: 22, operation: "START" }),
    (error) => error.code === "ASSESSMENT_TARGET_NOT_FOUND",
  );
  await assert.rejects(
    harness({ membership: null }).service.evaluate({ assessment: assessment(), studentId: 22, operation: "RESULT" }),
    (error) => error.code === "FORBIDDEN",
  );
});

test("custom discovery preserves safe reading and archive lock reasons", () => {
  for (const lockReason of ["READING_ACKNOWLEDGEMENT_REQUIRED", "PLACEMENT_ARCHIVED"]) {
    const status = serializeDiscoveryStatus({
      assessment: assessment(),
      available: true,
      unlocked: false,
      lockReason,
    }).status;
    assert.equal(status.lockReason, lockReason);
  }
});
