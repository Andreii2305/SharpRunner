const assert = require("node:assert/strict");
const express = require("express");
const { after, before, test } = require("node:test");
const requireRole = require("../src/middleware/requireRole");

let createPublicTestimonialAuthorRouter;
try {
  ({ createPublicTestimonialAuthorRouter } = require(
    "../src/routes/publicTestimonialAuthor"
  ));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

test("public testimonial author router is available", () => {
  assert.equal(typeof createPublicTestimonialAuthorRouter, "function");
});

const actors = new Map([
  [71, { id: 71, role: "student", status: "active" }],
  [72, { id: 72, role: "teacher", status: "active" }],
  [73, { id: 73, role: "student", status: "inactive" }],
  [74, { id: 74, role: "student", status: "active" }],
  [9, { id: 9, role: "admin", status: "active" }],
]);
let handlers;
let server;
let baseUrl;

const authenticate = (req, res, next) => {
  const actor = actors.get(Number(req.get("Authorization")?.replace("Bearer test-", "")));
  if (!actor) return res.status(401).json({ message: "Missing authentication token" });
  if (actor.status !== "active") return res.status(403).json({ message: "Account is not active" });
  req.userId = actor.id;
  req.userRole = actor.role;
  return next();
};

const operationResult = (changed = true) => ({
  changed,
  secret: "hidden",
  testimonial: {
    id: 201,
    authorUserId: 71,
    withdrawnAt: null,
    publicationSuspendedAt: null,
    publicationSuspensionReason: null,
    createdAt: "2026-11-03T07:00:00.000Z",
    currentRevision: {
      id: 301,
      revisionNumber: 1,
      message: "A testimonial",
      attributionMode: "named",
      publicDisplayName: "Ada L.",
      consentVersion: "synthetic-v1",
      consentedAt: "2026-11-03T08:00:00.000Z",
      moderationStatus: "pending",
      moderationExplanation: null,
      approvedAt: null,
      revokedAt: null,
      createdAt: "2026-11-03T08:00:00.000Z",
      idempotencyKey: "hidden",
    },
  },
  revision: {
    id: 301,
    revisionNumber: 1,
    message: "A testimonial",
    attributionMode: "named",
    publicDisplayName: "Ada L.",
    consentVersion: "synthetic-v1",
    consentedAt: "2026-11-03T08:00:00.000Z",
    moderationStatus: "pending",
    moderationExplanation: null,
    approvedAt: null,
    revokedAt: null,
    createdAt: "2026-11-03T08:00:00.000Z",
    approvedByUserId: 9,
  },
});

const request = async (path, { actorId, method = "GET", body, headers = {} } = {}) => {
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
  handlers = {};
  const service = {
    getOptions: (input) => handlers.options(input),
    createTestimonial: (input) => handlers.create(input),
    createRevision: (input) => handlers.revision(input),
    withdrawTestimonial: (input) => handlers.withdraw(input),
  };
  const historyService = {
    listOwnTestimonials: (input) => handlers.list(input),
    getOwnTestimonial: (input) => handlers.detail(input),
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api/feedback",
    authenticate,
    requireRole("student", "teacher"),
    createPublicTestimonialAuthorRouter?.({ service, historyService }),
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

test("options and creation use authenticated identity, exact contracts, and no-store", async () => {
  let optionsInput;
  let createInput;
  handlers.options = async (input) => {
    optionsInput = input;
    return {
      consentVersion: "synthetic-v1",
      consentText: "I agree that this synthetic testimonial may be displayed publicly.",
      consentBinding: "synthetic-consent-binding",
      namedDisplayPreview: "Ada L.",
      publicNamePreviewVersion: "preview-version",
      internal: "hidden",
    };
  };
  handlers.create = async (input) => {
    createInput = input;
    return operationResult(true);
  };
  const options = await request("/api/feedback/testimonials/options", { actorId: 71 });
  assert.equal(options.response.status, 200);
  assert.deepEqual(optionsInput, { actorId: 71, actorRole: "student" });
  assert.deepEqual(options.payload, {
    consentVersion: "synthetic-v1",
    consentText: "I agree that this synthetic testimonial may be displayed publicly.",
    consentBinding: "synthetic-consent-binding",
    namedDisplayPreview: "Ada L.",
    publicNamePreviewVersion: "preview-version",
  });
  assert.equal(options.response.headers.get("cache-control"), "private, no-store, max-age=0");

  const created = await request("/api/feedback/testimonials", {
    actorId: 71,
    method: "POST",
    body: {
      message: "A testimonial",
      attributionMode: "named",
      consent: true,
      consentVersion: "synthetic-v1",
      consentBinding: "synthetic-consent-binding",
      publicNamePreviewVersion: "preview-version",
    },
    headers: { "Idempotency-Key": "testimonial_route_key_1" },
  });
  assert.equal(created.response.status, 201);
  assert.deepEqual(createInput, {
    actorId: 71,
    actorRole: "student",
    message: "A testimonial",
    attributionMode: "named",
    consent: true,
    consentVersion: "synthetic-v1",
    consentBinding: "synthetic-consent-binding",
    publicNamePreviewVersion: "preview-version",
    idempotencyKey: "testimonial_route_key_1",
  });
  assert.equal("secret" in created.payload, false);
  assert.equal("authorUserId" in created.payload.testimonial, false);
  assert.equal("idempotencyKey" in created.payload.testimonial.currentRevision, false);
  assert.equal("approvedByUserId" in created.payload.revision, false);
});

test("revision, withdrawal, list, and detail forward exact scope and pagination", async () => {
  const received = {};
  handlers.revision = async (input) => { received.revision = input; return operationResult(false); };
  handlers.withdraw = async (input) => {
    received.withdraw = input;
    const result = operationResult(false);
    return { changed: false, testimonial: result.testimonial };
  };
  handlers.list = async (input) => {
    received.list = input;
    return {
      testimonials: [operationResult().testimonial],
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
    };
  };
  handlers.detail = async (input) => {
    received.detail = input;
    const result = operationResult();
    return {
      testimonial: result.testimonial,
      revisions: [result.revision],
      revisionPage: 3,
      revisionLimit: 10,
      revisionTotal: 21,
      revisionTotalPages: 3,
    };
  };
  const revised = await request("/api/feedback/testimonials/201/revisions", {
    actorId: 72,
    method: "POST",
    body: {
      baseRevisionId: 301,
      message: "Updated",
      attributionMode: "anonymous",
      consent: true,
      consentVersion: "synthetic-v1",
      consentBinding: "synthetic-consent-binding",
    },
    headers: { "Idempotency-Key": "testimonial_route_key_2" },
  });
  assert.equal(revised.response.status, 200);
  assert.equal(received.revision.actorId, 72);
  assert.equal(received.revision.actorRole, "teacher");
  assert.equal(received.revision.submissionId, 201);

  const withdrawn = await request("/api/feedback/testimonials/201/withdraw", {
    actorId: 71, method: "POST", body: {},
  });
  assert.equal(withdrawn.response.status, 200);
  assert.deepEqual(received.withdraw, { actorId: 71, actorRole: "student", submissionId: 201 });

  const list = await request("/api/feedback/testimonials/me?page=2&limit=20", { actorId: 71 });
  assert.equal(list.response.status, 200);
  assert.deepEqual(received.list, {
    actorId: 71, actorRole: "student", page: 2, limit: 20, offset: 20,
  });
  const detail = await request(
    "/api/feedback/testimonials/201?revisionPage=3&revisionLimit=10",
    { actorId: 71 },
  );
  assert.equal(detail.response.status, 200);
  assert.deepEqual(received.detail, {
    actorId: 71,
    actorRole: "student",
    submissionId: 201,
    revisionPage: 3,
    revisionLimit: 10,
    revisionOffset: 20,
  });
});

test("authentication, roles, body shapes, headers, queries, IDs, and offsets fail closed", async () => {
  let calls = 0;
  handlers.create = async () => { calls += 1; return operationResult(); };
  assert.equal((await request("/api/feedback/testimonials/options")).response.status, 401);
  assert.equal((await request("/api/feedback/testimonials/options", { actorId: 9 })).response.status, 403);
  assert.equal((await request("/api/feedback/testimonials/options", { actorId: 73 })).response.status, 403);
  const invalidBodies = [
    {},
    {
      message: "x", attributionMode: "named", consent: true,
      consentVersion: "v", consentBinding: "binding",
    },
    {
      message: "x", attributionMode: "anonymous", consent: true,
      consentVersion: "v", consentBinding: "binding",
      publicNamePreviewVersion: "not-allowed",
    },
    {
      message: "x", attributionMode: "anonymous", consent: true,
      consentVersion: "v", consentBinding: "binding", authorUserId: 99,
    },
    {
      message: "x", attributionMode: "anonymous", consent: true,
      consentVersion: "v", consentBinding: "binding", consentText: "client supplied",
    },
  ];
  for (const body of invalidBodies) {
    const result = await request("/api/feedback/testimonials", {
      actorId: 71,
      method: "POST",
      body,
      headers: { "Idempotency-Key": "testimonial_route_key_3" },
    });
    assert.equal(result.response.status, 400);
  }
  assert.equal((await request("/api/feedback/testimonials", {
    actorId: 71,
    method: "POST",
    body: {
      message: "x", attributionMode: "anonymous", consent: true,
      consentVersion: "v", consentBinding: "binding",
    },
  })).response.status, 400);
  assert.equal((await request("/api/feedback/testimonials/me?page=1&page=2", { actorId: 71 })).response.status, 400);
  assert.equal((await request("/api/feedback/testimonials/me?page=9007199254740991&limit=100", { actorId: 71 })).response.status, 400);
  assert.equal((await request("/api/feedback/testimonials/not-an-id", { actorId: 71 })).response.status, 400);
  assert.equal((await request("/api/feedback/testimonials/201?unknown=1", { actorId: 71 })).response.status, 400);
  assert.equal(calls, 0);
});

test("testimonial mutations return 429 and Retry-After after the bounded rate", async () => {
  let calls = 0;
  handlers.create = async () => {
    calls += 1;
    return operationResult(true);
  };
  const body = {
    message: "Rate-limited testimonial",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: "synthetic-v1",
    consentBinding: "synthetic-consent-binding",
  };
  for (let index = 1; index <= 10; index += 1) {
    const result = await request("/api/feedback/testimonials", {
      actorId: 74,
      method: "POST",
      body,
      headers: { "Idempotency-Key": `testimonial_rate_key_${index}` },
    });
    assert.equal(result.response.status, 201);
  }

  const limited = await request("/api/feedback/testimonials", {
    actorId: 74,
    method: "POST",
    body,
    headers: { "Idempotency-Key": "testimonial_rate_key_11" },
  });
  assert.equal(limited.response.status, 429);
  assert.equal(limited.payload.code, "TESTIMONIAL_RATE_LIMITED");
  assert.match(limited.response.headers.get("retry-after"), /^[1-9][0-9]*$/);
  assert.equal(calls, 10);
});

test("the production application registers testimonial author routes", async () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "testimonial-author-route-registration-secret";
  const productionApp = require("../src/app");
  const productionServer = productionApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => productionServer.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${productionServer.address().port}/api/feedback/testimonials/options`,
    );
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => productionServer.close(resolve));
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});
