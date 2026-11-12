import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_TESTIMONIAL_LIMIT,
  createPublicTestimonialService,
} from "./publicTestimonialService.js";

test("public testimonials use the unauthenticated bounded no-store contract", async () => {
  const calls = [];
  const service = createPublicTestimonialService({
    apiBaseUrl: "http://127.0.0.1:5000",
    fetchImpl: async (...args) => {
      calls.push(args);
      return {
        ok: true,
        json: async () => ({ testimonials: [], page: 1, limit: 20, total: 0, totalPages: 1 }),
      };
    },
  });
  const signal = new AbortController().signal;

  const result = await service.list({ signal });

  assert.equal(PUBLIC_TESTIMONIAL_LIMIT, 20);
  assert.deepEqual(result, { testimonials: [], page: 1, limit: 20, total: 0, totalPages: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "http://127.0.0.1:5000/api/public/testimonials?page=1&limit=20");
  assert.deepEqual(calls[0][1], {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  assert.equal("Authorization" in calls[0][1].headers, false);
});

test("public testimonial failures expose only a neutral client error", async () => {
  const service = createPublicTestimonialService({
    apiBaseUrl: "http://127.0.0.1:5000",
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: "private server details" }),
    }),
  });

  await assert.rejects(
    () => service.list(),
    (error) => error?.code === "PUBLIC_TESTIMONIALS_UNAVAILABLE"
      && error?.message === "Unable to load testimonials.",
  );
});
