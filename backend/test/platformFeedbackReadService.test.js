const assert = require("node:assert/strict");
const { test } = require("node:test");

let createPlatformFeedbackReadService;
let PlatformFeedbackReadError;
try {
  ({ createPlatformFeedbackReadService, PlatformFeedbackReadError } = require("../src/services/platformFeedbackReadService"));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

const rows = [{
  id: 3,
  authorUserId: 51,
  message: "Newest",
  idempotencyKey: "hidden_key_123",
  createdAt: new Date("2026-11-03T03:00:00.000Z"),
  updatedAt: new Date("2026-11-03T03:00:00.000Z"),
  author: {
    id: 51,
    firstName: "Ada",
    lastName: "Lovelace",
    username: "ada",
    email: "private@example.test",
    role: "student",
    status: "active",
    tokenVersion: 9,
  },
}, {
  id: 2,
  authorUserId: 52,
  message: "Teacher feedback",
  createdAt: new Date("2026-11-03T02:00:00.000Z"),
  author: {
    id: 52,
    firstName: "Grace",
    lastName: "Hopper",
    username: "grace",
    role: "teacher",
    status: "active",
  },
}, {
  id: 1,
  authorUserId: 51,
  message: "Older",
  createdAt: new Date("2026-11-03T01:00:00.000Z"),
  author: null,
}];

const makeHarness = () => {
  const calls = [];
  const models = {
    User: { name: "User" },
    PlatformFeedbackSubmission: {
      findAndCountAll: async (options) => {
        calls.push(options);
        const selected = options.where?.authorUserId
          ? rows.filter((row) => row.authorUserId === options.where.authorUserId)
          : rows;
        return {
          count: String(selected.length),
          rows: selected.slice(options.offset, options.offset + options.limit),
        };
      },
    },
  };
  return { calls, service: createPlatformFeedbackReadService?.({ models }) };
};

test("platform feedback read service is available", () => {
  assert.equal(typeof createPlatformFeedbackReadService, "function");
});

test("authors query only their records and receive the author allowlist", async () => {
  const h = makeHarness();
  const result = await h.service.listOwnPlatformFeedback({
    actorId: 51, actorRole: "student", page: 1, limit: 20, offset: 0,
  });
  assert.deepEqual(result, {
    feedback: [
      { id: 3, message: "Newest", createdAt: new Date("2026-11-03T03:00:00.000Z") },
      { id: 1, message: "Older", createdAt: new Date("2026-11-03T01:00:00.000Z") },
    ],
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  });
  assert.deepEqual(h.calls[0].where, { authorUserId: 51 });
  assert.deepEqual(h.calls[0].attributes, ["id", "message", "createdAt"]);
  assert.equal(h.calls[0].include, undefined);
  assert.equal("idempotencyKey" in result.feedback[0], false);
  assert.equal("authorUserId" in result.feedback[0], false);
});

test("administrators receive bounded records with only approved author fields", async () => {
  const h = makeHarness();
  const result = await h.service.listAdminPlatformFeedback({
    actorId: 9, actorRole: "admin", page: 1, limit: 2, offset: 0,
  });
  assert.deepEqual(result.feedback[0], {
    id: 3,
    message: "Newest",
    createdAt: new Date("2026-11-03T03:00:00.000Z"),
    author: {
      id: 51,
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      role: "student",
      status: "active",
    },
  });
  assert.deepEqual(h.calls[0].attributes, ["id", "message", "createdAt"]);
  assert.deepEqual(h.calls[0].include[0].attributes, [
    "id", "firstName", "lastName", "username", "role", "status",
  ]);
  assert.equal(h.calls[0].include[0].required, true);
  assert.deepEqual(h.calls[0].order, [["createdAt", "DESC"], ["id", "DESC"]]);
  assert.equal(result.total, 3);
  assert.equal(result.totalPages, 2);
  assert.equal("email" in result.feedback[0].author, false);
  assert.equal("tokenVersion" in result.feedback[0].author, false);
});

test("pagination remains authoritative for empty and out-of-range pages", async () => {
  const h = makeHarness();
  const result = await h.service.listAdminPlatformFeedback({
    actorId: 9, actorRole: "admin", page: 3, limit: 2, offset: 4,
  });
  assert.deepEqual(result, {
    feedback: [], page: 3, limit: 2, total: 3, totalPages: 2,
  });
  assert.equal(h.calls[0].limit, 2);
  assert.equal(h.calls[0].offset, 4);
  assert.equal(h.calls.length, 1);
});

test("role and pagination validation fail before any read", async () => {
  const h = makeHarness();
  const invalid = [
    () => h.service.listOwnPlatformFeedback({ actorId: 9, actorRole: "admin", page: 1, limit: 20, offset: 0 }),
    () => h.service.listAdminPlatformFeedback({ actorId: 51, actorRole: "student", page: 1, limit: 20, offset: 0 }),
    () => h.service.listOwnPlatformFeedback({ actorId: 51, actorRole: "student", page: 0, limit: 20, offset: 0 }),
    () => h.service.listAdminPlatformFeedback({ actorId: 9, actorRole: "admin", page: 1, limit: 101, offset: 0 }),
    () => h.service.listAdminPlatformFeedback({ actorId: 9, actorRole: "admin", page: 2, limit: 20, offset: 1 }),
  ];
  for (const run of invalid) {
    await assert.rejects(run(), (error) => error instanceof PlatformFeedbackReadError);
  }
  assert.equal(h.calls.length, 0);
});
