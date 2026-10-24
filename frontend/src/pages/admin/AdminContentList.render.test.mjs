import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const vite = await createServer({
  server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true },
  ssr: { noExternal: ["@monaco-editor/react"] },
  plugins: [{
    name: "admin-content-list-test-editor", enforce: "pre",
    resolveId(id) { return id === "@monaco-editor/react" ? "\0admin-content-list-test-editor" : null; },
    load(id) { return id === "\0admin-content-list-test-editor" ? 'import React from "react"; export default function Editor() { return React.createElement("div"); }' : null; },
  }],
});
test.after(async () => vite.close());

const dashboardModule = await vite.ssrLoadModule("/src/pages/admin/AdminDashboardPage.jsx");

test("admin content status control exposes the four displayed states", () => {
  assert.equal(typeof dashboardModule.AdminContentStatusFilter, "function");
  const html = renderToStaticMarkup(React.createElement(dashboardModule.AdminContentStatusFilter, {
    value: "scheduled",
    onChange() {},
  }));
  assert.match(html, /<option value=""[^>]*>All statuses<\/option>/);
  for (const [value, label] of [["draft", "Draft"], ["scheduled", "Scheduled"], ["published", "Published"], ["archived", "Archived"]]) {
    assert.match(html, new RegExp(`<option value="${value}"[^>]*>${label}</option>`));
  }
  assert.doesNotMatch(html, /value="true"|value="false"/);
});

test("admin content table uses derived publication labels and authoritative owner identity", () => {
  assert.equal(typeof dashboardModule.AdminContentTable, "function");
  const html = renderToStaticMarkup(React.createElement(dashboardModule.AdminContentTable, {
    content: [
      { id: 1, title: "Draft", contentType: "lesson", status: "draft", owner: { firstName: "Ada", lastName: "Owner" }, classroom: { className: "A", teacher: { firstName: "Wrong", lastName: "Teacher" } }, createdAt: "2026-10-01T00:00:00Z" },
      { id: 2, title: "Scheduled", contentType: "lesson", status: "scheduled", owner: { username: "schedule.owner" }, classroom: null, createdAt: "2026-10-02T00:00:00Z" },
      { id: 3, title: "Published", contentType: "module", status: "published", owner: null, classroom: { className: "B", teacher: { firstName: "Also", lastName: "Wrong" } }, createdAt: "2026-10-03T00:00:00Z" },
      { id: 4, title: "Archived", contentType: "assignment", status: "archived", owner: { firstName: "Archive", lastName: "Owner" }, classroom: null, createdAt: "2026-10-04T00:00:00Z" },
    ],
    loading: false,
    error: "",
    onRetry() {},
    onOpenContent() {},
    page: 2,
    total: 24,
    totalPages: 3,
    onPageChange() {},
  }));

  assert.match(html, />draft<\/span>/i);
  assert.match(html, />scheduled<\/span>/i);
  assert.match(html, />published<\/span>/i);
  assert.match(html, />archived<\/span>/i);
  assert.equal((html.match(/>Published<\/span>/g) ?? []).length, 1);
  assert.match(html, /Ada Owner/);
  assert.match(html, /@schedule\.owner/);
  assert.doesNotMatch(html, /Wrong Teacher|Also Wrong/);
  assert.equal(html.includes(`<td>${String.fromCodePoint(0x2014)}</td>`), true);
  assert.match(html, /24 items/);
  assert.match(html, /Page 2 of 3/);
});

test("admin content pagination stays mounted and unavailable during replacement loading", () => {
  const html = renderToStaticMarkup(React.createElement(dashboardModule.AdminContentTable, {
    content: [],
    loading: true,
    error: "",
    onOpenContent() {},
    page: 3,
    total: null,
    totalPages: null,
    onPageChange() {},
  }));

  assert.match(html, /Loading/);
  assert.match(html, /Results unavailable/);
  assert.match(html, /Pagination unavailable/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.doesNotMatch(html, /0 items|Page 3 of 1/);
});
