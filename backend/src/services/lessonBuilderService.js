const MAX_TOPICS = 80;
const MAX_BODY_LENGTH = 100_000;
const MAX_CODE_LENGTH = 16_384;
const MAX_BLOCKS = 100;

const normalizeString = (value, max = 10_000) => typeof value === "string" ? value.trim().slice(0, max) : "";

const normalizeUrl = (value) => {
  const url = normalizeString(value, 1000);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
};

const normalizeCodeBlock = (block = {}, index = 0) => {
  const value = block && typeof block === "object" ? block : {};
  return ({
    id: normalizeString(value.id, 80) || `code-${index + 1}`,
    title: normalizeString(value.title, 120) || "C# example",
    code: String(value.code || "").slice(0, MAX_CODE_LENGTH),
  });
};

const normalizePracticeBlock = (block = {}, index = 0) => {
  const value = block && typeof block === "object" ? block : {};
  return ({
    id: normalizeString(value.id, 80) || `practice-${index + 1}`,
    title: normalizeString(value.title, 120) || "Try It Yourself",
    prompt: normalizeString(value.prompt, 1000),
    starterCode: String(value.starterCode || "").slice(0, MAX_CODE_LENGTH),
    expectedOutput: String(value.expectedOutput || "").slice(0, 4000),
  });
};

const normalizeTopicBlock = (block = {}, index = 0) => {
  const value = block && typeof block === "object" ? block : {};
  const aliases = { text: "content", code_example: "code", try_it_yourself: "practice" };
  const type = aliases[value.type] || value.type;
  const common = {
    id: normalizeString(value.id, 100) || `block-${index + 1}`,
    type,
    displayOrder: index,
  };
  if (type === "content") return { ...common, body: String(value.body || "").slice(0, MAX_BODY_LENGTH) };
  if (type === "code") return { ...common, ...normalizeCodeBlock(value, index) };
  if (type === "practice") return { ...common, ...normalizePracticeBlock(value, index) };
  if (type === "image") {
    const imageId = Number(value.imageId);
    return { ...common, imageId: Number.isInteger(imageId) && imageId > 0 ? imageId : null };
  }
  return null;
};

const normalizeTopicContent = (content = {}) => {
  const value = content && typeof content === "object" ? content : {};
  if (Array.isArray(value.blocks)) {
    const blocks = value.blocks
      .slice(0, MAX_BLOCKS)
      .map(normalizeTopicBlock)
      .filter(Boolean)
      .map((block, displayOrder) => ({ ...block, displayOrder }));
    return { format: "markdown", blocks };
  }
  return {
    format: "markdown",
    body: String(value.body || "").slice(0, MAX_BODY_LENGTH),
    codeBlocks: Array.isArray(value.codeBlocks) ? value.codeBlocks.slice(0, 20).map(normalizeCodeBlock) : [],
    practiceBlocks: Array.isArray(value.practiceBlocks) ? value.practiceBlocks.slice(0, 10).map(normalizePracticeBlock) : [],
  };
};

const remapTopicImageBlocks = (content = {}, imageIdMap = new Map()) => {
  if (!Array.isArray(content?.blocks)) return JSON.parse(JSON.stringify(content || {}));
  return {
    ...JSON.parse(JSON.stringify(content)),
    blocks: content.blocks.map((block) => block?.type === "image"
      ? { ...block, imageId: imageIdMap.get(Number(block.imageId)) || null }
      : { ...block }),
  };
};

const normalizeTopics = (topics) => {
  if (!Array.isArray(topics)) return [];
  return topics.slice(0, MAX_TOPICS).map((topic, displayOrder) => {
    const value = topic && typeof topic === "object" ? topic : {};
    return ({
    id: Number.isInteger(Number(value.id)) && Number(value.id) > 0 ? Number(value.id) : null,
    clientId: normalizeString(value.clientId, 100),
    title: normalizeString(value.title, 180) || `Topic ${displayOrder + 1}`,
    displayOrder,
    content: normalizeTopicContent(value.content),
    });
  });
};

const publicationFields = (status, publishAt) => {
  const normalized = String(status || "draft").toLowerCase();
  if (normalized === "published") return { isPublished: true, publishAt: null };
  if (normalized === "scheduled") {
    const date = new Date(publishAt);
    if (!Number.isFinite(date.getTime()) || date <= new Date()) throw new Error("Schedule must be a valid future date and time");
    return { isPublished: true, publishAt: date };
  }
  return { isPublished: false, publishAt: null };
};

const derivePublicationStatus = (lesson, now = new Date()) => {
  if (!lesson?.isPublished) return "draft";
  if (lesson.publishAt && new Date(lesson.publishAt) > now) return "scheduled";
  return "published";
};

const safeImageMetadata = (body = {}) => ({
  placement: body.placement === "before" ? "before" : "after",
  altText: normalizeString(body.altText, 300),
  caption: normalizeString(body.caption, 500),
});

module.exports = {
  MAX_TOPICS,
  MAX_BLOCKS,
  normalizeString,
  normalizeUrl,
  normalizeTopicContent,
  normalizeTopicBlock,
  normalizeTopics,
  remapTopicImageBlocks,
  publicationFields,
  derivePublicationStatus,
  safeImageMetadata,
};
