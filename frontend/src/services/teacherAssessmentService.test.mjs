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
