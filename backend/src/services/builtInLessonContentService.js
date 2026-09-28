'use strict';

const rawPackage = require('../data/builtInLessonContent.v1.json');

const CANONICAL_BUILT_IN_LESSON_KEYS = Object.freeze([
  'tutorial',
  'arrays',
  'functions',
  'functions-with-arrays',
  'final',
]);

const ALLOWED_GAME_ROUTES = new Set(['/Map']);
const ALLOWED_NOTE_TONES = new Set(['note', 'warning']);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTENT_REVISION_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/;
const MAX_SERIALIZED_LESSON_BYTES = 250_000;

const PACKAGE_FIELDS = ['schemaVersion', 'contentRevision', 'lessons'];
const LESSON_FIELDS = ['title', 'eyebrow', 'description', 'objectives', 'sections', 'references', 'lessonKey', 'game'];
const SECTION_FIELDS = ['id', 'title', 'blocks'];
const GAME_FIELDS = ['title', 'route'];
const REFERENCE_FIELDS = ['title', 'url'];
const BLOCK_FIELDS = Object.freeze({
  heading: ['type', 'text'],
  paragraph: ['type', 'text'],
  list: ['type', 'items'],
  code: ['type', 'value', 'output', 'title', 'runnable'],
  note: ['type', 'label', 'text', 'tone'],
  diagram: ['type', 'headers', 'rows', 'caption'],
  practice: ['type', 'id', 'prompt', 'starterCode', 'solution', 'expectedOutput'],
  check: ['type', 'id', 'prompt', 'options', 'answer', 'feedback'],
  connection: ['type', 'text'],
});

class BuiltInLessonContentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuiltInLessonContentValidationError';
  }
}

const fail = (path, message) => {
  throw new BuiltInLessonContentValidationError(`${path}: ${message}`);
};

const isPlainObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const assertObject = (value, path) => {
  if (!isPlainObject(value)) fail(path, 'must be an object');
};

const assertAllowedFields = (value, allowedFields, path) => {
  assertObject(value, path);
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) fail(`${path}.${unknown}`, 'unknown field');
};

const assertRequiredFields = (value, requiredFields, path) => {
  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) fail(`${path}.${field}`, 'is required');
  }
};

const assertString = (value, path, maxLength, { pattern, allowEmpty = false } = {}) => {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) fail(path, 'must be a non-empty string');
  if (value.length > maxLength) fail(path, `length must not exceed ${maxLength}`);
  if (pattern && !pattern.test(value)) fail(path, 'has an invalid format');
};

const assertArray = (value, path, { min = 1, max }) => {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  if (value.length < min) fail(path, `must contain at least ${min} item(s)`);
  if (value.length > max) fail(path, `must contain at most ${max} items`);
};

const assertStringArray = (value, path, { min = 1, max, stringMax, allowEmpty = false }) => {
  assertArray(value, path, { min, max });
  value.forEach((item, index) => assertString(item, `${path}[${index}]`, stringMax, { allowEmpty }));
};

const validateReference = (reference, path) => {
  assertAllowedFields(reference, REFERENCE_FIELDS, path);
  assertRequiredFields(reference, ['title'], path);
  assertString(reference.title, `${path}.title`, 1_000);
  if (Object.prototype.hasOwnProperty.call(reference, 'url')) {
    assertString(reference.url, `${path}.url`, 2_048);
    let parsed;
    try {
      parsed = new URL(reference.url);
    } catch {
      fail(`${path}.url`, 'must be a valid HTTPS URL');
    }
    if (parsed.protocol !== 'https:') fail(`${path}.url`, 'must use HTTPS');
  }
};

const validateBlock = (block, path, usedPracticeIds, usedCheckIds) => {
  assertObject(block, path);
  assertString(block.type, `${path}.type`, 32);
  const allowedFields = BLOCK_FIELDS[block.type];
  if (!allowedFields) fail(`${path}.type`, `unsupported block type ${block.type}`);
  assertAllowedFields(block, allowedFields, path);

  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'connection':
      assertRequiredFields(block, ['type', 'text'], path);
      assertString(block.text, `${path}.text`, 4_000);
      break;
    case 'list':
      assertRequiredFields(block, ['type', 'items'], path);
      assertStringArray(block.items, `${path}.items`, { max: 100, stringMax: 2_000 });
      break;
    case 'code':
      assertRequiredFields(block, ['type', 'value', 'title'], path);
      assertString(block.value, `${path}.value`, 20_000);
      assertString(block.title, `${path}.title`, 256);
      if (Object.prototype.hasOwnProperty.call(block, 'output') && block.output !== null) {
        assertString(block.output, `${path}.output`, 8_000);
      }
      if (Object.prototype.hasOwnProperty.call(block, 'runnable') && typeof block.runnable !== 'boolean') {
        fail(`${path}.runnable`, 'must be a boolean');
      }
      break;
    case 'note':
      assertRequiredFields(block, ['type', 'label', 'text', 'tone'], path);
      assertString(block.label, `${path}.label`, 256);
      assertString(block.text, `${path}.text`, 4_000);
      if (!ALLOWED_NOTE_TONES.has(block.tone)) fail(`${path}.tone`, 'is not allowed');
      break;
    case 'diagram': {
      assertRequiredFields(block, ['type', 'headers', 'rows', 'caption'], path);
      assertStringArray(block.headers, `${path}.headers`, { max: 20, stringMax: 256, allowEmpty: true });
      assertArray(block.rows, `${path}.rows`, { max: 50 });
      block.rows.forEach((row, rowIndex) => {
        assertStringArray(row, `${path}.rows[${rowIndex}]`, { min: block.headers.length, max: block.headers.length, stringMax: 1_000 });
        if (row.length !== block.headers.length) fail(`${path}.rows[${rowIndex}]`, 'diagram row must match header width');
      });
      assertString(block.caption, `${path}.caption`, 2_000);
      break;
    }
    case 'practice':
      assertRequiredFields(block, ['type', 'id', 'prompt', 'starterCode', 'solution', 'expectedOutput'], path);
      assertString(block.id, `${path}.id`, 128, { pattern: ID_PATTERN });
      if (usedPracticeIds.has(block.id)) fail(`${path}.id`, `duplicate practice ID ${block.id}`);
      usedPracticeIds.add(block.id);
      assertString(block.prompt, `${path}.prompt`, 4_000);
      assertString(block.starterCode, `${path}.starterCode`, 20_000);
      assertString(block.solution, `${path}.solution`, 20_000);
      assertString(block.expectedOutput, `${path}.expectedOutput`, 8_000);
      break;
    case 'check':
      assertRequiredFields(block, ['type', 'id', 'prompt', 'options', 'answer', 'feedback'], path);
      assertString(block.id, `${path}.id`, 128, { pattern: ID_PATTERN });
      if (usedCheckIds.has(block.id)) fail(`${path}.id`, `duplicate check ID ${block.id}`);
      usedCheckIds.add(block.id);
      assertString(block.prompt, `${path}.prompt`, 4_000);
      assertStringArray(block.options, `${path}.options`, { min: 2, max: 20, stringMax: 2_000 });
      if (!Number.isSafeInteger(block.answer) || block.answer < 0 || block.answer >= block.options.length) {
        fail(`${path}.answer`, 'must be a valid option index');
      }
      assertString(block.feedback, `${path}.feedback`, 4_000);
      break;
    default:
      fail(`${path}.type`, 'unsupported block type');
  }
};

const validateLesson = (lesson, lessonIndex, usedPracticeIds, usedCheckIds) => {
  const path = `package.lessons[${lessonIndex}]`;
  assertAllowedFields(lesson, LESSON_FIELDS, path);
  assertRequiredFields(lesson, LESSON_FIELDS, path);
  assertString(lesson.lessonKey, `${path}.lessonKey`, 128, { pattern: ID_PATTERN });
  assertString(lesson.eyebrow, `${path}.eyebrow`, 256);
  assertString(lesson.title, `${path}.title`, 256);
  assertString(lesson.description, `${path}.description`, 4_000);
  assertStringArray(lesson.objectives, `${path}.objectives`, { max: 50, stringMax: 1_000 });

  assertArray(lesson.sections, `${path}.sections`, { max: 50 });
  const sectionIds = new Set();
  lesson.sections.forEach((section, sectionIndex) => {
    const sectionPath = `${path}.sections[${sectionIndex}]`;
    assertAllowedFields(section, SECTION_FIELDS, sectionPath);
    assertRequiredFields(section, SECTION_FIELDS, sectionPath);
    assertString(section.id, `${sectionPath}.id`, 128, { pattern: ID_PATTERN });
    if (sectionIds.has(section.id)) fail(`${sectionPath}.id`, `duplicate section ID ${section.id}`);
    sectionIds.add(section.id);
    assertString(section.title, `${sectionPath}.title`, 256);
    assertArray(section.blocks, `${sectionPath}.blocks`, { max: 100 });
    section.blocks.forEach((block, blockIndex) => validateBlock(
      block,
      `${sectionPath}.blocks[${blockIndex}]`,
      usedPracticeIds,
      usedCheckIds,
    ));
  });

  assertAllowedFields(lesson.game, GAME_FIELDS, `${path}.game`);
  assertRequiredFields(lesson.game, GAME_FIELDS, `${path}.game`);
  assertString(lesson.game.title, `${path}.game.title`, 256);
  assertString(lesson.game.route, `${path}.game.route`, 256);
  if (!ALLOWED_GAME_ROUTES.has(lesson.game.route)) fail(`${path}.game.route`, 'game route is not on the allowlist');

  assertArray(lesson.references, `${path}.references`, { max: 50 });
  lesson.references.forEach((reference, referenceIndex) => validateReference(reference, `${path}.references[${referenceIndex}]`));

  if (Buffer.byteLength(JSON.stringify(lesson), 'utf8') > MAX_SERIALIZED_LESSON_BYTES) {
    fail(path, `serialized lesson must not exceed ${MAX_SERIALIZED_LESSON_BYTES} bytes`);
  }
};

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const validateBuiltInLessonPackage = (candidate) => {
  const value = candidate;
  assertAllowedFields(value, PACKAGE_FIELDS, 'package');
  assertRequiredFields(value, PACKAGE_FIELDS, 'package');
  if (value.schemaVersion !== 1) fail('package.schemaVersion', 'must equal 1');
  assertString(value.contentRevision, 'package.contentRevision', 64, { pattern: CONTENT_REVISION_PATTERN });
  assertArray(value.lessons, 'package.lessons', {
    min: CANONICAL_BUILT_IN_LESSON_KEYS.length,
    max: CANONICAL_BUILT_IN_LESSON_KEYS.length,
  });

  const usedLessonKeys = new Set();
  const usedPracticeIds = new Set();
  const usedCheckIds = new Set();
  value.lessons.forEach((lesson, index) => {
    validateLesson(lesson, index, usedPracticeIds, usedCheckIds);
    if (usedLessonKeys.has(lesson.lessonKey)) fail(`package.lessons[${index}].lessonKey`, `duplicate lesson ${lesson.lessonKey}`);
    usedLessonKeys.add(lesson.lessonKey);
    if (lesson.lessonKey !== CANONICAL_BUILT_IN_LESSON_KEYS[index]) {
      fail(`package.lessons[${index}].lessonKey`, `canonical lesson order requires ${CANONICAL_BUILT_IN_LESSON_KEYS[index]}`);
    }
  });

  return deepFreeze(cloneJson(value));
};

const pickFields = (value, fields) => Object.fromEntries(
  fields.filter((field) => Object.prototype.hasOwnProperty.call(value, field)).map((field) => [field, value[field]]),
);

const projectBlock = (block) => pickFields(
  block,
  (BLOCK_FIELDS[block.type] || ['type']).filter((field) => field !== 'runnable'),
);

const projectLesson = (lesson) => ({
  ...pickFields(lesson, ['title', 'eyebrow', 'description']),
  objectives: Array.isArray(lesson.objectives) ? [...lesson.objectives] : lesson.objectives,
  sections: Array.isArray(lesson.sections) ? lesson.sections.map((section) => ({
    ...pickFields(section, ['id', 'title']),
    blocks: Array.isArray(section.blocks) ? section.blocks.map(projectBlock) : section.blocks,
  })) : lesson.sections,
  references: Array.isArray(lesson.references)
    ? lesson.references.map((reference) => pickFields(reference, REFERENCE_FIELDS))
    : lesson.references,
  ...pickFields(lesson, ['lessonKey']),
  game: isPlainObject(lesson.game) ? pickFields(lesson.game, GAME_FIELDS) : lesson.game,
});

const validatedPackage = validateBuiltInLessonPackage(rawPackage);
const lessonByKey = new Map(validatedPackage.lessons.map((lesson) => [lesson.lessonKey, lesson]));

const getBuiltInLessonContent = (lessonKey) => lessonByKey.get(lessonKey) || null;

const serializeBuiltInLesson = (lesson) => deepFreeze({
  schemaVersion: validatedPackage.schemaVersion,
  contentRevision: validatedPackage.contentRevision,
  lesson: cloneJson(projectLesson(lesson)),
});

module.exports = {
  CANONICAL_BUILT_IN_LESSON_KEYS,
  getBuiltInLessonContent,
  serializeBuiltInLesson,
  validateBuiltInLessonPackage,
};
