const assert = require("node:assert/strict");
const express = require("express");
const { after, before, test } = require("node:test");

const requireRole = require("../src/middleware/requireRole");
const {
  createStudentClassroomFeedbackReadService,
} = require("../src/services/studentClassroomFeedbackReadService");
const {
  createStudentClassroomFeedbackRouter,
} = require("../src/routes/studentClassroomFeedback");

const actors = new Map([
  [51, { id: 51, role: "student", status: "active" }],
  [52, { id: 52, role: "student", status: "active" }],
  [5, { id: 5, role: "teacher", status: "active" }],
  [9, { id: 9, role: "admin", status: "active" }],
]);
let readHandler;
let server;
let baseUrl;

const authenticate = (req, res, next) => {
  const header = req.get("Authorization");
  if (!header?.startsWith("Bearer test-")) {
    return res.status(401).json({ message: "Missing authentication token" });
  }
  const actor = actors.get(Number(header.slice("Bearer test-".length)));
  if (!actor) return res.status(401).json({ message: "Invalid or expired token" });
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
    "/api/classrooms",
    authenticate,
    requireRole("student"),
    createStudentClassroomFeedbackRouter({
      service: { submitStudentClassroomFeedback: async () => { throw new Error("not used"); } },
      readService: { listStudentClassroomFeedback: (input) => readHandler(input) },
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("history uses authenticated student identity and the production read service", async () => {
  let received;
  let query;
  const service = createStudentClassroomFeedbackReadService({
    models: {
      StudentClassroomFeedback: {
        findAndCountAll: async (options) => {
          query = options;
          return {
            count: 1,
            rows: [{
              id: 8,
              classroomId: 7,
              message: "My feedback",
              createdAt: new Date("2026-10-26T00:00:00.000Z"),
              classroom: {
                id: 7,
                className: "Algorithms",
                section: "A",
                schoolYear: "2026-2027",
                isActive: false,
              },
            }],
          };
        },
      },
      Classroom: { name: "Classroom" },
    },
  });
  readHandler = async (input) => {
    received = input;
    return service.listStudentClassroomFeedback(input);
  };

  const result = await request("/api/classrooms/feedback/me?page=2&limit=5", 51);
  assert.equal(result.response.status, 200);
  assert.deepEqual(received, { studentId: 51, page: 2, limit: 5, offset: 5 });
  assert.deepEqual(query.where, { studentId: 51 });
  assert.deepEqual(result.payload, {
    feedback: [{
      id: 8,
      classroomId: 7,
      classroom: {
        id: 7,
        className: "Algorithms",
        section: "A",
        schoolYear: "2026-2027",
        isActive: false,
      },
      message: "My feedback",
      createdAt: "2026-10-26T00:00:00.000Z",
    }],
    page: 2,
    limit: 5,
    total: 1,
    totalPages: 1,
  });
});

test("history defaults pagination and accepts no caller identity or classroom scope", async () => {
  let received;
  readHandler = async (input) => {
    received = input;
    return { feedback: [], page: 1, limit: 20, total: 0, totalPages: 1 };
  };
  const result = await request("/api/classrooms/feedback/me", 52);
  assert.equal(result.response.status, 200);
  assert.deepEqual(received, { studentId: 52, page: 1, limit: 20, offset: 0 });

  for (const query of ["studentId=51", "classroomId=7"]) {
    const invalid = await request(`/api/classrooms/feedback/me?${query}`, 52);
    assert.equal(invalid.response.status, 400);
    assert.deepEqual(invalid.payload, { code: "INVALID_REQUEST", message: "Invalid request" });
  }
});

test("unauthenticated teacher and administrator requests are denied before listing", async () => {
  let calls = 0;
  readHandler = async () => { calls += 1; return {}; };
  assert.equal((await request("/api/classrooms/feedback/me")).response.status, 401);
  assert.equal((await request("/api/classrooms/feedback/me", 5)).response.status, 403);
  assert.equal((await request("/api/classrooms/feedback/me", 9)).response.status, 403);
  assert.equal(calls, 0);
});

test("strict pagination rejects malformed repeated unknown and unsafe values", async () => {
  let calls = 0;
  readHandler = async () => { calls += 1; return {}; };
  const queries = [
    "page=0",
    "page=1.5",
    "page=abc",
    "limit=0",
    "limit=101",
    "limit=1.5",
    "page=9007199254740991&limit=100",
    "page=1&page=2",
    "limit=20&limit=21",
    "unknown=1",
  ];
  for (const query of queries) {
    const result = await request(`/api/classrooms/feedback/me?${query}`, 51);
    assert.equal(result.response.status, 400, query);
    assert.deepEqual(result.payload, { code: "INVALID_REQUEST", message: "Invalid request" });
  }
  assert.equal(calls, 0);
});

test("unexpected listing failures are neutral and never log private feedback", async () => {
  const privateText = "Private feedback must stay private";
  readHandler = async () => { throw new Error(privateText); };
  const original = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values.join(" "));
  try {
    const result = await request("/api/classrooms/feedback/me", 51);
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.payload, { code: "SERVER_ERROR", message: "Server error" });
  } finally {
    console.error = original;
  }
  assert.doesNotMatch(logs.join("\n"), new RegExp(privateText));
});
