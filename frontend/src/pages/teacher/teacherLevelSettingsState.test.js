import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLevelSettingsPayload,
  createLevelSettingsMutationController,
  createLevelSettingsRequestFence,
  mergeLevelSettings,
  runExclusiveLevelSettingsMutation,
  runFencedLevelSettingsOperation,
  validateInterruptionDeductions,
} from "./teacherLevelSettingsState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const base = {
  levelNumber: 1,
  levelKey: "tutorial-1",
  isEnabled: true,
  displayOrder: 1,
  unlockAt: "",
  dueAt: "",
  hintsEnabled: true,
  hintUnlockThreshold: 3,
  wrongAttemptDeduction: 5,
  lateDeductionPerDay: 3,
  interruptionScoreDeduction: 1,
  interruptionXpDeduction: 10,
};

test("stored interruption deductions preserve independent zero values and missing values use defaults", () => {
  const defaults = [base];
  const zeros = mergeLevelSettings(defaults, [{
    levelKey: "tutorial-1",
    interruptionScoreDeduction: 0,
    interruptionXpDeduction: 0,
  }]);
  const missing = mergeLevelSettings(defaults, [{ levelKey: "tutorial-1" }]);

  assert.equal(zeros[0].interruptionScoreDeduction, 0);
  assert.equal(zeros[0].interruptionXpDeduction, 0);
  assert.equal(missing[0].interruptionScoreDeduction, 1);
  assert.equal(missing[0].interruptionXpDeduction, 10);
});

test("deduction validation accepts two-decimal score values and whole-number XP only", () => {
  assert.deepEqual(validateInterruptionDeductions({
    interruptionScoreDeduction: "0.25",
    interruptionXpDeduction: "0",
  }), {});
  assert.deepEqual(validateInterruptionDeductions({
    interruptionScoreDeduction: "1.234",
    interruptionXpDeduction: "10.5",
  }), {
    interruptionScoreDeduction: "Enter a number from 0 to 100 with up to two decimal places.",
    interruptionXpDeduction: "Enter a whole number from 0 to 100.",
  });
  assert.ok(validateInterruptionDeductions({ interruptionScoreDeduction: "101", interruptionXpDeduction: "101" }).interruptionScoreDeduction);
  assert.ok(validateInterruptionDeductions({ interruptionScoreDeduction: "1e2", interruptionXpDeduction: "0x10" }).interruptionXpDeduction);
});

test("save payload includes validated deductions without dropping unrelated settings", () => {
  const payload = buildLevelSettingsPayload([{
    ...base,
    isEnabled: false,
    dueAt: "2026-11-01T23:59",
    interruptionScoreDeduction: "2.50",
    interruptionXpDeduction: "12",
  }], (value) => value ? `iso:${value}` : null);

  assert.equal(payload.settings[0].isEnabled, false);
  assert.equal(payload.settings[0].dueAt, "iso:2026-11-01T23:59");
  assert.equal(payload.settings[0].wrongAttemptDeduction, 5);
  assert.equal(payload.settings[0].interruptionScoreDeduction, 2.5);
  assert.equal(payload.settings[0].interruptionXpDeduction, 12);
});

test("request fence rejects stale classroom or level load, save, error, and finally continuations", () => {
  const fence = createLevelSettingsRequestFence("25");
  const loadA = fence.capture();
  assert.equal(fence.isCurrent(loadA), true);

  fence.setScope("26");
  const loadB = fence.capture();
  assert.equal(fence.isCurrent(loadA), false);
  assert.equal(fence.isCurrent(loadB), true);

  const saveForPreviousLevel = loadB;
  fence.invalidate();
  assert.equal(fence.isCurrent(saveForPreviousLevel), false);
  assert.equal(fence.isCurrent(loadB), false);
  assert.equal(fence.capture().scope, "26");
});

test("current save failures surface while switched-scope failure and finally updates are ignored", async () => {
  const fence = createLevelSettingsRequestFence("25");
  const currentUpdates = [];
  await runFencedLevelSettingsOperation({
    fence,
    operation: async () => { throw new Error("save failed"); },
    onError: (error) => currentUpdates.push(error.message),
    onFinally: () => currentUpdates.push("finished"),
  });
  assert.deepEqual(currentUpdates, ["save failed", "finished"]);

  let rejectOldSave;
  const oldSave = runFencedLevelSettingsOperation({
    fence,
    operation: () => new Promise((resolve, reject) => { rejectOldSave = reject; }),
    onError: () => currentUpdates.push("stale error"),
    onFinally: () => currentUpdates.push("stale finally"),
  });
  fence.setScope("26");
  rejectOldSave(new Error("old classroom"));
  await oldSave;
  assert.deepEqual(currentUpdates, ["save failed", "finished"]);
});

test("classroom mutation ownership blocks selection, edits, save, and reset until save settles", async () => {
  const fence = createLevelSettingsRequestFence("25");
  const mutations = createLevelSettingsMutationController();
  const saveA = deferred();
  const calls = [];

  const pending = runExclusiveLevelSettingsMutation({
    fence,
    mutations,
    kind: "save",
    operation: () => {
      calls.push("save A");
      return saveA.promise;
    },
    onSuccess: () => calls.push("save A success"),
    onSettled: () => calls.push("save A settled"),
  });

  assert.equal(mutations.isBusy(), true);
  assert.equal(mutations.runWhenIdle(() => calls.push("select level")), false);
  assert.equal(mutations.runWhenIdle(() => calls.push("edit")), false);
  const blockedSave = await runExclusiveLevelSettingsMutation({
    fence,
    mutations,
    kind: "save",
    operation: () => calls.push("save B"),
  });
  const blockedReset = await runExclusiveLevelSettingsMutation({
    fence,
    mutations,
    kind: "reset",
    operation: () => calls.push("reset"),
  });
  assert.equal(blockedSave.started, false);
  assert.equal(blockedReset.started, false);
  assert.deepEqual(calls, ["save A"]);

  saveA.resolve("saved");
  assert.deepEqual(await pending, { started: true, current: true, result: "saved" });
  assert.equal(mutations.isBusy(), false);
  assert.equal(mutations.runWhenIdle(() => calls.push("select level")), true);
  assert.deepEqual(calls, ["save A", "save A success", "save A settled", "select level"]);
});

test("reset rejection settles ownership while stale classroom continuations stay fenced", async () => {
  const fence = createLevelSettingsRequestFence("25");
  const mutations = createLevelSettingsMutationController();
  const resetA = deferred();
  const resetError = new Error("reset failed");
  const calls = [];

  const pending = runExclusiveLevelSettingsMutation({
    fence,
    mutations,
    kind: "reset",
    operation: () => resetA.promise,
    onError: () => calls.push("stale error"),
    onSettled: ({ current }) => calls.push(`settled:${current}`),
  });
  fence.setScope("26");
  fence.setScope("25");
  assert.equal(mutations.isBusy(), true);
  assert.equal((await runExclusiveLevelSettingsMutation({
    fence,
    mutations,
    kind: "save",
    operation: () => calls.push("overlap"),
  })).started, false);

  resetA.reject(resetError);
  assert.deepEqual(await pending, { started: true, current: false, error: resetError });
  assert.equal(mutations.isBusy(), false);
  assert.equal(mutations.runWhenIdle(() => calls.push("edit after rejection")), true);
  assert.deepEqual(calls, ["settled:false", "edit after rejection"]);
});

test("account change or unmount invalidation fences a late mutation without retaining busy ownership", async () => {
  const fence = createLevelSettingsRequestFence("25");
  const mutations = createLevelSettingsMutationController();
  const saveA = deferred();
  const calls = [];
  const pending = runExclusiveLevelSettingsMutation({
    fence,
    mutations,
    kind: "save",
    operation: () => saveA.promise,
    onSuccess: () => calls.push("stale success"),
    onError: () => calls.push("stale error"),
    onSettled: ({ current }) => calls.push(`settled:${current}`),
  });

  fence.invalidate();
  saveA.resolve("saved elsewhere");
  assert.deepEqual(await pending, {
    started: true,
    current: false,
    result: "saved elsewhere",
  });
  assert.deepEqual(calls, ["settled:false"]);
  assert.equal(mutations.isBusy(), false);
});
