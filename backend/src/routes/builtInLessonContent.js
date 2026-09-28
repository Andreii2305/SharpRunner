'use strict';

const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const defaultContentService = require('../services/builtInLessonContentService');
const defaultProgressionService = require('../services/lessonProgressionService');
const defaultStudentClassService = require('../services/studentClassService');
const { AssessmentApiError, sendAssessmentError } = require('../services/assessmentErrorService');

const ROUTE_PATH = '/:classroomId/built-in-lessons/:lessonKey/content';
const LESSON_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const protectedContentCachePolicy = (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  res.vary('Authorization');
  next();
};

const parseClassroomId = (value) => {
  if (!/^[1-9][0-9]*$/.test(String(value || ''))) {
    throw new AssessmentApiError(400, 'INVALID_CLASSROOM_ID', 'Invalid classroom ID');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new AssessmentApiError(400, 'INVALID_CLASSROOM_ID', 'Invalid classroom ID');
  }
  return parsed;
};

const parseLessonKey = (value) => {
  if (typeof value !== 'string' || !LESSON_KEY_PATTERN.test(value)) {
    throw new AssessmentApiError(400, 'INVALID_LESSON_KEY', 'Invalid lesson key');
  }
  return value;
};

const createBuiltInLessonContentRouter = ({
  contentService = defaultContentService,
  progressionService = defaultProgressionService,
  studentClassService = defaultStudentClassService,
} = {}) => {
  const router = express.Router();
  const canonicalKeys = new Set(contentService.CANONICAL_BUILT_IN_LESSON_KEYS || []);

  router.get(
    ROUTE_PATH,
    protectedContentCachePolicy,
    authMiddleware,
    requireRole('student'),
    async (req, res) => {
      try {
        const classroomId = parseClassroomId(req.params.classroomId);
        const lessonKey = parseLessonKey(req.params.lessonKey);
        const authorizedMembership = await studentClassService.requireExactActiveMembership({
          studentId: req.userId,
          classroomId,
        });

        if (!canonicalKeys.has(lessonKey)) {
          throw new AssessmentApiError(
            404,
            'BUILT_IN_LESSON_NOT_FOUND',
            'Built-in lesson was not found',
          );
        }

        await progressionService.assertModuleAccessAllowed({
          classroomId,
          studentId: req.userId,
          lessonKey,
          authorizedMembership,
        });
        const lesson = contentService.getBuiltInLessonContent(lessonKey);
        if (!lesson) {
          throw new AssessmentApiError(
            404,
            'BUILT_IN_LESSON_NOT_FOUND',
            'Built-in lesson was not found',
          );
        }
        return res.status(200).json(contentService.serializeBuiltInLesson(lesson));
      } catch (error) {
        return sendAssessmentError(res, error);
      }
    },
  );

  return router;
};

const router = createBuiltInLessonContentRouter();
router.createBuiltInLessonContentRouter = createBuiltInLessonContentRouter;

module.exports = router;
