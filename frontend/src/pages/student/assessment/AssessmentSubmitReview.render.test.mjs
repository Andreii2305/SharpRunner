import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { handleSubmitConfirmationKeyDown } from "./assessmentDialogFocus.js";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const { default: AssessmentSubmitReview } = await vite.ssrLoadModule(
  "/src/pages/student/assessment/AssessmentSubmitReview.jsx",
);
test.after(async () => { await vite.close(); });

const renderReview = (overrides = {}) => renderToStaticMarkup(React.createElement(
  AssessmentSubmitReview,
  {
    summary: { total: 3, answered: 1, unansweredQuestionIds: [102, 103] },
    readiness: {
      ready: true,
      dirtyQuestionIds: [],
      savingQuestionIds: [],
      failedQuestionIds: [],
    },
    confirmationOpen: false,
    submitting: false,
    onReturnToQuestions() {},
    onFirstUnanswered() {},
    onOpenConfirmation() {},
    onCancelConfirmation() {},
    onConfirm() {},
    ...overrides,
  },
));

test("final review distinguishes unanswered work from unresolved saves", () => {
  const html = renderReview({
    readiness: {
      ready: false,
      dirtyQuestionIds: [101],
      savingQuestionIds: [101],
      failedQuestionIds: [103],
    },
  });
  assert.match(html, /<dt>Answered<\/dt><dd>1 of 3<\/dd>/);
  assert.match(html, /<dt>Unanswered<\/dt><dd>2<\/dd>/);
  assert.match(html, /<dt>Unsaved or errored<\/dt><dd>2<\/dd>/);
  assert.match(html, /Saving is still in progress/);
  assert.match(html, /Jump to first unanswered question/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Continue to submission<\/button>/);
  assert.doesNotMatch(html, /Correct|Incorrect|Score|Expected answer/);
});

test("explicit confirmation warns about unanswered questions and uses accessible dialog semantics", () => {
  const html = renderReview({ confirmationOpen: true });
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /You still have 2 unanswered questions/);
  assert.match(html, /<button[^>]*>Cancel<\/button>/);
  assert.match(html, /<button[^>]*>Submit assessment<\/button>/);
});

test("submission in progress disables every route back to editable questions", () => {
  const html = renderReview({ submitting: true });
  assert.match(html, /<button[^>]*disabled=""[^>]*>Back to questions<\/button>/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Jump to first unanswered question<\/button>/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Continue to submission<\/button>/);
});

test("confirmation keyboard handling closes on Escape and contains Tab focus", () => {
  const cancel = { focused: false, disabled: false, focus() { this.focused = true; } };
  const submit = { focused: false, disabled: false, focus() { this.focused = true; } };
  const panel = {
    querySelectorAll: () => [cancel, submit],
  };
  let canceled = 0;
  const escape = {
    key: "Escape",
    target: submit,
    preventDefault() { this.prevented = true; },
  };
  handleSubmitConfirmationKeyDown({
    event: escape,
    panel,
    submitting: false,
    onCancel: () => { canceled += 1; },
  });
  assert.equal(canceled, 1);

  const tab = {
    key: "Tab",
    target: submit,
    shiftKey: false,
    preventDefault() { this.prevented = true; },
  };
  handleSubmitConfirmationKeyDown({
    event: tab,
    panel,
    submitting: false,
    onCancel() {},
  });
  assert.equal(tab.prevented, true);
  assert.equal(cancel.focused, true);
});

test("confirmation panel remains scrollable inside short and narrow viewports", async () => {
  const css = await readFile(new URL("./AssessmentPlayer.module.css", import.meta.url), "utf8");
  assert.match(css, /\.dialogBackdrop[\s\S]*z-index:/);
  assert.match(css, /\.dialogPanel[\s\S]*max-height:\s*calc\(100dvh - 2rem\)/);
  assert.match(css, /\.dialogPanel[\s\S]*overflow-y:\s*auto/);
});
