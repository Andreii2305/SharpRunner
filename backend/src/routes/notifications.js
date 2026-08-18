const router = require("express").Router();
const { Op } = require("sequelize");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const UserNotificationView = require("../models/UserNotificationView");
const ClassroomLesson = require("../models/ClassroomLesson");
const ClassroomLessonSubmission = require("../models/ClassroomLessonSubmission");
const {
  ensureProgressRowsForUser,
  buildProgressSummary,
} = require("../services/progressService");
const {
  formatDisplayName,
  findPrimaryActiveMembership,
  buildClassroomLeaderboard,
} = require("../services/studentClassService");

const MAX_NOTIFICATION_KEY_LENGTH = 255;
const NOTIFICATION_KEY_PREFIX_REGEX =
  /^(classroom|current-level|class-rank|levels-cleared|lesson|feedback)-/;

const normalizeNotificationKey = (value) =>
  typeof value === "string" ? value.trim() : "";

router.use(authMiddleware, requireRole("student"));

router.get("/me", async (req, res) => {
  try {
    const primaryMembership = await findPrimaryActiveMembership(req.userId, {
      includeTeacher: true,
    });

    const rows = await ensureProgressRowsForUser(req.userId);

    let classRank = null;
    let classSize = null;
    if (primaryMembership) {
      const leaderboardData = await buildClassroomLeaderboard({
        classroomId: primaryMembership.classroomId,
        currentUserId: req.userId,
        limit: null,
      });
      classRank = leaderboardData.currentUserRank;
      classSize = leaderboardData.classSize;
    }

    const summary = buildProgressSummary(rows, { classRank, classSize }).summary;
    const notifications = [];

    if (primaryMembership?.classroom) {
      const classroom = primaryMembership.classroom;
      const teacher = classroom.teacher ?? null;
      const teacherName = teacher ? formatDisplayName(teacher) : "Teacher";
      notifications.push({
        id: `classroom-${classroom.id}`,
        message: `You are enrolled in ${classroom.className} (${classroom.section}).`,
        teacherName,
        isRead: true,
        createdAt: new Date().toISOString(),
      });
    }

    if (summary.currentLevelName) {
      const currentLevelKey =
        summary.currentLevelKey ??
        summary.currentLevelName.toLowerCase().replace(/\s+/g, "-");
      notifications.push({
        id: `current-level-${currentLevelKey}`,
        message: `Continue ${summary.currentLevelName} to keep progressing.`,
        isRead: true,
        createdAt: new Date().toISOString(),
      });
    }

    if (Number.isInteger(classRank) && Number.isInteger(classSize)) {
      notifications.push({
        id: `class-rank-${classRank}-${classSize}`,
        message: `You are currently rank #${classRank} out of ${classSize} students.`,
        isRead: true,
        createdAt: new Date().toISOString(),
      });
    }

    if ((summary.totalLevelsCleared ?? 0) > 0) {
      notifications.push({
        id: `levels-cleared-${summary.totalLevelsCleared}`,
        message: `Great work. You have cleared ${summary.totalLevelsCleared} level${
          summary.totalLevelsCleared === 1 ? "" : "s"
        } so far.`,
        isRead: true,
        createdAt: new Date().toISOString(),
      });
    }

    if (primaryMembership) {
      const lessons = await ClassroomLesson.findAll({
        where: {
          classroomId: primaryMembership.classroomId,
          isPublished: true,
          [Op.or]: [{ publishAt: null }, { publishAt: { [Op.lte]: new Date() } }],
        },
        attributes: ["id", "title", "contentType", "dueAt", "updatedAt"],
        order: [["updatedAt", "DESC"]], limit: 10,
      });
      for (const lesson of lessons) {
        const dueAt = lesson.dueAt ? new Date(lesson.dueAt) : null;
        notifications.push({
          id: `lesson-${lesson.id}-${new Date(lesson.updatedAt).getTime()}`,
          message: dueAt && dueAt < new Date() ? `${lesson.title} is past due.` : `${lesson.contentType === "assignment" ? "Assignment" : "Class lesson"} available: ${lesson.title}.`,
          isRead: false, createdAt: lesson.updatedAt, lessonId: lesson.id, route: `/${lesson.contentType === "assignment" ? "assignment" : "lesson"}/classroom/${lesson.id}`,
        });
      }
      const graded = await ClassroomLessonSubmission.findAll({
        where: { studentId: req.userId, status: { [Op.in]: ["graded", "resubmit"] } },
        include: [{ model: ClassroomLesson, as: "lesson", attributes: ["id", "title", "contentType"] }],
        order: [["gradedAt", "DESC"]], limit: 10,
      });
      for (const submission of graded) notifications.push({
        id: `feedback-${submission.id}-${new Date(submission.gradedAt || submission.updatedAt).getTime()}`,
        message: submission.status === "resubmit" ? `Your teacher requested changes for ${submission.lesson.title}.` : `Feedback is ready for ${submission.lesson.title}.`,
        isRead: false, createdAt: submission.gradedAt || submission.updatedAt, lessonId: submission.lesson.id, route: `/assignment/classroom/${submission.lesson.id}`,
      });
    }

    if (notifications.length > 0) {
      const notificationKeys = notifications.map((notification) => notification.id);
      const viewedRows = await UserNotificationView.findAll({
        where: {
          userId: req.userId,
          notificationKey: { [Op.in]: notificationKeys },
        },
        attributes: ["notificationKey"],
      });

      const viewedKeySet = new Set(
        viewedRows.map((row) => normalizeNotificationKey(row.notificationKey))
      );

      notifications.forEach((notification) => {
        notification.isRead = viewedKeySet.has(
          normalizeNotificationKey(notification.id)
        );
      });
    }

    return res.json({ notifications });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/:notificationId/viewed", async (req, res) => {
  try {
    const decodedParam = decodeURIComponent(req.params.notificationId ?? "");
    const notificationKey = normalizeNotificationKey(decodedParam);
    if (!notificationKey) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    if (notificationKey.length > MAX_NOTIFICATION_KEY_LENGTH) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    if (!NOTIFICATION_KEY_PREFIX_REGEX.test(notificationKey)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    const [viewRow, wasCreated] = await UserNotificationView.findOrCreate({
      where: {
        userId: req.userId,
        notificationKey,
      },
      defaults: {
        viewedAt: new Date(),
      },
    });

    if (!wasCreated) {
      viewRow.viewedAt = new Date();
      await viewRow.save();
    }

    return res.json({
      message: "Notification marked as viewed",
      notificationId: notificationKey,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
