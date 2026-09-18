const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeUrl,
  normalizeTopics,
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
