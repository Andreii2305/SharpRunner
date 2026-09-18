const MAX_TOPICS = 80;
const MAX_BODY_LENGTH = 100_000;
const MAX_CODE_LENGTH = 16_384;

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

const normalizeTopicContent = (content = {}) => {
  const value = content && typeof content === "object" ? content : {};
  return ({
  format: "markdown",
  body: String(value.body || "").slice(0, MAX_BODY_LENGTH),
  codeBlocks: Array.isArray(value.codeBlocks) ? value.codeBlocks.slice(0, 20).map(normalizeCodeBlock) : [],
  practiceBlocks: Array.isArray(value.practiceBlocks) ? value.practiceBlocks.slice(0, 10).map(normalizePracticeBlock) : [],
  });
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
  normalizeString,
  normalizeUrl,
  normalizeTopicContent,
  normalizeTopics,
  publicationFields,
  derivePublicationStatus,
  safeImageMetadata,
};
