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
test.after(async () => vite.close());

const { default: BuiltInLessonRenderer } = await vite.ssrLoadModule(
  "/src/Components/BuiltInLessonRenderer.jsx",
);

const representativeLesson = {
  lessonKey: "arrays",
  title: "Arrays in context",
  eyebrow: "Arrays reference",
  description: "A static lesson description.",
  objectives: ["Read values", "Update values"],
  sections: [
    {
      id: "first",
      title: "First section",
      blocks: [
        { type: "heading", text: "Heading block" },
        { type: "paragraph", text: "Paragraph block" },
        { type: "list", items: ["List item one", "List item two"] },
        {
          type: "code",
          title: "Code example",
          value: "Console.WriteLine(4);",
          output: "4",
        },
        { type: "note", label: "Remember", text: "Note block", tone: "note" },
        {
          type: "diagram",
          headers: ["Index", "Value"],
          rows: [["0", "Kai"]],
          caption: "Diagram caption",
        },
        {
          type: "practice",
          id: "practice-one",
          prompt: "Practice prompt one",
          starterCode: "int value = 1;",
          expectedOutput: "1",
          solution: "Console.WriteLine(1);",
        },
        {
          type: "check",
          id: "check-one",
          prompt: "Which option is correct?",
          options: ["Wrong option", "Correct option"],
          answer: 1,
          feedback: "That is why the second option is correct.",
        },
        { type: "connection", text: "Connection block" },
      ],
    },
    {
      id: "second",
      title: "Second section",
      blocks: [
        {
          type: "practice",
          id: "practice-two",
          prompt: "Practice prompt two",
          starterCode: "int value = 2;",
          expectedOutput: "2",
          solution: "Console.WriteLine(2);",
        },
        {
          type: "check",
          id: "check-two",
          prompt: "Choose two.",
          options: ["One", "Two"],
          answer: 1,
          feedback: "Two is correct.",
        },
      ],
    },
  ],
  references: [
    { title: "Microsoft C# reference", url: "https://learn.microsoft.com/dotnet/csharp/" },
    { title: "Printed course reference", url: null },
  ],
};

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

test("renders every built-in block type in canonical section and block order", () => {
  const lesson = structuredClone(representativeLesson);
  const before = JSON.stringify(lesson);
  deepFreeze(lesson);

  const html = renderToStaticMarkup(React.createElement(BuiltInLessonRenderer, { lesson }));

  for (const text of [
    "Arrays in context",
    "A static lesson description.",
    "Read values",
    "Heading block",
    "Paragraph block",
    "List item one",
    "Code example",
    "Console.WriteLine(4);",
    "Expected output",
    "Remember",
    "Diagram caption",
    "Practice prompt one",
    "Which option is correct?",
    "Connection block",
    "Second section",
  ]) assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const orderedText = [
    "First section",
    "Heading block",
    "Paragraph block",
    "List item one",
    "Code example",
    "Remember",
    "Diagram caption",
    "Practice prompt one",
    "Which option is correct?",
    "Connection block",
    "Second section",
    "Practice prompt two",
    "Choose two.",
  ];
  let previousIndex = -1;
  for (const text of orderedText) {
    const nextIndex = html.indexOf(text, previousIndex + 1);
    assert.ok(nextIndex > previousIndex, `${text} should retain its original order`);
    previousIndex = nextIndex;
  }
  assert.equal(JSON.stringify(lesson), before);
});

test("associates static practice solutions and quick-check answers with their prompts", () => {
  const html = renderToStaticMarkup(React.createElement(BuiltInLessonRenderer, {
    lesson: representativeLesson,
  }));

  const firstPractice = html.slice(html.indexOf("Practice prompt one"), html.indexOf("Practice prompt two"));
  assert.match(firstPractice, /Starter code/);
  assert.match(firstPractice, /int value = 1;/);
  assert.match(firstPractice, /Expected output/);
  assert.match(firstPractice, />1</);
  assert.match(firstPractice, /Solution/);
  assert.match(firstPractice, /Console.WriteLine\(1\);/);
  assert.doesNotMatch(firstPractice, /int value = 2;|Console.WriteLine\(2\);/);

  const firstCheck = html.slice(html.indexOf("Which option is correct?"), html.indexOf("Connection block"));
  assert.match(firstCheck, /Wrong option/);
  assert.match(firstCheck, /Correct option/);
  assert.match(firstCheck, /Correct answer/);
  assert.match(firstCheck, /That is why the second option is correct\./);
  assert.doesNotMatch(firstCheck, /Two is correct\./);

  assert.doesNotMatch(html, /<button|<input|<textarea|contenteditable=/i);
  assert.doesNotMatch(html, /Run code|Reset code|Finish module|Continue|Start Adventure|Play Level/i);
});

test("provides accessible section navigation and references", () => {
  const html = renderToStaticMarkup(React.createElement(BuiltInLessonRenderer, {
    lesson: representativeLesson,
  }));

  assert.match(html, /<nav[^>]+aria-label="Built-in lesson sections"/);
  assert.match(html, /href="#built-in-arrays-first"/);
  assert.match(html, /href="#built-in-arrays-second"/);
  assert.match(html, /<section[^>]+id="built-in-arrays-first"[^>]+aria-labelledby=/);
  assert.match(html, /<nav[^>]+aria-label="Lesson references"/);
  assert.match(html, /href="https:\/\/learn\.microsoft\.com\/dotnet\/csharp\/"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /Printed course reference/);
});

test("renders all five canonical lessons without importing a duplicate frontend catalogue", async () => {
  const packageUrl = new URL("../../../backend/src/data/builtInLessonContent.v1.json", import.meta.url);
  const canonicalPackage = JSON.parse(await readFile(packageUrl, "utf8"));

  assert.equal(canonicalPackage.lessons.length, 5);
  for (const lesson of canonicalPackage.lessons) {
    const html = renderToStaticMarkup(React.createElement(BuiltInLessonRenderer, { lesson }));
    assert.match(html, new RegExp(lesson.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, new RegExp(lesson.sections[0].title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, /aria-label="Built-in lesson sections"/);
    assert.doesNotMatch(html, /<button|<input|<textarea|contenteditable=/i);
  }
});
