import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "teacher-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.get = async (...args) => {
  calls.push(args);
  return { data: { classroom: { id: 25 }, students: [], total: 0, limit: 5 } };
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const service = await vite.ssrLoadModule("/src/services/teacherAssessmentAttentionService.js");
after(async () => vite.close());

test("attention API uses the exact classroom endpoint limit authentication and abort signal", async () => {
  calls.length = 0;
  const abort = new AbortController();
  const result = await service.listTeacherAssessmentAttention({
    classroomId: 25,
    limit: 5,
    signal: abort.signal,
  });

  assert.match(calls[0][0], /\/api\/teacher\/classrooms\/25\/students-needing-attention\?limit=5$/);
  assert.equal(calls[0][1].headers.Authorization, "Bearer teacher-token");
  assert.equal(calls[0][1].signal, abort.signal);
  assert.equal(result.classroom.id, 25);
});
