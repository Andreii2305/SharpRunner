'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const canonicalPackage = require('../src/data/builtInLessonContent.v1.json');
const {
  CANONICAL_BUILT_IN_LESSON_KEYS,
  getBuiltInLessonContent,
  serializeBuiltInLesson,
  validateBuiltInLessonPackage,
} = require('../src/services/builtInLessonContentService');

const EXPECTED_KEYS = [
  'tutorial',
  'arrays',
  'functions',
  'functions-with-arrays',
  'final',
];

const EXPECTED_COUNTS = {
  tutorial: { sections: 9, code: 12, practice: 2, check: 2 },
  arrays: { sections: 11, code: 18, practice: 3, check: 4 },
  functions: { sections: 11, code: 15, practice: 3, check: 3 },
  'functions-with-arrays': { sections: 10, code: 12, practice: 2, check: 3 },
  final: { sections: 10, code: 9, practice: 1, check: 8 },
};

// Independently reviewed integrity anchors. An intentional educational-content
// edit must update contentRevision, these hashes, and its review evidence.
const EXPECTED_HASHES = {
  tutorial: '86aa40e84daff0756c5b1d19a6137357c5cd2cb0c30c3ae80c9fb30afd08d5ee',
  arrays: '27f9245235d3698103e35a870e7999679e8e39d0a7e4a407ecafae9ddfa41239',
  functions: 'e2aab28507193a95f220166de60f8bd5578ea88add686fa3db9dd03a76a0e8f4',
  'functions-with-arrays': 'bf967cfd405249238cc6fefdda24e247cab26ae4ca3b9168f00c871fa1ae3737',
  final: '4d0931a610736615ddbf6a3ad3b1e081aa406e40818a885140f17867af831cde',
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const hashLesson = (lesson) => crypto.createHash('sha256').update(stableStringify(lesson), 'utf8').digest('hex');

const mutate = (change) => {
  const candidate = clone(canonicalPackage);
  change(candidate);
  return candidate;
};

const expectInvalid = (name, change, messagePattern) => {
  test(`rejects ${name}`, () => {
    assert.throws(() => validateBuiltInLessonPackage(mutate(change)), messagePattern);
  });
};

test('exports canonical lesson keys in Phase D order', () => {
  assert.deepEqual(CANONICAL_BUILT_IN_LESSON_KEYS, EXPECTED_KEYS);
  assert.deepEqual(canonicalPackage.lessons.map((lesson) => lesson.lessonKey), EXPECTED_KEYS);
});

test('canonical package has the approved schema version and immutable revision', () => {
  const validated = validateBuiltInLessonPackage(clone(canonicalPackage));
  assert.equal(validated.schemaVersion, 1);
  assert.match(validated.contentRevision, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.ok(Object.isFrozen(validated));
  assert.ok(Object.isFrozen(validated.lessons[0].sections[0].blocks[0]));
});

expectInvalid('a wrong schemaVersion', (value) => { value.schemaVersion = 2; }, /schemaVersion/);
expectInvalid('a missing canonical lesson', (value) => { value.lessons.pop(); }, /lessons|canonical lesson/i);
expectInvalid('an extra lesson', (value) => { value.lessons.push({ ...value.lessons[0], lessonKey: 'extra' }); }, /lessons|canonical lesson/i);
expectInvalid('a duplicate lesson', (value) => { value.lessons[1] = clone(value.lessons[0]); }, /duplicate|canonical lesson/i);
expectInvalid('noncanonical lesson ordering', (value) => { [value.lessons[0], value.lessons[1]] = [value.lessons[1], value.lessons[0]]; }, /order|canonical lesson/i);
expectInvalid('unknown package fields', (value) => { value.internal = true; }, /unknown field/i);
expectInvalid('unknown lesson fields', (value) => { value.lessons[0].databaseId = 1; }, /unknown field/i);
expectInvalid('unknown lesson fields whose values are undefined', (value) => { value.lessons[0].databaseId = undefined; }, /unknown field/i);
expectInvalid('unknown section fields', (value) => { value.lessons[0].sections[0].html = '<b>x</b>'; }, /unknown field/i);
expectInvalid('unknown block fields', (value) => { value.lessons[0].sections[0].blocks[0].markdown = '**x**'; }, /unknown field/i);
expectInvalid('script-style fields', (value) => { value.lessons[0].sections[0].blocks[0].script = 'alert(1)'; }, /unknown field/i);
expectInvalid('empty required strings', (value) => { value.lessons[0].title = '   '; }, /title/);
expectInvalid('missing required fields', (value) => { delete value.lessons[0].game.route; }, /route/);
expectInvalid('excessive strings', (value) => { value.lessons[0].description = 'x'.repeat(4001); }, /description|length/i);
expectInvalid('excessive objectives', (value) => { value.lessons[0].objectives = Array(51).fill('objective'); }, /objectives|items/i);
expectInvalid('excessive sections', (value) => { value.lessons[0].sections = Array(51).fill(null).map((_, i) => ({ ...clone(value.lessons[0].sections[0]), id: `section-${i}` })); }, /sections|items/i);
expectInvalid('excessive blocks', (value) => { value.lessons[0].sections[0].blocks = Array(101).fill(null).map(() => ({ type: 'paragraph', text: 'bounded' })); }, /blocks|items/i);
expectInvalid('duplicate section IDs', (value) => { value.lessons[0].sections[1].id = value.lessons[0].sections[0].id; }, /duplicate section/i);
expectInvalid('duplicate practice IDs', (value) => {
  const practices = value.lessons.flatMap((lesson) => lesson.sections.flatMap((section) => section.blocks.filter((block) => block.type === 'practice')));
  practices[1].id = practices[0].id;
}, /duplicate practice/i);
expectInvalid('duplicate check IDs', (value) => {
  const checks = value.lessons.flatMap((lesson) => lesson.sections.flatMap((section) => section.blocks.filter((block) => block.type === 'check')));
  checks[1].id = checks[0].id;
}, /duplicate check/i);
expectInvalid('unsupported block types', (value) => { value.lessons[0].sections[0].blocks[0].type = 'video'; }, /block type|unsupported/i);
expectInvalid('malformed block-specific fields', (value) => {
  const code = value.lessons[0].sections.flatMap((section) => section.blocks).find((block) => block.type === 'code');
  code.runnable = 'yes';
}, /runnable|boolean/i);
expectInvalid('nonrectangular diagrams', (value) => {
  const diagram = value.lessons.flatMap((lesson) => lesson.sections).flatMap((section) => section.blocks).find((block) => block.type === 'diagram');
  diagram.rows[0].pop();
}, /diagram|row/i);
expectInvalid('invalid quick-check answer indexes', (value) => {
  const check = value.lessons[0].sections.flatMap((section) => section.blocks).find((block) => block.type === 'check');
  check.answer = check.options.length;
}, /answer/);
expectInvalid('unsafe reference URLs', (value) => { value.lessons[0].references[0].url = 'javascript:alert(1)'; }, /https|url/i);
expectInvalid('non-allowlisted game routes', (value) => { value.lessons[0].game.route = '/admin'; }, /game route|allowlist/i);
expectInvalid('oversized serialized lessons', (value) => {
  value.lessons[0].sections[0].blocks = Array(100).fill(null).map(() => ({
    type: 'paragraph',
    text: 'x'.repeat(3000),
  }));
}, /serialized/i);

test('matches the audited structural counts for all five lessons', () => {
  const actual = Object.fromEntries(canonicalPackage.lessons.map((lesson) => {
    const blocks = lesson.sections.flatMap((section) => section.blocks);
    return [lesson.lessonKey, {
      sections: lesson.sections.length,
      code: blocks.filter((block) => block.type === 'code').length,
      practice: blocks.filter((block) => block.type === 'practice').length,
      check: blocks.filter((block) => block.type === 'check').length,
    }];
  }));
  assert.deepEqual(actual, EXPECTED_COUNTS);
});

test('matches deterministic per-lesson SHA-256 hashes', () => {
  const actual = Object.fromEntries(canonicalPackage.lessons.map((lesson) => [lesson.lessonKey, hashLesson(lesson)]));
  assert.deepEqual(actual, EXPECTED_HASHES);
});

test('performs exact case-sensitive lookup and returns null for unsupported keys', () => {
  assert.equal(getBuiltInLessonContent('Tutorial'), null);
  assert.equal(getBuiltInLessonContent('../tutorial'), null);
  assert.equal(getBuiltInLessonContent('unknown'), null);
  assert.equal(getBuiltInLessonContent('tutorial').lessonKey, 'tutorial');
});

test('prevents nested mutation from changing current or future reads', () => {
  const first = getBuiltInLessonContent('tutorial');
  const originalTitle = first.sections[0].blocks[0].text;
  assert.throws(() => { first.sections[0].blocks[0].text = 'mutated'; }, TypeError);
  assert.throws(() => { first.sections.push({ id: 'new', title: 'new', blocks: [] }); }, TypeError);
  assert.equal(getBuiltInLessonContent('tutorial').sections[0].blocks[0].text, originalTitle);
});

test('serializes only the approved envelope and nested allowlists', () => {
  const lesson = clone(canonicalPackage.lessons[0]);
  Object.assign(lesson, {
    databaseId: 99,
    assessmentId: 10,
    attempts: [{ id: 1 }],
    grade: 100,
    membership: { id: 2 },
    progressionState: { moduleUnlocked: true },
    xp: 50,
    rewards: ['badge'],
    validator: { hiddenTests: ['secret'] },
  });
  lesson.sections[0].blocks[0].isCorrect = true;
  lesson.sections[0].blocks[0].hiddenExplanation = 'secret';

  const result = serializeBuiltInLesson(lesson);
  const expectedLesson = clone(canonicalPackage.lessons[0]);
  expectedLesson.sections.forEach((section) => section.blocks.forEach((block) => {
    if (block.type === 'code') delete block.runnable;
  }));
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'contentRevision', 'lesson']);
  assert.deepEqual(result.lesson, expectedLesson);
  const serializedKeys = new Set();
  const collectKeys = (value) => {
    if (Array.isArray(value)) return value.forEach(collectKeys);
    if (!value || typeof value !== 'object') return;
    Object.entries(value).forEach(([key, nested]) => {
      serializedKeys.add(key);
      collectKeys(nested);
    });
  };
  collectKeys(result);
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'assessmentId', 'attempts', 'grade', 'membership', 'progressionState',
    'xp', 'rewards', 'validator', 'hiddenTests', 'isCorrect', 'hiddenExplanation', 'databaseId',
    'runnable',
  ]) {
    assert.equal(serializedKeys.has(forbidden), false, `serialized forbidden field ${forbidden}`);
  }
  assert.equal(serialized.includes('solution'), true);
  assert.equal(serialized.includes('expectedOutput'), true);
  assert.equal(serialized.includes('answer'), true);
  assert.equal(serialized.includes('feedback'), true);
});
