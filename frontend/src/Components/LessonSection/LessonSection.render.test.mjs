import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getLessonModuleAccess } from "../../utils/lessonProgressionNavigation.js";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const { LessonNextStep, LessonAssessmentStrip, LessonCard } = await vite.ssrLoadModule(
  "/src/Components/LessonSection/LessonSection.jsx",
);
test.after(async () => vite.close());

const assessmentModel = {
  rows: [
    {
      type: "PRE",
      label: "Pre-Test",
      status: "Completed",
      resultAction: {
        label: "View Result",
        href: "/classrooms/7/lessons/arrays/assessment/pre/results/201",
      },
      action: null,
    },
    {
      type: "POST",
      label: "Post-Test",
      status: "Available",
      resultAction: {
        label: "View Result",
        href: "/classrooms/7/lessons/arrays/assessment/post/results/301",
      },
      action: {
        label: "Retry",
        href: "/classrooms/7/lessons/arrays/assessment/post",
      },
    },
  ],
};

const lessonCard = (overrides = {}) => ({
  id: "arrays",
  lessonKey: "arrays",
  title: "Arrays",
  region: "Barangay Malumay",
  description: "Learn arrays.",
  progress: 40,
  status: "active",
  canOpenModule: true,
  unlockHint: null,
  assessmentModel,
  ...overrides,
});

test("compact assessment strip keeps submitted results and retry as separate native links", () => {
  const html = renderToStaticMarkup(React.createElement(LessonAssessmentStrip, {
    lessonTitle: "Arrays",
    model: assessmentModel,
  }));

  assert.match(html, /<section[^>]+aria-label="Arrays assessments"/);
  assert.match(html, /Pre-Test/);
  assert.match(html, /Post-Test/);
  assert.match(html, /Completed/);
  assert.match(html, /Available/);
  assert.match(html, /href="\/classrooms\/7\/lessons\/arrays\/assessment\/pre\/results\/201"[^>]*>View Result<\/a>/);
  assert.match(html, /href="\/classrooms\/7\/lessons\/arrays\/assessment\/post\/results\/301"[^>]*>View Result<\/a>/);
  assert.match(html, /href="\/classrooms\/7\/lessons\/arrays\/assessment\/post"[^>]*>Retry<\/a>/);
  assert.match(html, /aria-label="View Result for Arrays Pre-Test"/);
  assert.match(html, /aria-label="Retry Arrays Post-Test"/);
  assert.doesNotMatch(html, /score|percentage|passed|failed|correct answer|answer key/i);
});

test("lesson card has consistent semantic header, progress, assessments, and primary action", () => {
  const html = renderToStaticMarkup(React.createElement(LessonCard, {
    lesson: lessonCard(),
    onPlay() {},
  }));

  assert.match(html, /^<article/);
  assert.match(html, /<header/);
  assert.match(html, /<footer/);
  assert.doesNotMatch(html, /role="link"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="40"/);
  assert.match(html, /<button[^>]+type="button"[^>]*>Open Module/);
  assert.match(html, /<a[^>]+href="\/classrooms\/7\/lessons\/arrays\/assessment\/pre\/results\/201"/);
  assert.doesNotMatch(html, /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<a\b/);
  assert.doesNotMatch(html, /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<(?:a|button)\b/);
});

test("only authoritative module locks disable the primary lesson action", () => {
  const locked = lessonCard({
    status: "locked",
    ...getLessonModuleAccess({ moduleUnlocked: false, nextAction: "TAKE_PRE" }),
  });
  assert.equal(locked.canOpenModule, false);
  assert.equal(locked.unlockHint, "Complete the Pre-Test to unlock this module.");
  const lockedHtml = renderToStaticMarkup(React.createElement(LessonCard, {
    lesson: locked,
    onPlay() { throw new Error("locked navigation must not run"); },
  }));
  assert.match(lockedHtml, /<button[^>]*disabled=""[^>]*>Module unavailable/);
  assert.match(lockedHtml, /Complete the Pre-Test to unlock this module/);

  const historical = lessonCard({
    progress: 100,
    status: "completed",
    ...getLessonModuleAccess({ progressPercent: 100 }),
  });
  assert.equal(historical.canOpenModule, true);
  assert.equal(historical.unlockHint, null);
  const historicalHtml = renderToStaticMarkup(React.createElement(LessonCard, {
    lesson: historical,
    onPlay() {},
  }));
  assert.match(historicalHtml, />Open Module/);
  assert.doesNotMatch(historicalHtml, /disabled=""/);
});

test("next step renders one authoritative action and a retry for failures", () => {
  const destinations = [];
  const ready = renderToStaticMarkup(React.createElement(LessonNextStep, {
    model: {
      kind: "ready",
      title: "Arrays",
      description: "Continue from the point your classroom progress allows.",
      action: { label: "Take Pre-Test", href: "/classrooms/7/lessons/arrays/assessment/pre", disabled: false },
      canRetry: false,
    },
    onNavigate: (href) => destinations.push(href),
    onRetry() {},
  }));
  assert.match(ready, /Take Pre-Test/);
  assert.doesNotMatch(ready, /Continue Game|Continue Learning/);

  const error = renderToStaticMarkup(React.createElement(LessonNextStep, {
    model: { kind: "error", title: "Learning progress unavailable", description: "Offline", action: null, canRetry: true },
    onNavigate() {},
    onRetry() {},
  }));
  assert.match(error, /role="alert"/);
  assert.match(error, />Retry</);
});

test("disabled next lesson action is visually distinct", async () => {
  const css = await readFile(new URL("./LessonSection.module.css", import.meta.url), "utf8");
  assert.match(css, /\.btnContinue:disabled\s*\{[^}]*cursor:\s*not-allowed[^}]*opacity:/s);
  assert.match(css, /\.btnContinue:hover:not\(:disabled\)/);
});

test("cards without assessments retain the same progress and action structure", () => {
  const html = renderToStaticMarkup(React.createElement(LessonCard, {
    lesson: lessonCard({
      id: "tutorial",
      lessonKey: "tutorial",
      title: "Tutorial",
      assessmentModel: { rows: [] },
      progress: 100,
      status: "completed",
    }),
    onPlay() {},
  }));

  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="100"/);
  assert.match(html, />Open Module/);
  assert.doesNotMatch(html, /aria-label="Tutorial assessments"/);
});

test("cards with no applicable game activities do not imply zero-percent progress", () => {
  const html = renderToStaticMarkup(React.createElement(LessonCard, {
    lesson: lessonCard({ progress: null, assessmentModel: { rows: [] } }),
    onPlay() {},
  }));

  assert.match(html, /No applicable game activities/);
  assert.doesNotMatch(html, /role="progressbar"|>0%/);
});

test("authoritatively blocked cards render a blocked state without an enabled module action", () => {
  const html = renderToStaticMarkup(React.createElement(LessonCard, {
    lesson: lessonCard({
      status: "blocked",
      statusLabel: "Blocked",
      canOpenModule: false,
      availabilityMessage: "Complete the previous lesson to unlock this module.",
    }),
    onPlay() { throw new Error("blocked navigation must not run"); },
  }));

  assert.match(html, />Blocked</);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Module unavailable/);
});

test("assessment strip hides absent rows and has responsive focus styling", async () => {
  assert.equal(renderToStaticMarkup(React.createElement(LessonAssessmentStrip, {
    lessonTitle: "Tutorial",
    model: { rows: [] },
  })), "");

  const css = await readFile(new URL("./LessonSection.module.css", import.meta.url), "utf8");
  const desktopCss = css.split("@media (max-width: 768px)")[0];
  assert.match(css, /\.assessmentAction:focus-visible/);
  assert.match(desktopCss, /\.builtInLessonsGrid\s*\{[^}]*align-items:\s*start/s);
  assert.match(desktopCss, /\.builtInLessonCard\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:/s);
  assert.match(desktopCss, /\.assessmentRow\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/s);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.assessmentAction[^}]*min-height:\s*44px/s);
});
