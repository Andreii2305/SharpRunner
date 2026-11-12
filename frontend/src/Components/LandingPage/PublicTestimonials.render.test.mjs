import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

globalThis.localStorage = { getItem: () => null, removeItem() {}, setItem() {} };
globalThis.window = {
  matchMedia: () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }),
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

const item = (id, overrides = {}) => ({
  id,
  message: `Testimonial ${id}`,
  displayName: id % 2 ? "Anonymous user" : "Ada L.",
  approvedAt: `2026-11-04T00:00:0${id}.000Z`,
  ...overrides,
});

const success = (count) => ({
  status: "success",
  testimonials: Array.from({ length: count }, (_, index) => item(index + 1)),
  page: 1,
  limit: 20,
  total: count,
  totalPages: count ? 1 : 0,
  error: "",
});

const callbacks = {
  onRetry() {}, onTogglePause() {}, onHoverChange() {}, onFocusChange() {},
};

test("empty public results omit the section while failure is retryable", async () => {
  const { PublicTestimonialsView } = await vite.ssrLoadModule("/src/Components/LandingPage/PublicTestimonials.jsx");
  assert.equal(renderToStaticMarkup(React.createElement(PublicTestimonialsView, {
    state: success(0), reducedMotion: false, motionPaused: false, userPaused: false, ...callbacks,
  })), "");
  const errorHtml = renderToStaticMarkup(React.createElement(PublicTestimonialsView, {
    state: { ...success(0), status: "error", error: "Testimonials are unavailable right now." },
    reducedMotion: false, motionPaused: false, userPaused: false, ...callbacks,
  }));
  assert.match(errorHtml, /Testimonials are unavailable right now/);
  assert.match(errorHtml, />Retry</);
  assert.doesNotMatch(errorHtml, /No testimonials/);
});

test("one to three testimonials render as one static semantic list", async () => {
  const { PublicTestimonialsView } = await vite.ssrLoadModule("/src/Components/LandingPage/PublicTestimonials.jsx");
  const html = renderToStaticMarkup(React.createElement(PublicTestimonialsView, {
    state: success(3), reducedMotion: false, motionPaused: false, userPaused: false, ...callbacks,
  }));
  assert.equal((html.match(/<ul/g) ?? []).length, 1);
  assert.equal((html.match(/<li/g) ?? []).length, 3);
  assert.doesNotMatch(html, /aria-hidden="true"[^>]*data-testid="testimonial-clones"/);
  assert.doesNotMatch(html, />Pause testimonials</);
  assert.match(html, /Anonymous user/);
  assert.match(html, /Ada L\./);
});

test("four testimonials render one semantic list and inaccessible visual duplicates", async () => {
  const { PublicTestimonialsView } = await vite.ssrLoadModule("/src/Components/LandingPage/PublicTestimonials.jsx");
  const html = renderToStaticMarkup(React.createElement(PublicTestimonialsView, {
    state: success(4), reducedMotion: false, motionPaused: false, userPaused: false, ...callbacks,
  }));
  assert.equal((html.match(/<ul/g) ?? []).length, 1);
  assert.equal((html.match(/<li/g) ?? []).length, 4);
  assert.match(html, /aria-hidden="true"[^>]*data-testid="testimonial-clones"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="Pause testimonial movement"/);
  const clone = html.slice(html.indexOf("data-testid=\"testimonial-clones\""));
  assert.doesNotMatch(clone, /tabindex=|<button|<a\s/);
  assert.doesNotMatch(html, /aria-live/);
});

test("reduced motion renders the unique testimonials as a static list without clones or controls", async () => {
  const { PublicTestimonialsView } = await vite.ssrLoadModule("/src/Components/LandingPage/PublicTestimonials.jsx");
  const html = renderToStaticMarkup(React.createElement(PublicTestimonialsView, {
    state: success(4), reducedMotion: true, motionPaused: true, userPaused: false, ...callbacks,
  }));
  assert.equal((html.match(/<ul/g) ?? []).length, 1);
  assert.equal((html.match(/<li/g) ?? []).length, 4);
  assert.doesNotMatch(html, /data-testid="testimonial-clones"/);
  assert.doesNotMatch(html, /Pause testimonial movement/);
});

test("testimonial content is plain text and long content is not clipped by markup", async () => {
  const { PublicTestimonialsView } = await vite.ssrLoadModule("/src/Components/LandingPage/PublicTestimonials.jsx");
  const state = success(1);
  state.testimonials[0] = item(1, {
    message: "Line one\n<script>alert('x')</script> " + "longword".repeat(40),
    displayName: "Anonymous user",
  });
  const html = renderToStaticMarkup(React.createElement(PublicTestimonialsView, {
    state, reducedMotion: false, motionPaused: false, userPaused: false, ...callbacks,
  }));
  assert.match(html, /Line one\n&lt;script&gt;alert/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /longwordlongword/);
});

test("landing page places public testimonials before the final call to action", async () => {
  const { default: LandingPage } = await vite.ssrLoadModule("/src/Components/LandingPage/LandingPage.jsx");
  const source = renderToStaticMarkup(React.createElement(
    MemoryRouter,
    null,
    React.createElement(LandingPage),
  ));
  assert.ok(source.indexOf("What learners say") < source.indexOf("Ready to Make Programming More Interactive?"));
});
