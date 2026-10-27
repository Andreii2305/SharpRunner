import assert from "node:assert/strict";
import test from "node:test";
import { createAssessmentAccountFence } from "./assessmentAccountFence.js";

test("account fence invalidates only when authenticated identity changes and unsubscribes", () => {
  let identity = "student:51";
  let listener;
  let unsubscribed = false;
  const changes = [];
  const fence = createAssessmentAccountFence({
    getIdentity: () => identity,
    subscribe(callback) {
      listener = callback;
      return () => { unsubscribed = true; };
    },
    onIdentityChanged: (event) => changes.push(event),
  });

  listener();
  assert.deepEqual(changes, []);
  identity = "student:52";
  listener();
  assert.deepEqual(changes, [{ previousIdentity: "student:51", identity: "student:52" }]);
  listener();
  assert.equal(changes.length, 1);

  fence.dispose();
  assert.equal(unsubscribed, true);
});
