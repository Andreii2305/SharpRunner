const assert = require("node:assert/strict");
const { test } = require("node:test");

let createPublicTestimonialReadService;
let PublicTestimonialReadError;
try {
  ({
    createPublicTestimonialReadService,
    PublicTestimonialReadError,
  } = require("../src/services/publicTestimonialReadService"));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

test("public testimonial read service is available", () => {
  assert.equal(typeof createPublicTestimonialReadService, "function");
  assert.equal(typeof PublicTestimonialReadError, "function");
});

const createHarness = (rows) => {
  const calls = [];
  const database = {
    async query(sql, options) {
      calls.push({ sql, options });
      return rows;
    },
  };
  return {
    calls,
    service: createPublicTestimonialReadService?.({ database }),
  };
};

test("eligible named and anonymous rows are serialized through the strict public allowlist", async () => {
  const h = createHarness([
    {
      total: "2",
      id: 302,
      message: "Named snapshot remains stable.",
      displayName: "Ada L.",
      approvedAt: new Date("2026-11-03T10:00:00.000Z"),
      authorUserId: 71,
      idempotencyKey: "private-key",
      email: "private@example.test",
    },
    {
      total: "2",
      id: 301,
      message: "Anonymous approved testimonial.",
      displayName: "Anonymous user",
      approvedAt: new Date("2026-11-03T09:00:00.000Z"),
      authorUserId: 72,
      publicDisplayNameSnapshot: null,
    },
  ]);

  const result = await h.service.listTestimonials({ page: 1, limit: 20, offset: 0 });

  assert.deepEqual(result, {
    testimonials: [
      {
        id: 302,
        message: "Named snapshot remains stable.",
        displayName: "Ada L.",
        approvedAt: new Date("2026-11-03T10:00:00.000Z"),
      },
      {
        id: 301,
        message: "Anonymous approved testimonial.",
        displayName: "Anonymous user",
        approvedAt: new Date("2026-11-03T09:00:00.000Z"),
      },
    ],
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  });
  assert.deepEqual(Object.keys(result.testimonials[0]), ["id", "message", "displayName", "approvedAt"]);
  assert.equal(h.calls.length, 1);
});

test("the one-statement query enforces all eligibility and ownership predicates in SQL", async () => {
  const h = createHarness([{ total: "0", id: null, message: null, displayName: null, approvedAt: null }]);
  await h.service.listTestimonials({ page: 3, limit: 10, offset: 20 });

  assert.equal(h.calls.length, 1);
  const [{ sql, options }] = h.calls;
  const normalized = sql.replace(/\s+/g, " ").trim();
  assert.match(normalized, /FROM "PublicTestimonialRevisions" AS revision/);
  assert.match(normalized, /INNER JOIN "PublicTestimonialSubmissions" AS submission ON submission\."id" = revision\."submissionId" AND submission\."authorUserId" = revision\."authorUserId"/);
  assert.match(normalized, /INNER JOIN "Users" AS author ON author\."id" = revision\."authorUserId"/);
  for (const predicate of [
    'revision."isCurrent" = TRUE',
    'revision."moderationStatus" = \'approved\'',
    'revision."approvedAt" IS NOT NULL',
    'revision."consentVersion" IS NOT NULL',
    'revision."consentedAt" IS NOT NULL',
    'submission."withdrawnAt" IS NULL',
    'submission."publicationSuspendedAt" IS NULL',
    'submission."publicationSuspensionReason" IS NULL',
    'author."status" = \'active\'',
  ]) assert.equal(normalized.includes(predicate), true, `missing predicate: ${predicate}`);
  assert.match(normalized, /revision\."attributionMode" = 'anonymous'.*revision\."publicDisplayNameSnapshot" IS NULL.*revision\."publicNamePreviewVersion" IS NULL/);
  assert.match(normalized, /revision\."attributionMode" = 'named'.*revision\."publicDisplayNameSnapshot" IS NOT NULL.*revision\."publicNamePreviewVersion" IS NOT NULL/);
  assert.match(normalized, /ORDER BY "approvedAt" DESC, "id" DESC/);
  assert.deepEqual(options.replacements, { limit: 10, offset: 20 });
  assert.equal(normalized.includes("PlatformFeedbackSubmissions"), false);
  assert.equal(normalized.includes("StudentClassroomFeedback"), false);
});

test("mixed ineligible history cannot enter the public result returned by the SQL boundary", async () => {
  const eligibleRows = [
    {
      total: "1",
      id: 801,
      message: "Only the eligible current approval.",
      displayName: "Grace H.",
      approvedAt: new Date("2026-11-03T12:00:00.000Z"),
    },
  ];
  const h = createHarness(eligibleRows);
  const result = await h.service.listTestimonials({ page: 1, limit: 20, offset: 0 });
  assert.deepEqual(result.testimonials.map(({ id }) => id), [801]);
  assert.equal(result.total, 1);
});

test("an out-of-range page retains its authoritative total with no fabricated item", async () => {
  const h = createHarness([
    { total: "7", id: null, message: null, displayName: null, approvedAt: null },
  ]);
  const result = await h.service.listTestimonials({ page: 4, limit: 2, offset: 6 });
  assert.deepEqual(result.testimonials, []);
  assert.equal(result.total, 7);
  assert.equal(result.totalPages, 4);
});

test("unsafe pagination and malformed database totals fail closed", async () => {
  const h = createHarness([]);
  for (const input of [
    { page: 0, limit: 20, offset: 0 },
    { page: 1, limit: 51, offset: 0 },
    { page: Number.MAX_SAFE_INTEGER, limit: 50, offset: 0 },
    { page: 2, limit: 20, offset: 0 },
  ]) {
    await assert.rejects(
      h.service.listTestimonials(input),
      (error) => error instanceof PublicTestimonialReadError
        && error.status === 400
        && error.code === "INVALID_REQUEST",
    );
  }
  assert.equal(h.calls.length, 0);

  const unsafeTotal = createHarness([
    { total: "9007199254740992", id: null, message: null, displayName: null, approvedAt: null },
  ]);
  await assert.rejects(
    unsafeTotal.service.listTestimonials({ page: 1, limit: 20, offset: 0 }),
    (error) => error.code === "PUBLIC_TESTIMONIAL_INTEGRITY_ERROR",
  );
});
