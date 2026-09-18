import assert from "node:assert/strict";
import test from "node:test";
import { createBlock, getTopicBlocks, insertBlock, moveBlock, removeBlock } from "./lessonBlocks.js";

test("ordered topic blocks support insertion, movement, and deletion", () => {
  let blocks = [createBlock("content", "a"), createBlock("code", "b")];
  blocks = insertBlock(blocks, createBlock("content", "c"), 1);
  assert.deepEqual(blocks.map((block) => block.id), ["a", "c", "b"]);
  assert.deepEqual(blocks.map((block) => block.displayOrder), [0, 1, 2]);
  blocks = moveBlock(blocks, 2, 0);
  assert.deepEqual(blocks.map((block) => block.id), ["b", "a", "c"]);
  blocks = removeBlock(blocks, "a");
  assert.deepEqual(blocks.map((block) => block.id), ["b", "c"]);
});

test("mixed block types retain exact explicit ordering", () => {
  const topic = { content: { blocks: [
    { id: "practice", type: "practice", displayOrder: 4 },
    { id: "content-2", type: "content", displayOrder: 2 },
    { id: "image", type: "image", imageId: 7, displayOrder: 1 },
    { id: "code", type: "code", displayOrder: 3 },
    { id: "content-1", type: "content", displayOrder: 0 },
    { id: "content-3", type: "content", displayOrder: 5 },
  ] } };
  assert.deepEqual(getTopicBlocks(topic).map((block) => block.id), ["content-1", "image", "content-2", "code", "practice", "content-3"]);
});

test("the requested content-code-content-code-image-content-practice-content workflow persists after reorder", () => {
  const blocks = [
    createBlock("content", "content-1"),
    createBlock("code", "code-1"),
    createBlock("content", "content-2"),
    createBlock("code", "code-2"),
    { ...createBlock("image", "image-1"), imageId: 42 },
    createBlock("content", "content-3"),
    createBlock("practice", "practice-1"),
    createBlock("content", "content-4"),
  ];
  const reordered = moveBlock(blocks, 4, 1);
  const refreshed = getTopicBlocks({ content: { blocks: JSON.parse(JSON.stringify(reordered)) } });
  assert.deepEqual(refreshed.map((block) => block.id), ["content-1", "image-1", "code-1", "content-2", "code-2", "content-3", "practice-1", "content-4"]);
  assert.deepEqual(refreshed.map((block) => block.displayOrder), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("legacy topics preserve before/content/code/practice/after image rendering", () => {
  const topic = {
    images: [
      { id: 2, placement: "after", displayOrder: 1 },
      { id: 1, placement: "before", displayOrder: 0 },
    ],
    content: {
      body: "Introduction",
      codeBlocks: [{ id: "code-1", code: "Console.WriteLine(1);" }],
      practiceBlocks: [{ id: "practice-1", starterCode: "" }],
    },
  };
  assert.deepEqual(getTopicBlocks(topic).map((block) => block.type), ["image", "content", "code", "practice", "image"]);
  assert.deepEqual(getTopicBlocks(topic).filter((block) => block.type === "image").map((block) => block.imageId), [1, 2]);
});
