import assert from "node:assert/strict";
import test from "node:test";
import * as gameStorage from "./gamePageStorage.js";

test("a blocked draft store does not interrupt game entry or reset", () => {
  const blocked = {
    getItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.equal(gameStorage.readGameDraft(blocked, "level-one"), null);
  assert.equal(gameStorage.removeGameDraft(blocked, "level-one"), false);
  assert.equal(gameStorage.readGameDraft(null, "level-one"), null);
  assert.equal(gameStorage.removeGameDraft(null, "level-one"), false);
});

test("draft recovery and removal still work when storage is available", () => {
  const values = new Map([["level-one", "int steps = 1;"]]);
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    removeItem(key) { values.delete(key); },
  };
  assert.equal(gameStorage.readGameDraft(storage, "level-one"), "int steps = 1;");
  assert.equal(gameStorage.removeGameDraft(storage, "level-one"), true);
  assert.equal(gameStorage.readGameDraft(storage, "level-one"), null);
});

test("restricted auth storage cannot throw out of a GamePage request", () => {
  assert.deepEqual(gameStorage.readGameAuthHeaders(() => {
    throw new Error("storage blocked");
  }), {});
  assert.deepEqual(gameStorage.readGameAuthHeaders(() => ({ Authorization: "Bearer demo" })), {
    Authorization: "Bearer demo",
  });
});
