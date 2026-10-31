const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const { after, before, test } = require("node:test");
const sessionService = require("../src/services/gameInterruptionSessionService");
const eventService = require("../src/services/gameInterruptionEventService");
const { createGameInterruptionRouter } = require("../src/routes/gameInterruptions");

let server;
let baseUrl;
let actor = null;
let sessionHandler;
let eventHandler;

const actorRecord = (overrides = {}) => ({
  id: 51,
  role: "student",
  ...overrides,
});

const tokenFor = (record) => `test-${record.id}`;

const authenticate = (req, res, next) => {
  const authorization = req.get("Authorization");
  if (!authorization?.startsWith("Bearer test-")) {
    return res.status(401).json({ message: "Missing authentication token" });
  }
  if (!actor || Number(authorization.slice("Bearer test-".length)) !== Number(actor.id)) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  req.userId = actor.id;
  req.userRole = actor.role;
  return next();
};

const request = async (path, {
  method = "POST",
  body,
  token = actor ? tokenFor(actor) : null,
  headers = {},
} = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, payload: await response.json() };
};

const startRequest = (overrides = {}) => request(
  overrides.path || "/api/progress/level/tutorial-level-1/interruption-sessions",
  {
    body: { classroomId: 25, sessionKey: "session_route_key_123" },
    ...overrides,
  },
);

const eventRequest = (overrides = {}) => request(
  overrides.path || "/api/progress/level/tutorial-level-1/interruption-sessions/70/events",
  {
    body: { classroomId: 25, eventKey: "event_route_key_123", eventType: "hidden" },
    ...overrides,
  },
);

before(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api/progress",
    authenticate,
    createGameInterruptionRouter({
      sessionServiceImpl: {
        startInterruptionSession: (input) => sessionHandler(input),
      },
      eventServiceImpl: {
        recordInterruptionEvent: (input) => eventHandler(input),
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
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("production progress routes use authenticated student identity and exact scopes", async () => {
  actor = actorRecord();
  let startInput;
  let eventInput;
  sessionHandler = async (input) => {
    startInput = input;
    return {
      changed: true,
      session: {
        id: 70,
        classroomId: 25,
        levelKey: "tutorial-level-1",
        lifecycleStatus: "CURRENT",
        startedAt: "2026-10-29T00:00:00.000Z",
        supersededAt: null,
        completedAt: null,
        scoreDeductionSnapshot: 1,
        xpDeductionSnapshot: 10,
        createdAt: "2026-10-29T00:00:00.000Z",
        sessionKey: "must-not-leak",
        studentId: 999,
      },
    };
  };
  eventHandler = async (input) => {
    eventInput = input;
    return {
      changed: true,
      event: {
        id: 91,
        sessionId: 70,
        classroomId: 25,
        levelKey: "tutorial-level-1",
        eventType: "hidden",
        receivedAt: "2026-10-29T00:01:00.000Z",
        eventKey: "must-not-leak",
        studentId: 999,
        appliedScoreDeduction: null,
      },
    };
  };

  const started = await startRequest();
  assert.equal(started.response.status, 201);
  assert.deepEqual(startInput, {
    actorId: 51,
    actorRole: "student",
    classroomId: 25,
    levelKey: "tutorial-level-1",
    sessionKey: "session_route_key_123",
  });
  assert.deepEqual(started.payload, {
    changed: true,
    session: {
      id: 70,
      classroomId: 25,
      levelKey: "tutorial-level-1",
      lifecycleStatus: "CURRENT",
      startedAt: "2026-10-29T00:00:00.000Z",
      supersededAt: null,
      completedAt: null,
      scoreDeductionSnapshot: 1,
      xpDeductionSnapshot: 10,
      createdAt: "2026-10-29T00:00:00.000Z",
    },
  });

  const recorded = await eventRequest();
  assert.equal(recorded.response.status, 201);
  assert.deepEqual(eventInput, {
    actorId: 51,
    actorRole: "student",
    classroomId: 25,
    levelKey: "tutorial-level-1",
    sessionId: 70,
    eventKey: "event_route_key_123",
    eventType: "hidden",
  });
  assert.deepEqual(recorded.payload, {
    changed: true,
    event: {
      id: 91,
      sessionId: 70,
      classroomId: 25,
      levelKey: "tutorial-level-1",
      eventType: "hidden",
      receivedAt: "2026-10-29T00:01:00.000Z",
    },
  });
});

test("matching retries return 200 without route-level terminal checks", async () => {
  actor = actorRecord({ id: 52 });
  sessionHandler = async () => ({
    changed: false,
    session: {
      id: 70, classroomId: 25, levelKey: "tutorial-level-1",
      lifecycleStatus: "SUPERSEDED", startedAt: "2026-10-29T00:00:00.000Z",
      supersededAt: "2026-10-29T00:02:00.000Z", completedAt: null,
      scoreDeductionSnapshot: 1, xpDeductionSnapshot: 10,
      createdAt: "2026-10-29T00:00:00.000Z",
    },
  });
  eventHandler = async () => ({
    changed: false,
    event: {
      id: 91, sessionId: 70, classroomId: 25, levelKey: "tutorial-level-1",
      eventType: "hidden", receivedAt: "2026-10-29T00:01:00.000Z",
    },
  });
  assert.equal((await startRequest()).response.status, 200);
  assert.equal((await eventRequest()).response.status, 200);
});

test("production authentication and student-only authorization run before either service", async () => {
  let calls = 0;
  sessionHandler = async () => { calls += 1; return { changed: true, session: {} }; };
  eventHandler = async () => { calls += 1; return { changed: true, event: {} }; };

  actor = null;
  assert.equal((await startRequest({ token: null })).response.status, 401);
  actor = actorRecord({ id: 61, role: "teacher" });
  assert.equal((await startRequest()).response.status, 403);
  actor = actorRecord({ id: 71, role: "admin" });
  assert.equal((await eventRequest()).response.status, 403);
  assert.equal(calls, 0);
});

test("strict path body query and key validation rejects untrusted fields", async () => {
  let calls = 0;
  sessionHandler = async () => { calls += 1; return { changed: true, session: {} }; };
  eventHandler = async () => { calls += 1; return { changed: true, event: {} }; };
  const startCases = [
    { path: "/api/progress/level/not-a-level/interruption-sessions" },
    { path: "/api/progress/level/TUTORIAL-LEVEL-1/interruption-sessions" },
    { path: "/api/progress/level/tutorial-level-1/interruption-sessions?classroomId=25" },
    { body: {} },
    { body: { classroomId: "25", sessionKey: "session_route_key_123" } },
    { body: { classroomId: 0, sessionKey: "session_route_key_123" } },
    { body: { classroomId: 25, sessionKey: "short" } },
    { body: { classroomId: 25, sessionKey: "session_route_key_123", studentId: 99 } },
    { body: { classroomId: 25, sessionKey: "session_route_key_123", scoreDeductionSnapshot: 5 } },
  ];
  for (const [index, entry] of startCases.entries()) {
    actor = actorRecord({ id: 100 + index });
    const result = await startRequest(entry);
    assert.equal(result.response.status, 400, JSON.stringify(entry));
    assert.equal(result.payload.code, "INVALID_REQUEST");
  }

  const eventCases = [
    { path: "/api/progress/level/tutorial-level-1/interruption-sessions/0/events" },
    { path: "/api/progress/level/tutorial-level-1/interruption-sessions/1e2/events" },
    { path: "/api/progress/level/tutorial-level-1/interruption-sessions/70/events?eventType=hidden&eventType=hidden" },
    { body: { classroomId: 25, eventKey: "event_route_key_123" } },
    { body: { classroomId: 25, eventKey: "short", eventType: "hidden" } },
    { body: { classroomId: 25, eventKey: "event_route_key_123", eventType: "blur" } },
    { body: { classroomId: 25, eventKey: "event_route_key_123", eventType: "hidden", receivedAt: "2020-01-01" } },
    { body: { classroomId: 25, eventKey: "event_route_key_123", eventType: "hidden", appliedXpDeduction: 10 } },
    { body: { classroomId: 25, eventKey: "event_route_key_123", eventType: "hidden", actorId: 99 } },
  ];
  for (const [index, entry] of eventCases.entries()) {
    actor = actorRecord({ id: 200 + index });
    const result = await eventRequest(entry);
    assert.equal(result.response.status, 400, JSON.stringify(entry));
    assert.equal(result.payload.code, "INVALID_REQUEST");
  }
  assert.equal(calls, 0);
});

test("malformed JSON is rejected before either service", async () => {
  actor = actorRecord({ id: 301 });
  let calls = 0;
  sessionHandler = async () => { calls += 1; };
  const response = await new Promise((resolve, reject) => {
    const requestInstance = http.request(
      `${baseUrl}/api/progress/level/tutorial-level-1/interruption-sessions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenFor(actor)}`,
          "Content-Type": "application/json",
        },
      },
      (result) => {
        let text = "";
        result.on("data", (chunk) => { text += chunk; });
        result.on("end", () => resolve({ status: result.statusCode, payload: JSON.parse(text) }));
      },
    );
    requestInstance.on("error", reject);
    requestInstance.end("{");
  });
  assert.equal(response.status, 400);
  assert.equal(response.payload.code, "INVALID_REQUEST");
  assert.equal(calls, 0);
});

test("known service errors retain safe status code and message", async () => {
  actor = actorRecord({ id: 401 });
  for (const [ServiceError, assignHandler, expected] of [
    [
      sessionService.GameInterruptionSessionError,
      (handler) => { sessionHandler = handler; },
      [403, "FORBIDDEN", "Forbidden"],
    ],
    [
      eventService.GameInterruptionEventError,
      (handler) => { eventHandler = handler; },
      [409, "EVENT_KEY_CONFLICT", "Event key conflict"],
    ],
    [
      eventService.GameInterruptionEventError,
      (handler) => { eventHandler = handler; },
      [409, "SESSION_NOT_CURRENT", "Interruption session is not current"],
    ],
    [
      eventService.GameInterruptionEventError,
      (handler) => { eventHandler = handler; },
      [409, "LEVEL_ALREADY_COMPLETED", "Completed levels do not accept interruption events"],
    ],
  ]) {
    assignHandler(async () => { throw new ServiceError(...expected); });
    const result = ServiceError === sessionService.GameInterruptionSessionError
      ? await startRequest()
      : await eventRequest();
    assert.equal(result.response.status, expected[0]);
    assert.deepEqual(result.payload, { code: expected[1], message: expected[2] });
  }
});

test("unexpected failures return neutral errors without logging payloads", async () => {
  actor = actorRecord({ id: 501 });
  const privateKey = "event_route_private_123";
  eventHandler = async () => { throw new Error(`database failure ${privateKey}`); };
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...values) => { logs.push(values.join(" ")); };
  try {
    const result = await eventRequest({
      body: { classroomId: 25, eventKey: privateKey, eventType: "hidden" },
    });
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.payload, { code: "SERVER_ERROR", message: "Server error" });
    assert.equal(logs.join(" ").includes(privateKey), false);
    assert.equal(logs.join(" ").includes("database failure"), false);
  } finally {
    console.error = originalConsoleError;
  }
});

test("event rate limiting is explicit and leaves retryable events unrecorded", async () => {
  actor = actorRecord({ id: 601 });
  let calls = 0;
  eventHandler = async (input) => {
    calls += 1;
    return {
      changed: calls === 1,
      event: {
        id: 90, sessionId: input.sessionId, classroomId: input.classroomId,
        levelKey: input.levelKey, eventType: input.eventType,
        receivedAt: "2026-10-29T00:01:00.000Z",
      },
    };
  };
  let result;
  for (let index = 0; index <= 120; index += 1) {
    result = await eventRequest({
      body: {
        classroomId: 25,
        eventKey: "event_rate_retry_key_123",
        eventType: "hidden",
      },
    });
  }
  assert.equal(calls, 120);
  assert.equal(result.response.status, 429);
  assert.equal(result.payload.code, "INTERRUPTION_EVENT_RATE_LIMITED");
  assert.ok(Number(result.response.headers.get("retry-after")) > 0);
});

test("session rate limiting uses its separate actor bucket", async () => {
  actor = actorRecord({ id: 602 });
  let calls = 0;
  sessionHandler = async (input) => {
    calls += 1;
    return {
      changed: calls === 1,
      session: {
        id: 70,
        classroomId: input.classroomId,
        levelKey: input.levelKey,
        lifecycleStatus: "CURRENT",
        startedAt: "2026-10-29T00:00:00.000Z",
        supersededAt: null,
        completedAt: null,
        scoreDeductionSnapshot: 1,
        xpDeductionSnapshot: 10,
        createdAt: "2026-10-29T00:00:00.000Z",
      },
    };
  };
  let result;
  for (let index = 0; index <= 30; index += 1) result = await startRequest();
  assert.equal(calls, 30);
  assert.equal(result.response.status, 429);
  assert.equal(result.payload.code, "INTERRUPTION_SESSION_RATE_LIMITED");
  assert.ok(Number(result.response.headers.get("retry-after")) > 0);
});
