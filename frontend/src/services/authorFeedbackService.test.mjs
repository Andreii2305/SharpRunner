import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "author-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.get = async (...args) => {
  calls.push(["get", ...args]);
  if (args[0].includes("/options")) {
    return { data: { consentVersion: "synthetic-v1", consentText: "Synthetic disclosure", consentBinding: "binding", namedDisplayPreview: "Ada L.", publicNamePreviewVersion: "preview" } };
  }
  return { data: { page: 1, limit: 20, total: 0, totalPages: 0, feedback: [], testimonials: [], revisions: [] } };
};
axios.post = async (...args) => {
  calls.push(["post", ...args]);
  return { data: { changed: true } };
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const service = await vite.ssrLoadModule("/src/services/authorFeedbackService.js");
after(async () => vite.close());

test("platform feedback requests use exact private author contracts", async () => {
  const signal = new AbortController().signal;
  await service.listOwnPlatformFeedback({ page: 3, limit: 20, signal });
  await service.submitPlatformFeedback({
    message: "Private message",
    idempotencyKey: "platform_key_123",
    signal,
  });

  assert.match(calls[0][1], /\/api\/feedback\/platform\/me\?page=3&limit=20$/);
  assert.equal(calls[0][2].headers.Authorization, "Bearer author-token");
  assert.equal(calls[0][2].signal, signal);
  assert.match(calls[1][1], /\/api\/feedback\/platform$/);
  assert.deepEqual(calls[1][2], { message: "Private message" });
  assert.equal(calls[1][3].headers["Idempotency-Key"], "platform_key_123");
  assert.equal(calls[1][3].signal, signal);
});

test("testimonial reads use exact options list and independently paginated detail contracts", async () => {
  const signal = new AbortController().signal;
  const options = await service.getTestimonialOptions({ signal });
  await service.listOwnTestimonials({ page: 2, limit: 20, signal });
  await service.getOwnTestimonial({ submissionId: 41, revisionPage: 4, revisionLimit: 20, signal });

  assert.equal(options.consentText, "Synthetic disclosure");
  assert.match(calls[2][1], /\/api\/feedback\/testimonials\/options$/);
  assert.match(calls[3][1], /\/api\/feedback\/testimonials\/me\?page=2&limit=20$/);
  assert.match(calls[4][1], /\/api\/feedback\/testimonials\/41\?revisionPage=4&revisionLimit=20$/);
  assert.equal(calls[4][2].signal, signal);
});

test("testimonial mutations send frozen named and anonymous contracts without consent text or display names", async () => {
  const signal = new AbortController().signal;
  const named = {
    message: "Named",
    attributionMode: "named",
    consent: true,
    consentVersion: "synthetic-v1",
    consentBinding: "binding",
    publicNamePreviewVersion: "preview",
  };
  const anonymous = {
    baseRevisionId: 51,
    message: "Anonymous",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: "synthetic-v1",
    consentBinding: "binding",
  };
  await service.createTestimonial({ payload: named, idempotencyKey: "testimonial_key_123", signal });
  await service.createTestimonialRevision({ submissionId: 41, payload: anonymous, idempotencyKey: "revision_key_123", signal });
  await service.withdrawTestimonial({ submissionId: 41, signal });

  assert.match(calls[5][1], /\/api\/feedback\/testimonials$/);
  assert.deepEqual(calls[5][2], named);
  assert.equal(calls[5][3].headers["Idempotency-Key"], "testimonial_key_123");
  assert.equal("consentText" in calls[5][2], false);
  assert.equal("publicDisplayName" in calls[5][2], false);
  assert.match(calls[6][1], /\/api\/feedback\/testimonials\/41\/revisions$/);
  assert.deepEqual(calls[6][2], anonymous);
  assert.equal("publicNamePreviewVersion" in calls[6][2], false);
  assert.match(calls[7][1], /\/api\/feedback\/testimonials\/41\/withdraw$/);
  assert.deepEqual(calls[7][2], {});
});
