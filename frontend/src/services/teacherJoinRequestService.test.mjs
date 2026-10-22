import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "teacher-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.get = async (...args) => { calls.push(["get", ...args]); return { data: { requests: [], total: 0 } }; };
axios.patch = async (...args) => { calls.push(["patch", ...args]); return { data: { changed: true } }; };

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const service = await vite.ssrLoadModule("/src/services/teacherJoinRequestService.js");
after(async () => vite.close());

test("join-request API preserves exact classroom pagination student and decision identity", async () => {
  calls.length = 0;
  const listAbort = new AbortController();
  await service.listTeacherJoinRequests({ classroomId: 25, page: 3, limit: 20, signal: listAbort.signal });
  await service.decideTeacherJoinRequest({ classroomId: 25, studentId: 7, decision: "reject" });

  assert.match(calls[0][1], /\/api\/teacher\/classrooms\/25\/join-requests\?page=3&limit=20$/);
  assert.equal(calls[0][2].signal, listAbort.signal);
  assert.equal(calls[0][2].headers.Authorization, "Bearer teacher-token");
  assert.match(calls[1][1], /\/api\/teacher\/classrooms\/25\/join-requests\/7$/);
  assert.deepEqual(calls[1][2], { decision: "reject" });
  assert.equal(calls[1][3].headers.Authorization, "Bearer teacher-token");
});
