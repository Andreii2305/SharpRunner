import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "student-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.get = async (...args) => { calls.push(["get", ...args]); return { data: { classrooms: [], pendingRequests: [] } }; };
axios.post = async (...args) => { calls.push(["post", ...args]); return { data: { membership: { status: "pending" } } }; };

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const service = await vite.ssrLoadModule("/src/services/studentClassMembershipService.js");
after(async () => vite.close());

test("student classroom service reads /me and submits only the class code", async () => {
  calls.length = 0;
  const abort = new AbortController();
  await service.getStudentClassroomSummary({ signal: abort.signal });
  await service.submitStudentJoinRequest({ classCode: "ABC234", studentId: 999 });

  assert.match(calls[0][1], /\/api\/classrooms\/me$/);
  assert.equal(calls[0][2].signal, abort.signal);
  assert.equal(calls[0][2].headers.Authorization, "Bearer student-token");
  assert.match(calls[1][1], /\/api\/classrooms\/join$/);
  assert.deepEqual(calls[1][2], { classCode: "ABC234" });
  assert.equal(calls[1][3].headers.Authorization, "Bearer student-token");
});
