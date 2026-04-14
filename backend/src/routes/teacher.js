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
} = require("../constants/progressDefaults");
const { ensureProgressRowsForUser } = require("../services/progressService");

const LEVEL_KEY_SUFFIX = "-level-";
const DEFAULT_SECTION_NAME = "Unassigned";
const MAX_STUDENT_ROWS = 10;
const CLASS_CODE_LENGTH = 6;
const CLASS_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ACTIVE_GAME_HEARTBEAT_WINDOW_MS = 2 * 60 * 1000;
const MAX_ANNOUNCEMENT_LENGTH = 1000;
const EXPECTED_PROGRESS_ROWS_PER_STUDENT = DEFAULT_LEVEL_PROGRESS.length;
const DEFAULT_LEVEL_KEYS = DEFAULT_LEVEL_PROGRESS.map((level) => level.levelKey);

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
        attributes: ["userId", "levelKey", "progressPercent", "isCompleted", "updatedAt"],
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
      });
    }

    const stats = studentStatsById.get(row.userId);
    stats.totalProgress += row.progressPercent;
    stats.levelCount += 1;
    if (row.isCompleted) {
      stats.completedLevels += 1;
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

module.exports = router;
