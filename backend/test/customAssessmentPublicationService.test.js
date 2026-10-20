const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  createCustomAssessmentPublicationService,
  switchEnabled,
} = require("../src/services/customAssessmentPublicationService");

const target = (overrides = {}) => ({
  classroom: { id: 7, isActive: true },
  placement: { id: 71, classroomId: 7, accessPolicyEstablishedAt: new Date("2026-10-01T00:00:00Z"), archivedAt: null },
  lesson: { id: 61, contentType: "lesson", contentVersion: 3, isPublished: true, publishAt: null, archivedAt: null },
  ...overrides,
});

const assessment = (overrides = {}) => ({
  id: 12,
  classroomId: 7,
  targetKind: "CLASSROOM_LESSON_PLACEMENT",
  classroomLessonPlacementId: 71,
  targetLessonVersion: 3,
  type: "PRE",
  isRequired: true,
  isPublished: false,
  publishedAt: null,
  accessGateEstablishedAt: null,
  ...overrides,
});

test("custom publication switch is default-off and accepts only explicit true", () => {
  assert.equal(switchEnabled({}), false);
  assert.equal(switchEnabled({ CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED: "1" }), false);
  assert.equal(switchEnabled({ CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED: "false" }), false);
  assert.equal(switchEnabled({ CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED: "true" }), true);
  assert.equal(switchEnabled({ CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED: " TRUE " }), true);
});

test("required PRE publication establishes its immutable boundary in the publication operation", () => {
  const activatedAt = new Date("2026-10-19T04:00:00Z");
  const calls = [];
  const service = createCustomAssessmentPublicationService({
    environment: { CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED: "true" },
    now: () => new Date("2026-10-19T05:00:00Z"),
    accessPolicy: {
      establishRequiredPreAccessGate({ assessment: row, placement }) {
        calls.push({ row, placement });
        row.accessGateEstablishedAt ||= activatedAt;
      },
    },
  });
  const row = assessment();
  service.publish({ assessment: row, target: target() });
  assert.equal(row.isPublished, true);
  assert.equal(row.publishedAt.toISOString(), "2026-10-19T05:00:00.000Z");
  assert.equal(row.accessGateEstablishedAt, activatedAt);
  assert.equal(calls[0].placement.lesson.contentVersion, 3);
});

test("optional PRE publication does not establish a required-PRE boundary", () => {
  let activationCalls = 0;
  const service = createCustomAssessmentPublicationService({
    environment: { CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED: "true" },
    accessPolicy: { establishRequiredPreAccessGate() { activationCalls += 1; } },
  });
  const row = assessment({ isRequired: false });
  service.publish({ assessment: row, target: target() });
  assert.equal(activationCalls, 0);
  assert.equal(row.accessGateEstablishedAt, null);
});

test("publication reports stale, archived, inactive, unpublished, and uncertain targets safely", () => {
  const service = createCustomAssessmentPublicationService({
    environment: { CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED: "true" },
  });
  assert.equal(service.availability({ assessment: assessment({ targetLessonVersion: 2 }), target: target() }).reason, "REVISION_REVIEW_REQUIRED");
  assert.equal(service.availability({ assessment: assessment(), target: target({ placement: { ...target().placement, archivedAt: new Date() } }) }).reason, "PLACEMENT_ARCHIVED");
  assert.equal(service.availability({ assessment: assessment(), target: target({ classroom: { id: 7, isActive: false } }) }).reason, "CLASSROOM_INACTIVE");
  assert.equal(service.availability({ assessment: assessment(), target: target({ lesson: { ...target().lesson, isPublished: false } }) }).reason, "LESSON_UNPUBLISHED");
  assert.equal(service.availability({ assessment: assessment(), target: target({ placement: { ...target().placement, accessPolicyEstablishedAt: null } }) }).reason, "ACCESS_HISTORY_UNCERTAIN");
});

test("disabled publication still reports safe draft blockers without authorizing publication", () => {
  const service = createCustomAssessmentPublicationService({ environment: {} });
  const state = service.availability({ assessment: assessment({ targetLessonVersion: 2 }), target: target() });
  assert.deepEqual(state, { enabled: false, canPublish: false, reason: "REVISION_REVIEW_REQUIRED" });
  assert.throws(
    () => service.assertCanPublish({ assessment: assessment({ targetLessonVersion: 2 }), target: target() }),
    (error) => error.code === "CUSTOM_ASSESSMENT_PUBLICATION_DISABLED",
  );
});

test("future scheduling remains publishable while student access stays delegated to the access policy", () => {
  const service = createCustomAssessmentPublicationService({
    environment: { CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED: "true" },
  });
  const state = service.availability({
    assessment: assessment({ type: "POST" }),
    target: target({ lesson: { ...target().lesson, publishAt: new Date("2099-01-01T00:00:00Z") } }),
  });
  assert.deepEqual(state, { enabled: true, canPublish: true, reason: null });
});
