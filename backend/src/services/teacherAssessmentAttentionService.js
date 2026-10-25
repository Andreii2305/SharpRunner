const { Op } = require("sequelize");
const defaultModels = require("../models");
const {
  ASSESSMENT_TARGET_KINDS,
  ASSESSMENT_TYPES,
} = require("../constants/assessmentConfig");
const {
  ASSESSMENT_GATED_LESSON_KEYS,
  CANONICAL_LESSON_ORDER,
  LESSON_NEXT_ACTIONS,
} = require("../constants/lessonProgressionConfig");
const {
  LESSON_DEFINITIONS,
  PLAYABLE_LEVEL_KEYS,
} = require("../constants/progressDefaults");
const defaultAuthorizationService = require("./assessmentAuthorizationService");
const { AssessmentApiError } = require("./assessmentErrorService");
const {
  buildLessonProgressionStates: defaultBuildProgressionStates,
  resolveRequiredAssessmentDebt: defaultResolveRequiredAssessmentDebt,
} = require("./lessonProgressionService");
const {
  getClassroomLevelSettings: defaultLevelSettingsLoader,
} = require("./classroomLevelSettingsService");

const ASSESSMENT_ATTRIBUTES = Object.freeze([
  "id",
  "classroomId",
  "targetKind",
  "lessonKey",
  "type",
  "title",
  "isRequired",
  "isPublished",
  "maxAttempts",
  "requirePassingForCompletion",
]);
const ATTEMPT_ATTRIBUTES = Object.freeze([
  "id",
  "assessmentId",
  "classroomId",
  "studentId",
  "attemptNumber",
  "status",
  "submittedAt",
  "percentage",
  "passed",
]);
const GRANT_ATTRIBUTES = Object.freeze([
  "id",
  "assessmentId",
  "classroomId",
  "studentId",
  "consumedByAttemptId",
]);
const PROGRESS_ATTRIBUTES = Object.freeze([
  "userId",
  "levelKey",
  "isCompleted",
  "startedAt",
  "progressPercent",
  "attemptCount",
]);

const plain = (value) => value?.get
  ? value.get({ plain: true })
  : value?.toJSON
    ? value.toJSON()
    : value;
const list = (values) => Array.isArray(values) ? values.map(plain) : [];
const sameId = (left, right) => String(left) === String(right);
const appendGrouped = (map, key, value) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
};
const normalizedName = (student) => (
  `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim().toLowerCase()
);

const createTeacherAssessmentAttentionService = ({
  models = defaultModels,
  authorizationService = defaultAuthorizationService,
  buildProgressionStates = defaultBuildProgressionStates,
  resolveRequiredAssessmentDebt = defaultResolveRequiredAssessmentDebt,
  levelSettingsLoader = defaultLevelSettingsLoader,
} = {}) => {
  const {
    AssessmentAttempt,
    AssessmentAttemptGrant,
    ClassroomMembership,
    LessonAssessment,
    User,
    UserProgress,
  } = models;

  const listStudentsNeedingAttention = async ({
    classroomId,
    limit,
    actorId,
    actorRole,
  }) => {
    const classroom = plain(await authorizationService.requireManagedClassroom({
      classroomId,
      actorId,
      actorRole,
    }));
    if (classroom.isActive !== true) {
      throw new AssessmentApiError(409, "CLASSROOM_INACTIVE", "Classroom is inactive");
    }

    const membershipRows = await ClassroomMembership.findAll({
      where: { classroomId, status: "active" },
      attributes: ["studentId"],
      include: [{
        model: User,
        as: "student",
        required: true,
        where: { role: "student", status: "active" },
        attributes: ["id", "firstName", "lastName", "username"],
      }],
    });
    const roster = list(membershipRows)
      .map((membership) => plain(membership.student))
      .filter((student) => student && Number.isSafeInteger(Number(student.id)))
      .map((student) => ({
        id: Number(student.id),
        firstName: student.firstName,
        lastName: student.lastName,
        username: student.username,
      }));

    const classroomPayload = {
      id: classroom.id,
      className: classroom.className,
      section: classroom.section ?? null,
      schoolYear: classroom.schoolYear ?? null,
    };
    if (roster.length === 0) {
      return { classroom: classroomPayload, students: [], total: 0, limit };
    }

    const studentIdSet = new Set(roster.map((student) => String(student.id)));
    const studentIds = roster.map((student) => student.id);
    const [assessmentRows, progressRows, levelSettings] = await Promise.all([
      LessonAssessment.findAll({
        where: {
          classroomId,
          targetKind: ASSESSMENT_TARGET_KINDS.BUILT_IN,
          lessonKey: { [Op.in]: ASSESSMENT_GATED_LESSON_KEYS },
          type: { [Op.in]: [ASSESSMENT_TYPES.PRE, ASSESSMENT_TYPES.POST] },
        },
        attributes: [...ASSESSMENT_ATTRIBUTES],
      }),
      UserProgress.findAll({
        where: {
          userId: { [Op.in]: studentIds },
          levelKey: { [Op.in]: PLAYABLE_LEVEL_KEYS },
        },
        attributes: [...PROGRESS_ATTRIBUTES],
      }),
      levelSettingsLoader(classroomId),
    ]);

    const historicalAssessments = list(assessmentRows).filter((assessment) => (
      sameId(assessment.classroomId, classroomId)
      && assessment.targetKind === ASSESSMENT_TARGET_KINDS.BUILT_IN
      && ASSESSMENT_GATED_LESSON_KEYS.includes(assessment.lessonKey)
      && [ASSESSMENT_TYPES.PRE, ASSESSMENT_TYPES.POST].includes(assessment.type)
    ));
    const publishedAssessments = historicalAssessments.filter(
      (assessment) => assessment.isPublished === true,
    );
    const assessmentIds = historicalAssessments.map((assessment) => assessment.id);
    const assessmentIdSet = new Set(assessmentIds.map(String));

    const [attemptRows, grantRows] = assessmentIds.length > 0
      ? await Promise.all([
          AssessmentAttempt.findAll({
            where: {
              classroomId,
              studentId: { [Op.in]: studentIds },
              assessmentId: { [Op.in]: assessmentIds },
            },
            attributes: [...ATTEMPT_ATTRIBUTES],
          }),
          AssessmentAttemptGrant
            ? AssessmentAttemptGrant.findAll({
                where: {
                  classroomId,
                  studentId: { [Op.in]: studentIds },
                  assessmentId: { [Op.in]: assessmentIds },
                },
                attributes: [...GRANT_ATTRIBUTES],
              })
            : [],
        ])
      : [[], []];

    const progressByStudent = new Map();
    for (const row of list(progressRows)) {
      if (!studentIdSet.has(String(row.userId)) || !PLAYABLE_LEVEL_KEYS.includes(row.levelKey)) continue;
      appendGrouped(progressByStudent, String(row.userId), row);
    }
    const attemptsByStudent = new Map();
    for (const attempt of list(attemptRows)) {
      if (!sameId(attempt.classroomId, classroomId)
        || !studentIdSet.has(String(attempt.studentId))
        || !assessmentIdSet.has(String(attempt.assessmentId))) continue;
      appendGrouped(attemptsByStudent, String(attempt.studentId), attempt);
    }
    const grantsByStudent = new Map();
    for (const grant of list(grantRows)) {
      if (!sameId(grant.classroomId, classroomId)
        || !studentIdSet.has(String(grant.studentId))
        || !assessmentIdSet.has(String(grant.assessmentId))) continue;
      appendGrouped(grantsByStudent, String(grant.studentId), grant);
    }

    const publishedById = new Map(publishedAssessments.map((assessment) => (
      [String(assessment.id), assessment]
    )));
    const lessonTitleByKey = new Map(LESSON_DEFINITIONS.map((lesson) => (
      [lesson.lessonKey, lesson.lessonTitle]
    )));
    const canonicalIndex = new Map(CANONICAL_LESSON_ORDER.map((lessonKey, index) => (
      [lessonKey, index]
    )));

    const affected = [];
    for (const student of roster) {
      const key = String(student.id);
      const states = buildProgressionStates({
        publishedAssessments,
        historicalAssessments,
        attempts: attemptsByStudent.get(key) ?? [],
        grants: grantsByStudent.get(key) ?? [],
        progressRows: progressByStudent.get(key) ?? [],
        levelSettings,
      });
      const reasons = [];
      for (const lessonKey of CANONICAL_LESSON_ORDER) {
        const debt = resolveRequiredAssessmentDebt(states.get(lessonKey));
        if (debt?.kind !== "required-assessment"
          || debt.assessmentType !== ASSESSMENT_TYPES.POST
          || debt.assessmentAction !== LESSON_NEXT_ACTIONS.POST_RECOVERY_REQUIRED
          || debt.routable !== false) continue;
        const assessment = publishedById.get(String(debt.assessmentId));
        if (!assessment || assessment.lessonKey !== lessonKey) continue;
        reasons.push({
          code: LESSON_NEXT_ACTIONS.POST_RECOVERY_REQUIRED,
          assessment: {
            id: assessment.id,
            title: assessment.title,
            type: assessment.type,
          },
          target: {
            kind: ASSESSMENT_TARGET_KINDS.BUILT_IN,
            lessonKey,
            lessonTitle: lessonTitleByKey.get(lessonKey) ?? lessonKey,
          },
          message: `No POST attempts remain for ${assessment.title}; teacher recovery is required.`,
        });
      }
      reasons.sort((left, right) => (
        (canonicalIndex.get(left.target.lessonKey) ?? Number.MAX_SAFE_INTEGER)
          - (canonicalIndex.get(right.target.lessonKey) ?? Number.MAX_SAFE_INTEGER)
        || Number(left.assessment.id) - Number(right.assessment.id)
      ));
      if (reasons.length > 0) affected.push({ ...student, reasons });
    }

    affected.sort((left, right) => {
      const leftName = normalizedName(left);
      const rightName = normalizedName(right);
      if (leftName < rightName) return -1;
      if (leftName > rightName) return 1;
      return Number(left.id) - Number(right.id);
    });

    return {
      classroom: classroomPayload,
      students: affected.slice(0, limit),
      total: affected.length,
      limit,
    };
  };

  return { listStudentsNeedingAttention };
};

const service = createTeacherAssessmentAttentionService();

module.exports = {
  createTeacherAssessmentAttentionService,
  ...service,
};
