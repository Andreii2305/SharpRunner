import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getDecisionRefreshNotice } from "./teacherJoinRequestState.js";

const vite = await createServer({
  server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

const baseProps = {
  state: { status: "success", requests: [], total: 0, page: 1, limit: 10, totalPages: 1, error: "", hasData: true },
  pendingStudentIds: new Set(),
  confirmedStudentIds: new Set(),
  notice: null,
  onDecision() {},
  onRetry() {},
  onRetryRefresh() {},
  onPageChange() {},
  registerAction() {},
  headingRef: { current: null },
};

test("join-request view renders a separate pending total and only intended student identity", async () => {
  const { JoinRequestsView } = await vite.ssrLoadModule("/src/pages/teacher/TeacherJoinRequests.jsx");
  const html = renderToStaticMarkup(React.createElement(JoinRequestsView, {
    ...baseProps,
    state: {
      ...baseProps.state,
      total: 12,
      totalPages: 2,
      requests: [{
        id: 81, classroomId: 25, studentId: 7, status: "pending",
        student: { id: 7, firstName: "Ada", lastName: "Lovelace", username: "ada", email: "private@example.com" },
      }],
    },
  }));

  assert.match(html, /Join requests/);
  assert.match(html, /12 pending requests/);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /@ada/);
  assert.match(html, />Approve</);
  assert.match(html, />Reject</);
  assert.doesNotMatch(html, /private@example\.com/);
  assert.doesNotMatch(html, /request date|createdAt|joinedAt/i);
});

test("join-request view exposes loading empty error retry and pagination states", async () => {
  const { JoinRequestsView } = await vite.ssrLoadModule("/src/pages/teacher/TeacherJoinRequests.jsx");
  const render = (props) => renderToStaticMarkup(React.createElement(JoinRequestsView, { ...baseProps, ...props }));

  assert.match(render({ state: { ...baseProps.state, status: "loading", hasData: false } }), /Loading join requests/);
  assert.match(render({ state: baseProps.state }), /No pending join requests/);
  const error = render({ state: { ...baseProps.state, status: "error", hasData: false, error: "Could not load requests." } });
  assert.match(error, /role="alert"/);
  assert.match(error, /Could not load requests/);
  assert.match(error, />Retry</);

  const paginated = render({ state: {
    ...baseProps.state, total: 21, page: 2, totalPages: 3,
    requests: [{ studentId: 7, student: { firstName: "Ada", lastName: "", username: "ada" } }],
  } });
  assert.match(paginated, /Page 2 of 3/);
  assert.match(paginated, /Previous<\/button>/);
  assert.match(paginated, /<button[^>]*>Next /);
});

test("pending or confirmed rows disable both decision controls and announce outcomes", async () => {
  const { JoinRequestsView } = await vite.ssrLoadModule("/src/pages/teacher/TeacherJoinRequests.jsx");
  const state = {
    ...baseProps.state,
    total: 1,
    requests: [{ studentId: 7, student: { firstName: "Ada", lastName: "Lovelace", username: "ada" } }],
  };
  const html = renderToStaticMarkup(React.createElement(JoinRequestsView, {
    ...baseProps,
    state,
    pendingStudentIds: new Set([7]),
    notice: { type: "success", message: "Ada Lovelace was approved." },
  }));

  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /role="status"/);
  assert.match(html, /Ada Lovelace was approved/);
});

test("decision refresh notices distinguish complete and partial refresh outcomes", async () => {
  const { JoinRequestsView } = await vite.ssrLoadModule("/src/pages/teacher/TeacherJoinRequests.jsx");

  assert.deepEqual(
    getDecisionRefreshNotice({ pendingList: true, roster: true }, { decision: "approve" }),
    {
      type: "success",
      retry: false,
      message: "The request was approved and classroom data was refreshed.",
    },
  );
  assert.deepEqual(
    getDecisionRefreshNotice({ pendingList: true, roster: false }, { decision: "reject" }),
    {
      type: "error",
      retry: true,
      message: "The request was rejected. The pending list refreshed, but the classroom roster could not refresh. The decision was saved.",
    },
  );
  assert.deepEqual(
    getDecisionRefreshNotice({ pendingList: false, roster: true }, { decision: "approve" }),
    {
      type: "error",
      retry: true,
      message: "The request was approved. The roster refreshed, but the pending list could not refresh. The decision was saved.",
    },
  );
  const bothFailed = getDecisionRefreshNotice(
    { pendingList: false, roster: false },
    { decision: "reject" },
  );
  assert.deepEqual(bothFailed, {
    type: "error",
    retry: true,
    message: "The request was rejected, but the pending list and classroom roster could not refresh. The decision was saved.",
  });

  const html = renderToStaticMarkup(React.createElement(JoinRequestsView, {
    ...baseProps,
    notice: bothFailed,
  }));
  assert.match(html, /The decision was saved/);
  assert.match(html, />Retry refresh</);
});
