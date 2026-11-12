import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "admin-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.get = async (...args) => {
  calls.push(["get", ...args]);
  return { data: {} };
};
axios.post = async (...args) => {
  calls.push(["post", ...args]);
  return { data: {} };
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const service = await vite.ssrLoadModule("/src/services/adminFeedbackService.js");
after(async () => vite.close());

test("administrator feedback reads use exact private inbox and moderation contracts", async () => {
  const signal = new AbortController().signal;
  await service.listAdminPlatformFeedback({ page: 3, limit: 20, signal });
  await service.listAdminTestimonials({ status: "rejected", page: 2, limit: 20, signal });
  await service.getAdminTestimonial({ submissionId: 41, revisionPage: 4, revisionLimit: 20, signal });

  assert.match(calls[0][1], /\/api\/admin\/feedback\/platform\?page=3&limit=20$/);
  assert.match(calls[1][1], /\/api\/admin\/feedback\/testimonials\?status=rejected&page=2&limit=20$/);
  assert.match(calls[2][1], /\/api\/admin\/feedback\/testimonials\/41\?revisionPage=4&revisionLimit=20$/);
  for (const call of calls.slice(0, 3)) {
    assert.equal(call[2].headers.Authorization, "Bearer admin-token");
    assert.equal(call[2].signal, signal);
  }
});

test("moderation mutations target one exact revision and send only the approved body", async () => {
  const signal = new AbortController().signal;
  await service.moderateTestimonial({ action: "approve", submissionId: 41, revisionId: 51, signal });
  await service.moderateTestimonial({ action: "reject", submissionId: 41, revisionId: 52, explanation: "Contains a private detail.", signal });
  await service.moderateTestimonial({ action: "revoke", submissionId: 41, revisionId: 53, explanation: "No longer suitable.", signal });

  assert.match(calls[3][1], /\/41\/revisions\/51\/approve$/);
  assert.deepEqual(calls[3][2], {});
  assert.match(calls[4][1], /\/41\/revisions\/52\/reject$/);
  assert.deepEqual(calls[4][2], { explanation: "Contains a private detail." });
  assert.match(calls[5][1], /\/41\/revisions\/53\/revoke$/);
  assert.deepEqual(calls[5][2], { explanation: "No longer suitable." });
  assert.equal("idempotencyKey" in calls[5][3].headers, false);
});
