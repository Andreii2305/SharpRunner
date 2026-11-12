const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  test,
} = require("node:test");
const jwt = require("jsonwebtoken");
const User = require("../src/models/User");
const platformFeedbackReadService = require(
  "../src/services/platformFeedbackReadService"
);
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require(
  "../src/constants/policyVersions"
);

const CACHE_POLICY = "private, no-store, max-age=0";
const actors = new Map([
  [801, { id: 801, role: "student", status: "active" }],
  [802, { id: 802, role: "admin", status: "active" }],
  [803, { id: 803, role: "student", status: "inactive" }],
  [804, {
    id: 804,
    role: "teacher",
    status: "active",
    termsVersionAccepted: "outdated",
    privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
  }],
]);

let server;
let baseUrl;
let previousJwtSecret;
const originalFindByPk = User.findByPk;
const originalListOwn = platformFeedbackReadService.listOwnPlatformFeedback;
const originalListAdmin = platformFeedbackReadService.listAdminPlatformFeedback;

const tokenFor = (id) => jwt.sign({ id, tokenVersion: 0 }, process.env.JWT_SECRET);

const request = (path, { actorId, method = "GET", body, rawBody } = {}) => fetch(
  `${baseUrl}${path}`,
  {
    method,
    headers: {
      ...(actorId ? { Authorization: `Bearer ${tokenFor(actorId)}` } : {}),
      ...((body !== undefined || rawBody !== undefined)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(rawBody !== undefined ? { body: rawBody } : {}),
  },
);

describe("production feedback cache policy", () => {
before(async () => {
  const app = require("../src/app");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "feedback-private-cache-policy-test-secret";
  User.findByPk = async (id) => {
    const actor = actors.get(Number(id));
    if (!actor) return null;
    return {
      tokenVersion: 0,
      termsVersionAccepted: TERMS_VERSION,
      privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
      ...actor,
    };
  };
  platformFeedbackReadService.listOwnPlatformFeedback = async () => ({
    feedback: [], page: 1, limit: 20, total: 0, totalPages: 0,
  });
  platformFeedbackReadService.listAdminPlatformFeedback = async () => ({
    feedback: [], page: 1, limit: 20, total: 0, totalPages: 0,
  });
});

afterEach(() => {
  User.findByPk = originalFindByPk;
  platformFeedbackReadService.listOwnPlatformFeedback = originalListOwn;
  platformFeedbackReadService.listAdminPlatformFeedback = originalListAdmin;
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("production feedback paths set private no-store before authentication", async () => {
  const author = await request("/api/feedback/testimonials/options");
  assert.equal(author.status, 401);
  assert.equal(author.headers.get("cache-control"), CACHE_POLICY);

  const administrator = await request("/api/admin/feedback/platform");
  assert.equal(administrator.status, 401);
  assert.equal(administrator.headers.get("cache-control"), CACHE_POLICY);
});

test("production feedback paths retain private no-store on malformed JSON", async () => {
  const author = await request("/api/feedback/testimonials", {
    method: "POST",
    rawBody: "{",
  });
  assert.equal(author.status, 400);
  assert.equal(author.headers.get("cache-control"), CACHE_POLICY);

  const administrator = await request("/api/admin/feedback/platform", {
    method: "POST",
    rawBody: "{",
  });
  assert.equal(administrator.status, 400);
  assert.equal(administrator.headers.get("cache-control"), CACHE_POLICY);
});

test("production feedback denials and successes retain private no-store", async () => {
  const inactive = await request("/api/feedback/platform/me", { actorId: 803 });
  assert.equal(inactive.status, 403);
  assert.equal(inactive.headers.get("cache-control"), CACHE_POLICY);

  const policy = await request("/api/feedback/platform/me", { actorId: 804 });
  assert.equal(policy.status, 428);
  assert.equal(policy.headers.get("cache-control"), CACHE_POLICY);

  const role = await request("/api/admin/feedback/platform", { actorId: 801 });
  assert.equal(role.status, 403);
  assert.equal(role.headers.get("cache-control"), CACHE_POLICY);

  const own = await request("/api/feedback/platform/me", { actorId: 801 });
  assert.equal(own.status, 200);
  assert.equal(own.headers.get("cache-control"), CACHE_POLICY);

  const admin = await request("/api/admin/feedback/platform", { actorId: 802 });
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get("cache-control"), CACHE_POLICY);
});

test("feedback path matching does not change unrelated cache behavior", async () => {
  for (const path of ["/api/feedback-public", "/api/admin/feedback-public", "/api/public-testimonials"]) {
    const response = await request(path);
    assert.equal(response.headers.get("cache-control"), null);
  }
});

test("the exact public testimonial path uses its separate public no-store policy", async () => {
  const response = await request("/api/public/testimonials?unknown=1");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
});
