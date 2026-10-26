const assert = require("node:assert/strict");
const express = require("express");
const { after, before, test } = require("node:test");

const requireRole = require("../src/middleware/requireRole");
const {
  TeacherClassroomFeedbackReadError,
  createTeacherClassroomFeedbackReadService,
} = require("../src/services/teacherClassroomFeedbackReadService");
const {
  createTeacherClassroomFeedbackRouter,
} = require("../src/routes/teacherClassroomFeedback");

const actors = new Map([
  [5, { id: 5, role: "teacher", status: "active" }],
  [6, { id: 6, role: "teacher", status: "active" }],
  [9, { id: 9, role: "admin", status: "active" }],
  [51, { id: 51, role: "student", status: "active" }],
  [10, { id: 10, role: "teacher", status: "inactive" }],
]);
let serviceHandler;
let server;
let baseUrl;

const authenticate = (req, res, next) => {
  const header = req.get("Authorization");
  if (!header?.startsWith("Bearer test-")) {
    return res.status(401).json({ message: "Missing authentication token" });
  }
  const actor = actors.get(Number(header.slice("Bearer test-".length)));
  if (!actor) return res.status(401).json({ message: "Invalid or expired token" });
  if (actor.status !== "active") return res.status(403).json({ message: "Account is not active" });
  req.userId = actor.id;
  req.userRole = actor.role;
  return next();
};

const request = async (path, actorId) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: actorId ? { Authorization: `Bearer test-${actorId}` } : {},
  });
  return { response, payload: await response.json() };
};

before(async () => {
  const app = express();
  app.use(
    "/api/teacher",
    authenticate,
    requireRole("teacher", "admin"),
    createTeacherClassroomFeedbackRouter({
      service: { listTeacherClassroomFeedback: (input) => serviceHandler(input) },
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("owning teacher receives the exact response and authenticated identity is forwarded", async () => {
  let received;
  let feedbackQuery;
  const readService = createTeacherClassroomFeedbackReadService({
    models: {
      Classroom: {
        findByPk: async (id) => ({ id, teacherId: 5 }),
      },
      StudentClassroomFeedback: {
        findAndCountAll: async (options) => {
          feedbackQuery = options;
          return {
            count: 6,
            rows: [{
              id: 4,
              classroomId: 7,
              message: "Helpful feedback",
              createdAt: new Date("2026-10-26T00:00:00.000Z"),
              student: { id: 51, firstName: "Ada", lastName: "Learner", username: "ada" },
            }],
          };
        },
      },
      User: { name: "User" },
    },
  });
  serviceHandler = async (input) => {
    received = input;
    return readService.listTeacherClassroomFeedback(input);
  };
  const result = await request(
    "/api/teacher/classrooms/7/student-feedback?page=2&limit=5",
    5,
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(received, { actorId: 5, classroomId: 7, page: 2, limit: 5, offset: 5 });
  assert.deepEqual(result.payload, {
    feedback: [{
      id: 4,
      classroomId: 7,
      message: "Helpful feedback",
      createdAt: "2026-10-26T00:00:00.000Z",
      student: { id: 51, firstName: "Ada", lastName: "Learner", username: "ada" },
    }],
    page: 2,
    limit: 5,
    total: 6,
    totalPages: 2,
  });
  assert.deepEqual(feedbackQuery.where, { classroomId: 7 });
  assert.equal(feedbackQuery.limit, 5);
  assert.equal(feedbackQuery.offset, 5);
});

test("pagination defaults to page one and twenty rows", async () => {
  let received;
  serviceHandler = async (input) => {
    received = input;
    return { feedback: [], page: 1, limit: 20, total: 0, totalPages: 1 };
  };
  const result = await request("/api/teacher/classrooms/7/student-feedback", 5);
  assert.equal(result.response.status, 200);
  assert.deepEqual(received, { actorId: 5, classroomId: 7, page: 1, limit: 20, offset: 0 });
  assert.deepEqual(result.payload, {
    feedback: [], page: 1, limit: 20, total: 0, totalPages: 1,
  });
});

test("authentication active-account and teacher-only gates reject students and administrators", async () => {
  let calls = 0;
  serviceHandler = async () => { calls += 1; return {}; };
  assert.equal((await request("/api/teacher/classrooms/7/student-feedback")).response.status, 401);
  assert.equal((await request("/api/teacher/classrooms/7/student-feedback", 51)).response.status, 403);
  const admin = await request("/api/teacher/classrooms/7/student-feedback", 9);
  assert.equal(admin.response.status, 403);
  assert.deepEqual(admin.payload, { code: "FORBIDDEN", message: "Forbidden" });
  assert.equal((await request("/api/teacher/classrooms/7/student-feedback", 10)).response.status, 403);
  assert.equal(calls, 0);
});

test("strict classroom and pagination validation rejects malformed repeated and unknown values", async () => {
  let calls = 0;
  serviceHandler = async () => { calls += 1; return {}; };
  const paths = [
    "/api/teacher/classrooms/0/student-feedback",
    "/api/teacher/classrooms/1.5/student-feedback",
    "/api/teacher/classrooms/9007199254740992/student-feedback",
    "/api/teacher/classrooms/7/student-feedback?page=0",
    "/api/teacher/classrooms/7/student-feedback?page=1.5",
    "/api/teacher/classrooms/7/student-feedback?limit=101",
    "/api/teacher/classrooms/7/student-feedback?page=9007199254740991&limit=100",
    "/api/teacher/classrooms/7/student-feedback?page=1&page=2",
    "/api/teacher/classrooms/7/student-feedback?limit=20&limit=21",
    "/api/teacher/classrooms/7/student-feedback?studentId=51",
  ];
  for (const path of paths) {
    const result = await request(path, 5);
    assert.equal(result.response.status, 400, path);
    assert.deepEqual(result.payload, { code: "INVALID_REQUEST", message: "Invalid request" }, path);
  }
  assert.equal(calls, 0);
});

test("known authorization and missing-classroom errors retain safe contracts", async () => {
  for (const expected of [
    [403, "FORBIDDEN", "Forbidden"],
    [404, "CLASSROOM_NOT_FOUND", "Classroom was not found"],
  ]) {
    serviceHandler = async () => { throw new TeacherClassroomFeedbackReadError(...expected); };
    const result = await request("/api/teacher/classrooms/7/student-feedback", 5);
    assert.equal(result.response.status, expected[0]);
    assert.deepEqual(result.payload, { code: expected[1], message: expected[2] });
  }
});

test("unexpected errors are neutral and never log private feedback", async () => {
  const privateText = "Private classroom feedback";
  serviceHandler = async () => { throw new Error(privateText); };
  const original = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values.join(" "));
  try {
    const result = await request("/api/teacher/classrooms/7/student-feedback", 5);
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.payload, { code: "SERVER_ERROR", message: "Server error" });
  } finally {
    console.error = original;
  }
  assert.doesNotMatch(logs.join("\n"), new RegExp(privateText));
});
