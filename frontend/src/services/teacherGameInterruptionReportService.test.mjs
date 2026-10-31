import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "teacher-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.get = async (...args) => {
  calls.push(args);
  return { data: { scope: { classroom: { id: 25 }, student: { id: 11 }, level: { levelKey: "arrays-level-1" } } } };
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const service = await vite.ssrLoadModule("/src/services/teacherGameInterruptionReportService.js");
after(async () => vite.close());

test("teacher interruption report API sends the exact scope and independent pages", async () => {
  const abort = new AbortController();
  const result = await service.getTeacherGameInterruptionReport({
    studentId: 11,
    classroomId: 25,
    levelKey: "arrays-level-1",
    sessionPage: 2,
    eventPage: 3,
    signal: abort.signal,
  });

  assert.match(
    calls[0][0],
    /\/api\/teacher\/analytics\/students\/11\/game-interruptions\/arrays-level-1\?classroomId=25&sessionPage=2&sessionLimit=20&eventPage=3&eventLimit=20$/,
  );
  assert.equal(calls[0][1].headers.Authorization, "Bearer teacher-token");
  assert.equal(calls[0][1].signal, abort.signal);
  assert.equal(result.scope.classroom.id, 25);
});
