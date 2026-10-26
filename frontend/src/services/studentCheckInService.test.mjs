import assert from "node:assert/strict";
import { after, test } from "node:test";
import axios from "axios";
import { createServer } from "vite";

globalThis.localStorage = { getItem: () => "student-token", removeItem() {}, setItem() {} };
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true } });
const { listStudentCheckIns, markStudentCheckInRead } = await vite.ssrLoadModule("/src/services/studentCheckInService.js");
after(async () => vite.close());

test("lists the requested bounded page with authentication and abort support", async () => {
  const original = axios.get;
  let received;
  axios.get = async (url, config) => {
    received = { url, config };
    return { data: { checkIns: [], page: 3, limit: 20, total: 0, totalPages: 1, unreadTotal: 0 } };
  };
  const signal = new AbortController().signal;
  try {
    const result = await listStudentCheckIns({ page: 3, limit: 20, signal });
    assert.match(received.url, /\/api\/notifications\/check-ins\?page=3&limit=20$/);
    assert.equal(received.config.signal, signal);
    assert.ok(received.config.headers);
    assert.equal(result.page, 3);
  } finally {
    axios.get = original;
  }
});

test("marks the exact canonical check-in notification without a message body", async () => {
  const original = axios.post;
  let received;
  axios.post = async (...args) => {
    received = args;
    return { data: { message: "Notification marked as viewed", notificationId: "check-in-81" } };
  };
  try {
    await markStudentCheckInRead({ notificationId: "check-in-81" });
    assert.match(received[0], /\/api\/notifications\/check-in-81\/viewed$/);
    assert.deepEqual(received[1], {});
    assert.ok(received[2].headers);
  } finally {
    axios.post = original;
  }
});
