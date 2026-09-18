const blockOrder = (left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0);

export const reindexBlocks = (blocks = []) => blocks.map((block, displayOrder) => ({ ...block, displayOrder }));

export const insertBlock = (blocks = [], block, index = blocks.length) => {
  const next = [...blocks];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, block);
  return reindexBlocks(next);
};

export const moveBlock = (blocks = [], source, target) => {
  if (source === target || source < 0 || target < 0 || source >= blocks.length || target >= blocks.length) return reindexBlocks(blocks);
  const next = [...blocks];
  const [item] = next.splice(source, 1);
  next.splice(target, 0, item);
  return reindexBlocks(next);
};

export const removeBlock = (blocks = [], blockId) => reindexBlocks(blocks.filter((block) => block.id !== blockId));

export const createBlock = (type, id) => {
  const common = { id, type, displayOrder: 0 };
  if (type === "content") return { ...common, body: "" };
  if (type === "code") return { ...common, title: "C# example", code: 'Console.WriteLine("Hello, SharpRunner!");' };
  if (type === "practice") return { ...common, title: "Try It Yourself", prompt: "Modify the code, then run it.", starterCode: 'Console.WriteLine("Hello!");', expectedOutput: "Hello!" };
  if (type === "image") return { ...common, imageId: null };
  throw new Error(`Unsupported lesson block type: ${type}`);
};

export const legacyTopicBlocks = (topic = {}) => {
  const images = [...(topic.images || [])].sort(blockOrder);
  const beforeImages = images.filter((image) => image.placement === "before");
  const afterImages = images.filter((image) => image.placement !== "before");
  const content = topic.content || {};
  const blocks = [
    ...beforeImages.map((image) => ({ id: `legacy-image-${image.id}`, type: "image", imageId: image.id })),
    ...(content.body ? [{ id: "legacy-content", type: "content", body: content.body }] : []),
    ...(content.codeBlocks || []).map((block, index) => ({ ...block, id: block.id || `legacy-code-${index + 1}`, type: "code" })),
    ...(content.practiceBlocks || []).map((block, index) => ({ ...block, id: block.id || `legacy-practice-${index + 1}`, type: "practice" })),
    ...afterImages.map((image) => ({ id: `legacy-image-${image.id}`, type: "image", imageId: image.id })),
  ];
  return reindexBlocks(blocks);
};

export const getTopicBlocks = (topic = {}) => Array.isArray(topic.content?.blocks)
  ? reindexBlocks([...topic.content.blocks].sort(blockOrder))
  : legacyTopicBlocks(topic);

export const prepareTopicForEditing = (topic = {}) => ({
  ...topic,
  content: { format: "markdown", blocks: getTopicBlocks(topic) },
});

export const prepareTopicsForEditing = (topics = []) => topics.map(prepareTopicForEditing);

export const findTopicImage = (topic, block) => (topic.images || []).find((image) => Number(image.id) === Number(block.imageId));
