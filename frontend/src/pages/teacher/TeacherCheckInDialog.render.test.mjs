import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true } });
test.after(async () => vite.close());

const render = async (overrides = {}) => {
  const { TeacherCheckInDialog } = await vite.ssrLoadModule("/src/pages/teacher/TeacherCheckInDialog.jsx");
  return renderToStaticMarkup(React.createElement(TeacherCheckInDialog, {
    state: {
      open: true,
      target: {
        classroom: { id: 7, className: "C# Foundations", section: "A" },
        student: { userId: 51, studentName: "Ada <script>alert(1)</script>", username: "ada" },
      },
      message: "Hello <b>student</b>\nPlease check in.",
      characterCount: 43,
      phase: "editing",
      error: "",
      retryAt: null,
      ...overrides,
    },
    onMessageChange() {}, onSend() {}, onRetry() {}, onClose() {},
  }));
};

test("dialog provides the visible recipient, classroom, complete plain-text review, and character count", async () => {
  const html = await render();
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /C# Foundations/);
  assert.match(html, /Ada &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /@ada/);
  assert.match(html, /43 of 1,000 characters/);
  assert.match(html, /Hello &lt;b&gt;student&lt;\/b&gt;\nPlease check in\./);
  assert.match(html, /placeholder="Write a neutral, private check-in message…"/);
});

test("uncertain results lock the exact payload and expose retry without another send action", async () => {
  const html = await render({ phase: "uncertain", error: "The result is uncertain. Retry to confirm whether it was saved." });
  assert.match(html, /textarea[^>]*disabled=""/);
  assert.match(html, /Retry same message/);
  assert.doesNotMatch(html, /<button[^>]*>Send check-in<\/button>/);
  assert.match(html, /does not create a new message/);
});

test("success says saved rather than read and known failures remain editable", async () => {
  const success = await render({ phase: "success", message: "Saved", characterCount: 5 });
  assert.match(success, /saved and sent to the student/i);
  assert.doesNotMatch(success, /student has read/i);
  const failure = await render({ phase: "error", errorKind: "unavailable", error: "The student or classroom is no longer available." });
  assert.match(failure, /no longer available/);
  assert.doesNotMatch(failure, /textarea[^>]*disabled=""/);
});
