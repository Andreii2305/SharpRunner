const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { after, before, test } = require("node:test");

const requireRole = require("../src/middleware/requireRole");
let createPlatformFeedbackRouter;
let createAdminPlatformFeedbackRouter;
let PlatformFeedbackError;
let PlatformFeedbackReadError;
try {
  ({ createPlatformFeedbackRouter, createAdminPlatformFeedbackRouter } = require("../src/routes/platformFeedback"));
  ({ PlatformFeedbackError } = require("../src/services/platformFeedbackService"));
  ({ PlatformFeedbackReadError } = require("../src/services/platformFeedbackReadService"));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

const actors = new Map([
  [51, { id: 51, role: "student", status: "active" }],
  [52, { id: 52, role: "teacher", status: "active" }],
  [53, { id: 53, role: "student", status: "inactive" }],
  [9, { id: 9, role: "admin", status: "active" }],
  [10, { id: 10, role: "admin", status: "inactive" }],
  [401, { id: 401, role: "student", status: "active" }],
  [402, { id: 402, role: "student", status: "active" }],
]);
let submitHandler;
let ownHandler;
let adminHandler;
let server;
let baseUrl;

const authenticate = (req, res, next) => {
  const header = req.get("Authorization");
  if (!header?.startsWith("Bearer test-")) return res.status(401).json({ message: "Missing authentication token" });
  const actor = actors.get(Number(header.slice("Bearer test-".length)));
  if (!actor) return res.status(401).json({ message: "Invalid or expired token" });
  if (actor.status !== "active") return res.status(403).json({ message: "Account is not active" });
  req.userId = actor.id;
  req.userRole = actor.role;
  return next();
};

const request = async (path, {
  actorId,
  method = "GET",
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

before(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api/feedback",
    authenticate,
    requireRole("student", "teacher"),
    createPlatformFeedbackRouter?.({
      service: { submitPlatformFeedback: (input) => submitHandler(input) },
      readService: { listOwnPlatformFeedback: (input) => ownHandler(input) },
    }),
  );
  app.use(
    "/api/admin/feedback",
    authenticate,
    requireRole("admin"),
    createAdminPlatformFeedbackRouter?.({
      readService: { listAdminPlatformFeedback: (input) => adminHandler(input) },
    }),
  );
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.type === "entity.parse.failed") {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Malformed JSON request body" });
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

test("platform feedback routers are available", () => {
  assert.equal(typeof createPlatformFeedbackRouter, "function");
  assert.equal(typeof createAdminPlatformFeedbackRouter, "function");
});

test("student and teacher submissions use authenticated identity and exact serialization", async () => {
  for (const actorId of [51, 52]) {
    let received;
    submitHandler = async (input) => {
      received = input;
      return {
        changed: actorId === 51,
        feedback: {
          id: 101,
          authorUserId: 999,
          message: input.message.trim(),
          idempotencyKey: input.idempotencyKey,
          createdAt: "2026-11-03T09:00:00.000Z",
          updatedAt: "2026-11-03T09:00:00.000Z",
        },
      };
    };
    const result = await request("/api/feedback/platform", {
      actorId,
      method: "POST",
      body: { message: "Private platform feedback" },
      headers: { "Idempotency-Key": `platform_route_key_${actorId}` },
    });
    assert.equal(result.response.status, actorId === 51 ? 201 : 200);
    assert.deepEqual(received, {
      actorId,
      actorRole: actorId === 51 ? "student" : "teacher",
      message: "Private platform feedback",
      idempotencyKey: `platform_route_key_${actorId}`,
    });
    assert.deepEqual(result.payload, {
      changed: actorId === 51,
      feedback: {
        id: 101,
        message: "Private platform feedback",
        createdAt: "2026-11-03T09:00:00.000Z",
      },
    });
    assert.equal(result.response.headers.get("cache-control"), "private, no-store, max-age=0");
  }
});

test("authentication and role gates deny administrator submission and non-admin listing", async () => {
  let submitCalls = 0;
  let adminCalls = 0;
  submitHandler = async () => { submitCalls += 1; return {}; };
  adminHandler = async () => { adminCalls += 1; return {}; };
  assert.equal((await request("/api/feedback/platform", { method: "POST" })).response.status, 401);
  assert.equal((await request("/api/feedback/platform", {
    actorId: 9, method: "POST", body: { message: "No" }, headers: { "Idempotency-Key": "admin_denied_key" },
  })).response.status, 403);
  assert.equal((await request("/api/admin/feedback/platform", { actorId: 51 })).response.status, 403);
  assert.equal((await request("/api/admin/feedback/platform", { actorId: 52 })).response.status, 403);
  assert.equal((await request("/api/feedback/platform/me", { actorId: 53 })).response.status, 403);
  assert.equal((await request("/api/admin/feedback/platform", { actorId: 10 })).response.status, 403);
  assert.equal(submitCalls, 0);
  assert.equal(adminCalls, 0);
});

test("platform submission uses an actor-isolated process-local retry-counting bucket", async () => {
  let calls = 0;
  submitHandler = async (input) => {
    calls += 1;
    return {
      changed: false,
      feedback: {
        id: 90,
        message: input.message,
        createdAt: "2026-11-03T09:00:00.000Z",
      },
    };
  };
  for (let index = 0; index < 10; index += 1) {
    const allowed = await request("/api/feedback/platform", {
      actorId: 401,
      method: "POST",
      body: { message: "Same retry" },
      headers: { "Idempotency-Key": "platform_burst_key_1" },
    });
    assert.equal(allowed.response.status, 200);
  }
  const limited = await request("/api/feedback/platform", {
    actorId: 401,
    method: "POST",
    body: { message: "Same retry" },
    headers: { "Idempotency-Key": "platform_burst_key_1" },
  });
  assert.equal(limited.response.status, 429);
  assert.deepEqual(limited.payload, {
    code: "PLATFORM_FEEDBACK_RATE_LIMITED",
    message: "Platform feedback submission is temporarily rate limited. Please try again shortly.",
  });
  assert.match(limited.response.headers.get("retry-after"), /^[1-9][0-9]*$/);
  const isolated = await request("/api/feedback/platform", {
    actorId: 402,
    method: "POST",
    body: { message: "Separate actor" },
    headers: { "Idempotency-Key": "platform_burst_key_2" },
  });
  assert.equal(isolated.response.status, 200);
  assert.equal(calls, 11);
});

test("the production application registers the platform feedback author routes", async () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "platform-feedback-route-registration-test-secret";
  const productionApp = require("../src/app");
  const productionServer = productionApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => productionServer.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${productionServer.address().port}/api/feedback/platform/me`,
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "Missing authentication token" });
  } finally {
    await new Promise((resolve) => productionServer.close(resolve));
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("the production administrator router registers the platform feedback listing", async () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "platform-feedback-admin-registration-test-secret";
  const User = require("../src/models/User");
  const readService = require("../src/services/platformFeedbackReadService");
  const originalFindByPk = User.findByPk;
  const originalList = readService.listAdminPlatformFeedback;
  User.findByPk = async () => ({
    id: 9,
    role: "admin",
    status: "active",
    tokenVersion: 0,
    termsVersionAccepted: "1.0",
    privacyVersionAcknowledged: "1.0",
  });
  readService.listAdminPlatformFeedback = async (input) => ({
    feedback: [],
    page: input.page,
    limit: input.limit,
    total: 0,
    totalPages: 1,
  });
  const productionApp = require("../src/app");
  const productionServer = productionApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => productionServer.once("listening", resolve));
  try {
    const token = jwt.sign({ id: 9, role: "admin", tokenVersion: 0 }, process.env.JWT_SECRET);
    const response = await fetch(
      `http://127.0.0.1:${productionServer.address().port}/api/admin/feedback/platform`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      feedback: [], page: 1, limit: 20, total: 0, totalPages: 1,
    });
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  } finally {
    await new Promise((resolve) => productionServer.close(resolve));
    User.findByPk = originalFindByPk;
    readService.listAdminPlatformFeedback = originalList;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("submission strictly rejects malformed bodies queries headers and supplied identity", async () => {
  let calls = 0;
  submitHandler = async () => { calls += 1; return {}; };
  const cases = [
    { path: "/api/feedback/platform?studentId=51", body: { message: "Hello" }, headers: { "Idempotency-Key": "strict_key_001" } },
    { body: {}, headers: { "Idempotency-Key": "strict_key_002" } },
    { body: { message: "Hello", authorUserId: 99 }, headers: { "Idempotency-Key": "strict_key_003" } },
    { body: { message: "Hello", role: "student" }, headers: { "Idempotency-Key": "strict_key_004" } },
    { body: ["Hello"], headers: { "Idempotency-Key": "strict_key_005" } },
    { body: null, headers: { "Idempotency-Key": "strict_key_006" } },
    { body: { message: "Hello" }, headers: {} },
    { body: { message: "Hello" }, headers: { "Idempotency-Key": "short" } },
  ];
  for (const entry of cases) {
    const result = await request(entry.path || "/api/feedback/platform", {
      actorId: 51, method: "POST", ...entry,
    });
    assert.equal(result.response.status, 400, JSON.stringify(entry));
    assert.equal(result.payload.code, "INVALID_REQUEST");
  }
  assert.equal(calls, 0);
});

test("duplicate idempotency headers and malformed JSON are rejected", async () => {
  let calls = 0;
  submitHandler = async () => { calls += 1; return {}; };
  const malformed = await fetch(`${baseUrl}/api/feedback/platform`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-51",
      "Content-Type": "application/json",
      "Idempotency-Key": "malformed_body_key",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "INVALID_REQUEST");

  const duplicate = await new Promise((resolve, reject) => {
    const instance = http.request(`${baseUrl}/api/feedback/platform`, {
      method: "POST",
      headers: [
        "Host", new URL(baseUrl).host,
        "Authorization", "Bearer test-51",
        "Content-Type", "application/json",
        "Content-Length", "19",
        "Idempotency-Key", "duplicate_header_key",
        "idempotency-key", "duplicate_header_key",
      ],
    }, (response) => {
      let responseBody = "";
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, payload: JSON.parse(responseBody) }));
    });
    instance.on("error", reject);
    instance.end('{"message":"hello"}');
  });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.payload.code, "INVALID_REQUEST");
  assert.equal(calls, 0);
});

test("author and admin histories use exact scope pagination allowlists and no-store", async () => {
  let ownInput;
  let adminInput;
  ownHandler = async (input) => {
    ownInput = input;
    return { feedback: [{ id: 1, message: "Mine", createdAt: "2026-11-03T00:00:00.000Z" }], page: 2, limit: 5, total: 6, totalPages: 2 };
  };
  adminHandler = async (input) => {
    adminInput = input;
    return { feedback: [{ id: 1, message: "Private", createdAt: "2026-11-03T00:00:00.000Z", author: { id: 51, firstName: "Ada", lastName: "Lovelace", username: "ada", role: "student", status: "active" } }], page: 1, limit: 20, total: 1, totalPages: 1 };
  };
  const own = await request("/api/feedback/platform/me?page=2&limit=5", { actorId: 51 });
  assert.equal(own.response.status, 200);
  assert.deepEqual(ownInput, { actorId: 51, actorRole: "student", page: 2, limit: 5, offset: 5 });
  assert.equal(own.response.headers.get("cache-control"), "private, no-store, max-age=0");

  const admin = await request("/api/admin/feedback/platform", { actorId: 9 });
  assert.equal(admin.response.status, 200);
  assert.deepEqual(adminInput, { actorId: 9, actorRole: "admin", page: 1, limit: 20, offset: 0 });
  assert.deepEqual(admin.payload.feedback[0].author, {
    id: 51, firstName: "Ada", lastName: "Lovelace", username: "ada", role: "student", status: "active",
  });
  assert.equal(admin.response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("history pagination rejects repeated unknown malformed and unsafe values", async () => {
  let calls = 0;
  ownHandler = async () => { calls += 1; return {}; };
  adminHandler = async () => { calls += 1; return {}; };
  for (const path of [
    "/api/feedback/platform/me?page=0",
    "/api/feedback/platform/me?page=1&page=2",
    "/api/feedback/platform/me?limit=101",
    "/api/feedback/platform/me?studentId=51",
    "/api/admin/feedback/platform?page=1.5",
    "/api/admin/feedback/platform?limit=20&limit=21",
    "/api/admin/feedback/platform?page=9007199254740991&limit=100",
    "/api/admin/feedback/platform?status=active",
  ]) {
    const actorId = path.startsWith("/api/admin") ? 9 : 51;
    const result = await request(path, { actorId });
    assert.equal(result.response.status, 400, path);
    assert.equal(result.payload.code, "INVALID_REQUEST");
  }
  assert.equal(calls, 0);
});

test("known service errors retain safe contracts and unexpected errors leak no private data", async () => {
  submitHandler = async () => { throw new PlatformFeedbackError(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict"); };
  const conflict = await request("/api/feedback/platform", {
    actorId: 51,
    method: "POST",
    body: { message: "Private route content" },
    headers: { "Idempotency-Key": "conflict_route_key" },
  });
  assert.equal(conflict.response.status, 409);
  assert.deepEqual(conflict.payload, { code: "IDEMPOTENCY_KEY_CONFLICT", message: "Idempotency key conflict" });

  const privateText = "Private platform message";
  const privateKey = "private_route_key_999";
  ownHandler = async () => { throw new Error(privateText); };
  adminHandler = async () => { throw new PlatformFeedbackReadError(403, "FORBIDDEN", "Forbidden"); };
  const logs = [];
  const original = console.error;
  console.error = (...values) => logs.push(values.join(" "));
  try {
    const failed = await request("/api/feedback/platform/me", { actorId: 51 });
    assert.equal(failed.response.status, 500);
    assert.deepEqual(failed.payload, { code: "SERVER_ERROR", message: "Server error" });
    const forbidden = await request("/api/admin/feedback/platform", { actorId: 9 });
    assert.equal(forbidden.response.status, 403);
  } finally {
    console.error = original;
  }
  assert.doesNotMatch(logs.join("\n"), new RegExp(`${privateText}|${privateKey}`));
});
