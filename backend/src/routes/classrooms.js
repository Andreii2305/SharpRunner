const router = require("express").Router();
const { Op } = require("sequelize");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const ClassroomAnnouncement = require("../models/ClassroomAnnouncement");
const ClassroomAnnouncementView = require("../models/ClassroomAnnouncementView");
const User = require("../models/User");
const {
  formatDisplayName,
  findPrimaryActiveMembership,
  buildClassroomLeaderboard,
} = require("../services/studentClassService");
const classroomJoinRequestService = require("../services/classroomJoinRequestService");

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const sanitizeClassroomSummary = (classroom, joinedAt = null) => ({
  id: classroom.id,
  className: classroom.className,
  section: classroom.section,
  schoolYear: classroom.schoolYear,
  classCode: classroom.classCode,
  maxStudents: classroom.maxStudents,
  description: classroom.description,
  teacherId: classroom.teacherId,
  joinedAt,
});

router.use(authMiddleware, requireRole("student"));

router.get("/me", async (req, res) => {
  try {
    const memberships = await ClassroomMembership.findAll({
      where: {
        studentId: req.userId,
        status: "active",
      },
      attributes: ["id", "classroomId", "joinedAt", "updatedAt"],
      include: [
        {
          model: Classroom,
          as: "classroom",
          required: true,
          where: { isActive: true },
          attributes: [
            "id",
            "className",
            "section",
            "schoolYear",
            "classCode",
            "maxStudents",
            "description",
            "teacherId",
          ],
        },
      ],
      order: [
        ["joinedAt", "DESC"],
        ["updatedAt", "DESC"],
      ],
    });

    const classrooms = memberships.map((membership) =>
      sanitizeClassroomSummary(membership.classroom, membership.joinedAt)
    );

    const pendingMemberships = await ClassroomMembership.findAll({
      where: {
        studentId: req.userId,
        status: "pending",
      },
      attributes: ["id", "classroomId", "status", "requestedAt"],
      include: [
        {
          model: Classroom,
          as: "classroom",
          required: true,
          where: { isActive: true },
          attributes: ["id", "className", "section", "schoolYear"],
        },
      ],
      order: [
        ["requestedAt", "DESC NULLS LAST"],
        ["id", "DESC"],
      ],
    });

    const pendingRequests = pendingMemberships.map((membership) => ({
      classroom: {
        id: membership.classroom.id,
        className: membership.classroom.className,
        section: membership.classroom.section,
        schoolYear: membership.classroom.schoolYear,
      },
      status: membership.status,
      requestedAt: membership.requestedAt ?? null,
    }));

    return res.json({
      hasActiveMembership: classrooms.length > 0,
      totalClassrooms: classrooms.length,
      classrooms,
      primaryClassroom: classrooms[0] ?? null,
      pendingRequests,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const primaryMembership = await findPrimaryActiveMembership(req.userId);
    if (!primaryMembership) {
      return res.json({
        classroomId: null,
        classSize: 0,
        currentUserRank: null,
        leaderboard: [],
      });
    }

    const leaderboardData = await buildClassroomLeaderboard({
      classroomId: primaryMembership.classroomId,
      currentUserId: req.userId,
      limit: null,
    });

    return res.json({
      classroomId: primaryMembership.classroomId,
      classSize: leaderboardData.classSize,
      currentUserRank: leaderboardData.currentUserRank,
      leaderboard: leaderboardData.leaderboard.map((entry) => ({
        rank: entry.rank,
        userId: entry.userId,
        name: entry.name,
        username: entry.username,
        xp: entry.xp,
        levelsCleared: entry.levelsCleared,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/announcements", async (req, res) => {
  try {
    const primaryMembership = await findPrimaryActiveMembership(req.userId, {
      includeTeacher: true,
    });
    if (!primaryMembership?.classroom) {
      return res.json({ announcements: [] });
    }

    const classroom = primaryMembership.classroom;
    const teacherName = classroom.teacher
      ? formatDisplayName(classroom.teacher)
      : "Teacher";
    const announcementRows = await ClassroomAnnouncement.findAll({
      where: {
        classroomId: classroom.id,
        isActive: true,
      },
      attributes: ["id", "teacherId", "message", "createdAt"],
      include: [
        {
          model: User,
          as: "teacher",
          required: false,
          attributes: ["id", "firstName", "lastName", "username"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    if (announcementRows.length === 0) {
      return res.json({ announcements: [] });
    }

    const announcementIds = announcementRows.map((announcement) => announcement.id);
    const viewRows = await ClassroomAnnouncementView.findAll({
      where: {
        studentId: req.userId,
        announcementId: { [Op.in]: announcementIds },
      },
      attributes: ["announcementId"],
    });
    const viewedAnnouncementIdSet = new Set(
      viewRows.map((row) => row.announcementId)
    );

    const announcements = announcementRows.map((announcement) => ({
      id: announcement.id,
      message: announcement.message,
      teacherName: announcement.teacher
        ? formatDisplayName(announcement.teacher)
        : teacherName,
      isRead: viewedAnnouncementIdSet.has(announcement.id),
      createdAt: announcement.createdAt,
    }));

    return res.json({ announcements });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/announcements/:announcementId/viewed", async (req, res) => {
  try {
    const announcementId = Number.parseInt(req.params.announcementId, 10);
    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      return res.status(400).json({ message: "Invalid announcement id" });
    }

    const announcement = await ClassroomAnnouncement.findByPk(announcementId, {
      attributes: ["id", "classroomId", "isActive"],
    });

    if (!announcement || !announcement.isActive) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    const membership = await ClassroomMembership.findOne({
      where: {
        classroomId: announcement.classroomId,
        studentId: req.userId,
        status: "active",
      },
      attributes: ["id"],
    });

    if (!membership) {
      return res.status(403).json({ message: "Access denied for this announcement" });
    }

    const [viewRow, wasCreated] = await ClassroomAnnouncementView.findOrCreate({
      where: {
        announcementId: announcement.id,
        studentId: req.userId,
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
      message: "Announcement marked as viewed",
      announcementId: announcement.id,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/join", async (req, res) => {
  try {
    const classCode = normalizeString(req.body.classCode).toUpperCase();
    if (!classCode) {
      return res.status(400).json({ message: "classCode is required" });
    }

    const result = await classroomJoinRequestService.submitJoinRequest({
      classCode,
      studentId: req.userId,
    });
    const classroom = {
      id: result.classroom.id,
      className: result.classroom.className,
      section: result.classroom.section,
      schoolYear: result.classroom.schoolYear,
    };

    if (result.membership.status === "active") {
      return res.json({
        changed: false,
        membership: {
          status: "active",
          joinedAt: result.membership.joinedAt ?? null,
        },
        classroom,
        message: "You are already an active member of this classroom",
      });
    }

    return res.status(result.changed ? 201 : 200).json({
      changed: result.changed,
      membership: {
        status: "pending",
        requestedAt: result.membership.requestedAt ?? null,
      },
      classroom,
      message: result.changed
        ? "Join request submitted"
        : "Join request is already awaiting teacher approval",
    });
  } catch (error) {
    if (error instanceof classroomJoinRequestService.ClassroomJoinRequestError) {
      return res.status(error.status).json({
        message: error.message,
        code: error.code,
      });
    }
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
