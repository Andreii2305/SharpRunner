const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeUrl,
  normalizeTopics,
  normalizeTopicContent,
  remapTopicImageBlocks,
  publicationFields,
  derivePublicationStatus,
  safeImageMetadata,
} = require("../src/services/lessonBuilderService");

test("lesson builder normalizes structured topic content and stable ordering", () => {
  const topics = normalizeTopics([
    { id: "8", title: "  Loops  ", displayOrder: 99, content: { body: "Intro", codeBlocks: [{ code: "for (;;) {}" }], practiceBlocks: [{ prompt: "Try it" }] } },
    { title: "", content: null },
  ]);
  assert.equal(topics[0].id, 8);
  assert.equal(topics[0].title, "Loops");
  assert.equal(topics[0].displayOrder, 0);
  assert.equal(topics[0].content.format, "markdown");
  assert.equal(topics[0].content.codeBlocks[0].title, "C# example");
  assert.equal(topics[1].title, "Topic 2");
  assert.equal(topics[1].displayOrder, 1);
});

test("lesson builder normalizes multiple mixed ordered blocks without grouping by type", () => {
  const content = normalizeTopicContent({ blocks: [
    { id: "text-1", type: "content", displayOrder: 20, body: "First explanation" },
    { id: "code-1", type: "code", title: "Variables", code: "int age = 18;" },
    { id: "text-2", type: "content", body: "Second explanation" },
    { id: "code-2", type: "code", title: "Output", code: "Console.WriteLine(age);" },
    { id: "image-1", type: "image", imageId: "42" },
    { id: "text-3", type: "content", body: "Third explanation" },
    { id: "practice-1", type: "practice", title: "Try it", prompt: "Create a variable" },
    { id: "text-4", type: "content", body: "Wrap up" },
  ] });
  assert.deepEqual(content.blocks.map((block) => block.type), ["content", "code", "content", "code", "image", "content", "practice", "content"]);
  assert.deepEqual(content.blocks.map((block) => block.displayOrder), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(content.blocks[4].imageId, 42);
  assert.equal(content.body, undefined);
});

test("ordered image blocks are remapped when a lesson or topic is copied", () => {
  const content = { format: "markdown", blocks: [
    { id: "text", type: "content", displayOrder: 0, body: "Diagram:" },
    { id: "image", type: "image", displayOrder: 1, imageId: 7 },
  ] };
  const remapped = remapTopicImageBlocks(content, new Map([[7, 70]]));
  assert.equal(remapped.blocks[1].imageId, 70);
  assert.equal(content.blocks[1].imageId, 7);
});

test("lesson publication state supports drafts, immediate release, and scheduling", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.deepEqual(publicationFields("draft"), { isPublished: false, publishAt: null });
  assert.deepEqual(publicationFields("published"), { isPublished: true, publishAt: null });
  const scheduled = publicationFields("scheduled", future);
  assert.equal(scheduled.isPublished, true);
  assert.equal(derivePublicationStatus(scheduled), "scheduled");
  assert.throws(() => publicationFields("scheduled", "not-a-date"), /valid future/);
});

test("lesson builder rejects unsafe links and constrains image metadata", () => {
  assert.equal(normalizeUrl("javascript:alert(1)"), "");
  assert.equal(normalizeUrl("https://example.com/resource"), "https://example.com/resource");
  assert.deepEqual(safeImageMetadata({ placement: "unexpected", altText: "  diagram  ", caption: " caption " }), {
    placement: "after",
    altText: "diagram",
    caption: "caption",
  });
});
