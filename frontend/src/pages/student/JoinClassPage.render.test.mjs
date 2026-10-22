import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

globalThis.localStorage = {
  getItem(key) {
    return key === "user" ? JSON.stringify({ id: 51, role: "student", username: "learner" }) : null;
  },
  setItem() {},
  removeItem() {},
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

const baseState = {
  status: "success",
  hasData: true,
  hasActiveMembership: false,
  requestStates: [],
  error: "",
  refreshWarning: "",
  notice: null,
  checking: false,
};

const baseProps = {
  state: baseState,
  classCode: "",
  isSubmitting: false,
  onClassCodeChange() {},
  onSubmit() {},
  onCheckStatus() {},
  onRetry() {},
  onContinue() {},
  onLogout() {},
};

const pending = {
  classroom: { id: 8, className: "Web Systems", section: "B", schoolYear: "2026-2027" },
  requestedAt: "2026-10-22T08:00:00.000Z",
  state: "pending",
};

test("student join view restores waiting state with classroom identity and manual status check", async () => {
  const { JoinClassView } = await vite.ssrLoadModule("/src/pages/student/JoinClassPage.jsx");
  const html = renderToStaticMarkup(React.createElement(JoinClassView, {
    ...baseProps,
    state: { ...baseState, requestStates: [pending] },
  }));

  assert.match(html, /Awaiting teacher approval/);
  assert.match(html, /Web Systems/);
  assert.match(html, /Section B/);
  assert.match(html, /2026-2027/);
  assert.match(html, />Check status</);
  assert.match(html, />Request to join</);
  assert.doesNotMatch(html, /Oct|requestedAt|Request date/i);
});

test("student join view represents active-plus-pending and status outcomes separately", async () => {
  const { JoinClassView } = await vite.ssrLoadModule("/src/pages/student/JoinClassPage.jsx");
  const html = renderToStaticMarkup(React.createElement(JoinClassView, {
    ...baseProps,
    state: {
      ...baseState,
      hasActiveMembership: true,
      requestStates: [
        pending,
        { classroom: { ...pending.classroom, id: 9, className: "Algorithms" }, state: "approved", requestedAt: null },
        { classroom: { ...pending.classroom, id: 10, className: "Databases" }, state: "no-longer-pending", requestedAt: null },
      ],
    },
  }));

  assert.match(html, />Continue to dashboard</);
  assert.match(html, /Algorithms/);
  assert.match(html, /Approved/);
  assert.match(html, /Databases/);
  assert.match(html, /no longer pending/i);
  assert.match(html, /Web Systems/);
  assert.match(html, /Awaiting teacher approval/);
});

test("student join view exposes loading retry checking and confirmed-refresh warning states", async () => {
  const { JoinClassView } = await vite.ssrLoadModule("/src/pages/student/JoinClassPage.jsx");
  const render = (state, overrides = {}) => renderToStaticMarkup(React.createElement(JoinClassView, {
    ...baseProps,
    ...overrides,
    state: { ...baseState, ...state },
  }));

  assert.match(render({ status: "loading", hasData: false }), /Checking your classroom status/);
  const error = render({ status: "error", hasData: false, error: "Unable to load status." });
  assert.match(error, /role="alert"/);
  assert.match(error, />Retry</);
  assert.match(render({ requestStates: [pending], checking: true }), /Checking status/);
  const warning = render({
    requestStates: [pending],
    notice: { type: "success", message: "Join request submitted" },
    refreshWarning: "Your request was saved, but its latest status could not be refreshed.",
  });
  assert.match(warning, /Join request submitted/);
  assert.match(warning, /request was saved/);
  assert.doesNotMatch(warning, /Failed to submit/);
});

test("student navigation includes the request-status screen", async () => {
  const { default: Sidebar } = await vite.ssrLoadModule("/src/Components/SideBar/Sidebar.jsx");
  const html = renderToStaticMarkup(React.createElement(
    MemoryRouter,
    { initialEntries: ["/dashboard"] },
    React.createElement(Sidebar),
  ));
  assert.match(html, /href="\/join-class"/);
  assert.match(html, /Class requests/);
});
