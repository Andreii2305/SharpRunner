import assert from "node:assert/strict";
import { classifyPracticeRequestError } from "./practiceCompilerState.js";

const starting = classifyPracticeRequestError({ response: { status: 503, data: { code: "PRACTICE_RUNNER_STARTING", message: "Starting", retryAfterMs: 5000 } } });
assert.equal(starting.errorType, "service_starting");
assert.equal(starting.retryAfterMs, 5000);

const busy = classifyPracticeRequestError({ response: { status: 429, data: { code: "PRACTICE_RUNNER_BUSY", retryAfterMs: 3000 } } });
assert.equal(busy.errorType, "runner_busy");
assert.equal(busy.retryAfterMs, 3000);

const rateLimited = classifyPracticeRequestError({ response: { status: 429, data: { message: "Slow down" } } });
assert.equal(rateLimited.errorType, "rate_limit");

console.log("Practice compiler state tests passed");
