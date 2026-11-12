const assert = require("node:assert/strict");
const express = require("express");
const { after, before, test } = require("node:test");
const requireRole = require("../src/middleware/requireRole");

let createPublicTestimonialAdminRouter;
try {
  ({ createPublicTestimonialAdminRouter } = require(
    "../src/routes/publicTestimonialAdmin"
  ));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

test("public testimonial administrator router is available", () => {
  assert.equal(typeof createPublicTestimonialAdminRouter, "function");
});

const actors = new Map([
  [9, { id: 9, role: "admin", status: "active" }],
  [71, { id: 71, role: "student", status: "active" }],
  [72, { id: 72, role: "teacher", status: "active" }],
  [10, { id: 10, role: "admin", status: "inactive" }],
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

const revision = (overrides = {}) => ({
  id: 301,
  revisionNumber: 2,
  message: "Anonymous testimonial",
  attributionMode: "anonymous",
  publicDisplayName: null,
  consentVersion: "synthetic-v1",
  consentedAt: "2026-11-03T08:00:00.000Z",
  moderationStatus: "pending",
  moderationExplanation: null,
  approvedByUserId: null,
  approvedAt: null,
  rejectedByUserId: null,
  rejectedAt: null,
  revokedByUserId: null,
  revokedAt: null,
  createdAt: "2026-11-03T08:00:00.000Z",
  idempotencyKey: "hidden",
  ...overrides,
});
const testimonial = (overrides = {}) => ({
  id: 201,
  withdrawnAt: null,
  publicationSuspendedAt: null,
  publicationSuspensionReason: null,
  createdAt: "2026-11-03T07:00:00.000Z",
  author: {
    id: 71,
    firstName: "Ada",
    lastName: "Lovelace",
    username: "ada",
    role: "student",
    status: "active",
    email: "hidden@example.test",
  },
  currentRevision: revision(),
  idempotencyKey: "hidden",
  ...overrides,
});

const request = async (path, { actorId, method = "GET", body, rawBody } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(actorId ? { Authorization: `Bearer test-${actorId}` } : {}),
      ...((body !== undefined || rawBody !== undefined)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(rawBody !== undefined ? { body: rawBody } : {}),
  });
  return { response, payload: await response.json() };
};

before(async () => {
  handlers = {};
  const service = {
    approve: (input) => handlers.approve(input),
    reject: (input) => handlers.reject(input),
    revoke: (input) => handlers.revoke(input),
  };
  const readService = {
    listTestimonials: (input) => handlers.list(input),
    getTestimonial: (input) => handlers.detail(input),
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api/admin/feedback",
    authenticate,
    requireRole("admin"),
    createPublicTestimonialAdminRouter?.({ service, readService }),
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

test("administrator queue and detail use exact filters, pagination, and allowlists", async () => {
  const received = {};
  handlers.list = async (input) => {
    received.list = input;
    return {
      testimonials: [testimonial()],
      status: "pending",
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
    };
  };
  handlers.detail = async (input) => {
    received.detail = input;
    return {
      testimonial: testimonial(),
      revisions: [revision()],
      revisionPage: 3,
      revisionLimit: 10,
      revisionTotal: 21,
      revisionTotalPages: 3,
    };
  };

  const list = await request(
    "/api/admin/feedback/testimonials?status=pending&page=2&limit=20",
    { actorId: 9 },
  );
  assert.equal(list.response.status, 200);
  assert.equal(list.response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.deepEqual(received.list, {
    actorId: 9,
    actorRole: "admin",
    status: "pending",
    page: 2,
    limit: 20,
    offset: 20,
  });
  assert.equal("email" in list.payload.testimonials[0].author, false);
  assert.equal("idempotencyKey" in list.payload.testimonials[0], false);
  assert.equal("idempotencyKey" in list.payload.testimonials[0].currentRevision, false);

  const detail = await request(
    "/api/admin/feedback/testimonials/201?revisionPage=3&revisionLimit=10",
    { actorId: 9 },
  );
  assert.equal(detail.response.status, 200);
  assert.deepEqual(received.detail, {
    actorId: 9,
    actorRole: "admin",
    submissionId: 201,
    revisionPage: 3,
    revisionLimit: 10,
    revisionOffset: 20,
  });
});

test("approve, reject, and revoke forward authenticated identity and exact decisions", async () => {
  const received = {};
  for (const action of ["approve", "reject", "revoke"]) {
    handlers[action] = async (input) => {
      received[action] = input;
      return {
        changed: action !== "revoke",
        testimonial: testimonial(),
        revision: revision({ moderationStatus: action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked" }),
      };
    };
  }
  const approved = await request(
    "/api/admin/feedback/testimonials/201/revisions/301/approve",
    { actorId: 9, method: "POST", body: {} },
  );
  assert.equal(approved.response.status, 200);
  assert.deepEqual(received.approve, {
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  });

  const rejected = await request(
    "/api/admin/feedback/testimonials/201/revisions/301/reject",
    { actorId: 9, method: "POST", body: { explanation: "Remove a private detail." } },
  );
  assert.equal(rejected.response.status, 200);
  assert.equal(received.reject.explanation, "Remove a private detail.");

  const revoked = await request(
    "/api/admin/feedback/testimonials/201/revisions/301/revoke",
    { actorId: 9, method: "POST", body: { explanation: "No longer suitable." } },
  );
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.payload.changed, false);
  assert.equal(received.revoke.actorId, 9);
});

test("authentication, roles, bodies, IDs, queries, and filters fail closed", async () => {
  handlers.list = async () => { throw new Error("must not be called"); };
  assert.equal((await request("/api/admin/feedback/testimonials")).response.status, 401);
  assert.equal((await request("/api/admin/feedback/testimonials", { actorId: 71 })).response.status, 403);
  assert.equal((await request("/api/admin/feedback/testimonials", { actorId: 72 })).response.status, 403);
  assert.equal((await request("/api/admin/feedback/testimonials", { actorId: 10 })).response.status, 403);
  assert.equal((await request("/api/admin/feedback/testimonials?status=unknown", { actorId: 9 })).response.status, 400);
  assert.equal((await request("/api/admin/feedback/testimonials?page=1&page=2", { actorId: 9 })).response.status, 400);
  assert.equal((await request("/api/admin/feedback/testimonials/unsafe", { actorId: 9 })).response.status, 400);
  assert.equal((await request(
    "/api/admin/feedback/testimonials/201/revisions/301/approve?extra=1",
    { actorId: 9, method: "POST", body: {} },
  )).response.status, 400);
  assert.equal((await request(
    "/api/admin/feedback/testimonials/201/revisions/301/approve",
    { actorId: 9, method: "POST", body: { explanation: "not allowed" } },
  )).response.status, 400);
  assert.equal((await request(
    "/api/admin/feedback/testimonials/201/revisions/301/reject",
    { actorId: 9, method: "POST", body: {} },
  )).response.status, 400);
});

test("known moderation errors stay safe and unexpected errors are neutral", async () => {
  const { PublicTestimonialModerationError } = require(
    "../src/services/publicTestimonialModerationService"
  );
  handlers.approve = async () => {
    throw new PublicTestimonialModerationError(409, "REVISION_CHANGED", "Revision changed");
  };
  const known = await request(
    "/api/admin/feedback/testimonials/201/revisions/301/approve",
    { actorId: 9, method: "POST", body: {} },
  );
  assert.equal(known.response.status, 409);
  assert.deepEqual(known.payload, { code: "REVISION_CHANGED", message: "Revision changed" });

  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(" "));
  try {
    handlers.approve = async () => { throw new Error("private message and explanation"); };
    const unexpected = await request(
      "/api/admin/feedback/testimonials/201/revisions/301/approve",
      { actorId: 9, method: "POST", body: {} },
    );
    assert.equal(unexpected.response.status, 500);
    assert.deepEqual(unexpected.payload, { code: "SERVER_ERROR", message: "Server error" });
    assert.equal(logs.join(" ").includes("private message"), false);
  } finally {
    console.error = originalError;
  }
});

test("the production administrator router registers testimonial moderation routes", async () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "testimonial-admin-route-registration-secret";
  const productionApp = require("../src/app");
  const productionServer = productionApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => productionServer.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${productionServer.address().port}/api/admin/feedback/testimonials`,
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  } finally {
    await new Promise((resolve) => productionServer.close(resolve));
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});
