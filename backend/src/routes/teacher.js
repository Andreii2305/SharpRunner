const router = require("express").Router();
const { Op } = require("sequelize");
const User = require("../models/User");
const UserProgress = require("../models/UserProgress");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const ClassroomAnnouncement = require("../models/ClassroomAnnouncement");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const {
  LESSON_DEFINITIONS,
  DEFAULT_LEVEL_PROGRESS,
  PLAYABLE_LEVEL_KEYS,
} = require("../constants/progressDefaults");
const { ensureProgressRowsForUser } = require("../services/progressService");
const LevelContentOverride = require("../models/LevelContentOverride");
const ClassroomLesson = require("../models/ClassroomLesson");
const ClassroomLessonAttachment = require("../models/ClassroomLessonAttachment");
const ClassroomLessonProgress = require("../models/ClassroomLessonProgress");
const ClassroomLessonSubmission = require("../models/ClassroomLessonSubmission");
const ClassroomLessonSubmissionAttachment = require("../models/ClassroomLessonSubmissionAttachment");
const ClassroomLessonVersion = require("../models/ClassroomLessonVersion");
const ClassroomLessonAudit = require("../models/ClassroomLessonAudit");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  uploadLessonFiles,
  removeUploadedFiles,
  removeStoredFiles,
  uploadDirectory,
  lessonUploadPolicy,
} = require("../middleware/classroomLessonUpload");
const lessonStorage = require("../services/lessonFileStorageService");

const LEVEL_KEY_SUFFIX = "-level-";
const DEFAULT_SECTION_NAME = "Unassigned";
const MAX_STUDENT_ROWS = 10;
const CLASS_CODE_LENGTH = 6;
const CLASS_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ACTIVE_GAME_HEARTBEAT_WINDOW_MS = 2 * 60 * 1000;
const MAX_ANNOUNCEMENT_LENGTH = 1000;
const MAX_LESSON_TITLE_LENGTH = 160;
const MAX_LESSON_DESCRIPTION_LENGTH = 4000;
const EXPECTED_PROGRESS_ROWS_PER_STUDENT = DEFAULT_LEVEL_PROGRESS.length;
const DEFAULT_LEVEL_KEYS = DEFAULT_LEVEL_PROGRESS.map((level) => level.levelKey);
const LEVEL_KEY_SET = new Set(DEFAULT_LEVEL_KEYS);
const PLAYABLE_LEVEL_KEY_SET = new Set(PLAYABLE_LEVEL_KEYS);

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const parseInteger = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const getLessonKeyFromLevelKey = (levelKey) => {
  const normalized = normalizeString(levelKey).toLowerCase();
  const separatorIndex = normalized.indexOf(LEVEL_KEY_SUFFIX);
  if (separatorIndex <= 0) {
    return null;
  }

  return normalized.slice(0, separatorIndex);
};

const formatRelativeTime = (dateValue) => {
  if (!dateValue) {
    return "No activity yet";
  }

  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) {
    return "No activity yet";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 60 * 1000) {
    return "Active now";
  }

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) {
    return `Active ${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Active ${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Active ${diffDays}d ago`;
};

const randomClassCode = () =>
  Array.from({ length: CLASS_CODE_LENGTH }, () =>
    CLASS_CODE_CHARS.charAt(Math.floor(Math.random() * CLASS_CODE_CHARS.length))
  ).join("");

const createUniqueClassCode = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const classCode = randomClassCode();
    const existing = await Classroom.findOne({
      where: { classCode },
      attributes: ["id"],
    });

    if (!existing) {
      return classCode;
    }
  }

  throw new Error("Unable to generate unique class code");
};

const buildScopeWhere = (req) => {
  const teacherIdQuery = parseInteger(req.query.teacherId);
  if (req.userRole === "admin" && teacherIdQuery) {
    return { teacherId: teacherIdQuery };
  }

  if (req.userRole === "admin") {
    return {};
  }

  return { teacherId: req.userId };
};

const sanitizeClassroom = (classroom, extra = {}) => ({
  id: classroom.id,
  className: classroom.className,
  section: classroom.section,
  schoolYear: classroom.schoolYear,
  maxStudents: classroom.maxStudents,
  description: classroom.description,
  classCode: classroom.classCode,
  teacherId: classroom.teacherId,
  isActive: classroom.isActive,
  createdAt: classroom.createdAt,
  updatedAt: classroom.updatedAt,
  ...extra,
});

const sanitizeAttachment = (attachment) => ({
  id: attachment.id,
  originalName: attachment.originalName,
  mimeType: attachment.mimeType,
  sizeBytes: Number(attachment.sizeBytes),
  displayOrder: attachment.displayOrder ?? 0,
  scanStatus: attachment.scanStatus,
});

const sanitizeClassroomLesson = (lesson) => ({
  id: lesson.id,
  classroomId: lesson.classroomId,
  title: lesson.title,
  contentType: lesson.contentType,
  description: lesson.description,
  dueAt: lesson.dueAt,
  isPublished: lesson.isPublished,
  publishAt: lesson.publishAt,
  allowSubmissions: lesson.allowSubmissions,
  maxScore: lesson.maxScore,
  displayOrder: lesson.displayOrder ?? 0,
  rubric: lesson.rubric ?? [],
  feedbackReleaseAt: lesson.feedbackReleaseAt,
  allowLateSubmissions: lesson.allowLateSubmissions,
  maxAttempts: lesson.maxAttempts,
  allowedFileTypes: lesson.allowedFileTypes ?? [],
  maxFileSizeMb: Math.min(lesson.maxFileSizeMb || lessonUploadPolicy.maxFileSizeMb, lessonUploadPolicy.maxFileSizeMb),
  assignedStudentIds: lesson.assignedStudentIds ?? [],
  version: lesson.version ?? 1,
  stats: lesson.stats,
  createdAt: lesson.createdAt,
  updatedAt: lesson.updatedAt,
  attachments: (lesson.attachments ?? []).map(sanitizeAttachment),
});

const parseLessonOptions = (body) => {
  const contentType = body?.contentType === "assignment" ? "assignment" : "lesson";
  const isPublished = body?.isPublished === undefined ? true : String(body.isPublished) === "true";
  const allowSubmissions = contentType === "assignment";
  let maxScore = Math.min(1000, Math.max(1, Number.parseInt(body?.maxScore, 10) || 100));
  let publishAt = null;
  if (body?.publishAt) {
    publishAt = new Date(body.publishAt);
    if (Number.isNaN(publishAt.getTime())) throw new Error("Publish date must be valid");
  }
  const parseArray = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string" || !value.trim()) return [];
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return value.split(",").map((item) => item.trim()).filter(Boolean); }
  };
  const rubric = contentType === "assignment" ? parseArray(body?.rubric).slice(0, 20).map((item, index) => ({ id: String(item.id || `criterion-${index + 1}`), title: normalizeString(item.title).slice(0, 120), points: Math.max(1, Number.parseInt(item.points, 10) || 1) })).filter((item) => item.title) : [];
  if (rubric.length) maxScore = Math.min(1000, rubric.reduce((sum, item) => sum + item.points, 0));
  const assignedStudentIds = contentType === "assignment" ? [...new Set(parseArray(body?.assignedStudentIds).map(parseInteger).filter(Boolean))] : [];
  const allowedFileTypes = contentType === "assignment" ? [...new Set(parseArray(body?.allowedFileTypes).map((item) => String(item).toLowerCase().replace(/^\./, "")).filter(Boolean))].slice(0, 30) : [];
  let feedbackReleaseAt = null;
  if (body?.feedbackReleaseAt) { feedbackReleaseAt = new Date(body.feedbackReleaseAt); if (Number.isNaN(feedbackReleaseAt.getTime())) throw new Error("Feedback release date must be valid"); }
  return {
    contentType, isPublished, allowSubmissions, maxScore, publishAt, rubric, assignedStudentIds, allowedFileTypes,
    feedbackReleaseAt: contentType === "assignment" ? feedbackReleaseAt : null,
    allowLateSubmissions: contentType === "assignment" ? String(body?.allowLateSubmissions) !== "false" : true,
    maxAttempts: contentType === "assignment" ? Math.min(100, Math.max(0, Number.parseInt(body?.maxAttempts, 10) || 0)) : 0,
    maxFileSizeMb: contentType === "assignment"
      ? Math.min(lessonUploadPolicy.maxFileSizeMb, Math.max(1, Number.parseInt(body?.maxFileSizeMb, 10) || lessonUploadPolicy.maxFileSizeMb))
      : lessonUploadPolicy.maxFileSizeMb,
  };
};

const lessonSnapshot = (lesson) => ({
  title: lesson.title, description: lesson.description, contentType: lesson.contentType, dueAt: lesson.dueAt,
  isPublished: lesson.isPublished, publishAt: lesson.publishAt, maxScore: lesson.maxScore, rubric: lesson.rubric,
  feedbackReleaseAt: lesson.feedbackReleaseAt, allowLateSubmissions: lesson.allowLateSubmissions, maxAttempts: lesson.maxAttempts,
  allowedFileTypes: lesson.allowedFileTypes, maxFileSizeMb: lesson.maxFileSizeMb, assignedStudentIds: lesson.assignedStudentIds,
});
const recordLessonAudit = (req, classroomId, lessonId, action, metadata = {}) => ClassroomLessonAudit.create({ classroomId, lessonId, actorId: req.userId, action, metadata });

const formatTeacherName = (user) => {
  if (!user) {
    return "Teacher";
  }

  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return fullName || user.username || "Teacher";
};

const buildDefaultLessonStats = () =>
  LESSON_DEFINITIONS.map((lesson) => ({
    lessonKey: lesson.lessonKey,
    lessonTitle: lesson.lessonTitle,
    completionPercent: 0,
    difficultyScore: 100,
  }));

const buildDashboardPayload = async (req) => {
  const scopeWhere = buildScopeWhere(req);
  const classrooms = await Classroom.findAll({
    where: scopeWhere,
    attributes: [
      "id",
      "className",
      "section",
      "schoolYear",
      "maxStudents",
      "description",
      "classCode",
      "teacherId",
      "isActive",
      "createdAt",
    ],
    order: [["createdAt", "DESC"]],
  });

  if (classrooms.length === 0) {
    const completionByLesson = buildDefaultLessonStats();
    return {
      overview: {
        totalStudents: 0,
        totalClassrooms: 0,
        averageProgressPercent: 0,
        activeStudentsToday: 0,
      },
      classPerformance: [],
      studentPerformance: [],
      lessonInsights: {
        mostCompletedLesson: null,
        mostDifficultLesson: null,
        averageTimePerLessonLabel: "Not enough data",
        completionByLesson,
        difficultyByLesson: completionByLesson.map((lesson) => ({
          lessonKey: lesson.lessonKey,
          lessonTitle: lesson.lessonTitle,
          difficultyScore: lesson.difficultyScore,
        })),
      },
    };
  }

  const classroomIds = classrooms.map((classroom) => classroom.id);
  const memberships = await ClassroomMembership.findAll({
    where: {
      classroomId: { [Op.in]: classroomIds },
      status: "active",
    },
    attributes: ["classroomId", "studentId", "joinedAt", "updatedAt"],
    order: [["updatedAt", "DESC"]],
  });

  const studentIds = Array.from(new Set(memberships.map((membership) => membership.studentId)));
  const students = studentIds.length
    ? await User.findAll({
        where: {
          id: { [Op.in]: studentIds },
          role: "student",
        },
        attributes: [
          "id",
          "firstName",
          "lastName",
          "username",
          "status",
          "isPlayingGame",
          "lastGameHeartbeatAt",
          "createdAt",
          "updatedAt",
        ],
      })
    : [];

  const studentsById = new Map(students.map((student) => [student.id, student]));
  const validMemberships = memberships.filter((membership) =>
    studentsById.has(membership.studentId)
  );

  const validStudentIds = Array.from(
    new Set(validMemberships.map((membership) => membership.studentId))
  );

  if (validStudentIds.length > 0) {
    const progressRowCounts = await UserProgress.findAll({
      where: {
        userId: { [Op.in]: validStudentIds },
        levelKey: { [Op.in]: DEFAULT_LEVEL_KEYS },
      },
      attributes: [
        "userId",
        [
          UserProgress.sequelize.fn("COUNT", UserProgress.sequelize.col("id")),
          "rowCount",
        ],
      ],
      group: ["userId"],
      raw: true,
    });

    const progressRowCountByUserId = new Map(
      progressRowCounts.map((row) => [
        Number(row.userId),
        Number(row.rowCount) || 0,
      ])
    );

    const studentsMissingProgressRows = validStudentIds.filter(
      (studentId) =>
        (progressRowCountByUserId.get(studentId) ?? 0) <
        EXPECTED_PROGRESS_ROWS_PER_STUDENT
    );

    for (const studentId of studentsMissingProgressRows) {
      await ensureProgressRowsForUser(studentId);
    }
  }

  const progressRows = validStudentIds.length
    ? await UserProgress.findAll({
        where: {
          userId: { [Op.in]: validStudentIds },
          levelKey: { [Op.in]: DEFAULT_LEVEL_KEYS },
        },
        attributes: ["userId", "levelKey", "progressPercent", "isCompleted", "finalScore", "updatedAt"],
      })
    : [];

  const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]));
  const firstMembershipByStudent = new Map();
  const studentIdsByClassroom = new Map(classroomIds.map((id) => [id, new Set()]));

  for (const membership of validMemberships) {
    if (!firstMembershipByStudent.has(membership.studentId)) {
      firstMembershipByStudent.set(membership.studentId, membership);
    }

    studentIdsByClassroom.get(membership.classroomId)?.add(membership.studentId);
  }

  const studentStatsById = new Map();
  const lessonStatsByKey = new Map(
    LESSON_DEFINITIONS.map((lesson) => [
      lesson.lessonKey,
      {
        lessonKey: lesson.lessonKey,
        lessonTitle: lesson.lessonTitle,
        totalProgress: 0,
        progressCount: 0,
      },
    ])
  );

  for (const row of progressRows) {
    if (!studentStatsById.has(row.userId)) {
      studentStatsById.set(row.userId, {
        totalProgress: 0,
        levelCount: 0,
        completedLevels: 0,
        lastProgressAt: null,
        totalScore: 0,
        scoredLevels: 0,
      });
    }

    const stats = studentStatsById.get(row.userId);
    stats.totalProgress += row.progressPercent;
    stats.levelCount += 1;
    if (row.isCompleted) {
      stats.completedLevels += 1;
      if (row.finalScore != null) {
        stats.totalScore += row.finalScore;
        stats.scoredLevels += 1;
      }
    }

    if (!stats.lastProgressAt || new Date(row.updatedAt) > new Date(stats.lastProgressAt)) {
      stats.lastProgressAt = row.updatedAt;
    }

    const lessonKey = getLessonKeyFromLevelKey(row.levelKey);
    if (!lessonKey || !lessonStatsByKey.has(lessonKey)) {
      continue;
    }

    const lessonStats = lessonStatsByKey.get(lessonKey);
    lessonStats.totalProgress += row.progressPercent;
    lessonStats.progressCount += 1;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const now = Date.now();

  const studentPerformanceRows = validStudentIds.map((studentId) => {
    const student = studentsById.get(studentId);
    const stats = studentStatsById.get(studentId) ?? {
      totalProgress: 0,
      levelCount: 0,
      completedLevels: 0,
      lastProgressAt: null,
      totalScore: 0,
      scoredLevels: 0,
    };
    const firstMembership = firstMembershipByStudent.get(studentId);
    const classroom = firstMembership
      ? classroomById.get(firstMembership.classroomId)
      : null;
    const progressPercent =
      stats.levelCount === 0 ? 0 : Math.round(stats.totalProgress / stats.levelCount);
    const lastActivityAt =
      stats.lastProgressAt ?? firstMembership?.updatedAt ?? student.updatedAt ?? student.createdAt;
    const status = normalizeString(student.status).toLowerCase() || "active";
    const heartbeatAt = student.lastGameHeartbeatAt
      ? new Date(student.lastGameHeartbeatAt).getTime()
      : null;
    const hasRecentHeartbeat =
      Number.isFinite(heartbeatAt) && now - heartbeatAt <= ACTIVE_GAME_HEARTBEAT_WINDOW_MS;
    const isCurrentlyPlaying = status === "active" && student.isPlayingGame && hasRecentHeartbeat;
    const isActiveToday =
      isCurrentlyPlaying &&
      Number.isFinite(heartbeatAt) &&
      heartbeatAt >= todayStart.getTime();

    return {
      userId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      username: student.username,
      section: classroom?.section ?? DEFAULT_SECTION_NAME,
      classroomName: classroom?.className ?? "No classroom",
      progressPercent,
      avgScore: stats.scoredLevels > 0
        ? Math.round(stats.totalScore / stats.scoredLevels * 10) / 10
        : null,
      badgesCount: Math.floor(stats.completedLevels / 5),
      completedLevels: stats.completedLevels,
      status,
      statusLabel:
        status === "inactive"
          ? "Inactive"
          : isCurrentlyPlaying
            ? "Playing"
            : "Online",
      lastActivityAt,
      lastActiveLabel: isCurrentlyPlaying ? "Playing now" : formatRelativeTime(lastActivityAt),
      isActiveToday,
      isCurrentlyPlaying,
    };
  });

  const progressByStudentId = new Map(
    studentPerformanceRows.map((student) => [student.userId, student.progressPercent])
  );

  const classPerformance = classrooms.map((classroom) => {
    const classStudentIds = Array.from(studentIdsByClassroom.get(classroom.id) ?? []);
    const classProgressValues = classStudentIds
      .map((studentId) => progressByStudentId.get(studentId))
      .filter((value) => Number.isFinite(value));
    const averageProgressPercent =
      classProgressValues.length === 0
        ? 0
        : Math.round(
            classProgressValues.reduce((sum, value) => sum + value, 0) /
              classProgressValues.length
          );

    return {
      classId: classroom.id,
      className: classroom.className,
      section: classroom.section,
      schoolYear: classroom.schoolYear,
      maxStudents: classroom.maxStudents,
      description: classroom.description,
      classCode: classroom.classCode,
      isActive: classroom.isActive,
      studentCount: classStudentIds.length,
      averageProgressPercent,
    };
  });

  const averageProgressPercent =
    studentPerformanceRows.length === 0
      ? 0
      : Math.round(
          studentPerformanceRows.reduce((sum, student) => sum + student.progressPercent, 0) /
            studentPerformanceRows.length
        );

  const activeStudentsToday = studentPerformanceRows.filter(
    (student) => student.isActiveToday
  ).length;

  const rankedStudents = [...studentPerformanceRows]
    .sort((a, b) => {
      if (b.progressPercent !== a.progressPercent) {
        return b.progressPercent - a.progressPercent;
      }

      return b.completedLevels - a.completedLevels;
    })
    .slice(0, MAX_STUDENT_ROWS)
    .map((student, index) => ({
      rank: index + 1,
      ...student,
    }));

  const completionByLesson = Array.from(lessonStatsByKey.values()).map((lessonStats) => {
    const completionPercent =
      lessonStats.progressCount === 0
        ? 0
        : Math.round(lessonStats.totalProgress / lessonStats.progressCount);

    return {
      lessonKey: lessonStats.lessonKey,
      lessonTitle: lessonStats.lessonTitle,
      completionPercent,
      difficultyScore: Math.max(0, 100 - completionPercent),
    };
  });

  const hasAnyLessonProgress = completionByLesson.some(
    (lesson) => lesson.completionPercent > 0
  );
  const sortedByCompletion = [...completionByLesson].sort(
    (a, b) => b.completionPercent - a.completionPercent
  );
  const sortedByDifficulty = [...completionByLesson].sort(
    (a, b) => b.difficultyScore - a.difficultyScore
  );

  return {
    overview: {
      totalStudents: studentPerformanceRows.length,
      totalClassrooms: classrooms.length,
      averageProgressPercent,
      activeStudentsToday,
    },
    classPerformance,
    studentPerformance: rankedStudents,
    lessonInsights: {
      mostCompletedLesson: hasAnyLessonProgress ? sortedByCompletion[0] : null,
      mostDifficultLesson: hasAnyLessonProgress ? sortedByDifficulty[0] : null,
      averageTimePerLessonLabel: "Not enough data",
      completionByLesson,
      difficultyByLesson: completionByLesson.map((lesson) => ({
        lessonKey: lesson.lessonKey,
        lessonTitle: lesson.lessonTitle,
        difficultyScore: lesson.difficultyScore,
      })),
    },
  };
};

router.use(authMiddleware, requireRole("teacher", "admin"));

router.get("/dashboard", async (req, res) => {
  try {
    const payload = await buildDashboardPayload(req);
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/students/:studentId/grades", async (req, res) => {
  try {
    const studentId = parseInteger(req.params.studentId);
    if (!studentId) return res.status(400).json({ message: "Invalid student ID" });

    const scopeWhere = buildScopeWhere(req);
    const classrooms = await Classroom.findAll({ where: scopeWhere, attributes: ["id"] });
    const classroomIds = classrooms.map((c) => c.id);

    const membership = await ClassroomMembership.findOne({
      where: { studentId, classroomId: { [Op.in]: classroomIds }, status: "active" },
    });
    if (!membership) return res.status(403).json({ message: "Student not in your classroom" });

    const rows = await UserProgress.findAll({
      where: { userId: studentId, levelKey: { [Op.in]: DEFAULT_LEVEL_KEYS } },
      attributes: ["levelKey", "orderIndex", "isCompleted", "attemptCount", "timeSpentSeconds", "finalScore", "completedAt"],
      order: [["orderIndex", "ASC"]],
    });

    const student = await User.findByPk(studentId, { attributes: ["firstName", "lastName", "username"] });
    const studentName = student ? `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || student.username : "Student";

    return res.json({
      studentName,
      grades: rows.map((r) => ({
        levelKey: r.levelKey,
        orderIndex: r.orderIndex,
        isCompleted: r.isCompleted,
        attemptCount: r.attemptCount,
        timeSpentSeconds: r.timeSpentSeconds,
        finalScore: r.finalScore,
        completedAt: r.completedAt,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/classrooms", async (req, res) => {
  try {
    const scopeWhere = buildScopeWhere(req);
    const classrooms = await Classroom.findAll({
      where: scopeWhere,
      order: [["createdAt", "DESC"]],
    });

    if (classrooms.length === 0) {
      return res.json({ total: 0, classrooms: [] });
    }

    const classIds = classrooms.map((classroom) => classroom.id);
    const memberships = await ClassroomMembership.findAll({
      where: {
        classroomId: { [Op.in]: classIds },
        status: "active",
      },
      attributes: ["classroomId", "studentId"],
    });

    const studentCountByClassId = new Map();
    for (const membership of memberships) {
      if (!studentCountByClassId.has(membership.classroomId)) {
        studentCountByClassId.set(membership.classroomId, new Set());
      }

      studentCountByClassId.get(membership.classroomId).add(membership.studentId);
    }

    const responseRows = classrooms.map((classroom) => {
      const studentSet = studentCountByClassId.get(classroom.id);
      return sanitizeClassroom(classroom, {
        studentCount: studentSet ? studentSet.size : 0,
      });
    });

    return res.json({
      total: responseRows.length,
      classrooms: responseRows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/classrooms", async (req, res) => {
  try {
    const className = normalizeString(req.body.className);
    const section = normalizeString(req.body.section);
    const schoolYear = normalizeString(req.body.schoolYear);
    const description = normalizeString(req.body.description);
    const maxStudentsRaw = req.body.maxStudents;
    const hasMaxStudentsValue =
      maxStudentsRaw !== undefined && `${maxStudentsRaw}`.trim() !== "";
    const parsedMaxStudents = hasMaxStudentsValue
      ? Number.parseInt(maxStudentsRaw, 10)
      : null;
    const requestedTeacherId = parseInteger(req.body.teacherId);

    if (!className) {
      return res.status(400).json({ message: "className is required" });
    }

    if (!section) {
      return res.status(400).json({ message: "section is required" });
    }

    if (!schoolYear) {
      return res.status(400).json({ message: "schoolYear is required" });
    }

    if (
      hasMaxStudentsValue &&
      (!Number.isInteger(parsedMaxStudents) || parsedMaxStudents <= 0)
    ) {
      return res.status(400).json({
        message: "maxStudents must be a positive integer",
      });
    }

    const teacherId =
      req.userRole === "admin" && requestedTeacherId ? requestedTeacherId : req.userId;
    const teacherUser = await User.findByPk(teacherId, {
      attributes: ["id", "role", "status"],
    });

    if (!teacherUser || !["teacher", "admin"].includes(teacherUser.role)) {
      return res.status(404).json({ message: "Teacher account not found" });
    }

    if (teacherUser.status === "inactive") {
      return res.status(400).json({ message: "Cannot assign classroom to inactive teacher" });
    }

    const classCode = await createUniqueClassCode();
    const classroom = await Classroom.create({
      teacherId,
      className,
      section,
      schoolYear,
      maxStudents: hasMaxStudentsValue ? parsedMaxStudents : null,
      description: description || null,
      classCode,
      isActive: true,
    });

    return res.status(201).json({
      message: "Classroom created successfully",
      classroom: sanitizeClassroom(classroom, {
        studentCount: 0,
      }),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/classrooms/:classroomId", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) return res.status(400).json({ message: "Invalid classroom id" });

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "You are not allowed to update this classroom" });
    }
    if (typeof req.body?.isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }

    classroom.isActive = req.body.isActive;
    await classroom.save();
    return res.json({
      message: classroom.isActive ? "Classroom reactivated" : "Classroom archived",
      classroom: sanitizeClassroom(classroom),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/classrooms/:classroomId/regenerate-code", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) return res.status(400).json({ message: "Invalid classroom id" });

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "You are not allowed to update this classroom" });
    }
    if (!classroom.isActive) {
      return res.status(409).json({ message: "Reactivate the classroom before rotating its code" });
    }

    classroom.classCode = await createUniqueClassCode();
    await classroom.save();
    return res.json({
      message: "Class code regenerated. The previous code no longer works.",
      classroom: sanitizeClassroom(classroom),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/classrooms/:classroomId/students", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) {
      return res.status(400).json({ message: "Invalid classroom id" });
    }

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "You are not allowed to update this classroom" });
    }

    const studentIds = Array.isArray(req.body.studentIds)
      ? req.body.studentIds.map(parseInteger).filter(Boolean)
      : [];
    const studentUsernames = Array.isArray(req.body.studentUsernames)
      ? req.body.studentUsernames
          .map((username) => normalizeString(username).toLowerCase())
          .filter(Boolean)
      : [];

    if (studentIds.length === 0 && studentUsernames.length === 0) {
      return res.status(400).json({
        message: "Provide studentIds or studentUsernames to add students",
      });
    }

    const idCondition =
      studentIds.length > 0 ? [{ id: { [Op.in]: studentIds } }] : [];
    const usernameConditions = studentUsernames.map((username) => ({
      username: { [Op.iLike]: username },
    }));

    const students = await User.findAll({
      where: {
        role: "student",
        status: "active",
        [Op.or]: [...idCondition, ...usernameConditions],
      },
      attributes: ["id", "username"],
    });

    if (students.length === 0) {
      return res.status(404).json({ message: "No matching active students found" });
    }

    let activatedCount = 0;
    for (const student of students) {
      const existingMembership = await ClassroomMembership.findOne({
        where: {
          classroomId,
          studentId: student.id,
        },
      });

      if (!existingMembership) {
        await ClassroomMembership.create({
          classroomId,
          studentId: student.id,
          status: "active",
        });
        activatedCount += 1;
        continue;
      }

      if (existingMembership.status !== "active") {
        existingMembership.status = "active";
        await existingMembership.save();
        activatedCount += 1;
      }
    }

    return res.json({
      message: "Students added to classroom",
      activatedCount,
      totalMatchedStudents: students.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/classrooms/:classroomId/students/:studentId", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const studentId = parseInteger(req.params.studentId);
    if (!classroomId || !studentId) {
      return res.status(400).json({ message: "Invalid classroom or student id" });
    }

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "You are not allowed to update this classroom" });
    }

    const status = normalizeString(req.body?.status).toLowerCase();
    if (!["active", "removed"].includes(status)) {
      return res.status(400).json({ message: "status must be active or removed" });
    }

    const membership = await ClassroomMembership.findOne({
      where: { classroomId, studentId },
    });
    if (!membership) return res.status(404).json({ message: "Classroom membership not found" });

    membership.status = status;
    if (status === "active") membership.joinedAt = membership.joinedAt ?? new Date();
    await membership.save();
    return res.json({
      message: status === "active" ? "Student membership reactivated" : "Student removed from classroom",
      membership: { classroomId, studentId, status: membership.status },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/announcements", async (req, res) => {
  try {
    const scopeWhere = buildScopeWhere(req);
    const classrooms = await Classroom.findAll({
      where: {
        ...scopeWhere,
        isActive: true,
      },
      attributes: ["id", "className", "section", "schoolYear", "classCode"],
      order: [
        ["className", "ASC"],
        ["section", "ASC"],
      ],
    });

    if (classrooms.length === 0) {
      return res.json({
        classrooms: [],
        announcements: [],
      });
    }

    const classroomIds = classrooms.map((classroom) => classroom.id);
    const announcementRows = await ClassroomAnnouncement.findAll({
      where: {
        classroomId: { [Op.in]: classroomIds },
        isActive: true,
      },
      attributes: ["id", "classroomId", "teacherId", "message", "createdAt"],
      include: [
        {
          model: Classroom,
          as: "classroom",
          required: true,
          attributes: ["id", "className", "section"],
        },
        {
          model: User,
          as: "teacher",
          required: false,
          attributes: ["id", "firstName", "lastName", "username"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 100,
    });

    return res.json({
      classrooms: classrooms.map((classroom) => ({
        id: classroom.id,
        className: classroom.className,
        section: classroom.section,
        schoolYear: classroom.schoolYear,
        classCode: classroom.classCode,
      })),
      announcements: announcementRows.map((announcement) => ({
        id: announcement.id,
        classroomId: announcement.classroomId,
        className: announcement.classroom?.className ?? "Classroom",
        section: announcement.classroom?.section ?? "",
        message: announcement.message,
        createdAt: announcement.createdAt,
        teacherName: formatTeacherName(announcement.teacher),
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/announcements", async (req, res) => {
  try {
    const classroomId = parseInteger(req.body.classroomId);
    const message = normalizeString(req.body.message);

    if (!classroomId) {
      return res.status(400).json({ message: "classroomId is required" });
    }

    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }

    if (message.length > MAX_ANNOUNCEMENT_LENGTH) {
      return res.status(400).json({
        message: `message must not exceed ${MAX_ANNOUNCEMENT_LENGTH} characters`,
      });
    }

    const classroom = await Classroom.findByPk(classroomId, {
      attributes: ["id", "teacherId", "className", "section", "isActive"],
    });

    if (!classroom || !classroom.isActive) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "You are not allowed to post to this classroom" });
    }

    const announcement = await ClassroomAnnouncement.create({
      classroomId: classroom.id,
      teacherId: req.userId,
      message,
      isActive: true,
    });

    const actor = await User.findByPk(req.userId, {
      attributes: ["id", "firstName", "lastName", "username"],
    });

    return res.status(201).json({
      message: "Announcement posted",
      announcement: {
        id: announcement.id,
        classroomId: announcement.classroomId,
        className: classroom.className,
        section: classroom.section,
        message: announcement.message,
        createdAt: announcement.createdAt,
        teacherName: formatTeacherName(actor),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/classrooms/:classroomId/students", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) return res.status(400).json({ message: "Invalid classroom id" });

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const memberships = await ClassroomMembership.findAll({
      where: { classroomId, status: "active" },
      attributes: ["studentId", "joinedAt"],
    });

    const studentIds = memberships.map((m) => m.studentId);
    if (studentIds.length === 0) {
      return res.json({ classroom: sanitizeClassroom(classroom), students: [] });
    }

    const students = await User.findAll({
      where: { id: { [Op.in]: studentIds }, role: "student" },
      attributes: [
        "id",
        "firstName",
        "lastName",
        "username",
        "status",
        "isPlayingGame",
        "lastGameHeartbeatAt",
        "createdAt",
      ],
    });

    const progressRows = await UserProgress.findAll({
      where: {
        userId: { [Op.in]: studentIds },
        levelKey: { [Op.in]: DEFAULT_LEVEL_KEYS },
      },
      attributes: ["userId", "progressPercent", "isCompleted", "finalScore", "updatedAt"],
    });

    const statsByUserId = new Map();
    for (const row of progressRows) {
      if (!statsByUserId.has(row.userId)) {
        statsByUserId.set(row.userId, {
          totalProgress: 0,
          levelCount: 0,
          completedLevels: 0,
          totalScore: 0,
          scoredLevels: 0,
          lastProgressAt: null,
        });
      }
      const s = statsByUserId.get(row.userId);
      s.totalProgress += row.progressPercent;
      s.levelCount += 1;
      if (row.isCompleted) {
        s.completedLevels += 1;
        if (row.finalScore != null) {
          s.totalScore += row.finalScore;
          s.scoredLevels += 1;
        }
      }
      if (!s.lastProgressAt || new Date(row.updatedAt) > new Date(s.lastProgressAt)) {
        s.lastProgressAt = row.updatedAt;
      }
    }

    const joinedAtByStudentId = new Map(memberships.map((m) => [m.studentId, m.joinedAt]));
    const now = Date.now();

    const studentsData = students
      .map((student) => {
        const stats = statsByUserId.get(student.id) ?? {
          totalProgress: 0,
          levelCount: 0,
          completedLevels: 0,
          totalScore: 0,
          scoredLevels: 0,
          lastProgressAt: null,
        };
        const progressPercent =
          stats.levelCount === 0 ? 0 : Math.round(stats.totalProgress / stats.levelCount);
        const heartbeatAt = student.lastGameHeartbeatAt
          ? new Date(student.lastGameHeartbeatAt).getTime()
          : null;
        const hasRecentHeartbeat =
          Number.isFinite(heartbeatAt) && now - heartbeatAt <= ACTIVE_GAME_HEARTBEAT_WINDOW_MS;
        const isCurrentlyPlaying =
          normalizeString(student.status).toLowerCase() === "active" &&
          student.isPlayingGame &&
          hasRecentHeartbeat;
        const lastActivityAt =
          stats.lastProgressAt ?? joinedAtByStudentId.get(student.id) ?? student.createdAt;

        return {
          userId: student.id,
          studentName:
            `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || student.username,
          username: student.username,
          progressPercent,
          completedLevels: stats.completedLevels,
          avgScore:
            stats.scoredLevels > 0
              ? Math.round((stats.totalScore / stats.scoredLevels) * 10) / 10
              : null,
          status: normalizeString(student.status).toLowerCase() || "active",
          isCurrentlyPlaying,
          lastActiveLabel: isCurrentlyPlaying ? "Playing now" : formatRelativeTime(lastActivityAt),
          joinedAt: joinedAtByStudentId.get(student.id),
        };
      })
      .sort((a, b) => b.progressPercent - a.progressPercent);

    return res.json({ classroom: sanitizeClassroom(classroom), students: studentsData });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/classrooms/:classroomId/lessons", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) return res.status(400).json({ message: "Invalid classroom id" });

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const lessons = await ClassroomLesson.findAll({
      where: { classroomId },
      include: [{ model: ClassroomLessonAttachment, as: "attachments", attributes: ["id", "originalName", "mimeType", "sizeBytes", "displayOrder"] }],
      order: [["createdAt", "DESC"]],
    });
    const [progressRows, submissionRows] = await Promise.all([
      ClassroomLessonProgress.findAll({ where: { classroomId }, attributes: ["lessonId", "viewedAt", "completedAt"] }),
      ClassroomLessonSubmission.findAll({ where: { classroomId }, attributes: ["lessonId", "status", "submittedAt"] }),
    ]);
    for (const lesson of lessons) {
      const progress = progressRows.filter((row) => row.lessonId === lesson.id);
      const submissions = submissionRows.filter((row) => row.lessonId === lesson.id);
      lesson.stats = {
        viewed: progress.filter((row) => row.viewedAt).length,
        completed: progress.filter((row) => row.completedAt).length,
        submitted: submissions.length,
        graded: submissions.filter((row) => row.status === "graded").length,
        late: lesson.dueAt ? submissions.filter((row) => new Date(row.submittedAt) > new Date(lesson.dueAt)).length : 0,
      };
      lesson.attachments?.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.id - b.id);
    }

    return res.json({ classroom: sanitizeClassroom(classroom), lessons: lessons.map(sanitizeClassroomLesson), storageMode: lessonStorage.storageMode(), uploadPolicy: lessonUploadPolicy });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/classrooms/:classroomId/classwork-management", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId); const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const [lessonBytes, submissionBytes, audits, assignments, memberships, submissions] = await Promise.all([
      ClassroomLessonAttachment.sum("sizeBytes", { where: { classroomId } }), ClassroomLessonSubmissionAttachment.sum("sizeBytes", { where: { classroomId } }),
      ClassroomLessonAudit.findAll({ where: { classroomId }, include: [{ model: User, as: "actor", attributes: ["id", "firstName", "lastName", "username"] }], order: [["createdAt", "DESC"]], limit: 50 }),
      ClassroomLesson.findAll({ where: { classroomId, contentType: "assignment" }, attributes: ["id", "title", "dueAt", "assignedStudentIds", "maxScore"] }),
      ClassroomMembership.findAll({ where: { classroomId, status: "active" }, attributes: ["studentId"] }),
      ClassroomLessonSubmission.findAll({ where: { classroomId }, attributes: ["lessonId", "studentId", "status", "grade", "submittedAt"] }),
    ]);
    const attention = memberships.map((membership) => {
      const assigned = assignments.filter((assignment) => !assignment.assignedStudentIds?.length || assignment.assignedStudentIds.includes(membership.studentId));
      const studentRows = submissions.filter((submission) => submission.studentId === membership.studentId);
      return { studentId: membership.studentId, missing: assigned.filter((assignment) => !studentRows.some((submission) => submission.lessonId === assignment.id)).length, submitted: studentRows.length, averageGrade: studentRows.filter((row) => row.grade != null).length ? Math.round(studentRows.filter((row) => row.grade != null).reduce((sum, row) => sum + row.grade, 0) / studentRows.filter((row) => row.grade != null).length) : null };
    }).sort((a, b) => b.missing - a.missing);
    return res.json({ storage: { usedBytes: Number(lessonBytes || 0) + Number(submissionBytes || 0), lessonBytes: Number(lessonBytes || 0), submissionBytes: Number(submissionBytes || 0) }, audits, insights: { assignments: assignments.length, submissions: submissions.length, graded: submissions.filter((row) => row.status === "graded").length, late: submissions.filter((row) => { const assignment = assignments.find((item) => item.id === row.lessonId); return assignment?.dueAt && new Date(row.submittedAt) > new Date(assignment.dueAt); }).length, attention } });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.get("/classrooms/:classroomId/lessons/:lessonId/versions", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId); const lessonId = parseInteger(req.params.lessonId); const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const versions = await ClassroomLessonVersion.findAll({ where: { classroomId, lessonId }, include: [{ model: User, as: "editor", attributes: ["id", "firstName", "lastName", "username"] }], order: [["versionNumber", "DESC"], ["createdAt", "DESC"]] });
    return res.json({ versions });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.post("/classrooms/:classroomId/lessons/:lessonId/versions/:versionId/restore", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId); const lessonId = parseInteger(req.params.lessonId); const versionId = parseInteger(req.params.versionId); const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const lesson = await ClassroomLesson.findOne({ where: { id: lessonId, classroomId }, include: [{ model: ClassroomLessonAttachment, as: "attachments", attributes: ["id", "originalName", "mimeType", "sizeBytes", "displayOrder", "scanStatus"] }] });
    const version = await ClassroomLessonVersion.findOne({ where: { id: versionId, lessonId, classroomId } });
    if (!lesson || !version) return res.status(404).json({ message: "Version not found" });
    await ClassroomLessonVersion.create({ classroomId, lessonId, editorId: req.userId, versionNumber: lesson.version || 1, snapshot: lessonSnapshot(lesson) });
    Object.assign(lesson, version.snapshot, { version: (lesson.version || 1) + 1 }); await lesson.save();
    await recordLessonAudit(req, classroomId, lessonId, "restored_version", { restoredVersion: version.versionNumber, newVersion: lesson.version });
    return res.json({ message: "Version restored", lesson: sanitizeClassroomLesson(lesson) });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.post("/classrooms/:classroomId/lessons/:lessonId/release-feedback", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId); const lessonId = parseInteger(req.params.lessonId); const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const lesson = await ClassroomLesson.findOne({ where: { id: lessonId, classroomId, contentType: "assignment" } });
    if (!lesson) return res.status(404).json({ message: "Assignment not found" });
    lesson.feedbackReleaseAt = new Date(); await lesson.save(); await recordLessonAudit(req, classroomId, lessonId, "released_feedback");
    return res.json({ message: "Feedback released", feedbackReleaseAt: lesson.feedbackReleaseAt });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.post("/classrooms/:classroomId/lessons", uploadLessonFiles, async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ message: "Invalid classroom id" });
    }

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) {
      await removeUploadedFiles(req.files);
      return res.status(404).json({ message: "Classroom not found" });
    }
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      await removeUploadedFiles(req.files);
      return res.status(403).json({ message: "Access denied" });
    }

    const title = normalizeString(req.body?.title);
    const description = normalizeString(req.body?.description);
    if (!title) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ message: "Lesson title is required" });
    }
    if (title.length > MAX_LESSON_TITLE_LENGTH) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ message: `Lesson title must not exceed ${MAX_LESSON_TITLE_LENGTH} characters` });
    }
    if (description.length > MAX_LESSON_DESCRIPTION_LENGTH) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ message: `Lesson description must not exceed ${MAX_LESSON_DESCRIPTION_LENGTH} characters` });
    }

    let dueAt = null;
    if (req.body?.dueAt) {
      dueAt = new Date(req.body.dueAt);
      if (Number.isNaN(dueAt.getTime())) {
        await removeUploadedFiles(req.files);
        return res.status(400).json({ message: "Due date must be valid" });
      }
    }

    let options;
    try { options = parseLessonOptions(req.body); } catch (optionError) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ message: optionError.message });
    }
    if (options.assignedStudentIds.length) {
      const audienceCount = await ClassroomMembership.count({ where: { classroomId, studentId: { [Op.in]: options.assignedStudentIds }, status: "active" } });
      if (audienceCount !== options.assignedStudentIds.length) { await removeUploadedFiles(req.files); return res.status(400).json({ message: "Assignment audience contains students outside this class" }); }
    }
    const lesson = await ClassroomLesson.create({
      classroomId,
      title,
      description: description || null,
      dueAt: options.contentType === "assignment" ? dueAt : null,
      ...options,
      displayOrder: await ClassroomLesson.count({ where: { classroomId } }),
    });

    const attachments = [];
    for (const [index, file] of (req.files ?? []).entries()) {
      const stored = await lessonStorage.uploadFile(file, `classrooms/${classroomId}/lessons/${lesson.id}`);
      attachments.push(await ClassroomLessonAttachment.create({
        classroomId,
        lessonId: lesson.id,
        originalName: file.originalname.slice(0, 255),
        storedName: file.filename,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
        ...stored,
        displayOrder: index,
      }));
    }
    await removeUploadedFiles(req.files);
    lesson.attachments = attachments;

    await Promise.all([
      ClassroomLessonVersion.create({ classroomId, lessonId: lesson.id, editorId: req.userId, versionNumber: 1, snapshot: lessonSnapshot(lesson) }),
      recordLessonAudit(req, classroomId, lesson.id, options.isPublished ? "created_and_published" : "created_draft", { contentType: options.contentType }),
    ]);

    return res.status(201).json({ message: `${options.contentType === "assignment" ? "Assignment" : "Lesson"} added to classroom`, lesson: sanitizeClassroomLesson(lesson) });
  } catch (error) {
    await removeUploadedFiles(req.files);
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/classrooms/:classroomId/lessons/reorder", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const lessonIds = Array.isArray(req.body?.lessonIds) ? req.body.lessonIds.map(parseInteger).filter(Boolean) : [];
    const existing = await ClassroomLesson.findAll({ where: { classroomId, id: { [Op.in]: lessonIds } }, attributes: ["id"] });
    if (!lessonIds.length || existing.length !== new Set(lessonIds).size) return res.status(400).json({ message: "Invalid classwork order" });
    await Promise.all(lessonIds.map((id, displayOrder) => ClassroomLesson.update({ displayOrder }, { where: { id, classroomId } })));
    return res.json({ message: "Classwork reordered" });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.post("/classrooms/:classroomId/lessons/:lessonId/duplicate", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const lessonId = parseInteger(req.params.lessonId);
    const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const source = await ClassroomLesson.findOne({ where: { id: lessonId, classroomId }, include: [{ model: ClassroomLessonAttachment, as: "attachments" }] });
    if (!source) return res.status(404).json({ message: "Classwork not found" });
    const copy = await ClassroomLesson.create({
      classroomId, title: `Copy of ${source.title}`.slice(0, MAX_LESSON_TITLE_LENGTH), description: source.description,
      contentType: source.contentType, dueAt: source.dueAt, publishAt: null, isPublished: false,
      allowSubmissions: source.allowSubmissions, maxScore: source.maxScore,
      rubric: source.rubric, feedbackReleaseAt: source.feedbackReleaseAt, allowLateSubmissions: source.allowLateSubmissions,
      maxAttempts: source.maxAttempts, allowedFileTypes: source.allowedFileTypes, maxFileSizeMb: source.maxFileSizeMb,
      assignedStudentIds: source.assignedStudentIds, version: 1,
      displayOrder: await ClassroomLesson.count({ where: { classroomId } }),
    });
    const attachments = [];
    for (const sourceFile of source.attachments || []) {
      const data = await lessonStorage.readFile(sourceFile);
      if (!data) continue;
      attachments.push(await ClassroomLessonAttachment.create({
        classroomId, lessonId: copy.id, originalName: sourceFile.originalName,
        storedName: `${crypto.randomUUID()}${path.extname(sourceFile.originalName).slice(0, 20)}`,
        mimeType: sourceFile.mimeType, sizeBytes: sourceFile.sizeBytes, data,
        storageProvider: "database", storageKey: null, displayOrder: sourceFile.displayOrder,
        sha256: sourceFile.sha256, scanStatus: sourceFile.scanStatus,
      }));
    }
    copy.attachments = attachments;
    await Promise.all([
      ClassroomLessonVersion.create({ classroomId, lessonId: copy.id, editorId: req.userId, versionNumber: 1, snapshot: lessonSnapshot(copy) }),
      recordLessonAudit(req, classroomId, copy.id, "duplicated", { sourceLessonId: source.id }),
    ]);
    return res.status(201).json({ message: "Draft copy created", lesson: sanitizeClassroomLesson(copy) });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.post("/classrooms/:classroomId/lessons/:lessonId/attachments", uploadLessonFiles, async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const lessonId = parseInteger(req.params.lessonId);
    if (!classroomId || !lessonId) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ message: "Invalid lesson id" });
    }

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom || (req.userRole !== "admin" && classroom.teacherId !== req.userId)) {
      await removeUploadedFiles(req.files);
      return res.status(classroom ? 403 : 404).json({ message: classroom ? "Access denied" : "Classroom not found" });
    }

    const lesson = await ClassroomLesson.findOne({ where: { id: lessonId, classroomId } });
    if (!lesson) {
      await removeUploadedFiles(req.files);
      return res.status(404).json({ message: "Lesson not found" });
    }
    if (!req.files?.length) return res.status(400).json({ message: "Choose at least one file" });

    const legacyAttachments = await ClassroomLessonAttachment.findAll({
      where: { lessonId, classroomId, data: null },
      attributes: ["id", "storedName"],
    });
    const missingLegacyIds = legacyAttachments
      .filter((attachment) => !fs.existsSync(path.join(uploadDirectory, path.basename(attachment.storedName))))
      .map((attachment) => attachment.id);
    if (missingLegacyIds.length) {
      await ClassroomLessonAttachment.destroy({ where: { id: { [Op.in]: missingLegacyIds } } });
    }

    const attachments = [];
    const duplicateNames = [];
    const currentCount = await ClassroomLessonAttachment.count({ where: { lessonId, classroomId } });
    for (const [index, file] of req.files.entries()) {
      const stored = await lessonStorage.uploadFile(file, `classrooms/${classroomId}/lessons/${lessonId}`);
      const duplicate = stored.sha256 && await ClassroomLessonAttachment.findOne({ where: { lessonId, sha256: stored.sha256 }, attributes: ["id", "originalName"] });
      if (duplicate) { duplicateNames.push(file.originalname); await lessonStorage.deleteFile(stored); continue; }
      attachments.push(await ClassroomLessonAttachment.create({
        classroomId,
        lessonId,
        originalName: file.originalname.slice(0, 255),
        storedName: file.filename,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
        ...stored,
        displayOrder: currentCount + index,
      }));
    }
    await removeUploadedFiles(req.files);
    const savedAttachments = await ClassroomLessonAttachment.findAll({
      where: { lessonId, classroomId },
      attributes: ["id", "originalName", "mimeType", "sizeBytes", "displayOrder"],
      order: [["displayOrder", "ASC"], ["createdAt", "ASC"]],
    });
    return res.status(201).json({
      message: "Attachments added",
      attachments: savedAttachments.map(sanitizeAttachment),
      removedUnavailableCount: missingLegacyIds.length,
      duplicateNames,
    });
  } catch (error) {
    await removeUploadedFiles(req.files);
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/classrooms/:classroomId/lessons/:lessonId", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const lessonId = parseInteger(req.params.lessonId);
    if (!classroomId || !lessonId) return res.status(400).json({ message: "Invalid lesson id" });

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const lesson = await ClassroomLesson.findOne({
      where: { id: lessonId, classroomId },
      include: [{
        model: ClassroomLessonAttachment,
        as: "attachments",
        attributes: ["id", "originalName", "mimeType", "sizeBytes"],
      }],
    });
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    const title = normalizeString(req.body?.title);
    const description = normalizeString(req.body?.description);
    if (!title) return res.status(400).json({ message: "Lesson title is required" });
    if (title.length > MAX_LESSON_TITLE_LENGTH) {
      return res.status(400).json({ message: `Lesson title must not exceed ${MAX_LESSON_TITLE_LENGTH} characters` });
    }
    if (description.length > MAX_LESSON_DESCRIPTION_LENGTH) {
      return res.status(400).json({ message: `Lesson description must not exceed ${MAX_LESSON_DESCRIPTION_LENGTH} characters` });
    }

    let dueAt = null;
    if (req.body?.dueAt) {
      dueAt = new Date(req.body.dueAt);
      if (Number.isNaN(dueAt.getTime())) return res.status(400).json({ message: "Due date must be valid" });
    }

    await ClassroomLessonVersion.create({ classroomId, lessonId, editorId: req.userId, versionNumber: lesson.version || 1, snapshot: lessonSnapshot(lesson) });
    lesson.title = title;
    lesson.description = description || null;
    let options;
    try { options = parseLessonOptions(req.body); } catch (optionError) {
      return res.status(400).json({ message: optionError.message });
    }
    if (options.assignedStudentIds.length) {
      const audienceCount = await ClassroomMembership.count({ where: { classroomId, studentId: { [Op.in]: options.assignedStudentIds }, status: "active" } });
      if (audienceCount !== options.assignedStudentIds.length) return res.status(400).json({ message: "Assignment audience contains students outside this class" });
    }
    lesson.isPublished = options.isPublished;
    lesson.contentType = options.contentType;
    lesson.dueAt = options.contentType === "assignment" ? dueAt : null;
    lesson.publishAt = options.publishAt;
    lesson.allowSubmissions = options.allowSubmissions;
    lesson.maxScore = options.maxScore;
    lesson.rubric = options.rubric; lesson.feedbackReleaseAt = options.feedbackReleaseAt;
    lesson.allowLateSubmissions = options.allowLateSubmissions; lesson.maxAttempts = options.maxAttempts;
    lesson.allowedFileTypes = options.allowedFileTypes; lesson.maxFileSizeMb = options.maxFileSizeMb;
    lesson.assignedStudentIds = options.assignedStudentIds; lesson.version = (lesson.version || 1) + 1;
    await lesson.save();
    await recordLessonAudit(req, classroomId, lessonId, "updated", { version: lesson.version, published: lesson.isPublished });
    return res.json({ message: "Lesson updated", lesson: sanitizeClassroomLesson(lesson) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/classrooms/:classroomId/lessons/:lessonId/attachments/reorder", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId); const lessonId = parseInteger(req.params.lessonId);
    const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const attachmentIds = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds.map(parseInteger).filter(Boolean) : [];
    const existing = await ClassroomLessonAttachment.findAll({ where: { classroomId, lessonId, id: { [Op.in]: attachmentIds } }, attributes: ["id"] });
    if (!attachmentIds.length || existing.length !== new Set(attachmentIds).size) return res.status(400).json({ message: "Invalid attachment order" });
    await Promise.all(attachmentIds.map((id, displayOrder) => ClassroomLessonAttachment.update({ displayOrder }, { where: { id, classroomId, lessonId } })));
    return res.json({ message: "Attachments reordered" });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.patch("/classrooms/:classroomId/lessons/:lessonId/attachments/:attachmentId", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const lessonId = parseInteger(req.params.lessonId);
    const attachmentId = parseInteger(req.params.attachmentId);
    const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const attachment = await ClassroomLessonAttachment.findOne({ where: { id: attachmentId, lessonId, classroomId } });
    if (!attachment) return res.status(404).json({ message: "Attachment not found" });
    const name = normalizeString(req.body?.originalName);
    if (name) attachment.originalName = name.slice(0, 255);
    if (Number.isInteger(req.body?.displayOrder)) {
      const nextOrder = Math.max(0, req.body.displayOrder);
      const displaced = await ClassroomLessonAttachment.findOne({ where: { lessonId, classroomId, displayOrder: nextOrder, id: { [Op.ne]: attachment.id } } });
      if (displaced) { displaced.displayOrder = attachment.displayOrder; await displaced.save(); }
      attachment.displayOrder = nextOrder;
    }
    await attachment.save();
    return res.json({ message: "Attachment updated", attachment: sanitizeAttachment(attachment) });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.put("/classrooms/:classroomId/lessons/:lessonId/attachments/:attachmentId/file", uploadLessonFiles, async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const lessonId = parseInteger(req.params.lessonId);
    const attachmentId = parseInteger(req.params.attachmentId);
    const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom || (req.userRole !== "admin" && classroom.teacherId !== req.userId)) { await removeUploadedFiles(req.files); return res.status(classroom ? 403 : 404).json({ message: classroom ? "Access denied" : "Classroom not found" }); }
    const attachment = await ClassroomLessonAttachment.findOne({ where: { id: attachmentId, lessonId, classroomId } });
    const file = req.files?.[0];
    if (!attachment || !file) { await removeUploadedFiles(req.files); return res.status(attachment ? 400 : 404).json({ message: attachment ? "Choose a replacement file" : "Attachment not found" }); }
    const previous = { storedName: attachment.storedName, storageProvider: attachment.storageProvider, storageKey: attachment.storageKey };
    const stored = await lessonStorage.uploadFile(file, `classrooms/${classroomId}/lessons/${lessonId}`);
    attachment.originalName = file.originalname.slice(0, 255); attachment.storedName = file.filename;
    attachment.mimeType = file.mimetype || "application/octet-stream"; attachment.sizeBytes = file.size;
    attachment.data = stored.data; attachment.storageProvider = stored.storageProvider; attachment.storageKey = stored.storageKey;
    await attachment.save();
    await Promise.all([lessonStorage.deleteFile(previous), removeStoredFiles([previous.storedName]), removeUploadedFiles(req.files)]);
    return res.json({ message: "Attachment replaced", attachment: sanitizeAttachment(attachment) });
  } catch (error) { await removeUploadedFiles(req.files); console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.delete("/classrooms/:classroomId/lessons/:lessonId/attachments/:attachmentId", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const lessonId = parseInteger(req.params.lessonId);
    const attachmentId = parseInteger(req.params.attachmentId);
    const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const attachment = await ClassroomLessonAttachment.findOne({ where: { id: attachmentId, lessonId, classroomId } });
    if (!attachment) return res.status(404).json({ message: "Attachment not found" });
    await lessonStorage.deleteFile(attachment);
    await removeStoredFiles([attachment.storedName]);
    await attachment.destroy();
    return res.json({ message: "Attachment removed" });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.get("/classrooms/:classroomId/lessons/:lessonId/submissions", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const lessonId = parseInteger(req.params.lessonId);
    const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const lesson = await ClassroomLesson.findOne({ where: { id: lessonId, classroomId } });
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    const submissions = await ClassroomLessonSubmission.findAll({
      where: { lessonId, classroomId },
      include: [
        { model: User, as: "student", attributes: ["id", "firstName", "lastName", "username"] },
        { model: ClassroomLessonSubmissionAttachment, as: "attachments", attributes: ["id", "originalName", "mimeType", "sizeBytes"] },
      ],
      order: [["submittedAt", "DESC"]],
    });
    return res.json({ lesson: sanitizeClassroomLesson(lesson), submissions });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.put("/classrooms/:classroomId/lessons/:lessonId/submissions/:submissionId/grade", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const lessonId = parseInteger(req.params.lessonId);
    const submissionId = parseInteger(req.params.submissionId);
    const classroom = classroomId ? await Classroom.findByPk(classroomId) : null;
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) return res.status(403).json({ message: "Access denied" });
    const lesson = await ClassroomLesson.findOne({ where: { id: lessonId, classroomId } });
    const submission = await ClassroomLessonSubmission.findOne({ where: { id: submissionId, lessonId, classroomId } });
    if (!lesson || lesson.contentType !== "assignment" || !submission) return res.status(404).json({ message: "Submission not found" });
    const requestedResubmit = req.body?.status === "resubmit";
    const rubricScores = Array.isArray(lesson.rubric) && lesson.rubric.length ? lesson.rubric.map((criterion) => {
      const submitted = Array.isArray(req.body?.rubricScores) ? req.body.rubricScores.find((item) => String(item.id) === String(criterion.id)) : null;
      return { id: String(criterion.id), score: Math.min(Number(criterion.points) || 0, Math.max(0, Number(submitted?.score) || 0)) };
    }) : [];
    const rubricTotal = Array.isArray(lesson.rubric) && lesson.rubric.length ? rubricScores.reduce((sum, item) => sum + item.score, 0) : null;
    const grade = rubricTotal ?? Number.parseInt(req.body?.grade, 10);
    if (!requestedResubmit && (!Number.isInteger(grade) || grade < 0 || grade > lesson.maxScore)) return res.status(400).json({ message: `Grade must be between 0 and ${lesson.maxScore}` });
    submission.grade = requestedResubmit ? null : grade;
    submission.feedback = normalizeString(req.body?.feedback).slice(0, 4000) || null;
    submission.rubricScores = requestedResubmit ? [] : rubricScores;
    submission.status = requestedResubmit ? "resubmit" : "graded";
    submission.gradedAt = new Date();
    await submission.save();
    await recordLessonAudit(req, classroomId, lessonId, requestedResubmit ? "resubmission_requested" : "graded_submission", { submissionId, studentId: submission.studentId, grade: submission.grade });
    return res.json({ message: "Feedback saved", submission });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.delete("/classrooms/:classroomId/lessons/:lessonId", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    const lessonId = parseInteger(req.params.lessonId);
    if (!classroomId || !lessonId) return res.status(400).json({ message: "Invalid lesson id" });

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const attachments = await ClassroomLessonAttachment.findAll({
      where: { lessonId, classroomId },
      attributes: ["storedName", "storageProvider", "storageKey"],
    });
    await recordLessonAudit(req, classroomId, lessonId, "deleted", { title: (await ClassroomLesson.findByPk(lessonId, { attributes: ["title"] }))?.title });
    const deleted = await ClassroomLesson.destroy({ where: { id: lessonId, classroomId } });
    if (!deleted) return res.status(404).json({ message: "Lesson not found" });
    await Promise.all(attachments.map((attachment) => lessonStorage.deleteFile(attachment)));
    await removeStoredFiles(attachments.map((attachment) => attachment.storedName));
    return res.json({ message: "Lesson removed" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/classrooms/:classroomId/level-overrides", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) return res.status(400).json({ message: "Invalid classroom id" });

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const overrides = await LevelContentOverride.findAll({ where: { classroomId } });
    return res.json(overrides);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/classrooms/:classroomId/level-settings", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) return res.status(400).json({ message: "Invalid classroom id" });

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const settings = req.body?.settings;
    if (!Array.isArray(settings) || settings.length !== PLAYABLE_LEVEL_KEYS.length) {
      return res.status(400).json({ message: "Settings must include every playable level" });
    }

    const seen = new Set();
    const normalized = [];
    const parseOptionalDate = (value, field) => {
      if (value === null || value === undefined || value === "") return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date`);
      return date;
    };
    const parseDeduction = (value, field, fallback) => {
      const number = value === "" || value == null ? fallback : Number(value);
      if (!Number.isFinite(number) || number < 0 || number > 100) {
        throw new Error(`${field} must be between 0 and 100`);
      }
      return Math.round(number * 100) / 100;
    };

    try {
      settings.forEach((setting, index) => {
        const levelKey = normalizeString(setting?.levelKey).toLowerCase();
        if (!PLAYABLE_LEVEL_KEY_SET.has(levelKey) || seen.has(levelKey)) {
          throw new Error("Settings contain an unknown or duplicate level");
        }
        seen.add(levelKey);
        normalized.push({
          levelKey,
          isEnabled: setting.isEnabled !== false,
          displayOrder: index + 1,
          unlockAt: parseOptionalDate(setting.unlockAt, "unlockAt"),
          dueAt: parseOptionalDate(setting.dueAt, "dueAt"),
          hintsEnabled: setting.hintsEnabled !== false,
          wrongAttemptDeduction: parseDeduction(
            setting.wrongAttemptDeduction,
            "wrongAttemptDeduction",
            5,
          ),
          lateDeductionPerDay: parseDeduction(
            setting.lateDeductionPerDay,
            "lateDeductionPerDay",
            3,
          ),
        });
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    for (const setting of normalized) {
      const [row] = await LevelContentOverride.findOrCreate({
        where: { classroomId, levelKey: setting.levelKey },
        defaults: { classroomId, ...setting },
      });
      Object.assign(row, setting);
      await row.save();
    }

    const saved = await LevelContentOverride.findAll({
      where: { classroomId },
      order: [["displayOrder", "ASC"]],
    });
    return res.json({ message: "Classroom level settings saved", settings: saved });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/classrooms/:classroomId/level-settings", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) return res.status(400).json({ message: "Invalid classroom id" });

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    await LevelContentOverride.destroy({ where: { classroomId } });
    return res.json({ message: "Classroom levels reset to system defaults" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/classrooms/:classroomId/level-overrides/:levelKey", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) return res.status(400).json({ message: "Invalid classroom id" });

    const levelKey = normalizeString(req.params.levelKey).toLowerCase();
    if (!LEVEL_KEY_SET.has(levelKey)) {
      return res.status(404).json({ message: "Unknown level key" });
    }

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const body = req.body ?? {};
    const fields = [
      "lessonCardTitle",
      "lessonCardDescription",
      "goalTitle",
      "goalDescription",
      "instructionItems",
      "defaultCode",
      "validatorConfig",
    ];
    const updates = {};
    for (const field of fields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    const [override] = await LevelContentOverride.findOrCreate({
      where: { classroomId, levelKey },
      defaults: { classroomId, levelKey, ...updates },
    });
    if (Object.keys(updates).length > 0) {
      Object.assign(override, updates);
      await override.save();
    }

    return res.json(override);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/classrooms/:classroomId/level-overrides/:levelKey", async (req, res) => {
  try {
    const classroomId = parseInteger(req.params.classroomId);
    if (!classroomId) return res.status(400).json({ message: "Invalid classroom id" });

    const levelKey = normalizeString(req.params.levelKey).toLowerCase();

    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (req.userRole !== "admin" && classroom.teacherId !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    await LevelContentOverride.destroy({ where: { classroomId, levelKey } });
    return res.json({ message: "Override removed" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
