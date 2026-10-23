import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

let FilterView;
let Pager;
try {
  ({ AdminStudentClassroomFilterView: FilterView } = await vite.ssrLoadModule("/src/pages/admin/AdminStudentClassroomFilter.jsx"));
  ({ Pager } = await vite.ssrLoadModule("/src/pages/admin/AdminDashboardPage.jsx"));
} catch {
  // The first red run intentionally precedes the feature component.
}

const baseProps = {
  selectedClassroom: null,
  options: [],
  search: "",
  page: 1,
  totalPages: 1,
  total: 0,
  status: "success",
  error: "",
  onSearchChange() {},
  onSelect() {},
  onPageChange() {},
  onRetry() {},
};

const render = (props = {}) => {
  assert.equal(typeof FilterView, "function");
  return renderToStaticMarkup(React.createElement(FilterView, { ...baseProps, ...props }));
};

test("classroom filter renders All classrooms and explains active membership scope", () => {
  const html = render();
  assert.match(html, /All classrooms/);
  assert.match(html, /active classroom memberships/i);
  assert.match(html, /Account status is filtered separately/i);
  assert.match(html, /aria-label="Search classrooms for student filtering"/);
});

test("selected classroom identity remains visible outside the current lookup page", () => {
  const html = render({
    selectedClassroom: { id: 25, className: "Legacy Systems", section: "A", isActive: false },
    options: [{ id: 31, className: "Algorithms", section: "B", isActive: true }],
  });
  assert.match(html, /Legacy Systems · A \(Archived\)/);
  assert.match(html, /Algorithms · B/);
  assert.match(html, /Applied classroom:.*Legacy Systems/s);
});

test("classroom lookup exposes loading, empty, retryable error, and separate pagination states", () => {
  assert.match(render({ status: "loading" }), /Loading classrooms/);
  assert.match(render({ status: "success", options: [], search: "missing" }), /No classrooms match/);

  const failed = render({ status: "error", error: "Unable to load classrooms." });
  assert.match(failed, /role="alert"/);
  assert.match(failed, />Retry</);

  const paginated = render({
    options: [{ id: 31, className: "Algorithms", section: "B", isActive: true }],
    page: 2,
    totalPages: 4,
    total: 73,
  });
  assert.match(paginated, /Classroom results page 2 of 4/);
  assert.match(paginated, /aria-label="Previous classroom results page"/);
  assert.match(paginated, /aria-label="Next classroom results page"/);

  const reloadingPage = render({ status: "loading", page: 2, totalPages: null, total: null });
  assert.match(reloadingPage, /Classroom results unavailable/);
  assert.doesNotMatch(reloadingPage, /73 classrooms/);
  assert.equal((reloadingPage.match(/disabled=""/g) ?? []).length, 2);

  const failedPagination = render({ status: "error", page: 2, totalPages: null, total: null });
  assert.match(failedPagination, /Classroom results unavailable/);
  assert.equal((failedPagination.match(/disabled=""/g) ?? []).length, 2);
});

test("student pager remains mounted but disables navigation when metadata is unavailable", () => {
  assert.equal(typeof Pager, "function");
  const html = renderToStaticMarkup(React.createElement(Pager, {
    page: 2,
    totalPages: null,
    total: null,
    label: "matching users",
    paginationLabel: "student results",
    onChange() {},
  }));
  assert.match(html, /Results unavailable/);
  assert.doesNotMatch(html, /0 matching users/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /aria-label="Previous student results page"/);
  assert.match(html, /aria-label="Next student results page"/);
});
