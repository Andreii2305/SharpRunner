import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "teacher-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.get = async (...args) => {
  calls.push(args);
  return { data: { feedback: [], page: 3, limit: 20, total: 0, totalPages: 0 } };
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const service = await vite.ssrLoadModule("/src/services/teacherClassroomFeedbackService.js");
after(async () => vite.close());

test("teacher feedback API uses the exact classroom and page with authentication", async () => {
  const abort = new AbortController();
  const result = await service.listTeacherClassroomFeedback({ classroomId: 25, page: 3, signal: abort.signal });

  assert.match(calls[0][0], /\/api\/teacher\/classrooms\/25\/student-feedback\?page=3&limit=20$/);
  assert.equal(calls[0][1].headers.Authorization, "Bearer teacher-token");
  assert.equal(calls[0][1].signal, abort.signal);
  assert.equal(result.page, 3);
});
