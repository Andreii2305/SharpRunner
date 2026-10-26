const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { after, afterEach, before, beforeEach, test } = require("node:test");

process.env.JWT_SECRET = "private-check-in-route-test-secret";

const User = require("../src/models/User");
const Classroom = require("../src/models/Classroom");
const ClassroomAnnouncement = require("../src/models/ClassroomAnnouncement");
const privateCheckInService = require("../src/services/privateCheckInService");
const { PrivateCheckInError } = privateCheckInService;
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require("../src/constants/policyVersions");

const originalFindUser = User.findByPk;
const originalCreateCheckIn = privateCheckInService.createPrivateCheckIn;
const originalFindClassroom = Classroom.findByPk;
const originalCreateAnnouncement = ClassroomAnnouncement.create;

const actors = new Map();
let serviceHandler;
let server;
let baseUrl;

const activeActor = (id, role) => ({
  id,
  role,
  status: "active",
  tokenVersion: 0,
  termsVersionAccepted: TERMS_VERSION,
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
});

const authToken = (id) => jwt.sign(
  { id, tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);

const request = async (path, {
  actorId,
  method = "POST",
  body,
  headers = {},
} = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(actorId ? { Authorization: `Bearer ${authToken(actorId)}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, payload: await response.json() };
};

const send = (actorId, overrides = {}) => request(
  overrides.path || "/api/teacher/classrooms/7/students/51/check-ins",
  {
    actorId,
    body: { message: "Could we check in after class?" },
    headers: { "Idempotency-Key": "checkin_key_123" },
    ...overrides,
  },
);

before(async () => {
  for (const [id, role] of [[41, "teacher"], [42, "teacher"], [51, "student"], [61, "admin"]]) {
    actors.set(id, activeActor(id, role));
  }
  const app = require("../src/app");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  User.findByPk = async (id, options = {}) => {
    if (options.attributes?.includes("tokenVersion")) return actors.get(Number(id)) || null;
    return originalFindUser.call(User, id, options);
  };
  privateCheckInService.createPrivateCheckIn = (input) => serviceHandler(input);
});

afterEach(() => {
  User.findByPk = originalFindUser;
  privateCheckInService.createPrivateCheckIn = originalCreateCheckIn;
  Classroom.findByPk = originalFindClassroom;
  ClassroomAnnouncement.create = originalCreateAnnouncement;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("owner and administrator use authenticated identity and receive the exact new-record response", async () => {
  for (const [actorId, role] of [[41, "teacher"], [61, "admin"]]) {
    let received;
    serviceHandler = async (input) => {
      received = input;
      return {
        changed: true,
        checkIn: {
          id: actorId + 100,
          senderId: actorId,
          senderRole: role,
          classroomId: 7,
          recipientStudentId: 51,
          message: input.message.trim(),
          idempotencyKey: input.idempotencyKey,
          createdAt: "2026-10-25T05:00:00.000Z",
          updatedAt: "2026-10-25T05:00:00.000Z",
          internal: "hidden",
        },
      };
    };

    const result = await send(actorId);
    assert.equal(result.response.status, 201);
    assert.deepEqual(received, {
      actorId,
      actorRole: role,
      classroomId: 7,
      studentId: 51,
      message: "Could we check in after class?",
      idempotencyKey: "checkin_key_123",
    });
    assert.deepEqual(result.payload, {
      changed: true,
      checkIn: {
        id: actorId + 100,
        classroomId: 7,
        recipientStudentId: 51,
        message: "Could we check in after class?",
        createdAt: "2026-10-25T05:00:00.000Z",
      },
    });
  }
});

test("matching retries return 200 and the same allowlisted shape", async () => {
  serviceHandler = async () => ({
    changed: false,
    checkIn: {
      id: 88,
      senderId: 41,
      senderRole: "teacher",
      classroomId: 7,
      recipientStudentId: 51,
      message: "Could we check in after class?",
      createdAt: "2026-10-25T05:00:00.000Z",
      updatedAt: "2026-10-25T05:00:00.000Z",
    },
  });
  const result = await send(41);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, {
    changed: false,
    checkIn: {
      id: 88,
      classroomId: 7,
      recipientStudentId: 51,
      message: "Could we check in after class?",
      createdAt: "2026-10-25T05:00:00.000Z",
    },
  });
});

test("authentication and teacher/admin roles are enforced before the service", async () => {
  let calls = 0;
  serviceHandler = async () => { calls += 1; return { changed: true, checkIn: {} }; };
  assert.equal((await send(undefined)).response.status, 401);
  assert.equal((await send(51)).response.status, 403);
  assert.equal(calls, 0);
});

test("strict path, body, query, and key validation rejects untrusted identity input", async () => {
  let calls = 0;
  serviceHandler = async () => { calls += 1; return { changed: true, checkIn: {} }; };
  const cases = [
    { path: "/api/teacher/classrooms/0/students/51/check-ins" },
    { path: "/api/teacher/classrooms/7/students/1.5/check-ins" },
    { path: "/api/teacher/classrooms/9007199254740992/students/51/check-ins" },
    { path: "/api/teacher/classrooms/7/students/51/check-ins?studentId=51" },
    { body: {} },
    { body: { message: "hello", actorId: 41 } },
    { body: { message: "hello", classroomId: 7 } },
    { body: { message: "hello", studentId: 51 } },
    { body: ["hello"] },
    { body: null },
    { headers: {} },
    { headers: { "Idempotency-Key": "short" } },
    { headers: { "Idempotency-Key": "invalid.key" } },
  ];
  for (const [index, entry] of cases.entries()) {
    const actorId = 100 + index;
    actors.set(actorId, activeActor(actorId, "teacher"));
    const options = { ...entry };
    if (!Object.prototype.hasOwnProperty.call(entry, "body")) {
      options.body = { message: "hello" };
    }
    if (!Object.prototype.hasOwnProperty.call(entry, "headers")) {
      options.headers = { "Idempotency-Key": "validation_key_123" };
    }
    const result = await send(actorId, options);
    assert.equal(result.response.status, 400, JSON.stringify(entry));
    assert.equal(result.payload.code, "INVALID_REQUEST");
  }
  assert.equal(calls, 0);
});

test("malformed JSON and duplicate Idempotency-Key headers are rejected", async () => {
  let calls = 0;
  serviceHandler = async () => { calls += 1; return { changed: true, checkIn: {} }; };
  actors.set(89, activeActor(89, "teacher"));
  actors.set(90, activeActor(90, "teacher"));
  const malformed = await fetch(`${baseUrl}/api/teacher/classrooms/7/students/51/check-ins`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken(89)}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "validation_key_124",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "INVALID_REQUEST");

  const duplicate = await new Promise((resolve, reject) => {
    const requestInstance = http.request(`${baseUrl}/api/teacher/classrooms/7/students/51/check-ins`, {
      method: "POST",
      headers: [
        "Host", new URL(baseUrl).host,
        "Authorization", `Bearer ${authToken(90)}`,
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

test("service conflicts and inactive or missing recipients preserve their safe contracts", async () => {
  for (const expected of [
    [409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict"],
    [409, "CLASSROOM_INACTIVE", "Classroom is inactive"],
    [404, "ACTIVE_STUDENT_NOT_FOUND", "Active student was not found"],
    [403, "FORBIDDEN", "Forbidden"],
  ]) {
    serviceHandler = async () => { throw new PrivateCheckInError(...expected); };
    const result = await send(42, { headers: { "Idempotency-Key": `mapping_key_${expected[1]}` } });
    assert.equal(result.response.status, expected[0]);
    assert.deepEqual(result.payload, { code: expected[1], message: expected[2] });
  }
});

test("unexpected failures return a safe response and do not log private request data", async () => {
  const privateText = "Private message that must not leak";
  const privateKey = "unexpected_key_123";
  serviceHandler = async () => { throw new Error(`database failed: ${privateText} ${privateKey}`); };
  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...values) => { logs.push(values.join(" ")); };
  try {
    const result = await send(42, {
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

test("check-in burst limiting is actor-isolated, permits ten requests, and counts retries", async () => {
  actors.set(71, activeActor(71, "teacher"));
  actors.set(72, activeActor(72, "teacher"));
  let calls = 0;
  serviceHandler = async (input) => {
    calls += 1;
    return {
      changed: calls === 1,
      checkIn: {
        id: 90,
        classroomId: input.classroomId,
        recipientStudentId: input.studentId,
        message: input.message,
        createdAt: "2026-10-25T05:00:00.000Z",
      },
    };
  };
  for (let index = 0; index < 10; index += 1) {
    const allowed = await send(71, { headers: { "Idempotency-Key": "burst_key_123" } });
    assert.ok([200, 201].includes(allowed.response.status));
  }
  const limited = await send(71, { headers: { "Idempotency-Key": "burst_key_123" } });
  assert.equal(limited.response.status, 429);
  assert.deepEqual(limited.payload, {
    code: "CHECK_IN_RATE_LIMITED",
    message: "Private check-in sending is temporarily rate limited. Please try again shortly.",
  });
  assert.match(limited.response.headers.get("retry-after"), /^[1-9][0-9]*$/);

  const isolated = await send(72, { headers: { "Idempotency-Key": "burst_key_124" } });
  assert.equal(isolated.response.status, 200);
  assert.equal(calls, 11);
});

test("the existing classroom announcement route remains unchanged", async () => {
  Classroom.findByPk = async () => ({
    id: 7,
    teacherId: 41,
    className: "C# Foundations",
    section: "A",
    isActive: true,
  });
  ClassroomAnnouncement.create = async (values) => ({
    id: 301,
    ...values,
    createdAt: "2026-10-25T05:30:00.000Z",
  });
  const originalUserFind = User.findByPk;
  User.findByPk = async (id, options = {}) => {
    if (options.attributes?.includes("tokenVersion")) return actors.get(Number(id)) || null;
    return { id: 41, firstName: "Tess", lastName: "Teacher", username: "tess" };
  };
  try {
    const result = await request("/api/teacher/announcements", {
      actorId: 41,
      body: { classroomId: 7, message: "Class starts at nine." },
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.payload.message, "Announcement posted");
    assert.equal(result.payload.announcement.message, "Class starts at nine.");
  } finally {
    User.findByPk = originalUserFind;
  }
});
