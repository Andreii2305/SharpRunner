const assert = require("node:assert/strict");
const express = require("express");
const { after, before, test } = require("node:test");

let createPublicTestimonialRouter;
try {
  ({ createPublicTestimonialRouter } = require("../src/routes/publicTestimonials"));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

test("public testimonial router is available", () => {
  assert.equal(typeof createPublicTestimonialRouter, "function");
});

let handler;
let server;
let baseUrl;

const request = async (path, options) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, payload: await response.json() };
};

before(async () => {
  const service = { listTestimonials: (input) => handler(input) };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/public", createPublicTestimonialRouter?.({ service }));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("unauthenticated listing applies defaults and returns the exact public response", async () => {
  let received;
  handler = async (input) => {
    received = input;
    return {
      testimonials: [{
        id: 301,
        message: "A public testimonial",
        displayName: "Anonymous user",
        approvedAt: "2026-11-03T10:00:00.000Z",
        authorUserId: 71,
        idempotencyKey: "private",
      }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    };
  };

  const { response, payload } = await request("/api/public/testimonials");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(received, { page: 1, limit: 20, offset: 0 });
  assert.deepEqual(payload, {
    testimonials: [{
      id: 301,
      message: "A public testimonial",
      displayName: "Anonymous user",
      approvedAt: "2026-11-03T10:00:00.000Z",
    }],
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1,
  });
});

test("strict pagination rejects repeated unknown malformed and unsafe values before querying", async () => {
  let calls = 0;
  handler = async () => { calls += 1; throw new Error("must not query"); };
  for (const path of [
    "/api/public/testimonials?extra=1",
    "/api/public/testimonials?page=1&page=2",
    "/api/public/testimonials?limit=20&limit=21",
    "/api/public/testimonials?page=0",
    "/api/public/testimonials?page=01",
    "/api/public/testimonials?page=1.5",
    "/api/public/testimonials?limit=51",
    "/api/public/testimonials?page=9007199254740991&limit=50",
  ]) {
    const { response, payload } = await request(path);
    assert.equal(response.status, 400, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(payload, { code: "INVALID_REQUEST", message: "Invalid request" });
  }
  assert.equal(calls, 0);
});

test("unexpected failures are neutral, no-store, and do not log private details", async () => {
  handler = async () => { throw new Error("private testimonial text and key"); };
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const { response, payload } = await request("/api/public/testimonials?page=2&limit=10");
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(payload, { code: "SERVER_ERROR", message: "Unable to load testimonials" });
    assert.equal(logs.join(" ").includes("private testimonial"), false);
  } finally {
    console.error = originalError;
  }
});

test("internal service integrity failures use the same neutral public error", async () => {
  const { PublicTestimonialReadError } = require("../src/services/publicTestimonialReadService");
  handler = async () => {
    throw new PublicTestimonialReadError(
      500,
      "PUBLIC_TESTIMONIAL_INTEGRITY_ERROR",
      "Unable to load testimonials",
    );
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const { response, payload } = await request("/api/public/testimonials");
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(payload, {
      code: "SERVER_ERROR",
      message: "Unable to load testimonials",
    });
  } finally {
    console.error = originalError;
  }
});

test("the production application registers the public route once with early no-store", async () => {
  const productionApp = require("../src/app");
  const productionServer = productionApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => productionServer.once("listening", resolve));
  try {
    const origin = `http://127.0.0.1:${productionServer.address().port}`;
    const invalid = await fetch(`${origin}/api/public/testimonials?unknown=1`);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.headers.get("cache-control"), "no-store");

    const malformed = await fetch(`${origin}/api/public/testimonials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.headers.get("cache-control"), "no-store");
  } finally {
    await new Promise((resolve) => productionServer.close(resolve));
  }
});
