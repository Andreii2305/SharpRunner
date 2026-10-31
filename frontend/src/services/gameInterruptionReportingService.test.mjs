import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const calls = [];
globalThis.localStorage = { getItem: () => "student-token", removeItem() {}, setItem() {} };
const { default: axios } = await import("axios");
axios.post = async (...args) => {
  calls.push(args);
  if (args[0].endsWith("/events")) {
    return {
      data: {
        changed: false,
        event: {
          id: 19,
          sessionId: 41,
          classroomId: 7,
          levelKey: "arrays-1",
          eventType: "hidden",
          receivedAt: "2026-10-30T00:01:00.000Z",
        },
      },
    };
  }
  return {
    data: {
      changed: true,
      session: {
        id: 41,
        classroomId: 7,
        levelKey: "arrays-1",
        lifecycleStatus: "CURRENT",
        scoreDeductionSnapshot: 0,
        xpDeductionSnapshot: 0,
      },
    },
  };
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const service = await vite.ssrLoadModule("/src/services/gameInterruptionReportingService.js");
after(async () => vite.close());

test("session creation uses the authenticated progress route and exact strict body", async () => {
  const abort = new AbortController();
  const result = await service.startGameInterruptionSession({
    classroomId: 7,
    levelKey: "arrays-1",
    sessionKey: "session_key_0001",
    signal: abort.signal,
  });

  assert.match(calls[0][0], /\/api\/progress\/level\/arrays-1\/interruption-sessions$/);
  assert.deepEqual(calls[0][1], { classroomId: 7, sessionKey: "session_key_0001" });
  assert.deepEqual(calls[0][2].headers, { Authorization: "Bearer student-token" });
  assert.equal(calls[0][2].signal, abort.signal);
  assert.equal(result.session.scoreDeductionSnapshot, 0);
});

test("event delivery sends no actor, rates, or client timestamp", async () => {
  const abort = new AbortController();
  const result = await service.recordGameInterruptionEvent({
    classroomId: 7,
    levelKey: "arrays-1",
    sessionId: 41,
    eventKey: "event_key_0001",
    eventType: "hidden",
    signal: abort.signal,
  });

  assert.match(calls[1][0], /\/api\/progress\/level\/arrays-1\/interruption-sessions\/41\/events$/);
  assert.deepEqual(calls[1][1], {
    classroomId: 7,
    eventKey: "event_key_0001",
    eventType: "hidden",
  });
  assert.deepEqual(calls[1][2].headers, { Authorization: "Bearer student-token" });
  assert.equal(calls[1][2].signal, abort.signal);
  assert.equal(result.changed, false);
});
