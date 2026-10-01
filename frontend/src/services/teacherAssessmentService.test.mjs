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

test("safe teacher errors never expose transport internals", () => {
  const error = { message: "secret stack", stack: "ORM password", config: { headers: { Authorization: "token" } }, response: { status: 409, data: { error: { code: "VERSION_CONFLICT", message: "Version conflict" } } } };
  assert.deepEqual(service.normalizeTeacherAssessmentError(error), { code: "VERSION_CONFLICT", message: "This assessment changed elsewhere. Reload it before continuing.", status: 409 });
  assert.equal(service.normalizeTeacherAssessmentError({ response: { status: 409, data: { code: "ASSESSMENT_PUBLISHED" } } }).message, "Unpublish this assessment before deleting it.");
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
      methodContract: { typeName: "Solution", methodName: "Add", parameterTypes: ["int"], returnType: "int", extra: "drop" },
      codingTestCases: [{ visibility: "HIDDEN", input: [1], expectedOutput: 2, weight: 1, extra: "drop" }],
      extra: "drop",
    }],
    extra: "drop",
  };
  await service.saveTeacherAssessment({ classroomId: 7, assessmentId: 8, graph });
  const payload = calls[0][2];
  assert.equal(payload.questions[0].referenceSolution, "teacher secret");
  assert.deepEqual(Object.keys(payload.questions[0].methodContract).sort(), ["methodName", "parameterTypes", "returnType", "typeName"]);
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
      methodContract: { typeName: "Solution", methodName: "Add", parameterTypes: ["int"], returnType: "int", extra: "drop" },
      codingTestCases: [{ id: 4, displayOrder: 0, visibility: "HIDDEN", input: [1], expectedOutput: 2, weight: 1, extra: "drop" }],
    }],
  });
  assert.equal(assessment.referenceSolution, undefined);
  assert.equal(assessment.unexpected, undefined);
  assert.equal(assessment.questions[0].extra, undefined);
  assert.equal(assessment.questions[0].referenceSolution, "teacher secret");
  assert.equal(JSON.stringify(assessment).includes("extra"), false);
});
