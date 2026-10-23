import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

const { DetailPanel } = await vite.ssrLoadModule("/src/pages/admin/AdminDashboardPage.jsx");

test("classroom detail labels mixed memberships without treating every record as enrolled", () => {
  assert.equal(typeof DetailPanel, "function");
  const html = renderToStaticMarkup(React.createElement(DetailPanel, {
    onClose() {},
    detail: {
      type: "classroom",
      classroom: {
        id: 25,
        className: "Web Systems",
        isActive: true,
        studentCount: 1,
        moduleCount: 2,
        createdAt: "2026-10-01T00:00:00.000Z",
        teacher: { firstName: "Tess", lastName: "Teacher" },
      },
      memberships: [
        { id: 1, studentId: 11, status: "active", student: { firstName: "Ada", lastName: "Active", email: "ada@example.test", status: "inactive" } },
        { id: 2, studentId: 12, status: "pending", student: { firstName: "Pia", lastName: "Pending", email: "pia@example.test", status: "active" } },
        { id: 3, studentId: 13, status: "rejected", student: { firstName: "Rae", lastName: "Rejected", email: "rae@example.test" } },
        { id: 4, studentId: 14, status: "removed", student: { firstName: "Remy", lastName: "Removed", email: "remy@example.test" } },
        { id: 5, studentId: 15, status: "future_state", student: { firstName: "Uma", lastName: "Unknown", email: "uma@example.test" } },
        { id: 6, studentId: 16, student: { firstName: "Mia", lastName: "Missing", email: "mia@example.test" } },
      ],
      lessons: [],
      announcements: [],
    },
  }));

  assert.match(html, /Classroom memberships/);
  assert.doesNotMatch(html, /Enrolled students<\/h3>/);
  assert.match(html, /<dt>Enrolled students<\/dt><dd>1<\/dd>/);
  assert.equal((html.match(/Membership status: Enrolled/g) ?? []).length, 1);
  assert.match(html, /Membership status: Pending approval/);
  assert.match(html, /Membership status: Rejected/);
  assert.match(html, /Membership status: Removed/);
  assert.equal((html.match(/Membership status: Unknown membership status/g) ?? []).length, 2);
  assert.match(html, /Account status: inactive/);
  assert.match(html, /Account status: active/);
  assert.equal((html.match(/Account status:/g) ?? []).length, 2);
});

test("classroom detail never derives the enrolled count from membership records", () => {
  const html = renderToStaticMarkup(React.createElement(DetailPanel, {
    onClose() {},
    detail: {
      type: "classroom",
      classroom: {
        id: 25,
        className: "Web Systems",
        isActive: true,
        moduleCount: 0,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
      memberships: [
        { id: 1, studentId: 11, status: "pending" },
        { id: 2, studentId: 12, status: "removed" },
      ],
      lessons: [],
      announcements: [],
    },
  }));

  assert.match(html, /<dt>Enrolled students<\/dt><dd>—<\/dd>/);
  assert.doesNotMatch(html, /<dt>Enrolled students<\/dt><dd>2<\/dd>/);
});
