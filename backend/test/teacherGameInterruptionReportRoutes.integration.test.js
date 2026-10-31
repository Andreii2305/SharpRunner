const assert = require("node:assert/strict");
const express = require("express");
const { after, before, test } = require("node:test");

let server;
let baseUrl;
let actor = null;
let handler;

const authenticate = (req, res, next) => {
  if (!actor) return res.status(401).json({ message: "Missing authentication token" });
  req.userId = actor.id;
  req.userRole = actor.role;
  return next();
};

const get = async (path) => {
  const response = await fetch(`${baseUrl}${path}`);
  return { response, payload: await response.json() };
};

before(async () => {
  const {
    createTeacherGameInterruptionReportRouter,
  } = require("../src/routes/teacherGameInterruptionReports");
  const app = express();
  app.use(
    "/api/teacher",
    authenticate,
    createTeacherGameInterruptionReportRouter({
      reportService: {
        getTeacherGameInterruptionReport: (input) => handler(input),
      },
    }),
  );
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("teacher interruption report route forwards authenticated exact scope and pagination", async () => {
  actor = { id: 7, role: "teacher" };
  let received;
  handler = async (input) => {
    received = input;
    return {
      scope: { classroom: { id: 25 }, student: { id: 11 }, level: { levelKey: "tutorial-level-1" } },
      summary: { recordedEventCount: 0, appliedEventCount: 0, unappliedEventCount: 0, actualScoreDeduction: 0, actualXpDeduction: 0 },
      completionEvidence: { availability: "unavailable" },
      sessions: { items: [], page: 2, limit: 5, total: 0, totalPages: 0 },
      events: { items: [], page: 3, limit: 10, total: 0, totalPages: 0 },
      generatedAt: "2026-10-31T00:00:00.000Z",
    };
  };
  const result = await get(
    "/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1"
      + "?classroomId=25&sessionPage=2&sessionLimit=5&eventPage=3&eventLimit=10",
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(received, {
    actorId: 7,
    actorRole: "teacher",
    classroomId: 25,
    studentId: 11,
    levelKey: "tutorial-level-1",
    sessionPage: 2,
    sessionLimit: 5,
    sessionOffset: 5,
    eventPage: 3,
    eventLimit: 10,
    eventOffset: 20,
  });
  assert.equal(result.payload.completionEvidence.availability, "unavailable");
});

test("route preserves administrator access and rejects denied roles before the service", async () => {
  let calls = 0;
  handler = async () => { calls += 1; return { ok: true }; };
  actor = { id: 8, role: "admin" };
  assert.equal((await get("/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25")).response.status, 200);
  actor = { id: 9, role: "student" };
  assert.equal((await get("/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25")).response.status, 403);
  actor = null;
  assert.equal((await get("/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25")).response.status, 401);
  assert.equal(calls, 1);
});

test("route strictly rejects missing all repeated unknown malformed and unsafe pagination", async () => {
  actor = { id: 7, role: "teacher" };
  let calls = 0;
  handler = async () => { calls += 1; return { ok: true }; };
  const invalidPaths = [
    "/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1",
    "/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=all",
    "/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25&classroomId=26",
    "/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25&unknown=1",
    "/api/teacher/analytics/students/1e2/game-interruptions/tutorial-level-1?classroomId=25",
    "/api/teacher/analytics/students/11/game-interruptions/TUTORIAL-LEVEL-1?classroomId=25",
    "/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25&sessionPage=0",
    "/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25&eventLimit=101",
    "/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25&eventPage=214748365",
  ];
  for (const path of invalidPaths) {
    const result = await get(path);
    assert.equal(result.response.status, 400, path);
    assert.deepEqual(result.payload, { code: "INVALID_REQUEST", message: "Invalid request" });
  }
  assert.equal(calls, 0);
});

test("route preserves safe service errors and neutralizes unexpected failures", async () => {
  const {
    TeacherGameInterruptionReportError,
  } = require("../src/services/teacherGameInterruptionReportService");
  actor = { id: 7, role: "teacher" };
  handler = async () => {
    throw new TeacherGameInterruptionReportError(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
  };
  const integrity = await get("/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25");
  assert.equal(integrity.response.status, 409);
  assert.deepEqual(integrity.payload, { code: "REPORT_INTEGRITY_ERROR", message: "Report could not be verified" });

  const logs = [];
  const original = console.error;
  console.error = (...values) => logs.push(values.join(" "));
  try {
    handler = async () => { throw new Error("private database details"); };
    const unexpected = await get("/api/teacher/analytics/students/11/game-interruptions/tutorial-level-1?classroomId=25");
    assert.equal(unexpected.response.status, 500);
    assert.deepEqual(unexpected.payload, { code: "SERVER_ERROR", message: "Server error" });
    assert.equal(logs.join(" ").includes("private database details"), false);
  } finally {
    console.error = original;
  }
});
