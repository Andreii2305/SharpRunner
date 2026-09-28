import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import { createServer } from "vite";

import {
  builtInModuleContentReducer,
  classifyBuiltInLessonContentError,
  initialBuiltInModuleContentState,
  parsePositiveClassroomId,
  visibleBuiltInModuleContentState,
  withClassroomIdQuery,
} from "./builtInModuleContentState.js";

test("initial and new request states never retain prior lesson content", () => {
  assert.deepEqual(initialBuiltInModuleContentState, {
    status: "idle",
    requestKey: null,
    content: null,
    error: null,
  });

  const previous = {
    status: "ready",
    requestKey: "class-7:arrays:1",
    content: { lesson: { lessonKey: "arrays", title: "Protected arrays prose" } },
    error: null,
  };
  const classroomChange = builtInModuleContentReducer(previous, {
    type: "BEGIN_REQUEST",
    requestKey: "class-8:arrays:2",
  });
  assert.deepEqual(classroomChange, {
    status: "loading",
    requestKey: "class-8:arrays:2",
    content: null,
    error: null,
  });

  const lessonChange = builtInModuleContentReducer(previous, {
    type: "BEGIN_REQUEST",
    requestKey: "class-7:functions:3",
  });
  assert.equal(lessonChange.status, "loading");
  assert.equal(lessonChange.content, null);
  assert.notEqual(lessonChange.requestKey, previous.requestKey);
});

test("matching success stores content while stale success and failure are ignored", () => {
  const loading = builtInModuleContentReducer(initialBuiltInModuleContentState, {
    type: "BEGIN_REQUEST",
    requestKey: "class-7:arrays:4",
  });
  const content = { schemaVersion: 1, lesson: { lessonKey: "arrays" } };
  const ready = builtInModuleContentReducer(loading, {
    type: "REQUEST_SUCCEEDED",
    requestKey: loading.requestKey,
    content,
  });
  assert.deepEqual(ready, {
    status: "ready",
    requestKey: loading.requestKey,
    content,
    error: null,
  });

  const staleContent = { lesson: { lessonKey: "tutorial" } };
  assert.strictEqual(builtInModuleContentReducer(ready, {
    type: "REQUEST_SUCCEEDED",
    requestKey: "class-7:tutorial:3",
    content: staleContent,
  }), ready);
  assert.strictEqual(builtInModuleContentReducer(ready, {
    type: "REQUEST_FAILED",
    requestKey: "class-7:tutorial:3",
    error: { kind: "retryable" },
  }), ready);
});

test("retry starts a fresh generation and matching failure clears content", () => {
  const failed = {
    status: "error",
    requestKey: "class-7:arrays:4",
    content: null,
    error: { kind: "retryable" },
  };
  const retrying = builtInModuleContentReducer(failed, {
    type: "BEGIN_REQUEST",
    requestKey: "class-7:arrays:5",
  });
  assert.deepEqual(retrying, {
    status: "loading",
    requestKey: "class-7:arrays:5",
    content: null,
    error: null,
  });

  const denied = { kind: "forbidden", message: "This lesson is unavailable." };
  assert.deepEqual(builtInModuleContentReducer(retrying, {
    type: "REQUEST_FAILED",
    requestKey: retrying.requestKey,
    error: denied,
  }), {
    status: "error",
    requestKey: retrying.requestKey,
    content: null,
    error: denied,
  });
});

test("request state logic never writes lesson content to browser storage", () => {
  let writes = 0;
  const previousLocalStorage = globalThis.localStorage;
  const previousSessionStorage = globalThis.sessionStorage;
  globalThis.localStorage = { setItem() { writes += 1; } };
  globalThis.sessionStorage = { setItem() { writes += 1; } };
  try {
    const loading = builtInModuleContentReducer(initialBuiltInModuleContentState, {
      type: "BEGIN_REQUEST",
      requestKey: "class-7:arrays:6",
    });
    builtInModuleContentReducer(loading, {
      type: "REQUEST_SUCCEEDED",
      requestKey: loading.requestKey,
      content: { lesson: { title: "Never persist this DTO" } },
    });
    assert.equal(writes, 0);
  } finally {
    globalThis.localStorage = previousLocalStorage;
    globalThis.sessionStorage = previousSessionStorage;
  }
});

test("error classification distinguishes cancellation auth locks forbidden not-found and retry", () => {
  assert.deepEqual(classifyBuiltInLessonContentError({ name: "CanceledError", code: "ERR_CANCELED" }), {
    kind: "silent",
    retryable: false,
  });
  assert.deepEqual(classifyBuiltInLessonContentError({ status: 401 }), {
    kind: "auth",
    message: "Your session has expired. Sign in again to continue.",
    retryable: false,
  });
  assert.deepEqual(classifyBuiltInLessonContentError({
    status: 403,
    code: "LESSON_PREREQUISITE_REQUIRED",
    details: { prerequisiteLessonKey: "tutorial", nextAction: "COMPLETE_PREREQUISITE" },
  }), {
    kind: "locked",
    reason: "prerequisite",
    message: "Complete the previous lesson before opening this module.",
    nextAction: "COMPLETE_PREREQUISITE",
    prerequisiteLessonKey: "tutorial",
    retryable: false,
  });
  assert.deepEqual(classifyBuiltInLessonContentError({
    status: 403,
    code: "PRE_ASSESSMENT_REQUIRED",
    details: { assessmentId: 91, nextAction: "COMPLETE_PRE" },
  }), {
    kind: "locked",
    reason: "pre-assessment",
    message: "Complete the required pre-assessment before opening this module.",
    nextAction: "COMPLETE_PRE",
    assessmentId: 91,
    retryable: false,
  });

  const forbidden = classifyBuiltInLessonContentError({
    status: 403,
    code: "FORBIDDEN",
    details: { lessonKey: "secret-lesson", title: "Protected title" },
  });
  assert.deepEqual(forbidden, {
    kind: "forbidden",
    message: "This module is unavailable for your current classroom access.",
    retryable: false,
  });
  assert.equal(JSON.stringify(forbidden).includes("secret-lesson"), false);
  assert.deepEqual(classifyBuiltInLessonContentError({ status: 404 }), {
    kind: "not-found",
    message: "This module could not be found.",
    retryable: false,
  });
  assert.equal(classifyBuiltInLessonContentError({ status: 503 }).kind, "retryable");
  assert.equal(classifyBuiltInLessonContentError({ status: null }).retryable, true);
});

test("classroom query helpers reject malformed explicit IDs and preserve canonical navigation", () => {
  assert.equal(parsePositiveClassroomId("123"), 123);
  for (const value of ["", "0", "-1", "1.5", "1abc", "9007199254740992"]) {
    assert.equal(parsePositiveClassroomId(value), null);
  }
  assert.equal(withClassroomIdQuery("/lesson/built-in/arrays", 123), "/lesson/built-in/arrays?classroomId=123");
  assert.equal(withClassroomIdQuery("/lesson/built-in/arrays", null), "/lesson/built-in/arrays");
});

test("malformed explicit classroom identity has a safe non-retryable classification", () => {
  assert.deepEqual(classifyBuiltInLessonContentError({
    status: 400,
    code: "INVALID_CLASSROOM_ID",
  }), {
    kind: "invalid-classroom",
    message: "The classroom link is invalid.",
    retryable: false,
  });
});

test("route context changes hide authorized content before the replacement effect runs", () => {
  const ready = {
    status: "ready",
    requestKey: "explicit:47:arrays:8",
    content: { lesson: { lessonKey: "arrays", title: "Protected arrays prose" } },
    error: null,
  };
  assert.strictEqual(visibleBuiltInModuleContentState(ready, "explicit:47:arrays"), ready);
  assert.deepEqual(visibleBuiltInModuleContentState(ready, "explicit:52:arrays"), {
    status: "loading",
    requestKey: null,
    content: null,
    error: null,
  });
  assert.equal(
    JSON.stringify(visibleBuiltInModuleContentState(ready, "explicit:47:functions")).includes("Protected"),
    false,
  );
});

const withServiceHarness = async (fakeGet, callback) => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const originalGet = axios.get;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) { return key === "token" ? "service-test-token" : null; },
    setItem() { assert.fail("content service must not persist data"); },
    removeItem() {},
  };
  axios.get = fakeGet;
  try {
    const service = await vite.ssrLoadModule("/src/services/builtInLessonContentService.js");
    await callback(service);
  } finally {
    axios.get = originalGet;
    globalThis.localStorage = previousLocalStorage;
    await vite.close();
  }
};

test("content service reads the canonical primary classroom and forwards cancellation", async () => {
  const controller = new AbortController();
  await withServiceHarness(async (url, config) => {
    assert.equal(url, "http://localhost:5000/api/progress/me");
    assert.equal(config.signal, controller.signal);
    assert.equal(config.headers.Authorization, "Bearer service-test-token");
    return { data: { classroomId: 47, lessons: [] } };
  }, async ({ fetchPrimaryClassroomId }) => {
    assert.equal(await fetchPrimaryClassroomId({ signal: controller.signal }), 47);
  });
});

test("content service calls only the encoded exact-classroom route and returns its DTO", async () => {
  const controller = new AbortController();
  const dto = { schemaVersion: 1, contentRevision: "revision", lesson: { lessonKey: "arrays" } };
  await withServiceHarness(async (url, config) => {
    assert.equal(
      url,
      "http://localhost:5000/api/classrooms/47/built-in-lessons/functions-with-arrays/content",
    );
    assert.equal(config.signal, controller.signal);
    assert.equal(config.headers.Authorization, "Bearer service-test-token");
    return { data: dto };
  }, async ({ fetchBuiltInLessonContent }) => {
    assert.strictEqual(await fetchBuiltInLessonContent({
      classroomId: 47,
      lessonKey: "functions-with-arrays",
      signal: controller.signal,
    }), dto);
  });
});

test("content service converts missing membership and Axios failures into safe errors", async () => {
  await withServiceHarness(async () => ({ data: { classroomId: null } }), async ({ fetchPrimaryClassroomId }) => {
    await assert.rejects(
      fetchPrimaryClassroomId({}),
      (error) => error.status === 403
        && error.code === "FORBIDDEN"
        && !("response" in error)
        && !("config" in error),
    );
  });

  await withServiceHarness(async () => {
    const error = new Error("raw transport details");
    error.response = {
      status: 403,
      data: {
        code: "PRE_ASSESSMENT_REQUIRED",
        message: "Complete the PRE assessment",
        details: {
          lessonKey: "arrays",
          assessmentId: 91,
          nextAction: "COMPLETE_PRE",
          answerKey: "must-not-escape",
        },
      },
    };
    error.config = { headers: { Authorization: "secret" } };
    throw error;
  }, async ({ fetchBuiltInLessonContent }) => {
    await assert.rejects(
      fetchBuiltInLessonContent({ classroomId: 47, lessonKey: "arrays" }),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.code, "PRE_ASSESSMENT_REQUIRED");
        assert.deepEqual(error.details, {
          lessonKey: "arrays",
          assessmentId: 91,
          nextAction: "COMPLETE_PRE",
        });
        assert.equal("response" in error, false);
        assert.equal("config" in error, false);
        assert.equal(JSON.stringify(error).includes("answerKey"), false);
        assert.equal(JSON.stringify(error).includes("secret"), false);
        return true;
      },
    );
  });
});
