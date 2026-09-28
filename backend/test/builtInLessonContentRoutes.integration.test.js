'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { test } = require('node:test');

process.env.JWT_SECRET = 'built-in-content-route-test-secret';

const Classroom = require('../src/models/Classroom');
const ClassroomMembership = require('../src/models/ClassroomMembership');
const User = require('../src/models/User');
const UserProgress = require('../src/models/UserProgress');
const LessonAssessment = require('../src/models/LessonAssessment');
const AssessmentAttempt = require('../src/models/AssessmentAttempt');
const LevelContentOverride = require('../src/models/LevelContentOverride');
const builtInContentService = require('../src/services/builtInLessonContentService');
const lessonProgressionService = require('../src/services/lessonProgressionService');
const studentClassService = require('../src/services/studentClassService');
const { AssessmentApiError } = require('../src/services/assessmentErrorService');
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require('../src/constants/policyVersions');

let createBuiltInLessonContentRouter = null;
try {
  ({ createBuiltInLessonContentRouter } = require('../src/routes/builtInLessonContent'));
} catch {
  // The protected route does not exist during the required RED run.
}

const activeMembership = (overrides = {}) => ({
  id: 301,
  classroomId: 7,
  studentId: 42,
  status: 'active',
  classroom: { id: 7, isActive: true },
  ...overrides,
});

test('exact active membership helper performs one constrained classroom query', async (t) => {
  const membership = activeMembership();
  const transaction = { id: 'membership-transaction' };
  let calls = 0;
  t.mock.method(ClassroomMembership, 'findOne', async (options) => {
    calls += 1;
    assert.deepEqual(options.where, { studentId: 42, classroomId: 7, status: 'active' });
    assert.equal(options.transaction, transaction);
    assert.equal(options.include.length, 1);
    assert.equal(options.include[0].model, Classroom);
    assert.equal(options.include[0].as, 'classroom');
    assert.equal(options.include[0].required, true);
    assert.deepEqual(options.include[0].where, { isActive: true });
    return membership;
  });

  assert.equal(await studentClassService.requireExactActiveMembership({
    studentId: 42,
    classroomId: 7,
    transaction,
  }), membership);
  assert.equal(calls, 1);
});

test('exact active membership helper rejects wrong former and inactive classroom membership', async (t) => {
  let current = activeMembership();
  t.mock.method(ClassroomMembership, 'findOne', async ({ where, include }) => (
    current.studentId === where.studentId
      && current.classroomId === where.classroomId
      && current.status === where.status
      && current.classroom.isActive === include[0].where.isActive
      ? current
      : null
  ));

  for (const fixture of [
    { classroomId: 8, membership: activeMembership() },
    { classroomId: 7, membership: activeMembership({ status: 'removed' }) },
    { classroomId: 7, membership: activeMembership({ classroom: { id: 7, isActive: false } }) },
  ]) {
    current = fixture.membership;
    await assert.rejects(
      studentClassService.requireExactActiveMembership({ studentId: 42, classroomId: fixture.classroomId }),
      (error) => error?.status === 403 && error?.code === 'FORBIDDEN' && error?.message === 'Forbidden',
    );
  }
});

test('exact active membership helper freshly rereads membership after removal', async (t) => {
  let current = activeMembership();
  let calls = 0;
  t.mock.method(ClassroomMembership, 'findOne', async () => {
    calls += 1;
    return current?.status === 'active' && current.classroom?.isActive === true ? current : null;
  });

  assert.equal((await studentClassService.requireExactActiveMembership({
    studentId: 42,
    classroomId: 7,
  })).id, 301);
  current = { ...current, status: 'removed' };
  await assert.rejects(
    studentClassService.requireExactActiveMembership({ studentId: 42, classroomId: 7 }),
    (error) => error?.status === 403 && error?.code === 'FORBIDDEN',
  );
  assert.equal(calls, 2);
});

const activeUser = (id = 42, role = 'student') => ({
  id,
  role,
  status: 'active',
  tokenVersion: 0,
  termsVersionAccepted: TERMS_VERSION,
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
});

const token = (id = 42, role = 'student', options = {}) => jwt.sign(
  { id, role, tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: '5m', ...options },
);

const assertProtectedHeaders = (response) => {
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  const vary = String(response.headers.get('vary') || '').split(',').map((value) => value.trim().toLowerCase());
  assert.ok(vary.includes('origin'));
  assert.ok(vary.includes('authorization'));
};

const forbiddenContentKeys = new Set([
  'lesson', 'sections', 'blocks', 'objectives', 'solution', 'answer', 'expectedOutput',
]);
const protectedSentinels = [
  'Barangay Malumay',
  'tutorial-arithmetic',
  'Bakunawa Eclipse',
];
const assertNoProtectedContent = (payload, path = '$') => {
  if (!payload || typeof payload !== 'object') return;
  for (const [key, value] of Object.entries(payload)) {
    assert.equal(forbiddenContentKeys.has(key), false, `${path}.${key} leaked protected content`);
    assertNoProtectedContent(value, `${path}.${key}`);
  }
  const serialized = JSON.stringify(payload);
  for (const sentinel of protectedSentinels) assert.equal(serialized.includes(sentinel), false);
};

const startHarness = async (t, {
  role = 'student',
  membership = async (input) => activeMembership({
    studentId: input.studentId,
    classroomId: input.classroomId,
    classroom: { id: input.classroomId, isActive: true },
  }),
  progression = async ({ lessonKey }) => ({ lessonKey, moduleUnlocked: true }),
  contentService = builtInContentService,
} = {}) => {
  assert.equal(typeof createBuiltInLessonContentRouter, 'function', 'built-in content router factory must exist');
  t.mock.method(User, 'findByPk', async (id) => activeUser(Number(id), role));
  const app = express();
  app.use((_req, res, next) => {
    res.vary('Origin');
    next();
  });
  app.use('/api/classrooms', createBuiltInLessonContentRouter({
    contentService,
    progressionService: { assertModuleAccessAllowed: progression },
    studentClassService: { requireExactActiveMembership: membership },
  }));
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return async (path, { authToken = token(), method = 'GET' } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    const text = await response.text();
    return { response, payload: text ? JSON.parse(text) : null };
  };
};

test('protected content route requires authentication and student role with no-store headers', async (t) => {
  const unauthenticated = await startHarness(t);
  for (const authToken of [null, 'not-a-token', token(42, 'student', { expiresIn: -1 })]) {
    const result = await unauthenticated('/api/classrooms/7/built-in-lessons/tutorial/content', { authToken });
    assert.equal(result.response.status, 401);
    assertProtectedHeaders(result.response);
    assertNoProtectedContent(result.payload);
  }

  const teacherRequest = await startHarness(t, { role: 'teacher' });
  const teacher = await teacherRequest('/api/classrooms/7/built-in-lessons/tutorial/content', {
    authToken: token(5, 'teacher'),
  });
  assert.equal(teacher.response.status, 403);
  assertProtectedHeaders(teacher.response);
  assertNoProtectedContent(teacher.payload);
});

test('protected content route validates classroom and lesson path values before authorization', async (t) => {
  let membershipCalls = 0;
  const request = await startHarness(t, {
    membership: async () => { membershipCalls += 1; return activeMembership(); },
  });
  for (const classroomId of ['0', '-1', '1.5', 'abc', '9007199254740992']) {
    const result = await request(`/api/classrooms/${classroomId}/built-in-lessons/tutorial/content`);
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.code, 'INVALID_CLASSROOM_ID');
    assertProtectedHeaders(result.response);
    assertNoProtectedContent(result.payload);
  }
  for (const lessonKey of ['Arrays', 'arrays_1', '-arrays', 'arrays-']) {
    const result = await request(`/api/classrooms/7/built-in-lessons/${lessonKey}/content`);
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.code, 'INVALID_LESSON_KEY');
    assertProtectedHeaders(result.response);
    assertNoProtectedContent(result.payload);
  }
  assert.equal(membershipCalls, 0);
});

test('membership is established before unsupported lesson keys can be distinguished', async (t) => {
  const deniedBodies = [];
  let membershipCalls = 0;
  let progressionCalls = 0;
  let contentCalls = 0;
  const deniedRequest = await startHarness(t, {
    membership: async () => {
      membershipCalls += 1;
      throw new AssessmentApiError(403, 'FORBIDDEN', 'Forbidden');
    },
    progression: async () => { progressionCalls += 1; },
    contentService: {
      ...builtInContentService,
      getBuiltInLessonContent: () => { contentCalls += 1; return null; },
    },
  });
  for (const key of ['tutorial', 'unknown-lesson']) {
    const denied = await deniedRequest(`/api/classrooms/7/built-in-lessons/${key}/content`);
    assert.equal(denied.response.status, 403);
    assert.equal(denied.payload.code, 'FORBIDDEN');
    assertProtectedHeaders(denied.response);
    assertNoProtectedContent(denied.payload);
    deniedBodies.push(denied.payload);
  }
  assert.deepEqual(deniedBodies[0], deniedBodies[1]);
  assert.equal(membershipCalls, 2);
  assert.equal(progressionCalls, 0);
  assert.equal(contentCalls, 0);

  const memberRequest = await startHarness(t);
  const notFound = await memberRequest('/api/classrooms/7/built-in-lessons/unknown-lesson/content');
  assert.equal(notFound.response.status, 404);
  assert.equal(notFound.payload.code, 'BUILT_IN_LESSON_NOT_FOUND');
  assertProtectedHeaders(notFound.response);
  assertNoProtectedContent(notFound.payload);
});

test('protected content route delegates in membership progression content serialization order', async (t) => {
  const calls = [];
  const request = await startHarness(t, {
    membership: async (input) => {
      calls.push(['membership', input]);
      return activeMembership();
    },
    progression: async (input) => {
      calls.push(['progression', input]);
      return { lessonKey: input.lessonKey, moduleUnlocked: true };
    },
    contentService: {
      CANONICAL_BUILT_IN_LESSON_KEYS: builtInContentService.CANONICAL_BUILT_IN_LESSON_KEYS,
      getBuiltInLessonContent: (lessonKey) => {
        calls.push(['content', lessonKey]);
        return builtInContentService.getBuiltInLessonContent(lessonKey);
      },
      serializeBuiltInLesson: (lesson) => {
        calls.push(['serialize', lesson.lessonKey]);
        return builtInContentService.serializeBuiltInLesson(lesson);
      },
    },
  });
  const result = await request('/api/classrooms/7/built-in-lessons/tutorial/content');

  assert.equal(result.response.status, 200);
  assertProtectedHeaders(result.response);
  assert.deepEqual(calls.map(([name]) => name), ['membership', 'progression', 'content', 'serialize']);
  assert.deepEqual(calls[0][1], { studentId: 42, classroomId: 7 });
  assert.equal(calls[1][1].authorizedMembership.id, 301);
  assert.equal(calls[1][1].classroomId, 7);
  assert.equal(calls[1][1].studentId, 42);
  assert.equal(calls[1][1].lessonKey, 'tutorial');
});

test('protected content route maps progression denials without content leakage', async (t) => {
  for (const fixture of [
    {
      code: 'LESSON_PREREQUISITE_REQUIRED',
      details: { lessonKey: 'functions', prerequisiteLessonKey: 'arrays', nextAction: 'COMPLETE_PREREQUISITE_LESSON' },
    },
    {
      code: 'PRE_ASSESSMENT_REQUIRED',
      details: { lessonKey: 'arrays', assessmentId: 808, nextAction: 'TAKE_PRE' },
    },
  ]) {
    const request = await startHarness(t, {
      progression: async () => {
        throw new lessonProgressionService.LessonProgressionError({
          code: fixture.code,
          message: 'safe progression denial',
          ...fixture.details,
        });
      },
    });
    const result = await request(`/api/classrooms/7/built-in-lessons/${fixture.details.lessonKey}/content`);
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.code, fixture.code);
    assert.equal(result.payload.lessonKey, fixture.details.lessonKey);
    assertProtectedHeaders(result.response);
    assertNoProtectedContent(result.payload);
  }
});

test('protected content route returns safe 500 errors and no content', async (t) => {
  t.mock.method(console, 'error', () => {});
  const request = await startHarness(t, {
    progression: async () => { throw new Error('database password and protected lesson text'); },
  });
  const result = await request('/api/classrooms/7/built-in-lessons/tutorial/content');
  assert.equal(result.response.status, 500);
  assert.deepEqual(result.payload, { code: 'SERVER_ERROR', message: 'Server error' });
  assertProtectedHeaders(result.response);
  assertNoProtectedContent(result.payload);
  assert.equal(JSON.stringify(result.payload).includes('database password'), false);
});

test('success response is exactly the safe Checkpoint A envelope', async (t) => {
  const request = await startHarness(t);
  const result = await request('/api/classrooms/7/built-in-lessons/arrays/content');
  assert.equal(result.response.status, 200);
  assertProtectedHeaders(result.response);
  assert.deepEqual(Object.keys(result.payload), ['schemaVersion', 'contentRevision', 'lesson']);
  assert.equal(result.payload.lesson.lessonKey, 'arrays');
  const serialized = JSON.stringify(result.payload);
  for (const forbidden of [
    'progressionState', 'membership', 'assessmentId', 'attempt', 'score', 'grade',
    'databaseId', 'xp', 'rewards', 'validator', 'isCorrect', 'hiddenExplanation', 'runnable',
  ]) {
    assert.equal(serialized.includes(`"${forbidden}"`), false, forbidden);
  }
  assert.equal(serialized.includes('"solution"'), true);
  assert.equal(serialized.includes('"expectedOutput"'), true);
  assert.equal(serialized.includes('"answer"'), true);
  assert.equal(serialized.includes('"feedback"'), true);
});

test('route rereads membership and denies a former member after prior success', async (t) => {
  let active = true;
  let calls = 0;
  const request = await startHarness(t, {
    membership: async () => {
      calls += 1;
      if (!active) throw new AssessmentApiError(403, 'FORBIDDEN', 'Forbidden');
      return activeMembership();
    },
  });
  assert.equal((await request('/api/classrooms/7/built-in-lessons/tutorial/content')).response.status, 200);
  active = false;
  const denied = await request('/api/classrooms/7/built-in-lessons/tutorial/content');
  assert.equal(denied.response.status, 403);
  assertNoProtectedContent(denied.payload);
  assert.equal(calls, 2);
});

test('real route authorization uses four bounded queries or five with a relevant assessment', async (t) => {
  assert.equal(typeof createBuiltInLessonContentRouter, 'function', 'built-in content router factory must exist');
  t.mock.method(User, 'findByPk', async (id) => activeUser(Number(id)));
  const counts = { membership: 0, assessment: 0, progress: 0, settings: 0, attempt: 0 };
  let assessments = [];
  let attempts = [];
  let progressRows = [];
  t.mock.method(ClassroomMembership, 'findOne', async () => {
    counts.membership += 1;
    return activeMembership();
  });
  t.mock.method(LessonAssessment, 'findAll', async () => { counts.assessment += 1; return assessments; });
  t.mock.method(UserProgress, 'findAll', async () => { counts.progress += 1; return progressRows; });
  t.mock.method(LevelContentOverride, 'findAll', async () => { counts.settings += 1; return []; });
  t.mock.method(AssessmentAttempt, 'findAll', async () => { counts.attempt += 1; return attempts; });

  const app = express();
  app.use('/api/classrooms', createBuiltInLessonContentRouter({
    contentService: builtInContentService,
    progressionService: lessonProgressionService,
    studentClassService,
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const call = async (lessonKey) => fetch(
    `http://127.0.0.1:${server.address().port}/api/classrooms/7/built-in-lessons/${lessonKey}/content`,
    { headers: { Authorization: `Bearer ${token()}` } },
  );

  assert.equal((await call('tutorial')).status, 200);
  assert.deepEqual(counts, { membership: 1, assessment: 1, progress: 1, settings: 1, attempt: 0 });

  assessments = [{
    id: 808, classroomId: 7, lessonKey: 'arrays', type: 'PRE', isRequired: true,
    isPublished: true, maxAttempts: 1, requirePassingForCompletion: false,
  }];
  attempts = [{
    id: 900, assessmentId: 808, classroomId: 7, studentId: 42, attemptNumber: 1,
    status: 'SUBMITTED', submittedAt: new Date(), percentage: 0, passed: null,
  }, ...Array.from({ length: 500 }, (_, index) => ({
    id: 1000 + index, assessmentId: 9999, classroomId: 999, studentId: 999,
    status: 'SUBMITTED', attemptNumber: 1,
  }))];
  progressRows = Array.from({ length: 5 }, (_, index) => ({
    levelKey: `tutorial-level-${index + 1}`,
    isCompleted: true,
  }));
  assert.equal((await call('arrays')).status, 200);
  assert.deepEqual(counts, { membership: 2, assessment: 2, progress: 2, settings: 2, attempt: 1 });
});
