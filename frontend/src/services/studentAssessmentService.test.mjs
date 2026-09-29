import assert from "node:assert/strict";
import { after, test } from "node:test";
import axios from "axios";
import { createServer } from "vite";

const previousLocalStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem(key) {
    return key === "token" ? "assessment-test-token" : null;
  },
  setItem() {
    assert.fail("the assessment API service must not persist browser state");
  },
  removeItem() {},
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
const service = await vite.ssrLoadModule("/src/services/studentAssessmentService.js");

after(async () => {
  globalThis.localStorage = previousLocalStorage;
  await vite.close();
});

const withAxiosMethod = async (method, fake, callback) => {
  const original = axios[method];
  axios[method] = fake;
  try {
    await callback();
  } finally {
    axios[method] = original;
  }
};

const assertAuthorizedConfig = (config, signal) => {
  assert.equal(config.headers.Authorization, "Bearer assessment-test-token");
  assert.equal(config.signal, signal);
};

test("discovery and progress calls use exact encoded classroom routes and preserve DTOs", async () => {
  const controller = new AbortController();
  const discovery = { assessment: { id: 91 }, status: { available: true } };
  const progress = { classroomId: 47, lessons: [] };
  const calls = [];

  await withAxiosMethod("get", async (url, config) => {
    calls.push([url, config]);
    return { data: calls.length === 1 ? discovery : progress };
  }, async () => {
    assert.strictEqual(await service.discoverAssessment({
      classroomId: 47,
      lessonKey: "functions-with-arrays",
      type: "pre",
      signal: controller.signal,
    }), discovery);
    assert.strictEqual(await service.getProgress({
      classroomId: 47,
      signal: controller.signal,
    }), progress);
  });

  assert.equal(
    calls[0][0],
    "http://localhost:5000/api/assessments/classrooms/47/lessons/functions-with-arrays/PRE",
  );
  assert.equal(calls[1][0], "http://localhost:5000/api/progress/me?classroomId=47");
  assertAuthorizedConfig(calls[0][1], controller.signal);
  assertAuthorizedConfig(calls[1][1], controller.signal);
});

test("assessment and attempt reads return server DTOs without reshaping them", async () => {
  const controller = new AbortController();
  const assessment = { id: 91, questions: [{ id: 3 }] };
  const attempt = { attemptId: 312, responses: [] };
  const result = { attemptId: 312, result: { passed: true } };
  const expected = [assessment, attempt, result];
  const calls = [];

  await withAxiosMethod("get", async (url, config) => {
    calls.push([url, config]);
    return { data: expected[calls.length - 1] };
  }, async () => {
    assert.strictEqual(await service.getAssessment({ assessmentId: 91, signal: controller.signal }), assessment);
    assert.strictEqual(await service.getAttempt({ attemptId: 312, signal: controller.signal }), attempt);
    assert.strictEqual(await service.getAttemptResult({ attemptId: 312, signal: controller.signal }), result);
  });

  assert.deepEqual(calls.map(([url]) => url), [
    "http://localhost:5000/api/assessments/91",
    "http://localhost:5000/api/assessments/attempts/312",
    "http://localhost:5000/api/assessments/attempts/312/result",
  ]);
  calls.forEach(([, config]) => assertAuthorizedConfig(config, controller.signal));
});

test("attempt start, response save, and submission use the exact bodies and idempotency header", async () => {
  const controller = new AbortController();
  const startDto = { attempt: { attemptId: 312, resumed: false }, assessment: { id: 91 } };
  const saveDto = { response: { questionId: 3, selectedChoiceId: 19 } };
  const resultDto = { attemptId: 312, result: { passed: false } };
  const postCalls = [];
  const putCalls = [];

  const originalPost = axios.post;
  const originalPut = axios.put;
  axios.post = async (...args) => {
    postCalls.push(args);
    return { data: postCalls.length === 1 ? startDto : resultDto };
  };
  axios.put = async (...args) => {
    putCalls.push(args);
    return { data: saveDto };
  };
  try {
    assert.strictEqual(await service.startOrResumeAttempt({ assessmentId: 91, signal: controller.signal }), startDto);
    assert.strictEqual(await service.saveResponse({
      attemptId: 312,
      questionId: 3,
      selectedChoiceId: 19,
      signal: controller.signal,
    }), saveDto);
    assert.strictEqual(await service.submitAttempt({
      attemptId: 312,
      idempotencyKey: "submit-session-312",
      signal: controller.signal,
    }), resultDto);
  } finally {
    axios.post = originalPost;
    axios.put = originalPut;
  }

  assert.equal(postCalls[0][0], "http://localhost:5000/api/assessments/91/attempts");
  assert.deepEqual(postCalls[0][1], {});
  assertAuthorizedConfig(postCalls[0][2], controller.signal);

  assert.equal(putCalls[0][0], "http://localhost:5000/api/assessments/attempts/312/responses/3");
  assert.deepEqual(putCalls[0][1], { selectedChoiceId: 19 });
  assertAuthorizedConfig(putCalls[0][2], controller.signal);

  assert.equal(postCalls[1][0], "http://localhost:5000/api/assessments/attempts/312/submit");
  assert.deepEqual(postCalls[1][1], {});
  assertAuthorizedConfig(postCalls[1][2], controller.signal);
  assert.equal(postCalls[1][2].headers["Idempotency-Key"], "submit-session-312");
});

test("safe request errors retain contract data but never leak Axios internals", async () => {
  const cases = [
    [400, "INVALID_REQUEST", "Malformed assessment request"],
    [401, "AUTHENTICATION_REQUIRED", "Sign in first"],
    [403, "PRE_ASSESSMENT_REQUIRED", "Complete the PRE assessment"],
    [404, "ASSESSMENT_NOT_FOUND", "Assessment not found"],
    [409, "ATTEMPT_ALREADY_SUBMITTED", "Attempt is immutable"],
  ];

  for (const [status, code, message] of cases) {
    await withAxiosMethod("get", async () => {
      const error = new Error("raw transport details");
      error.response = {
        status,
        data: {
          code,
          message,
          details: {
            lessonKey: "arrays",
            prerequisiteLessonKey: "tutorial",
            assessmentId: 91,
            nextAction: "COMPLETE_PRE",
            answerKey: "must-not-escape",
          },
        },
      };
      error.config = { headers: { Authorization: "secret" } };
      throw error;
    }, async () => {
      await assert.rejects(
        service.getAssessment({ assessmentId: 91 }),
        (error) => {
          assert.equal(error.name, "StudentAssessmentRequestError");
          assert.equal(error.status, status);
          assert.equal(error.code, code);
          assert.equal(error.message, message);
          assert.deepEqual(error.details, {
            lessonKey: "arrays",
            prerequisiteLessonKey: "tutorial",
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
  }
});

test("server, network, and cancellation failures are normalized without transport leakage", async () => {
  await withAxiosMethod("get", async () => {
    const error = new Error("database password in raw message");
    error.response = { status: 500, data: { message: "sensitive server detail" } };
    throw error;
  }, async () => {
    await assert.rejects(
      service.getAssessment({ assessmentId: 91 }),
      (error) => error.status === 500
        && error.message === "The assessment request could not be completed"
        && !error.message.includes("sensitive"),
    );
  });

  await withAxiosMethod("get", async () => {
    throw new Error("network adapter detail");
  }, async () => {
    await assert.rejects(
      service.getAssessment({ assessmentId: 91 }),
      (error) => error.status === null
        && error.message === "The assessment request could not be completed"
        && !("response" in error),
    );
  });

  await withAxiosMethod("get", async () => {
    const error = new Error("canceled by adapter");
    error.code = "ERR_CANCELED";
    throw error;
  }, async () => {
    await assert.rejects(
      service.getAssessment({ assessmentId: 91 }),
      (error) => error.name === "CanceledError" && error.code === "ERR_CANCELED",
    );
  });
});
