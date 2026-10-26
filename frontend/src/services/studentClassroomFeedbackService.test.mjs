import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "student-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.get = async (...args) => {
  calls.push(args);
  if (args[0].endsWith("/api/classrooms/me")) {
    return { data: { classrooms: [{ id: 25, className: "Programming" }] } };
  }
  return { data: { feedback: [], page: 4, limit: 20, total: 0, totalPages: 0 } };
};
axios.post = async (...args) => {
  calls.push(args);
  return { data: { changed: true, feedback: { id: 8, classroomId: 25, message: "Helpful pace", createdAt: "2026-10-26T00:00:00.000Z" } } };
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const service = await vite.ssrLoadModule("/src/services/studentClassroomFeedbackService.js");
after(async () => vite.close());

test("student feedback history uses the exact owned-history endpoint and page", async () => {
  const abort = new AbortController();
  const result = await service.listStudentClassroomFeedback({ page: 4, signal: abort.signal });

  assert.match(calls[0][0], /\/api\/classrooms\/feedback\/me\?page=4&limit=20$/);
  assert.equal(calls[0][1].headers.Authorization, "Bearer student-token");
  assert.equal(calls[0][1].signal, abort.signal);
  assert.equal(result.page, 4);
});

test("eligible classrooms use the active-membership summary endpoint", async () => {
  const abort = new AbortController();
  const result = await service.listEligibleFeedbackClassrooms({ signal: abort.signal });
  const call = calls.find(([url]) => url.endsWith("/api/classrooms/me"));
  assert.ok(call);
  assert.equal(call[1].headers.Authorization, "Bearer student-token");
  assert.equal(call[1].signal, abort.signal);
  assert.equal(result.classrooms[0].id, 25);
});

test("submission sends only message with the exact classroom and idempotency key", async () => {
  const abort = new AbortController();
  const result = await service.submitStudentClassroomFeedback({
    classroomId: 25,
    message: "Helpful pace",
    idempotencyKey: "feedback-key-123",
    signal: abort.signal,
  });
  const call = calls.find(([, body]) => body?.message === "Helpful pace");
  assert.match(call[0], /\/api\/classrooms\/25\/feedback$/);
  assert.deepEqual(call[1], { message: "Helpful pace" });
  assert.equal(call[2].headers.Authorization, "Bearer student-token");
  assert.equal(call[2].headers["Idempotency-Key"], "feedback-key-123");
  assert.equal(call[2].signal, abort.signal);
  assert.equal(result.changed, true);
});
