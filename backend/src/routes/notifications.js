const router = require("express").Router();
const { Op } = require("sequelize");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const UserNotificationView = require("../models/UserNotificationView");
const TeacherStudentCheckIn = require("../models/TeacherStudentCheckIn");
const privateCheckInReadService = require("../services/privateCheckInReadService");
const ClassroomLesson = require("../models/ClassroomLesson");
const ClassroomLessonSubmission = require("../models/ClassroomLessonSubmission");
const ClassroomLessonPlacement = require("../models/ClassroomLessonPlacement");
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

const parseCheckInPagination = (query) => {
  if (Object.keys(query).some((key) => !["page", "limit"].includes(key))) return null;
  const parseValue = (value, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  };
  const page = parseValue(query.page, 1);
  const limit = parseValue(query.limit, 20);
  if (page === null || limit === null || limit > 100) return null;
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) return null;
  return { page, limit, offset };
};

router.get("/check-ins", async (req, res) => {
  const pagination = parseCheckInPagination(req.query);
  if (!pagination) return res.status(400).json({ message: "Invalid pagination" });
  try {
    const result = await privateCheckInReadService.listPrivateCheckIns({
      studentId: req.userId,
      ...pagination,
    });
    return res.json(result);
  } catch (error) {
    console.error("Private check-in listing failed");
    return res.status(500).json({ message: "Server error" });
  }
});

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
      const placementRows = await ClassroomLessonPlacement.findAll({
        where: { classroomId: primaryMembership.classroomId },
        attributes: ["lessonId"],
      });
      const placedLessonIds = placementRows.map((row) => row.lessonId);
      const lessons = await ClassroomLesson.findAll({
        where: {
          [Op.or]: [
            { classroomId: primaryMembership.classroomId },
            ...(placedLessonIds.length ? [{ id: { [Op.in]: placedLessonIds } }] : []),
          ],
          archivedAt: null,
          isPublished: true,
          publishAt: { [Op.or]: [{ [Op.is]: null }, { [Op.lte]: new Date() }] },
        },
        attributes: ["id", "title", "contentType", "dueAt", "assignedStudentIds", "updatedAt"],
        order: [["updatedAt", "DESC"]], limit: 10,
      });
      for (const lesson of lessons) {
        if (Array.isArray(lesson.assignedStudentIds) && lesson.assignedStudentIds.length && !lesson.assignedStudentIds.includes(Number(req.userId))) continue;
        const dueAt = lesson.dueAt ? new Date(lesson.dueAt) : null;
        notifications.push({
          id: `lesson-${lesson.id}-${new Date(lesson.updatedAt).getTime()}`,
          message: dueAt && dueAt < new Date() ? `${lesson.title} is past due.` : `${lesson.contentType === "assignment" ? "Assignment" : "Class lesson"} available: ${lesson.title}.`,
          isRead: false, createdAt: lesson.updatedAt, lessonId: lesson.id, route: `/${lesson.contentType === "assignment" ? "assignment" : "lesson"}/classroom/${lesson.id}`,
        });
      }
      const graded = await ClassroomLessonSubmission.findAll({
        where: { studentId: req.userId, status: { [Op.in]: ["graded", "resubmit"] } },
        include: [{ model: ClassroomLesson, as: "lesson", attributes: ["id", "title", "contentType", "feedbackReleaseAt"] }],
        order: [["gradedAt", "DESC"]], limit: 10,
      });
      for (const submission of graded) {
        if (submission.lesson.feedbackReleaseAt && new Date(submission.lesson.feedbackReleaseAt) > new Date()) continue;
        notifications.push({
        id: `feedback-${submission.id}-${new Date(submission.gradedAt || submission.updatedAt).getTime()}`,
        message: submission.status === "resubmit" ? `Your teacher requested changes for ${submission.lesson.title}.` : `Feedback is ready for ${submission.lesson.title}.`,
        isRead: false, createdAt: submission.gradedAt || submission.updatedAt, lessonId: submission.lesson.id, route: `/assignment/classroom/${submission.lesson.id}`,
        });
      }
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
  let isPrivateCheckIn = false;
  try {
    const decodedParam = decodeURIComponent(req.params.notificationId ?? "");
    let notificationKey = normalizeNotificationKey(decodedParam);
    if (!notificationKey) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    if (notificationKey.length > MAX_NOTIFICATION_KEY_LENGTH) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    if (notificationKey.startsWith("check-in")) {
      isPrivateCheckIn = true;
      const match = /^check-in-([1-9][0-9]*)$/.exec(notificationKey);
      const checkInId = match ? Number(match[1]) : null;
      if (!Number.isSafeInteger(checkInId)) {
        return res.status(400).json({ message: "Invalid notification id" });
      }
      const checkIn = await TeacherStudentCheckIn.findOne({
        where: { id: checkInId, recipientStudentId: req.userId },
        attributes: ["id"],
      });
      if (!checkIn) return res.status(404).json({ message: "Notification not found" });
      notificationKey = `check-in-${checkInId}`;
    } else if (!NOTIFICATION_KEY_PREFIX_REGEX.test(notificationKey)) {
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
    if (isPrivateCheckIn) {
      console.error("Private check-in read-state update failed");
      return res.status(500).json({ message: "Server error" });
    }
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof URIError
    && /^\/api\/notifications\/check-in-[^?]*\/viewed(?:\?|$)/.test(req.originalUrl || "")) {
    return res.status(400).json({ message: "Invalid notification id" });
  }
  return next(error);
});

module.exports = router;
