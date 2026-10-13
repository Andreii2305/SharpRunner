import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const { default: LessonProgressionPanel } = await vite.ssrLoadModule(
  "/src/Components/LessonProgression/LessonProgressionPanel.jsx",
);
test.after(async () => vite.close());

test("renders a compact ordered status strip with an exact-classroom semantic action", () => {
  const html = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    title: "Arrays",
    model: {
      steps: [
        { key: "pre", label: "Pre-Test", state: "completed", resultAction: {
          label: "View Result",
          href: "/classrooms/7/lessons/arrays/assessment/pre/results/201",
        } },
        { key: "module", label: "Module", state: "current" },
        { key: "game", label: "Game Levels", state: "locked" },
      ],
      action: { label: "Open Module", href: "/lesson/built-in/arrays?classroomId=7", disabled: false },
    },
  }));
  assert.match(html, /<section[^>]+aria-labelledby=/);
  assert.match(html, /<ol/);
  assert.match(html, /Arrays/);
  assert.match(html, /Pre-Test/);
  assert.match(html, /Completed/);
  assert.match(html, /Current/);
  assert.match(html, /Locked/);
  assert.match(html, /href="\/classrooms\/7\/lessons\/arrays\/assessment\/pre\/results\/201"[^>]*>View Result<\/a>/);
  assert.match(html, /<a[^>]+href="\/lesson\/built-in\/arrays\?classroomId=7"[^>]*>Open Module<\/a>/);
});

test("suppresses a redundant game action while preserving progression status", () => {
  const html = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    title: "Functions & Methods",
    showAction: false,
    model: {
      steps: [
        { key: "module", label: "Module", state: "complete" },
        { key: "game", label: "Game Levels", state: "current" },
        { key: "post", label: "Post-Test", state: "locked" },
      ],
      action: { kind: "game", label: "Continue Game", href: "/function/level/9?classroomId=7", disabled: false },
    },
  }));

  assert.match(html, /Functions &amp; Methods/);
  assert.match(html, /Game Levels/);
  assert.doesNotMatch(html, /Continue Game/);
  assert.doesNotMatch(html, /<a/);
});

test("uses a step-specific status label when completed progression is not reader completion", () => {
  const html = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    title: "Final Review classroom progression",
    model: {
      steps: [
        { key: "module", label: "Module", state: "complete", statusLabel: "Game started" },
        { key: "game", label: "Game Levels", state: "current" },
      ],
      action: { kind: "game", label: "Continue Game", href: "/final/level/1?classroomId=7", disabled: false },
    },
  }));

  assert.match(html, /Final Review classroom progression/);
  assert.match(html, /Module/);
  assert.match(html, /Game started/);
  assert.doesNotMatch(html, /Module<\/span>[\s\S]{0,120}<small>Completed<\/small>/);
});

test("renders exhausted POST as status text without a bypass link", () => {
  const html = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    model: {
      steps: [{ key: "post", label: "Post-Test", state: "blocked", resultAction: {
        label: "View Result",
        href: "/classrooms/7/lessons/arrays/assessment/post/results/303",
      } }],
      action: { label: "Post-Test attempts exhausted", href: null, disabled: true },
    },
  }));
  assert.match(html, /Post-Test attempts exhausted/);
  assert.match(html, /role="status"/);
  assert.match(html, />View Result<\/a>/);
  assert.doesNotMatch(html, /href="[^"]*\/assessment\/post"/);
});

test("keeps retry and View Result as separate POST actions", () => {
  const html = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    model: {
      steps: [{ key: "post", label: "Post-Test", state: "current", resultAction: {
        label: "View Result",
        href: "/classrooms/7/lessons/arrays/assessment/post/results/301",
      } }],
      action: {
        kind: "assessment",
        label: "Retry Post-Test",
        href: "/classrooms/7/lessons/arrays/assessment/post",
        disabled: false,
      },
    },
  }));
  assert.match(html, />View Result<\/a>/);
  assert.match(html, />Retry Post-Test<\/a>/);
});

test("keeps the shared context label by default and allows a map-specific label", () => {
  const model = {
    steps: [{ key: "game", label: "Game Levels", state: "current" }],
    action: { label: "Continue Game", href: "/array/level/1?classroomId=7", disabled: false },
  };
  const shared = renderToStaticMarkup(React.createElement(LessonProgressionPanel, { model }));
  const map = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    model,
    contextLabel: "Curriculum next step",
  }));

  assert.match(shared, />Lesson progress<\/span>/);
  assert.match(map, />Curriculum next step<\/span>/);
  assert.doesNotMatch(map, />Lesson progress<\/span>/);
});

test("map presents one authoritative next action separately from the selected region", async () => {
  const pageSource = await readFile(new URL("../../pages/map/LessonMapPage.jsx", import.meta.url), "utf8");
  const panelCss = await readFile(new URL("./LessonProgressionPanel.module.css", import.meta.url), "utf8");
  const mapCss = await readFile(new URL("../../pages/map/LessonMapPage.module.css", import.meta.url), "utf8");

  assert.match(pageSource, /eyebrow: "Functions & Methods · Levels 1–11"/);
  assert.match(pageSource, /eyebrow: "Functions with Arrays · Levels 1–5"/);
  assert.match(pageSource, /model=\{mapViewModel\.nextStep\.progression\}/);
  assert.match(pageSource, /showAction/);
  assert.match(pageSource, /showContinue=\{false\}/);
  assert.doesNotMatch(pageSource, /continueRoute/);
  assert.doesNotMatch(pageSource, /\} journey`/);
  assert.match(panelCss, /grid-template-columns:\s*minmax\(140px, auto\) minmax\(0, 1fr\) auto/);
  assert.match(panelCss, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(mapCss, /max-height:\s*260px/);
  assert.match(
    mapCss,
    /\.lessonMapContent\s*>\s*\*:not\(\.regionTabs\):not\(\.progressionPanel\)/,
  );
  assert.match(
    mapCss,
    /\.lessonMapContent\s*>\s*\.progressionPanel\s*\{[^}]*flex:\s*0\s+0\s+auto/s,
  );
});
