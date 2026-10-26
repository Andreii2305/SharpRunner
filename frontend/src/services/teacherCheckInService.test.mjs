import assert from "node:assert/strict";
import { after, test } from "node:test";
import axios from "axios";
import { createServer } from "vite";

globalThis.localStorage = { getItem: () => "teacher-token", removeItem() {}, setItem() {} };
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true } });
const { sendTeacherCheckIn } = await vite.ssrLoadModule("/src/services/teacherCheckInService.js");
after(async () => vite.close());

test("sends the exact roster identities with only message and idempotency key", async () => {
  const previousPost = axios.post;
  let received;
  axios.post = async (...args) => {
    received = args;
    return { data: { changed: true, checkIn: { id: 91 } } };
  };
  try {
    const signal = new AbortController().signal;
    const result = await sendTeacherCheckIn({
      classroomId: 7,
      studentId: 51,
      message: "A private note",
      idempotencyKey: "checkin_test_123",
      signal,
    });
    assert.match(received[0], /\/api\/teacher\/classrooms\/7\/students\/51\/check-ins$/);
    assert.deepEqual(received[1], { message: "A private note" });
    assert.equal(received[2].headers["Idempotency-Key"], "checkin_test_123");
    assert.ok(received[2].headers.Authorization);
    assert.equal(received[2].signal, signal);
    assert.equal(result.changed, true);
  } finally {
    axios.post = previousPost;
  }
});
