const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const { after, before, test } = require("node:test");

const requireRole = require("../src/middleware/requireRole");
const feedbackService = require("../src/services/studentClassroomFeedbackService");
const { StudentClassroomFeedbackError } = feedbackService;
const { createStudentClassroomFeedbackRouter } = require("../src/routes/studentClassroomFeedback");

const actors = new Map();
let serviceHandler;
let server;
let baseUrl;

const authenticate = (req, res, next) => {
  const authorization = req.get("Authorization");
  if (!authorization?.startsWith("Bearer test-")) {
    return res.status(401).json({ message: "Missing authentication token" });
  }
  const actor = actors.get(Number(authorization.slice("Bearer test-".length)));
  if (!actor) return res.status(401).json({ message: "Invalid or expired token" });
  req.userId = actor.id;
  req.userRole = actor.role;
  return next();
};

const request = async (path, {
  actorId,
  method = "POST",
  body,
  headers = {},
} = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(actorId ? { Authorization: `Bearer test-${actorId}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, payload: await response.json() };
};

const submit = (actorId, overrides = {}) => request(
  overrides.path || "/api/classrooms/7/feedback",
  {
    actorId,
    body: { message: "The worked examples helped me." },
    headers: { "Idempotency-Key": "feedback_key_123" },
    ...overrides,
  },
);

before(async () => {
  for (const [id, role] of [
    [51, "student"],
    [52, "student"],
    [61, "teacher"],
    [71, "admin"],
  ]) actors.set(id, { id, role });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api/classrooms",
    authenticate,
    requireRole("student"),
    createStudentClassroomFeedbackRouter({
      service: {
        submitStudentClassroomFeedback: (input) => serviceHandler(input),
      },
    }),
  );
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError
      && error.status === 400
      && error.type === "entity.parse.failed") {
      return res.status(400).json({
        code: "INVALID_REQUEST",
        message: "Malformed JSON request body",
      });
    }
    return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("active student submission uses authenticated identity and exact response serialization", async () => {
  let received;
  serviceHandler = async (input) => {
    received = input;
    return {
      changed: true,
      feedback: {
        id: 101,
        classroomId: 7,
        studentId: 51,
        message: input.message.trim(),
        idempotencyKey: input.idempotencyKey,
        createdAt: "2026-10-26T09:00:00.000Z",
        updatedAt: "2026-10-26T09:00:00.000Z",
        internalOnly: "hidden",
      },
    };
  };
  const result = await submit(51);
  assert.equal(result.response.status, 201);
  assert.deepEqual(received, {
    actorId: 51,
    actorRole: "student",
    classroomId: 7,
    message: "The worked examples helped me.",
    idempotencyKey: "feedback_key_123",
  });
  assert.deepEqual(result.payload, {
    changed: true,
    feedback: {
      id: 101,
      classroomId: 7,
      message: "The worked examples helped me.",
      createdAt: "2026-10-26T09:00:00.000Z",
    },
  });
});

test("matching committed retry returns 200 without route-level access checks", async () => {
  serviceHandler = async () => ({
    changed: false,
    feedback: {
      id: 81,
      classroomId: 7,
      message: "The worked examples helped me.",
      createdAt: "2026-10-20T09:00:00.000Z",
    },
  });
  const result = await submit(51);
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.changed, false);
  assert.equal(result.payload.feedback.id, 81);
});

test("authentication and student role are enforced with no administrator bypass", async () => {
  let calls = 0;
  serviceHandler = async () => { calls += 1; return { changed: true, feedback: {} }; };
  assert.equal((await submit(undefined)).response.status, 401);
  assert.equal((await submit(61)).response.status, 403);
  assert.equal((await submit(71)).response.status, 403);
  assert.equal(calls, 0);
});

test("strict path, body, query, and key validation rejects identity injection", async () => {
  let calls = 0;
  serviceHandler = async () => { calls += 1; return { changed: true, feedback: {} }; };
  const cases = [
    { path: "/api/classrooms/0/feedback" },
    { path: "/api/classrooms/1.5/feedback" },
    { path: "/api/classrooms/9007199254740992/feedback" },
    { path: "/api/classrooms/7/feedback?studentId=51" },
    { body: {} },
    { body: { message: "hello", actorId: 99 } },
    { body: { message: "hello", studentId: 99 } },
    { body: { message: "hello", classroomId: 9 } },
    { body: ["hello"] },
    { body: null },
    { headers: {} },
    { headers: { "Idempotency-Key": "short" } },
    { headers: { "Idempotency-Key": "invalid.key" } },
  ];
  for (const [index, entry] of cases.entries()) {
    const actorId = 100 + index;
    actors.set(actorId, { id: actorId, role: "student" });
    const options = { ...entry };
    if (!Object.prototype.hasOwnProperty.call(entry, "body")) options.body = { message: "hello" };
    if (!Object.prototype.hasOwnProperty.call(entry, "headers")) {
      options.headers = { "Idempotency-Key": "validation_key_123" };
    }
    const result = await submit(actorId, options);
    assert.equal(result.response.status, 400, JSON.stringify(entry));
    assert.equal(result.payload.code, "INVALID_REQUEST");
  }
  assert.equal(calls, 0);
});

test("malformed JSON and duplicate Idempotency-Key headers are rejected", async () => {
  let calls = 0;
  serviceHandler = async () => { calls += 1; return { changed: true, feedback: {} }; };
  actors.set(89, { id: 89, role: "student" });
  actors.set(90, { id: 90, role: "student" });
  const malformed = await fetch(`${baseUrl}/api/classrooms/7/feedback`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-89",
      "Content-Type": "application/json",
      "Idempotency-Key": "validation_key_124",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "INVALID_REQUEST");

  const duplicate = await new Promise((resolve, reject) => {
    const requestInstance = http.request(`${baseUrl}/api/classrooms/7/feedback`, {
      method: "POST",
      headers: [
        "Host", new URL(baseUrl).host,
        "Authorization", "Bearer test-90",
        "Content-Type", "application/json",
        "Content-Length", "19",
        "Idempotency-Key", "validation_key_125",
        "idempotency-key", "validation_key_125",
      ],
    }, (response) => {
      let responseBody = "";
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, payload: JSON.parse(responseBody) }));
    });
    requestInstance.on("error", reject);
    requestInstance.end('{"message":"hello"}');
  });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.payload.code, "INVALID_REQUEST");
  assert.equal(calls, 0);
});

test("known service errors preserve status, code, and safe message", async () => {
  for (const expected of [
    [409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict"],
    [409, "CLASSROOM_INACTIVE", "Classroom is inactive"],
    [404, "CLASSROOM_NOT_FOUND", "Classroom was not found"],
    [403, "FORBIDDEN", "Forbidden"],
  ]) {
    const actorId = 200 + expected[0] + expected[1].length;
    actors.set(actorId, { id: actorId, role: "student" });
    serviceHandler = async () => { throw new StudentClassroomFeedbackError(...expected); };
    const result = await submit(actorId, {
      headers: { "Idempotency-Key": `mapping_key_${expected[1]}` },
    });
    assert.equal(result.response.status, expected[0]);
    assert.deepEqual(result.payload, { code: expected[1], message: expected[2] });
  }
});

test("unexpected failures return a neutral response and log no private data", async () => {
  const privateText = "Private feedback that must not leak";
  const privateKey = "unexpected_key_123";
  actors.set(301, { id: 301, role: "student" });
  serviceHandler = async () => { throw new Error(`database failed: ${privateText} ${privateKey}`); };
  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...values) => { logs.push(values.join(" ")); };
  try {
    const result = await submit(301, {
      body: { message: privateText },
      headers: { "Idempotency-Key": privateKey },
    });
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.payload, { code: "SERVER_ERROR", message: "Server error" });
  } finally {
    console.error = originalConsoleError;
  }
  assert.doesNotMatch(logs.join("\n"), new RegExp(`${privateText}|${privateKey}`));
});

test("feedback rate limit permits ten requests, counts retries, and isolates actors", async () => {
  actors.set(401, { id: 401, role: "student" });
  actors.set(402, { id: 402, role: "student" });
  let calls = 0;
  serviceHandler = async (input) => {
    calls += 1;
    return {
      changed: calls === 1,
      feedback: {
        id: 90,
        classroomId: input.classroomId,
        message: input.message,
        createdAt: "2026-10-26T09:00:00.000Z",
      },
    };
  };
  for (let index = 0; index < 10; index += 1) {
    const allowed = await submit(401, { headers: { "Idempotency-Key": "burst_feedback_key_1" } });
    assert.ok([200, 201].includes(allowed.response.status));
  }
  const limited = await submit(401, { headers: { "Idempotency-Key": "burst_feedback_key_1" } });
  assert.equal(limited.response.status, 429);
  assert.deepEqual(limited.payload, {
    code: "FEEDBACK_RATE_LIMITED",
    message: "Classroom feedback submission is temporarily rate limited. Please try again shortly.",
  });
  assert.match(limited.response.headers.get("retry-after"), /^[1-9][0-9]*$/);
  const isolated = await submit(402, { headers: { "Idempotency-Key": "burst_feedback_key_2" } });
  assert.equal(isolated.response.status, 200);
  assert.equal(calls, 11);
});
