import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true } });
test.after(async () => vite.close());
const { StudentCheckIns } = await vite.ssrLoadModule("/src/Components/Dashboard/StudentCheckIns.jsx");
const render = (state) => renderToStaticMarkup(React.createElement(StudentCheckIns, {
  state,
  onRetry: () => {}, onRefresh: () => {}, onPrevious: () => {}, onNext: () => {}, onMarkRead: () => {},
}));
const base = {
  status: "success", loading: false, refreshing: false, checkIns: [], page: 1, limit: 20,
  total: 0, totalPages: 1, unreadTotal: 0, error: "", refreshError: "", markInFlight: [], markErrors: {},
};

test("renders full plain text and authoritative sender, role, classroom, archive, and unread context", () => {
  const first = {
    id: "check-in-81", senderRole: "admin",
    sender: { id: 61, firstName: "Ada", lastName: "Admin", username: "ada" },
    classroom: { id: 7, className: "Programming 1", section: "A", schoolYear: "2026-2027", isActive: false },
    message: "First line\n<script>alert('no')</script>\nLast line",
    createdAt: "2026-10-25T05:00:00.000Z", isRead: false,
  };
  const html = render({
    ...base,
    total: 21,
    totalPages: 2,
    unreadTotal: 13,
    checkIns: [first, ...Array.from({ length: 5 }, (_, index) => ({
      ...first, id: `check-in-${82 + index}`, message: `Additional message ${index + 1}`, isRead: true,
    }))],
  });
  assert.match(html, /13 unread check-ins/);
  assert.match(html, /Ada Admin/);
  assert.match(html, /@ada/);
  assert.match(html, /Administrator/);
  assert.match(html, /Programming 1/);
  assert.match(html, /Archived classroom/);
  assert.match(html, /First line\n&lt;script&gt;alert\(&#x27;no&#x27;\)&lt;\/script&gt;\nLast line/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Mark as read/);
  assert.match(html, /Additional message 5/);
  assert.match(html, /Page 1 of 2/);
});

test("uses neutral association labels and keeps pagination controls mounted without metadata", () => {
  const html = render({ ...base, status: "loading", loading: true, total: null, totalPages: null, unreadTotal: null, checkIns: [{
    id: "check-in-82", senderRole: "teacher", sender: null, classroom: null,
    message: "Private message", createdAt: null, isRead: true,
  }] });
  assert.match(html, /Loading check-ins/);
  assert.match(html, /Previous/);
  assert.match(html, /Next/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /0 unread/);
});

test("uses a username-only sender as a single neutral name fallback", () => {
  const html = render({ ...base, total: 1, unreadTotal: 0, checkIns: [{
    id: "check-in-83", senderRole: "teacher",
    sender: { id: 41, firstName: null, lastName: null, username: "teacher41" },
    classroom: null, message: "Hello", createdAt: null, isRead: true,
  }] });
  assert.equal((html.match(/@teacher41/g) || []).length, 1);
});

test("renders empty, initial failure, mutation failure, and confirmed-read refresh failure distinctly", () => {
  assert.match(render(base), /No check-ins yet/);
  const failed = render({ ...base, status: "error", total: null, totalPages: null, unreadTotal: null, error: "Could not load check-ins." });
  assert.match(failed, /Could not load check-ins/);
  assert.match(failed, />Retry</);
  const partial = render({ ...base, checkIns: [{ id: "check-in-81", senderRole: "teacher", sender: null, classroom: null, message: "Hello", createdAt: null, isRead: true }], refreshError: "Marked as read, but updated check-ins could not be refreshed." });
  assert.match(partial, /decision|Marked as read/i);
  assert.match(partial, /Retry refresh/);
  const mutationFailure = render({ ...base, checkIns: [{ id: "check-in-82", senderRole: "teacher", sender: null, classroom: null, message: "Still unread", createdAt: null, isRead: false }], markErrors: { "check-in-82": "Unable to mark this check-in as read." } });
  assert.match(mutationFailure, /Unable to mark this check-in as read/);
  assert.match(mutationFailure, /Mark as read/);
});
