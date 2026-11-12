import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import fs from "node:fs";

globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true } });
test.after(async () => vite.close());
const view = await vite.ssrLoadModule("/src/pages/admin/AdminFeedbackView.jsx");
const feedbackState = await vite.ssrLoadModule("/src/pages/admin/adminFeedbackState.js");

test("administrator navigation registers the feedback area once", () => {
  const source = fs.readFileSync(new URL("./AdminDashboardPage.jsx", import.meta.url), "utf8");
  assert.equal((source.match(/\["feedback", "Feedback", FiMessageSquare\]/g) ?? []).length, 1);
  assert.match(source, /<AdminFeedbackView active=\{activeView === "feedback"\}/);
});

const revision = (overrides = {}) => ({
  id: 51, revisionNumber: 2, message: "Plain testimonial text", attributionMode: "anonymous",
  publicDisplayName: null, consentVersion: "synthetic-v1", consentedAt: "2026-11-03T08:00:00Z",
  moderationStatus: "pending", moderationExplanation: null, approvedAt: null, rejectedAt: null,
  revokedAt: null, createdAt: "2026-11-03T08:00:00Z", ...overrides,
});
const testimonial = (overrides = {}) => ({
  id: 41, withdrawnAt: null, publicationSuspendedAt: null, publicationSuspensionReason: null,
  createdAt: "2026-11-03T07:00:00Z",
  author: { id: 7, firstName: "Ada", lastName: "Lovelace", username: "ada", role: "student", status: "active" },
  currentRevision: revision(), ...overrides,
});

test("private inbox is read-only and never exposes classroom feedback actions", () => {
  const html = renderToStaticMarkup(React.createElement(view.AdminFeedbackContent, {
    state: { ...feedbackState.INITIAL_ADMIN_FEEDBACK_STATE, section: "platform", platformStatus: "success", platformFeedback: [{ id: 1, message: "Private platform message", createdAt: "2026-11-03T00:00:00Z", author: testimonial().author }], platformPage: 1, platformTotal: 1, platformTotalPages: 1 },
    controller: {},
  }));
  assert.match(html, /Private platform message/);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /read-only/i);
  assert.doesNotMatch(html, />Publish<|>Delete<|>Edit<|Convert to testimonial/i);
});

test("an inactive administrator account transition clears published inbox state before reopening", async () => {
  const { createAdminFeedbackController } = feedbackState;
  let publishedState = { ...feedbackState.INITIAL_ADMIN_FEEDBACK_STATE };
  const controller = createAdminFeedbackController({
    listPlatform: async () => ({
      feedback: [{
        id: 1,
        message: "Previous administrator inbox message",
        createdAt: "2026-11-03T00:00:00Z",
        author: testimonial().author,
      }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    }),
    listTestimonials: async () => { throw new Error("not used"); },
    getTestimonial: async () => { throw new Error("not used"); },
    moderate: async () => { throw new Error("not used"); },
    onChange: (state) => { publishedState = state; },
  });
  controller.setScope({ accountId: 9, role: "admin" });
  controller.activate();
  await controller.loadPlatform();
  controller.deactivate();

  controller.setScope({ accountId: 10, role: "admin" });

  const html = renderToStaticMarkup(React.createElement(view.AdminFeedbackContent, {
    state: publishedState,
    controller: {},
  }));
  assert.doesNotMatch(html, /Previous administrator inbox message/);
});

test("moderation renders administrator identity separately from public attribution and exact evidence", () => {
  const item = testimonial();
  const html = renderToStaticMarkup(React.createElement(view.AdminFeedbackContent, {
    state: { ...feedbackState.INITIAL_ADMIN_FEEDBACK_STATE, section: "testimonials", queueStatus: "success", testimonials: [item], queueTotal: 1, queueTotalPages: 1, detailStatus: "success", selectedSubmissionId: 41, detail: { testimonial: item, revisions: [item.currentRevision], revisionPage: 1, revisionLimit: 20, revisionTotal: 1, revisionTotalPages: 1 } },
    controller: {},
  }));
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /Public attribution: Anonymous user/);
  assert.match(html, /Administrators can identify this author/);
  assert.match(html, /synthetic-v1/);
  assert.doesNotMatch(html, /current consent wording/i);
  assert.match(html, /Approve revision 2/);
  assert.match(html, /Reject revision 2/);
});

test("withdrawn and suspended testimonials expose lifecycle but no moderation actions", () => {
  const item = testimonial({ withdrawnAt: "2026-11-04T00:00:00Z", publicationSuspendedAt: "2026-11-03T23:00:00Z" });
  const html = renderToStaticMarkup(React.createElement(view.AdminFeedbackContent, {
    state: { ...feedbackState.INITIAL_ADMIN_FEEDBACK_STATE, section: "testimonials", queueStatus: "success", testimonials: [item], queueTotal: 1, queueTotalPages: 1, detailStatus: "success", selectedSubmissionId: 41, detail: { testimonial: item, revisions: [item.currentRevision], revisionPage: 1, revisionLimit: 20, revisionTotal: 1, revisionTotalPages: 1 } },
    controller: {},
  }));
  assert.match(html, /Withdrawn/);
  assert.match(html, /Publication suspended/);
  assert.doesNotMatch(html, /Approve revision|Reject revision|Revoke revision/);
});

test("decision dialog identifies the exact revision and explains author-visible reasons", () => {
  const html = renderToStaticMarkup(React.createElement(view.ModerationDialog, {
    decision: { action: "reject", submissionId: 41, revisionId: 51, revisionNumber: 2, explanation: "", error: "An explanation is required." },
    busy: false, onExplanationChange() {}, onConfirm() {}, onCancel() {},
  }));
  assert.match(html, /Reject revision 2/);
  assert.match(html, /visible to the author/i);
  assert.match(html, /An explanation is required/);
  assert.match(html, /aria-modal="true"/);
});

test("an uncertain frozen decision exposes one reachable identical-operation retry without a dialog", () => {
  const html = renderToStaticMarkup(React.createElement(view.AdminFeedbackContent, {
    state: {
      ...feedbackState.INITIAL_ADMIN_FEEDBACK_STATE,
      section: "testimonials",
      mutationPhase: "uncertain",
      mutationError: "The decision result is uncertain.",
      decision: null,
      queueStatus: "success",
      queueTotal: 0,
      queueTotalPages: 1,
    },
    controller: {},
  }));
  assert.match(html, /Retry identical decision/);
  assert.doesNotMatch(html, /aria-modal="true"/);
});
