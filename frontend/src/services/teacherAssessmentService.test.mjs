import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "teacher-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.get = async (...args) => { calls.push(["get", ...args]); return { data: { ok: true } }; };
axios.post = async (...args) => { calls.push(["post", ...args]); return { data: { ok: true } }; };
axios.put = async (...args) => { calls.push(["put", ...args]); return { data: { ok: true } }; };
axios.delete = async (...args) => { calls.push(["delete", ...args]); return { data: null }; };

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const service = await vite.ssrLoadModule("/src/services/teacherAssessmentService.js");
after(async () => vite.close());

test("teacher assessment service preserves exact classroom, lesson, assessment, and type identity", async () => {
  calls.length = 0;
  await service.listTeacherAssessments({ classroomId: 47, lessonKey: "functions-with-arrays" });
  await service.createTeacherAssessment({ classroomId: 47, lessonKey: "arrays", type: "PRE", title: "Diagnostic" });
  await service.loadTeacherAssessment({ classroomId: 47, assessmentId: 91 });
  assert.match(calls[0][1], /classrooms\/47\/assessments\?lessonKey=functions-with-arrays$/);
  assert.deepEqual(calls[1][2], { lessonKey: "arrays", type: "PRE", title: "Diagnostic" });
  assert.match(calls[2][1], /classrooms\/47\/assessments\/91$/);
  assert.equal(calls.every((call) => call.at(-1)?.headers?.Authorization === "Bearer teacher-token"), true);
});

test("custom lesson draft service preserves exact classroom and placement identity", async () => {
  calls.length = 0;
  await service.listCustomLessonAssessmentDrafts({ classroomId: 7, placementId: 71 });
  await service.createCustomLessonAssessmentDraft({
    classroomId: 7, placementId: 71, type: "PRE", title: "Lesson diagnostic",
  });
  await service.loadCustomLessonAssessmentDraft({ classroomId: 7, placementId: 71, assessmentId: 91 });
  await service.saveCustomLessonAssessmentDraft({
    classroomId: 7, placementId: 71, assessmentId: 91,
    graph: { version: 2, settings: { title: "Lesson diagnostic" }, questions: [] },
  });
  await service.reviewCustomLessonAssessmentRevision({
    classroomId: 7, placementId: 71, assessmentId: 91, version: 3, targetLessonVersion: 4,
  });
  await service.publishCustomLessonAssessment({
    classroomId: 7, placementId: 71, assessmentId: 91, version: 4,
  });
  await service.unpublishCustomLessonAssessment({
    classroomId: 7, placementId: 71, assessmentId: 91, version: 5,
  });
  await service.deleteCustomLessonAssessmentDraft({ classroomId: 7, placementId: 71, assessmentId: 91 });

  assert.deepEqual(calls.map(([method]) => method), ["get", "post", "get", "put", "post", "post", "post", "delete"]);
  assert.equal(calls.every((call) => call[1].includes("classrooms/7/lesson-placements/71/assessments")), true);
  assert.deepEqual(calls[1][2], { type: "PRE", title: "Lesson diagnostic" });
  assert.deepEqual(calls[4][2], { version: 3, targetLessonVersion: 4 });
  assert.match(calls[5][1], /lesson-placements\/71\/assessments\/91\/publish$/);
  assert.deepEqual(calls[5][2], { version: 4 });
  assert.match(calls[6][1], /lesson-placements\/71\/assessments\/91\/unpublish$/);
  assert.deepEqual(calls[6][2], { version: 5 });
  assert.equal(calls.every((call) => call.at(-1)?.headers?.Authorization === "Bearer teacher-token"), true);
});

test("custom reporting service preserves exact classroom placement assessment and student identity", async () => {
  calls.length = 0;
  await service.listCustomAssessmentReportingTargets({ classroomId: 7 });
  await service.getCustomTeacherAssessmentResults({ classroomId: 7, placementId: 71, assessmentId: 91 });
  await service.getCustomAdditionalAttemptEligibility({
    classroomId: 7, placementId: 71, assessmentId: 91, studentId: 42,
  });
  await service.grantCustomAdditionalAssessmentAttempt({
    classroomId: 7, placementId: 71, assessmentId: 91, studentId: 42,
    reason: "Targeted support", idempotencyKey: "custom_grant_123",
  });
  await service.getCustomTeacherAssessmentScoreSheet({ classroomId: 7, placementId: 71 });

  assert.deepEqual(calls.map(([method]) => method), ["get", "get", "get", "post", "get"]);
  assert.match(calls[0][1], /classrooms\/7\/lesson-placements\/assessment-reporting$/);
  assert.match(calls[1][1], /lesson-placements\/71\/assessments\/91\/results$/);
  assert.match(calls[2][1], /lesson-placements\/71\/assessments\/91\/students\/42\/additional-attempt$/);
  assert.match(calls[3][1], /lesson-placements\/71\/assessments\/91\/students\/42\/additional-attempt$/);
  assert.equal(calls[3][3].headers["Idempotency-Key"], "custom_grant_123");
  assert.match(calls[4][1], /lesson-placements\/71\/assessment-score-sheet\.csv$/);
  assert.equal(calls.every((call) => call.at(-1)?.headers?.Authorization === "Bearer teacher-token"), true);
});

test("custom editor normalization retains safe target and revision-review metadata", () => {
  const normalized = service.normalizeTeacherAssessmentGraph({
    id: 91,
    classroomId: 7,
    targetKind: "CLASSROOM_LESSON_PLACEMENT",
    lessonKey: null,
    classroomLessonPlacementId: 71,
    targetLessonVersion: 3,
    currentLessonVersion: 4,
    revisionReviewRequired: true,
    type: "POST",
    title: "Lesson check",
    isPublished: false,
    version: 2,
    questions: [],
    accessGateEstablishedAt: "private",
  });
  assert.equal(normalized.classroomLessonPlacementId, 71);
  assert.equal(normalized.targetLessonVersion, 3);
  assert.equal(normalized.currentLessonVersion, 4);
  assert.equal(normalized.revisionReviewRequired, true);
  assert.equal(normalized.accessGateEstablishedAt, undefined);
});

test("built-in template requests keep catalog answers server-side and preserve exact classroom identity", async () => {
  calls.length = 0;
  await service.listBuiltInAssessmentTemplates();
  await service.importBuiltInAssessmentTemplate({
    classroomId: 47,
    templateKey: "builtin-functions-post",
    templateVersion: 1,
  });
  assert.match(calls[0][1], /\/api\/teacher\/assessment-templates$/);
  assert.match(calls[1][1], /classrooms\/47\/assessments\/from-template$/);
  assert.deepEqual(calls[1][2], {
    templateKey: "builtin-functions-post",
    templateVersion: 1,
  });
  assert.equal(JSON.stringify(calls).includes("isCorrect"), false);
});

test("template import controller single-flights and fences classroom or lesson changes", async () => {
  const requests = [];
  const successes = [];
  const errors = [];
  const pending = [];
  const controller = service.createTemplateImportController({
    request: ({ signal, scope }) => new Promise((resolve, reject) => requests.push({ resolve, reject, signal, scope })),
    onSuccess: (value) => successes.push(value),
    onError: (error) => errors.push(error.message),
    onPending: (value) => pending.push(value),
  });
  controller.setScope("7:arrays:PRE");
  const first = controller.importTemplate({ scope: "7:arrays:PRE" });
  assert.equal(await controller.importTemplate({ scope: "7:arrays:PRE" }), false);
  assert.equal(requests.length, 1);
  controller.setScope("8:functions:POST");
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve({ assessment: { id: 12 } });
  assert.equal(await first, false);
  assert.deepEqual(successes, []);
  assert.deepEqual(errors, []);

  const current = controller.importTemplate({ scope: "8:functions:POST" });
  requests[1].resolve({ assessment: { id: 13 } });
  assert.equal(await current, true);
  assert.deepEqual(successes, [{ assessment: { id: 13 } }]);
  assert.deepEqual(pending, [true, false, true, false]);
});

test("template import controller reports only current-scope errors", async () => {
  const errors = [];
  const controller = service.createTemplateImportController({
    request: async () => { throw new Error("template unavailable"); },
    onSuccess: () => assert.fail("failed imports must not open an assessment"),
    onError: (error) => errors.push(error.message),
    onPending: () => {},
  });
  controller.setScope("7:arrays:PRE");
  assert.equal(await controller.importTemplate({ scope: "7:arrays:PRE" }), false);
  assert.deepEqual(errors, ["template unavailable"]);
});

test("teacher assessment candidate discovery preserves the canonical assessment ID", async () => {
  calls.length = 0;
  const originalGet = axios.get;
  axios.get = async (...args) => {
    calls.push(["get", ...args]);
    return { data: { lessonKey: "arrays", assessments: {
      PRE: { exists: true, id: 12, title: "Arrays Pre-Test", published: true,
        questionCount: 1, attemptsExist: false },
      POST: { exists: false },
    } } };
  };
  try {
    const payload = await service.listTeacherAssessments({ classroomId: 7, lessonKey: "arrays" });
    assert.equal(payload.assessments.PRE.id, 12);
    assert.equal(payload.assessments.PRE.title, "Arrays Pre-Test");
    assert.match(calls[0][1], /classrooms\/7\/assessments\?lessonKey=arrays$/);
  } finally {
    axios.get = originalGet;
  }
});

test("teacher assessment copy posts exact source and destination identity and normalizes the draft", async () => {
  calls.length = 0;
  const originalPost = axios.post;
  axios.post = async (...args) => {
    calls.push(["post", ...args]);
    return { data: { assessment: {
      id: 92, classroomId: 10, lessonKey: "arrays", type: "PRE", title: "Functions diagnostic",
      isPublished: false, version: 1, questions: [], unexpected: "drop",
    } } };
  };
  try {
    const payload = await service.copyTeacherAssessment({
      destinationClassroomId: 10,
      sourceClassroomId: 7,
      sourceAssessmentId: 12,
      lessonKey: "arrays",
      type: "PRE",
    });
    assert.match(calls[0][1], /classrooms\/10\/assessments\/copy$/);
    assert.deepEqual(calls[0][2], {
      sourceClassroomId: 7,
      sourceAssessmentId: 12,
      lessonKey: "arrays",
      type: "PRE",
    });
    assert.equal(calls[0].at(-1)?.headers?.Authorization, "Bearer teacher-token");
    assert.equal(payload.assessment.id, 92);
    assert.equal(payload.assessment.isPublished, false);
    assert.equal(payload.assessment.unexpected, undefined);
  } finally {
    axios.post = originalPost;
  }
});

test("teacher assessment service uses versioned save and explicit lifecycle endpoints", async () => {
  calls.length = 0;
  const graph = { version: 3, settings: { title: "Post" }, questions: [] };
  await service.saveTeacherAssessment({ classroomId: 7, assessmentId: 8, graph });
  await service.publishTeacherAssessment({ classroomId: 7, assessmentId: 8, version: 4 });
  await service.unpublishTeacherAssessment({ classroomId: 7, assessmentId: 8, version: 5 });
  await service.deleteTeacherAssessment({ classroomId: 7, assessmentId: 8 });
  assert.deepEqual(calls.map(([method]) => method), ["put", "post", "post", "delete"]);
  assert.deepEqual(calls[0][2], graph);
  assert.deepEqual(calls[1][2], { version: 4 });
  assert.deepEqual(calls[2][2], { version: 5 });
  assert.equal(calls[3][1].endsWith("/classrooms/7/assessments/8"), true);
});

test("teacher assessment results request preserves exact classroom and assessment identity", async () => {
  calls.length = 0;
  await service.getTeacherAssessmentResults({ classroomId: 47, assessmentId: 91 });
  assert.match(calls[0][1], /classrooms\/47\/assessments\/91\/results$/);
  assert.equal(calls[0].at(-1)?.headers?.Authorization, "Bearer teacher-token");
});

test("additional-attempt requests preserve classroom assessment and student identity", async () => {
  calls.length = 0;
  await service.getAdditionalAttemptEligibility({ classroomId: 47, assessmentId: 91, studentId: 23 });
  await service.grantAdditionalAssessmentAttempt({
    classroomId: 47, assessmentId: 91, studentId: 23,
    reason: "Targeted support", idempotencyKey: "grant_key_123",
  });
  assert.match(calls[0][1], /classrooms\/47\/assessments\/91\/students\/23\/additional-attempt$/);
  assert.match(calls[1][1], /classrooms\/47\/assessments\/91\/students\/23\/additional-attempt$/);
  assert.deepEqual(calls[1][2], { reason: "Targeted support" });
  assert.equal(calls[1][3].headers["Idempotency-Key"], "grant_key_123");
});

test("attempt grant controller single-flights, fences scope changes, and reconciles uncertain outcomes", async () => {
  const requests = [];
  const successes = [];
  const errors = [];
  const pending = [];
  const reconciliations = [];
  const controller = service.createAttemptGrantController({
    request: ({ signal, scope }) => new Promise((resolve, reject) => requests.push({ resolve, reject, signal, scope })),
    reconcile: async (input) => {
      reconciliations.push(input);
      return { allowance: { additionalAttemptsAvailable: 1 }, assessment: { type: "PRE" } };
    },
    onSuccess: (value) => successes.push(value),
    onError: (error) => errors.push(error.message),
    onPending: (value) => pending.push(value),
  });
  controller.setScope("7:arrays:42");
  const first = controller.grant({ scope: "7:arrays:42", idempotencyKey: "grant_same_key_001" });
  assert.equal(await controller.grant({ scope: "7:arrays:42" }), false);
  requests[0].reject(new Error("uncertain network failure"));
  assert.equal(await first, true);
  assert.equal(successes[0].reconciled, true);
  assert.equal(reconciliations[0].idempotencyKey, "grant_same_key_001");
  assert.deepEqual(errors, []);

  const stale = controller.grant({ scope: "7:arrays:42" });
  controller.setScope("7:functions:42");
  requests[1].resolve({ grant: { id: 2 } });
  assert.equal(await stale, false);
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(successes.length, 1);
  assert.deepEqual(pending, [false, true, false, true, false]);
});

test("teacher assessment score sheet request preserves exact classroom and lesson identity", async () => {
  calls.length = 0;
  await service.getTeacherAssessmentScoreSheet({ classroomId: 47, lessonKey: "functions-with-arrays" });
  assert.match(calls[0][1], /classrooms\/47\/lessons\/functions-with-arrays\/assessment-score-sheet\.csv$/);
  assert.equal(calls[0][2].responseType, "blob");
  assert.equal(calls[0][2].headers.Authorization, "Bearer teacher-token");
});

test("score sheet controller prevents duplicate downloads and fences stale scope responses", async () => {
  const requests = [];
  const ready = [];
  const errors = [];
  const pending = [];
  const controller = service.createScoreSheetDownloadController({
    request: ({ signal, scope }) => new Promise((resolve, reject) => requests.push({ resolve, reject, signal, scope })),
    onReady: (value) => ready.push(value),
    onError: (error) => errors.push(error.message),
    onPending: (value) => pending.push(value),
  });

  controller.setScope("7:arrays");
  const first = controller.download({ scope: "7:arrays" });
  const duplicate = await controller.download({ scope: "7:arrays" });
  assert.equal(duplicate, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].scope, "7:arrays");

  controller.setScope("7:functions");
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve({ filename: "stale.csv" });
  assert.equal(await first, false);
  assert.deepEqual(ready, []);
  assert.deepEqual(errors, []);

  const current = controller.download({ scope: "7:functions" });
  requests[1].resolve({ filename: "current.csv" });
  assert.equal(await current, true);
  assert.deepEqual(ready, [{ filename: "current.csv" }]);
  assert.deepEqual(pending, [true, false, true, false]);
});

test("score sheet controller reports only current-scope failures", async () => {
  const errors = [];
  const controller = service.createScoreSheetDownloadController({
    request: async () => { throw new Error("network unavailable"); },
    onReady: () => assert.fail("failed requests must not download"),
    onError: (error) => errors.push(error.message),
    onPending: () => {},
  });
  controller.setScope("7:arrays");
  assert.equal(await controller.download({ scope: "7:arrays" }), false);
  assert.deepEqual(errors, ["network unavailable"]);
});

test("score sheet save revokes its object URL after triggering the named download", () => {
  const events = [];
  const link = {
    click: () => events.push("click"),
    remove: () => events.push("remove"),
  };
  service.saveTeacherAssessmentScoreSheet({ blob: "csv-blob", filename: "scores.csv" }, {
    documentRef: {
      createElement: () => link,
      body: { appendChild: (value) => events.push(value === link ? "append" : "wrong") },
    },
    createObjectUrl: (blob) => { assert.equal(blob, "csv-blob"); return "blob:test"; },
    revokeObjectUrl: (url) => events.push(`revoke:${url}`),
  });
  assert.equal(link.href, "blob:test");
  assert.equal(link.download, "scores.csv");
  assert.deepEqual(events, ["append", "click", "remove", "revoke:blob:test"]);
});

test("safe teacher errors never expose transport internals", () => {
  const error = { message: "secret stack", stack: "ORM password", config: { headers: { Authorization: "token" } }, response: { status: 409, data: { error: { code: "VERSION_CONFLICT", message: "Version conflict" } } } };
  assert.deepEqual(service.normalizeTeacherAssessmentError(error), { code: "VERSION_CONFLICT", message: "This assessment changed elsewhere. Reload it before continuing.", status: 409 });
  assert.deepEqual(service.normalizeTeacherAssessmentError({ response: { status: 409, data: { code: "CUSTOM_ASSESSMENT_REVISION_REVIEW_REQUIRED", currentVersion: 8 } } }), {
    code: "CUSTOM_ASSESSMENT_REVISION_REVIEW_REQUIRED",
    message: "Review the current lesson revision before saving this draft.",
    status: 409,
    currentVersion: 8,
  });
  assert.equal(service.normalizeTeacherAssessmentError({ response: { status: 409, data: { code: "ASSESSMENT_PUBLISHED" } } }).message, "Unpublish this assessment before deleting it.");
  assert.equal(service.normalizeTeacherAssessmentError({ response: { status: 403, data: { code: "CUSTOM_ASSESSMENT_PUBLICATION_DISABLED" } } }).message, "Custom lesson assessment publication is not enabled on this server.");
  assert.match(service.normalizeTeacherAssessmentError({ response: { status: 409, data: { code: "CUSTOM_PRE_ACCESS_HISTORY_UNCERTAIN" } } }).message, /predates reliable access tracking/);
  assert.equal(service.normalizeTeacherAssessmentError({ response: { status: 409, data: { code: "ASSESSMENT_TYPE_MISMATCH" } } }).message, "Only assessments of the same type can be copied.");
  assert.equal(service.normalizeTeacherAssessmentError({ response: { status: 422, data: { code: "SOURCE_ASSESSMENT_INVALID" } } }).message, "The source assessment cannot be copied in its current state.");
  assert.deepEqual(
    service.normalizeTeacherAssessmentError({ response: { status: 409, data: { code: "CODING_EXECUTION_UNAVAILABLE" } } }),
    {
      code: "CODING_EXECUTION_UNAVAILABLE",
      message: "Coding assessments can be saved as drafts, but publishing is unavailable until secure coding execution is available.",
      status: 409,
    },
  );
  assert.deepEqual(service.normalizeTeacherAssessmentError({ response: { status: 403, data: { message: "SQL secret" } } }), { code: "REQUEST_FAILED", message: "You do not have permission to manage this classroom.", status: 403 });
});

test("teacher CODING DTO allowlists reference solution and grading cases only on teacher paths", async () => {
  calls.length = 0;
  const graph = {
    version: 2,
    settings: { title: "Coding", unexpected: "drop" },
    questions: [{
      questionText: "Add", questionType: "CODING", points: 4, explanation: null, objectiveKey: null,
      choices: [], starterCode: "starter", referenceSolution: "teacher secret",
      methodContract: { typeName: "Solution", methodName: "Add", parameterNames: ["value"], parameterTypes: ["int"], returnType: "int", extra: "drop" },
      codingTestCases: [{ visibility: "HIDDEN", input: [1], expectedOutput: 2, weight: 1, extra: "drop" }],
      extra: "drop",
    }],
    extra: "drop",
  };
  await service.saveTeacherAssessment({ classroomId: 7, assessmentId: 8, graph });
  const payload = calls[0][2];
  assert.equal(payload.questions[0].referenceSolution, "teacher secret");
  assert.deepEqual(Object.keys(payload.questions[0].methodContract).sort(), ["methodName", "parameterNames", "parameterTypes", "returnType", "typeName"]);
  assert.deepEqual(payload.questions[0].methodContract.parameterNames, ["value"]);
  assert.deepEqual(Object.keys(payload.questions[0].codingTestCases[0]).sort(), ["expectedOutput", "input", "visibility", "weight"]);
  assert.equal(JSON.stringify(payload).includes("extra"), false);
});

test("teacher CODING response normalization drops arbitrary nested fields", () => {
  const assessment = service.normalizeTeacherAssessmentGraph({
    id: 8, classroomId: 7, lessonKey: "arrays", type: "POST", title: "Coding",
    version: 2, unexpected: "drop",
    questions: [{
      id: 9, questionText: "Add", questionType: "CODING", points: 3,
      starterCode: "starter", referenceSolution: "teacher secret", choices: [], extra: "drop",
      methodContract: { typeName: "Solution", methodName: "Add", parameterNames: ["value"], parameterTypes: ["int"], returnType: "int", extra: "drop" },
      codingTestCases: [{ id: 4, displayOrder: 0, visibility: "HIDDEN", input: [1], expectedOutput: 2, weight: 1, extra: "drop" }],
    }],
  });
  assert.equal(assessment.referenceSolution, undefined);
  assert.equal(assessment.unexpected, undefined);
  assert.equal(assessment.questions[0].extra, undefined);
  assert.equal(assessment.questions[0].referenceSolution, "teacher secret");
  assert.deepEqual(assessment.questions[0].methodContract.parameterNames, ["value"]);
  assert.equal(JSON.stringify(assessment).includes("extra"), false);
});
