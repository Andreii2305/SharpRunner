const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  heartbeatProgressSession,
  pauseProgressSession,
  startProgressSession,
} = require("../src/services/activeLevelTimerService");
const {
  evaluateStudentLevelAccess,
  getEffectiveDueAt,
} = require("../src/services/levelAccessService");

const progressRow = (overrides = {}) => ({
  levelKey: "tutorial-level-1",
  isCompleted: false,
  timeSpentSeconds: 0,
  activeSessionId: null,
  activeSessionStartedAt: null,
  lastHeartbeatAt: null,
  startedAt: null,
  save: async () => undefined,
  ...overrides,
});

test("active timer accumulates confirmed visible segments and not closed time", async () => {
  const row = progressRow();
  const began = new Date("2026-09-05T00:00:00Z");
  await startProgressSession(row, "session_one", began);
  await heartbeatProgressSession(row, "session_one", new Date("2026-09-05T00:00:30Z"));
  await pauseProgressSession(row, { now: new Date("2026-09-05T00:00:40Z") });
  assert.equal(row.timeSpentSeconds, 40);

  await startProgressSession(row, "session_two", new Date("2026-09-05T04:00:00Z"));
  assert.equal(row.timeSpentSeconds, 40, "four closed hours are not accumulated");
  await heartbeatProgressSession(row, "session_two", new Date("2026-09-05T04:00:30Z"));
  assert.equal(row.timeSpentSeconds, 70);
});

test("stale sessions cap unconfirmed time and replaced tabs cannot heartbeat", async () => {
  const row = progressRow();
  await startProgressSession(row, "first_tab", new Date("2026-09-05T00:00:00Z"));
  await startProgressSession(row, "second_tab", new Date("2026-09-05T01:00:00Z"));
  assert.equal(row.timeSpentSeconds, 0);
  const oldTab = await heartbeatProgressSession(row, "first_tab", new Date("2026-09-05T01:00:30Z"));
  assert.equal(oldTab.replaced, true);
  assert.equal(row.timeSpentSeconds, 0);
});

test("effective deadlines use the later class or individual date", () => {
  assert.equal(getEffectiveDueAt(null, "2026-09-20T00:00:00Z"), null);
  assert.equal(
    getEffectiveDueAt("2026-09-12T00:00:00Z", "2026-09-16T00:00:00Z").toISOString(),
    "2026-09-16T00:00:00.000Z",
  );
  assert.equal(
    getEffectiveDueAt("2026-09-18T00:00:00Z", "2026-09-16T00:00:00Z").toISOString(),
    "2026-09-18T00:00:00.000Z",
  );
});

test("unfinished work expires while completed work remains accessible", () => {
  const settings = [{
    levelKey: "tutorial-level-1",
    isEnabled: true,
    unlockAt: null,
    dueAt: new Date("2026-09-12T00:00:00Z"),
  }];
  const unfinished = new Map([["tutorial-level-1", progressRow()]]);
  const expired = evaluateStudentLevelAccess({
    levelKey: "tutorial-level-1",
    settings,
    progressByKey: unfinished,
    now: new Date("2026-09-13T00:00:00Z"),
  });
  assert.equal(expired.allowed, false);
  assert.equal(expired.reason, "DEADLINE_PASSED");

  unfinished.get("tutorial-level-1").isCompleted = true;
  const completed = evaluateStudentLevelAccess({
    levelKey: "tutorial-level-1",
    settings,
    progressByKey: unfinished,
    now: new Date("2026-09-13T00:00:00Z"),
  });
  assert.equal(completed.allowed, true);
  assert.equal(completed.reason, "COMPLETED");
});
