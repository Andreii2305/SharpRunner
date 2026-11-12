import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

let storedUser = { id: 7, role: "student", firstName: "Ada" };
globalThis.localStorage = {
  getItem: (key) => key === "user" ? JSON.stringify(storedUser) : "author-token",
  removeItem() {},
  setItem() {},
};

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "sharprunner-author-feedback-vite-"));
const vite = await createServer({
  cacheDir: viteCacheDir,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
test.after(async () => {
  await vite.close();
  fs.rmSync(viteCacheDir, { recursive: true, force: true });
});

const platformState = (overrides = {}) => ({
  status: "success", loading: false, feedback: [], page: 1, limit: 20,
  total: 0, totalPages: 0, error: "", message: "", characterCount: 0,
  mutationPhase: "editing", mutationErrorKind: "", mutationError: "",
  retryAt: null, savedFeedback: null, historyRefreshError: "", ...overrides,
});

const testimonialState = (overrides = {}) => ({
  status: "success", loading: false, testimonials: [], page: 1, limit: 20,
  total: 0, totalPages: 0, error: "", optionsStatus: "success",
  options: {
    consentVersion: "synthetic-v1",
    consentText: "I understand this synthetic testimonial may be displayed publicly.",
    consentBinding: "B".repeat(43),
    namedDisplayPreview: "Ada L.",
    publicNamePreviewVersion: "P".repeat(43),
  },
  optionsError: "", selectedSubmissionId: null, detailStatus: "idle",
  detailLoading: false, detail: null, detailError: "", revisionPage: 1,
  draftMode: "create", message: "", characterCount: 0, attributionMode: "named",
  consentConfirmed: false, baseRevisionId: null, mutationPhase: "editing",
  mutationErrorKind: "", mutationError: "", mutationRetryAt: null,
  withdrawalPhase: "idle", withdrawalError: "", withdrawalRetryAt: null, ...overrides,
});

const callbacks = {
  onDestinationChange() {}, onPlatformMessageChange() {}, onPlatformSubmit() {},
  onPlatformRetry() {}, onPlatformSendAnother() {}, onPlatformLoadRetry() {},
  onPlatformPageChange() {}, onTestimonialMessageChange() {}, onAttributionChange() {},
  onConsentChange() {}, onTestimonialSubmit() {}, onTestimonialRetry() {},
  onOptionsRetry() {}, onTestimonialLoadRetry() {}, onTestimonialPageChange() {},
  onSelectTestimonial() {}, onCloseDetail() {}, onStartCreate() {}, onStartEdit() {},
  onRevisionPageChange() {}, onWithdraw() {},
};

test("student destinations default to private platform feedback and retain the classroom-only route", async () => {
  const { AuthorFeedbackPageView } = await vite.ssrLoadModule("/src/pages/feedback/AuthorFeedbackPage.jsx");
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(AuthorFeedbackPageView, {
      role: "student",
      destination: "platform",
      platformState: platformState(),
      testimonialState: testimonialState(),
      ...callbacks,
    })));
  assert.match(html, /Private platform feedback/);
  assert.match(html, /Administrators can read this feedback/);
  assert.match(html, /href="\/classroom-feedback"/);
  assert.match(html, /Teacher-only classroom feedback/);
  assert.match(html, /Public testimonial/);
  assert.match(html, /No private platform feedback yet/);
  assert.doesNotMatch(html, /Testimonial publication consent/);
});

test("teacher destinations omit classroom submission while preserving platform and public choices", async () => {
  const { FeedbackDestinationNav } = await vite.ssrLoadModule("/src/pages/feedback/AuthorFeedbackPage.jsx");
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(FeedbackDestinationNav, { role: "teacher", destination: "platform", onChange() {} })));
  assert.match(html, /Private platform feedback/);
  assert.match(html, /Public testimonial/);
  assert.doesNotMatch(html, /Teacher-only classroom feedback/);
  assert.doesNotMatch(html, /href="\/classroom-feedback"/);
});

test("an inactive account transition clears published author state before either destination renders", async () => {
  const { AuthorFeedbackPageView } = await vite.ssrLoadModule("/src/pages/feedback/AuthorFeedbackPage.jsx");
  const { createPlatformFeedbackController } = await vite.ssrLoadModule("/src/pages/feedback/platformFeedbackState.js");
  const { createTestimonialAuthorController } = await vite.ssrLoadModule("/src/pages/feedback/testimonialAuthorState.js");
  let publishedPlatform = platformState();
  let publishedTestimonials = testimonialState();
  const platformController = createPlatformFeedbackController({
    list: async () => ({
      feedback: [{ id: 71, message: "Previous private platform message", createdAt: "2026-11-04T00:00:00.000Z" }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    }),
    submit: async () => { throw new Error("not used"); },
    onChange: (state) => { publishedPlatform = state; },
  });
  const testimonialController = createTestimonialAuthorController({
    getOptions: async () => testimonialState().options,
    list: async () => ({
      testimonials: [{
        id: 81,
        withdrawnAt: null,
        publicationSuspendedAt: null,
        createdAt: "2026-11-04T00:00:00.000Z",
        currentRevision: {
          id: 82,
          revisionNumber: 1,
          message: "Previous private testimonial draft",
          attributionMode: "anonymous",
          publicDisplayName: null,
          consentVersion: "synthetic-v1",
          consentedAt: "2026-11-04T00:00:00.000Z",
          moderationStatus: "pending",
          moderationExplanation: null,
          approvedAt: null,
          revokedAt: null,
          createdAt: "2026-11-04T00:00:00.000Z",
        },
      }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    }),
    detail: async () => { throw new Error("not used"); },
    create: async () => { throw new Error("not used"); },
    revise: async () => { throw new Error("not used"); },
    withdraw: async () => { throw new Error("not used"); },
    onChange: (state) => { publishedTestimonials = state; },
  });
  platformController.setScope({ accountId: 7, eligible: true });
  testimonialController.setScope({ accountId: 7, eligible: true });
  await platformController.load();
  await testimonialController.loadList();
  platformController.deactivate();
  testimonialController.deactivate();

  platformController.setScope({ accountId: 8, eligible: true });
  testimonialController.setScope({ accountId: 8, eligible: true });

  const platformHtml = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(AuthorFeedbackPageView, {
      role: "student",
      destination: "platform",
      platformState: publishedPlatform,
      testimonialState: publishedTestimonials,
      ...callbacks,
    })));
  const testimonialHtml = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(AuthorFeedbackPageView, {
      role: "student",
      destination: "testimonial",
      platformState: publishedPlatform,
      testimonialState: publishedTestimonials,
      ...callbacks,
    })));
  assert.doesNotMatch(platformHtml, /Previous private platform message/);
  assert.doesNotMatch(testimonialHtml, /Previous private testimonial draft/);
});

test("administrator navigation does not advertise the author-only feedback workspace", async () => {
  storedUser = { id: 9, role: "admin", firstName: "Admin" };
  const { default: Sidebar } = await vite.ssrLoadModule("/src/Components/SideBar/Sidebar.jsx");
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ["/teacher"] }, React.createElement(Sidebar)));
  assert.doesNotMatch(html, /href="\/feedback"/);
  storedUser = { id: 7, role: "student", firstName: "Ada" };
});

test("testimonial form renders exact server disclosure and name preview with unchecked consent", async () => {
  const { TestimonialAuthorView } = await vite.ssrLoadModule("/src/pages/feedback/AuthorFeedbackPage.jsx");
  const html = renderToStaticMarkup(React.createElement(TestimonialAuthorView, {
    state: testimonialState({ message: "Plain <script> text", characterCount: 19 }),
    ...callbacks,
  }));
  assert.match(html, /I understand this synthetic testimonial may be displayed publicly\./);
  assert.match(html, /Ada L\./);
  assert.match(html, /Administrators can identify you even when the public display is anonymous/);
  assert.match(html, /type="checkbox"/);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
  assert.match(html, /Plain &lt;script&gt; text/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /disabled=""[^>]*>Submit testimonial/);
});

test("a confirmed testimonial operation offers a deliberate fresh submission action", async () => {
  const { TestimonialAuthorView } = await vite.ssrLoadModule("/src/pages/feedback/AuthorFeedbackPage.jsx");
  const html = renderToStaticMarkup(React.createElement(TestimonialAuthorView, {
    state: testimonialState({ mutationPhase: "success" }),
    ...callbacks,
  }));
  assert.match(html, />Start another testimonial</);
});

test("unavailable consent leaves history and withdrawal controls usable", async () => {
  const { TestimonialAuthorView } = await vite.ssrLoadModule("/src/pages/feedback/AuthorFeedbackPage.jsx");
  const current = {
    id: 51, revisionNumber: 2, message: "Published before suspension",
    attributionMode: "anonymous", publicDisplayName: null,
    consentVersion: "old-v1", consentedAt: "2026-11-03T00:00:00.000Z",
    moderationStatus: "approved", moderationExplanation: null,
    approvedAt: "2026-11-03T01:00:00.000Z", revokedAt: null,
    createdAt: "2026-11-03T00:00:00.000Z",
  };
  const item = { id: 41, withdrawnAt: null, publicationSuspendedAt: "2026-11-04T00:00:00.000Z", createdAt: "2026-11-03T00:00:00.000Z", currentRevision: current };
  const html = renderToStaticMarkup(React.createElement(TestimonialAuthorView, {
    state: testimonialState({
      optionsStatus: "unavailable", options: null,
      optionsError: "Public testimonial submission is not available right now.",
      testimonials: [item], total: 1, selectedSubmissionId: 41,
      detailStatus: "success",
      detail: { testimonial: item, revisions: [current], revisionPage: 1, revisionLimit: 20, revisionTotal: 1, revisionTotalPages: 1 },
    }),
    ...callbacks,
  }));
  assert.match(html, /submission is not available right now/i);
  assert.match(html, /Published before suspension/);
  assert.match(html, /Suspended from public display/);
  assert.match(html, /Create a fresh revision/);
  assert.match(html, /Withdraw testimonial/);
  assert.match(html, /internal history is retained/);
  assert.doesNotMatch(html, />Submit testimonial</);
});

test("withdrawn testimonials are terminal and revision history remains plain text", async () => {
  const { TestimonialAuthorView } = await vite.ssrLoadModule("/src/pages/feedback/AuthorFeedbackPage.jsx");
  const current = {
    id: 51, revisionNumber: 1, message: "Line one\n<script>not markup</script>",
    attributionMode: "named", publicDisplayName: "Ada L.", consentVersion: "synthetic-v1",
    consentedAt: "2026-11-03T00:00:00.000Z", moderationStatus: "rejected",
    moderationExplanation: "Remove the classroom name.", approvedAt: null,
    revokedAt: null, createdAt: "2026-11-03T00:00:00.000Z",
  };
  const item = { id: 41, withdrawnAt: "2026-11-04T00:00:00.000Z", publicationSuspendedAt: null, createdAt: "2026-11-03T00:00:00.000Z", currentRevision: current };
  const html = renderToStaticMarkup(React.createElement(TestimonialAuthorView, {
    state: testimonialState({
      testimonials: [item], total: 1, selectedSubmissionId: 41,
      detailStatus: "success",
      detail: { testimonial: item, revisions: [current], revisionPage: 1, revisionLimit: 20, revisionTotal: 1, revisionTotalPages: 1 },
    }),
    ...callbacks,
  }));
  assert.match(html, /Withdrawn/);
  assert.match(html, /terminal/);
  assert.match(html, /Remove the classroom name/);
  assert.match(html, /Line one\n&lt;script&gt;not markup&lt;\/script&gt;/);
  assert.doesNotMatch(html, />Edit testimonial</);
  assert.doesNotMatch(html, />Withdraw testimonial</);
});

test("withdrawal rate-limit waiting feedback is announced accessibly", async () => {
  const { TestimonialAuthorView } = await vite.ssrLoadModule("/src/pages/feedback/AuthorFeedbackPage.jsx");
  const html = renderToStaticMarkup(React.createElement(TestimonialAuthorView, {
    state: testimonialState({
      withdrawalPhase: "rate-limited",
      withdrawalError: "Too many requests. Withdrawal retry will be available shortly.",
      withdrawalRetryAt: 3_000,
    }),
    ...callbacks,
  }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Withdrawal retry will be available shortly/);
});

test("explicit testimonial navigation scrolls and focuses the rendered target with motion preferences", async () => {
  const { scheduleFeedbackNavigation } = await vite.ssrLoadModule("/src/pages/feedback/authorFeedbackNavigation.js");
  const calls = [];
  let scheduled;
  const cleanup = scheduleFeedbackNavigation({
    section: { scrollIntoView: (options) => calls.push(["scroll", options]) },
    focusTarget: { focus: (options) => calls.push(["focus", options]) },
    reducedMotion: false,
    schedule: (callback) => { scheduled = callback; return 17; },
    cancel: (id) => calls.push(["cancel", id]),
  });
  assert.deepEqual(calls, []);
  scheduled();
  assert.deepEqual(calls, [
    ["scroll", { behavior: "smooth", block: "start", inline: "nearest" }],
    ["focus", { preventScroll: true }],
  ]);
  cleanup();
  assert.deepEqual(calls.at(-1), ["cancel", 17]);

  calls.length = 0;
  scheduleFeedbackNavigation({
    section: { scrollIntoView: (options) => calls.push(options) },
    focusTarget: { focus() {} },
    reducedMotion: true,
    schedule: (callback) => { callback(); return 18; },
    cancel() {},
  });
  assert.equal(calls[0].behavior, "auto");
});

test("only explicit ready edit and selection requests resolve to navigation targets", async () => {
  const { resolveFeedbackNavigation } = await vite.ssrLoadModule("/src/pages/feedback/authorFeedbackNavigation.js");
  const ready = testimonialState({
    selectedSubmissionId: 41,
    detailStatus: "success",
    detail: {
      testimonial: { id: 41 },
      revisions: [],
      revisionPage: 1,
      revisionLimit: 20,
      revisionTotal: 0,
      revisionTotalPages: 0,
    },
  });
  assert.equal(resolveFeedbackNavigation(null, ready), null);
  assert.equal(resolveFeedbackNavigation({ kind: "history", submissionId: 41 }, ready), "history");
  assert.equal(resolveFeedbackNavigation({ kind: "history", submissionId: 42 }, ready), null);
  assert.equal(resolveFeedbackNavigation({ kind: "edit" }, { ...ready, draftMode: "create" }), null);
  assert.equal(resolveFeedbackNavigation({ kind: "edit" }, { ...ready, draftMode: "edit" }), "edit");
});

test("testimonial history heading is programmatically focusable", async () => {
  const { TestimonialAuthorView } = await vite.ssrLoadModule("/src/pages/feedback/AuthorFeedbackPage.jsx");
  const current = {
    id: 51, revisionNumber: 1, message: "Accessible history",
    attributionMode: "anonymous", publicDisplayName: null,
    consentVersion: "synthetic-v1", consentedAt: "2026-11-03T00:00:00.000Z",
    moderationStatus: "pending", moderationExplanation: null,
    approvedAt: null, revokedAt: null, createdAt: "2026-11-03T00:00:00.000Z",
  };
  const item = { id: 41, withdrawnAt: null, publicationSuspendedAt: null, createdAt: "2026-11-03T00:00:00.000Z", currentRevision: current };
  const html = renderToStaticMarkup(React.createElement(TestimonialAuthorView, {
    state: testimonialState({
      testimonials: [item], total: 1, selectedSubmissionId: 41,
      detailStatus: "success",
      detail: { testimonial: item, revisions: [current], revisionPage: 1, revisionLimit: 20, revisionTotal: 1, revisionTotalPages: 1 },
    }),
    ...callbacks,
  }));
  assert.match(html, /<h2[^>]*id="testimonial-detail-title"[^>]*tabindex="-1"/);
});

test("production route and navigation register student and teacher author feedback without changing classroom feedback", async () => {
  const appSource = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
  const sidebarSource = fs.readFileSync(new URL("../../Components/SideBar/Sidebar.jsx", import.meta.url), "utf8");
  assert.match(appSource, /path="\/feedback"[\s\S]{0,180}<ProtectedRoute allowedRoles=\{\["student", "teacher"\]\}>/);
  assert.match(appSource, /path="\/classroom-feedback"[\s\S]{0,180}<ProtectedRoute allowedRoles=\{\["student"\]\}>/);
  assert.match(sidebarSource, /to: "\/feedback"[\s\S]*label: "Feedback"/);
  assert.match(sidebarSource, /to: "\/classroom-feedback"[\s\S]*label: "Classroom feedback"/);
});
