import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const { default: LessonProgressionPanel } = await vite.ssrLoadModule(
  "/src/Components/LessonProgression/LessonProgressionPanel.jsx",
);
test.after(async () => vite.close());

test("renders a compact ordered status strip with an exact-classroom semantic action", () => {
  const html = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    title: "Arrays",
    model: {
      steps: [
        { key: "pre", label: "Pre-Test", state: "completed" },
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

test("renders exhausted POST as status text without a bypass link", () => {
  const html = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    model: {
      steps: [{ key: "post", label: "Post-Test", state: "blocked" }],
      action: { label: "Post-Test attempts exhausted", href: null, disabled: true },
    },
  }));
  assert.match(html, /Post-Test attempts exhausted/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /<a/);
});

test("map uses canonical lesson titles, contextual actions, and compact responsive styling", async () => {
  const pageSource = await readFile(new URL("../../pages/map/LessonMapPage.jsx", import.meta.url), "utf8");
  const panelCss = await readFile(new URL("./LessonProgressionPanel.module.css", import.meta.url), "utf8");
  const mapCss = await readFile(new URL("../../pages/map/LessonMapPage.module.css", import.meta.url), "utf8");

  assert.match(pageSource, /progressionTitle: "Functions & Methods"/);
  assert.match(pageSource, /progressionTitle: "Functions with Arrays"/);
  assert.match(pageSource, /showAction=\{progressionModel\.action\.kind !== "game"\}/);
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
