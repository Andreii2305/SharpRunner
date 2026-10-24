import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  ssr: { noExternal: ["@monaco-editor/react"] },
  plugins: [{
    name: "lesson-renderer-test-editor",
    enforce: "pre",
    resolveId(id) { return id === "@monaco-editor/react" ? "\0lesson-renderer-test-editor" : null; },
    load(id) {
      if (id !== "\0lesson-renderer-test-editor") return null;
      return 'import React from "react"; export default function Editor() { return React.createElement("div", { "data-practice-editor": "true" }); }';
    },
  }],
});
test.after(async () => vite.close());

const { default: LessonRenderer } = await vite.ssrLoadModule(
  "/src/Components/LessonRenderer/LessonRenderer.jsx",
);

const structuredLesson = {
  id: 41,
  title: "Structured lesson",
  topics: [{
    id: 12,
    title: "Structured topic",
    displayOrder: 0,
    images: [],
    content: {
      blocks: [
        { id: "practice", type: "practice", displayOrder: 2, title: "Practice arrays", prompt: "Print the first value.", starterCode: "Console.WriteLine(values[0]);", expectedOutput: "4" },
        { id: "code", type: "code", displayOrder: 1, title: "Worked example", code: "Console.WriteLine(4);" },
        { id: "intro", type: "content", displayOrder: 0, body: "Structured introduction" },
      ],
    },
  }],
};

test("default mode retains the interactive practice compiler", () => {
  const html = renderToStaticMarkup(React.createElement(LessonRenderer, { lesson: structuredLesson }));

  assert.match(html, /Practice arrays/);
  assert.match(html, /Print the first value\./);
  assert.match(html, /data-practice-editor="true"/);
  assert.match(html, /Run code<\/button>/);
  assert.match(html, /Reset code<\/button>/);
  assert.match(html, /Actual output/);
});

test("readOnly mode renders static practice content without compiler controls", () => {
  const html = renderToStaticMarkup(React.createElement(LessonRenderer, {
    lesson: structuredLesson,
    readOnly: true,
  }));

  assert.match(html, /Practice arrays/);
  assert.match(html, /Print the first value\./);
  assert.match(html, /Console\.WriteLine\(values\[0\]\);/);
  assert.doesNotMatch(html, /data-practice-editor="true"/);
  assert.doesNotMatch(html, /Run code<\/button>/);
  assert.doesNotMatch(html, /Reset code<\/button>/);
  assert.doesNotMatch(html, /Actual output|Expected output|Not run yet/);
  assert.doesNotMatch(html, /api\/practice|completion|submission|assessment/i);
});

test("readOnly mode preserves structured block order and topic navigation", () => {
  const html = renderToStaticMarkup(React.createElement(LessonRenderer, {
    lesson: structuredLesson,
    readOnly: true,
  }));

  assert.match(html, /aria-label="Lesson topics"/);
  assert.match(html, /Structured topic/);
  assert.ok(html.indexOf("Structured introduction") < html.indexOf("Worked example"));
  assert.ok(html.indexOf("Worked example") < html.indexOf("Practice arrays"));
});

test("readOnly mode preserves legacy content, code, and practice ordering", () => {
  const lesson = {
    id: 42,
    title: "Legacy lesson",
    topics: [{
      id: 13,
      title: "Legacy topic",
      displayOrder: 0,
      images: [],
      content: {
        body: "Legacy introduction",
        codeBlocks: [{ id: "legacy-code", title: "Legacy example", code: "Console.WriteLine(1);" }],
        practiceBlocks: [{ id: "legacy-practice", title: "Legacy practice", prompt: "Change the value.", starterCode: "Console.WriteLine(2);" }],
      },
    }],
  };
  const html = renderToStaticMarkup(React.createElement(LessonRenderer, { lesson, readOnly: true }));

  assert.match(html, /Legacy topic/);
  assert.ok(html.indexOf("Legacy introduction") < html.indexOf("Legacy example"));
  assert.ok(html.indexOf("Legacy example") < html.indexOf("Legacy practice"));
  assert.match(html, /Console\.WriteLine\(2\);/);
  assert.doesNotMatch(html, /Run code<\/button>/);
});
