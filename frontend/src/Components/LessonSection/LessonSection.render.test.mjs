import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const { LessonAssessmentStrip, LessonCard } = await vite.ssrLoadModule(
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
  assert.doesNotMatch(html, /score|percentage|passed|failed|correct answer|answer key/i);
});

test("lesson card uses a non-interactive article around native buttons and links", () => {
  const html = renderToStaticMarkup(React.createElement(LessonCard, {
    lesson: {
      id: "arrays",
      title: "Arrays",
      region: "Barangay Malumay",
      description: "Learn arrays.",
      progress: 40,
      status: "active",
      assessmentModel,
    },
    onPlay() {},
  }));

  assert.match(html, /^<article/);
  assert.doesNotMatch(html, /role="link"/);
  assert.match(html, /<button[^>]+type="button"[^>]*>Open Module/);
  assert.match(html, /<a[^>]+href="\/classrooms\/7\/lessons\/arrays\/assessment\/pre\/results\/201"/);
  assert.doesNotMatch(html, /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<a\b/);
  assert.doesNotMatch(html, /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<(?:a|button)\b/);
});

test("assessment strip hides absent rows and has responsive focus styling", async () => {
  assert.equal(renderToStaticMarkup(React.createElement(LessonAssessmentStrip, {
    lessonTitle: "Tutorial",
    model: { rows: [] },
  })), "");

  const css = await readFile(new URL("./LessonSection.module.css", import.meta.url), "utf8");
  const desktopCss = css.split("@media (max-width: 640px)")[0];
  assert.match(css, /\.assessmentAction:focus-visible/);
  assert.match(desktopCss, /\.assessmentActions\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.assessmentRow/);
});
