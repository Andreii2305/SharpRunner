const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Op, col, fn, where, literal } = require("sequelize");
const User = require("../models/User");
const AdminActivityLog = require("../models/AdminActivityLog");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const ClassroomLesson = require("../models/ClassroomLesson");
const ClassroomLessonAttachment = require("../models/ClassroomLessonAttachment");
const ClassroomAnnouncement = require("../models/ClassroomAnnouncement");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const { logAdminActivity } = require("../services/adminActivityLogService");
const { validateEmailAddress } = require("../services/emailValidationService");
const { sendTeacherInviteEmail, sendTemporaryPasswordEmail } = require("../services/emailService");
const { createRateLimit } = require("../middleware/rateLimit");

const ALLOWED_ROLES = new Set(["student", "teacher", "admin"]);
const ALLOWED_STATUSES = new Set(["active", "inactive", "pending", "archived"]);
const ALLOWED_LOG_STATUSES = new Set(["success", "failed"]);
const teacherCreationRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `teacher-create:${req.userId}`,
  message: "Too many teacher account requests. Please try again later.",
});
const adminMutationRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => `admin-mutation:${req.userId}`,
  message: "Too many admin changes. Please try again later.",
});

const parsePagination = (query, defaultLimit = 20) => {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
};

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value) =>
  normalizeString(value).toLowerCase();

const sanitizeUser = (user) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  email: user.email,
  role: user.role,
  status: user.status,
  authProvider: user.authProvider,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  lastLoginAt: user.lastLoginAt,
});

const sanitizeActivityLog = (log) => ({
  id: log.id,
  actorUserId: log.actorUserId,
  actorUsername: log.actorUsername,
  targetUserId: log.targetUserId,
  targetUsername: log.targetUsername,
  role: log.role,
  activity: log.activity,
  details: log.details,
  status: log.status,
  createdAt: log.createdAt,
});

const getActorUsername = async (userId) => {
  if (!Number.isInteger(userId)) {
    return null;
  }

  const actor = await User.findByPk(userId, {
    attributes: ["username"],
  });

  return actor?.username ?? null;
};

const parseDate = (value, endOfDay = false) => {
  const normalized = normalizeString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const csvEscape = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const sendCsv = (res, filename, headers, rows) => {
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  return res.send(`\uFEFF${csv}`);
};

const buildUserWhere = (query) => {
  const roleFilter = normalizeString(query.role).toLowerCase();
  const statusFilter = normalizeString(query.status).toLowerCase();
  const searchText = normalizeString(query.search).toLowerCase();
  const whereClause = {};
  if (roleFilter) {
    if (!ALLOWED_ROLES.has(roleFilter)) throw Object.assign(new Error("Invalid role filter"), { statusCode: 400 });
    whereClause.role = roleFilter;
  }
  if (statusFilter) {
    if (!ALLOWED_STATUSES.has(statusFilter)) throw Object.assign(new Error("Invalid status filter"), { statusCode: 400 });
    whereClause.status = statusFilter;
  } else {
    whereClause.status = { [Op.ne]: "archived" };
  }
  if (searchText) {
    const likeQuery = `%${searchText}%`;
    whereClause[Op.or] = ["firstName", "lastName", "username", "email"]
      .map((field) => where(fn("lower", col(field)), { [Op.like]: likeQuery }));
  }
  return whereClause;
};

router.use(authMiddleware, requireRole("admin"));

router.get("/users", async (req, res) => {
  try {
    const whereClause = buildUserWhere(req.query);

    const { page, limit, offset } = parsePagination(req.query, 20);
    const result = await User.findAndCountAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.json({
      total: result.count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(result.count / limit)),
      users: result.rows.map(sanitizeUser),
    });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Server error" });
  }
});

router.get("/logs", async (req, res) => {
  try {
    const actor = normalizeString(req.query.actor).toLowerCase();
    const target = normalizeString(req.query.target).toLowerCase();
    const action = normalizeString(req.query.action);
    const logStatus = normalizeString(req.query.status).toLowerCase();
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to, true);
    if (req.query.from && !from) return res.status(400).json({ message: "Invalid from date" });
    if (req.query.to && !to) return res.status(400).json({ message: "Invalid to date" });
    if (logStatus && !ALLOWED_LOG_STATUSES.has(logStatus)) return res.status(400).json({ message: "Invalid log status" });
    const whereClause = {};
    if (actor) whereClause.actorUsername = { [Op.iLike]: `%${actor}%` };
    if (target) whereClause.targetUsername = { [Op.iLike]: `%${target}%` };
    if (action) whereClause.activity = { [Op.iLike]: `%${action}%` };
    if (logStatus) whereClause.status = logStatus;
    if (from || to) whereClause.createdAt = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
    const { page, limit, offset } = parsePagination(req.query, 20);
    const result = await AdminActivityLog.findAndCountAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.json({
      total: result.count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(result.count / limit)),
      logs: result.rows.map(sanitizeActivityLog),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/summary", async (_req, res) => {
  try {
    const [totalUsers, activeUsers, activeTeachers, activeStudents, activeClassrooms, archivedAccounts] = await Promise.all([
      User.count(),
      User.count({ where: { status: "active" } }),
      User.count({ where: { role: "teacher", status: "active" } }),
      User.count({ where: { role: "student", status: "active" } }),
      Classroom.count({ where: { isActive: true } }),
      User.count({ where: { status: "archived" } }),
    ]);
    return res.json({ totalUsers, activeUsers, activeTeachers, activeStudents, activeClassrooms, archivedAccounts });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/users/export.csv", async (req, res) => {
  try {
    const users = await User.findAll({ where: buildUserWhere(req.query), order: [["createdAt", "DESC"]] });
    return sendCsv(res, "sharprunner-users.csv",
      ["Name", "Email", "Username", "Role", "Status", "Created At", "Last Login"],
      users.map((user) => [
        `${user.firstName} ${user.lastName}`, user.email, user.username, user.role,
        user.status, user.createdAt?.toISOString?.() ?? user.createdAt,
        user.lastLoginAt?.toISOString?.() ?? user.lastLoginAt,
      ]));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Failed to export users" });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid user id" });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const [ownedClassrooms, memberships, recentActivity] = await Promise.all([
      user.role === "teacher" ? Classroom.findAll({ where: { teacherId: user.id }, attributes: ["id", "className", "section", "isActive", "createdAt"], order: [["createdAt", "DESC"]], limit: 20 }) : [],
      user.role === "student" ? ClassroomMembership.findAll({ where: { studentId: user.id }, attributes: ["id", "classroomId", "status", "joinedAt"], order: [["joinedAt", "DESC"]], limit: 20 }) : [],
      AdminActivityLog.findAll({ where: { targetUserId: user.id }, order: [["createdAt", "DESC"]], limit: 10 }),
    ]);
    return res.json({ user: sanitizeUser(user), ownedClassrooms, memberships, recentActivity: recentActivity.map(sanitizeActivityLog) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load user details" });
  }
});

router.post("/users/:id/archive", adminMutationRateLimit, async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid user id" });
    if (userId === req.userId) return res.status(403).json({ message: "You cannot archive your own account" });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(403).json({ message: "Admin accounts cannot be archived from the dashboard" });
    if (user.status === "archived") return res.json({ message: "User is already archived", user: sanitizeUser(user) });
    const previousStatus = user.status;
    user.status = "archived";
    user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
    await user.save();
    await logAdminActivity({ actorUserId: req.userId, actorUsername: await getActorUsername(req.userId), role: req.userRole, targetUserId: user.id, targetUsername: user.username, activity: "USER_ARCHIVED", details: `Previous status: ${previousStatus}` });
    return res.json({ message: "Account archived. Historical data was preserved.", user: sanitizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to archive user" });
  }
});

router.post("/users/:id/restore", adminMutationRateLimit, async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid user id" });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.status !== "archived") return res.status(409).json({ message: "Only archived accounts can be restored" });
    if (!user.emailVerifiedAt) return res.status(400).json({ message: "The user must verify their email before restoration" });
    user.status = "active";
    user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
    await user.save();
    await logAdminActivity({ actorUserId: req.userId, actorUsername: await getActorUsername(req.userId), role: req.userRole, targetUserId: user.id, targetUsername: user.username, activity: "USER_RESTORED", details: "Restored to active" });
    return res.json({ message: "Account restored", user: sanitizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to restore user" });
  }
});

router.post("/users/:id/force-logout", adminMutationRateLimit, async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid user id" });
    if (userId === req.userId) return res.status(403).json({ message: "Use the Logout button to end your own session" });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
    await user.save();
    await logAdminActivity({ actorUserId: req.userId, actorUsername: await getActorUsername(req.userId), role: req.userRole, targetUserId: user.id, targetUsername: user.username, activity: "SESSION_REVOKED", details: "All existing access tokens revoked" });
    return res.json({ message: "User was logged out from all devices" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to revoke sessions" });
  }
});

router.patch("/users/:id/status", adminMutationRateLimit, async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    const nextStatus = normalizeString(req.body.status).toLowerCase();

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (!ALLOWED_STATUSES.has(nextStatus)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin" && nextStatus === "inactive") {
      return res.status(400).json({
        message: "Admin accounts cannot be set to inactive",
      });
    }

    if (nextStatus === "archived") {
      return res.status(400).json({ message: "Use the archive action to archive an account" });
    }
    if (user.status === "archived") {
      return res.status(409).json({ message: "Restore this archived account before changing its status" });
    }

    if (nextStatus === "active" && !user.emailVerifiedAt) {
      return res.status(400).json({
        message: "The user must verify their email before activation",
      });
    }

    if (user.status === nextStatus) {
      return res.json({
        message: `User is already ${nextStatus}`,
        user: sanitizeUser(user),
      });
    }

    const previousStatus = user.status;
    user.status = nextStatus;
    await user.save();

    const actorUsername = await getActorUsername(req.userId);

    await logAdminActivity({
      actorUserId: req.userId,
      actorUsername,
      role: req.userRole ?? "admin",
      targetUserId: user.id,
      targetUsername: user.username,
      activity: user.role === "teacher" && nextStatus === "inactive"
        ? "TEACHER_SUSPENDED"
        : user.role === "teacher" && previousStatus === "inactive" && nextStatus === "active"
          ? "TEACHER_RESTORED"
          : "Updated user status",
      details: `${user.username}: ${previousStatus} -> ${nextStatus}`,
      status: "success",
    });

    return res.json({
      message: "User status updated",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/users/:id/role", adminMutationRateLimit, async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    const nextRole = normalizeString(req.body?.role).toLowerCase();
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid user id" });
    if (!["student", "teacher"].includes(nextRole)) return res.status(400).json({ message: "Role must be student or teacher" });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(403).json({ message: "Admin roles cannot be changed from the dashboard" });
    if (user.role === nextRole) return res.json({ message: `User is already a ${nextRole}`, user: sanitizeUser(user) });
    if (user.role === "teacher" && nextRole === "student") {
      const classroomCount = await Classroom.count({ where: { teacherId: user.id } });
      if (classroomCount > 0) return res.status(409).json({ message: "Reassign or remove this teacher's classrooms before changing the role" });
    }

    const previousRole = user.role;
    user.role = nextRole;
    await user.save();
    const actorUsername = await getActorUsername(req.userId);
    await logAdminActivity({ actorUserId: req.userId, actorUsername, role: req.userRole ?? "admin", targetUserId: user.id, targetUsername: user.username, activity: "Updated user role", details: `${user.username}: ${previousRole} -> ${nextRole}`, status: "success" });
    return res.json({ message: "User role updated", user: sanitizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/users/:id/reset-password", adminMutationRateLimit, async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid user id" });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(403).json({ message: "Admin passwords cannot be reset from the dashboard" });
    if (user.role !== "teacher") return res.status(400).json({ message: "Dashboard password resets are currently available for teacher accounts" });
    if (user.authProvider === "google" || !user.password) return res.status(400).json({ message: "Google Sign-In accounts do not have a local password" });

    const temporaryPassword = `Aa1!${crypto.randomBytes(9).toString("base64url")}`;
    const previousPassword = user.password;
    const revokeSessions = req.body?.revokeSessions !== false;
    const previousTokenVersion = Number(user.tokenVersion ?? 0);
    user.password = await bcrypt.hash(temporaryPassword, 10);
    if (revokeSessions) user.tokenVersion = previousTokenVersion + 1;
    await user.save();
    try {
      await sendTemporaryPasswordEmail({ email: user.email, firstName: user.firstName, username: user.username, temporaryPassword });
    } catch (error) {
      user.password = previousPassword;
      user.tokenVersion = previousTokenVersion;
      await user.save();
      throw error;
    }

    const actorUsername = await getActorUsername(req.userId);
    await logAdminActivity({ actorUserId: req.userId, actorUsername, role: req.userRole ?? "admin", targetUserId: user.id, targetUsername: user.username, activity: "PASSWORD_RESET", details: `Temporary password emailed; sessions revoked: ${revokeSessions ? "yes" : "no"}`, status: "success" });
    return res.json({ message: `A temporary password was emailed${revokeSessions ? " and existing sessions were revoked" : ""}` });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Failed to reset password" });
  }
});

router.delete("/users/:id", adminMutationRateLimit, async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(403).json({
        message: "Admin accounts cannot be deleted from the dashboard",
      });
    }

    if (user.status !== "archived") {
      return res.status(409).json({ message: "Archive this account before permanently deleting it" });
    }
    if (normalizeString(req.body?.confirmation).toUpperCase() !== "DELETE") {
      return res.status(400).json({ message: "Type DELETE to confirm permanent deletion" });
    }

    const deletedUsername = user.username;
    const deletedRole = user.role;
    const actorUsername = await getActorUsername(req.userId);

    await user.destroy();

    await logAdminActivity({
      actorUserId: req.userId,
      actorUsername,
      role: req.userRole ?? "admin",
      targetUsername: deletedUsername,
      activity: "USER_DELETED",
      details: `${deletedUsername} (${deletedRole})`,
      status: "success",
    });

    return res.json({ message: `User ${deletedUsername} was permanently deleted` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

const buildClassroomWhere = (query) => {
  const state = normalizeString(query.status).toLowerCase();
  const search = normalizeString(query.search).toLowerCase();
  const createdFrom = parseDate(query.from);
  const createdTo = parseDate(query.to, true);
  if (state && !["active", "archived"].includes(state)) throw Object.assign(new Error("Invalid classroom status"), { statusCode: 400 });
  if (query.from && !createdFrom) throw Object.assign(new Error("Invalid from date"), { statusCode: 400 });
  if (query.to && !createdTo) throw Object.assign(new Error("Invalid to date"), { statusCode: 400 });
  const whereClause = {};
  if (state) whereClause.isActive = state === "active";
  if (search) whereClause[Op.or] = [
    where(fn("lower", col("Classrooms.className")), { [Op.like]: `%${search}%` }),
    where(fn("lower", col("teacher.firstName")), { [Op.like]: `%${search}%` }),
    where(fn("lower", col("teacher.lastName")), { [Op.like]: `%${search}%` }),
    where(fn("lower", col("teacher.email")), { [Op.like]: `%${search}%` }),
  ];
  if (createdFrom || createdTo) whereClause.createdAt = { ...(createdFrom && { [Op.gte]: createdFrom }), ...(createdTo && { [Op.lte]: createdTo }) };
  return whereClause;
};

const classroomIncludes = [{ model: User, as: "teacher", attributes: ["id", "firstName", "lastName", "email", "status"] }];
const classroomAttributes = {
  include: [
    [literal('(SELECT COUNT(*) FROM "ClassroomMemberships" m WHERE m."classroomId" = "Classrooms"."id" AND m."status" = \'active\')'), "studentCount"],
    [literal('(SELECT COUNT(*) FROM "ClassroomLessons" l WHERE l."classroomId" = "Classrooms"."id" AND l."contentType" = \'module\')'), "moduleCount"],
    [literal('GREATEST("Classrooms"."updatedAt", (SELECT MAX(m."updatedAt") FROM "ClassroomMemberships" m WHERE m."classroomId" = "Classrooms"."id"), (SELECT MAX(l."updatedAt") FROM "ClassroomLessons" l WHERE l."classroomId" = "Classrooms"."id"))'), "latestActivityAt"],
  ],
};

router.get("/classrooms", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query, 20);
    const result = await Classroom.findAndCountAll({ where: buildClassroomWhere(req.query), attributes: classroomAttributes, include: classroomIncludes, distinct: true, order: [["createdAt", "DESC"]], limit, offset });
    return res.json({ total: result.count, page, limit, totalPages: Math.max(1, Math.ceil(result.count / limit)), classrooms: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Failed to load classrooms" });
  }
});

router.get("/classrooms/export.csv", async (req, res) => {
  try {
    const classrooms = await Classroom.findAll({ where: buildClassroomWhere(req.query), attributes: classroomAttributes, include: classroomIncludes, order: [["createdAt", "DESC"]] });
    return sendCsv(res, "sharprunner-classrooms.csv", ["Classroom", "Teacher", "Teacher Email", "Students", "Modules", "Status", "Created At", "Latest Activity"], classrooms.map((room) => [room.className, `${room.teacher?.firstName ?? ""} ${room.teacher?.lastName ?? ""}`.trim(), room.teacher?.email, room.get("studentCount"), room.get("moduleCount"), room.isActive ? "Active" : "Archived", room.createdAt?.toISOString?.() ?? room.createdAt, room.get("latestActivityAt")]));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Failed to export classrooms" });
  }
});

router.get("/classrooms/:id", async (req, res) => {
  try {
    const classroomId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(classroomId) || classroomId <= 0) return res.status(400).json({ message: "Invalid classroom id" });
    const classroom = await Classroom.findByPk(classroomId, { attributes: classroomAttributes, include: classroomIncludes });
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    const [memberships, lessons, announcements] = await Promise.all([
      ClassroomMembership.findAll({ where: { classroomId }, include: [{ model: User, as: "student", attributes: ["id", "firstName", "lastName", "username", "email", "status"] }], order: [["joinedAt", "DESC"]] }),
      ClassroomLesson.findAll({ where: { classroomId }, attributes: ["id", "title", "contentType", "moduleId", "externalUrl", "description", "isPublished", "publishAt", "createdAt", "updatedAt"], include: [{ model: ClassroomLessonAttachment, as: "attachments", attributes: ["id", "originalName", "mimeType", "sizeBytes", "scanStatus"] }], order: [["displayOrder", "ASC"], ["createdAt", "ASC"]] }),
      ClassroomAnnouncement.findAll({ where: { classroomId }, attributes: ["id", "message", "isActive", "createdAt", "updatedAt"], order: [["createdAt", "DESC"]], limit: 20 }),
    ]);
    return res.json({ classroom, memberships, lessons, announcements, mode: "read-only" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load classroom details" });
  }
});

router.post("/classrooms/:id/archive", adminMutationRateLimit, async (req, res) => {
  try {
    const classroomId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(classroomId) || classroomId <= 0) return res.status(400).json({ message: "Invalid classroom id" });
    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (!classroom.isActive) return res.json({ message: "Classroom is already archived" });
    classroom.isActive = false;
    await classroom.save();
    await logAdminActivity({ actorUserId: req.userId, actorUsername: await getActorUsername(req.userId), role: req.userRole, activity: "CLASSROOM_ARCHIVED", details: `${classroom.className} (#${classroom.id})` });
    return res.json({ message: "Classroom archived", classroom });
  } catch (error) {
    return res.status(500).json({ message: "Failed to archive classroom" });
  }
});

router.post("/classrooms/:id/restore", adminMutationRateLimit, async (req, res) => {
  try {
    const classroomId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(classroomId) || classroomId <= 0) return res.status(400).json({ message: "Invalid classroom id" });
    const classroom = await Classroom.findByPk(classroomId);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    if (classroom.isActive) return res.json({ message: "Classroom is already active" });
    classroom.isActive = true;
    await classroom.save();
    await logAdminActivity({ actorUserId: req.userId, actorUsername: await getActorUsername(req.userId), role: req.userRole, activity: "CLASSROOM_RESTORED", details: `${classroom.className} (#${classroom.id})` });
    return res.json({ message: "Classroom restored", classroom });
  } catch (error) {
    return res.status(500).json({ message: "Failed to restore classroom" });
  }
});

router.get("/content", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query, 20);
    const search = normalizeString(req.query.search).toLowerCase();
    const type = normalizeString(req.query.type).toLowerCase();
    const published = normalizeString(req.query.published).toLowerCase();
    if (type && !["module", "lesson", "assignment"].includes(type)) return res.status(400).json({ message: "Invalid content type" });
    if (published && !["true", "false"].includes(published)) return res.status(400).json({ message: "Invalid publish filter" });
    const whereClause = {};
    if (type) whereClause.contentType = type;
    if (published) whereClause.isPublished = published === "true";
    if (search) whereClause[Op.or] = [
      where(fn("lower", col("ClassroomLessons.title")), { [Op.like]: `%${search}%` }),
      where(fn("lower", col("classroom.className")), { [Op.like]: `%${search}%` }),
      where(fn("lower", col("classroom->teacher.email")), { [Op.like]: `%${search}%` }),
    ];
    const result = await ClassroomLesson.findAndCountAll({
      where: whereClause,
      attributes: ["id", "title", "contentType", "moduleId", "externalUrl", "isPublished", "publishAt", "createdAt", "updatedAt"],
      include: [{ model: Classroom, as: "classroom", attributes: ["id", "className", "isActive"], include: [{ model: User, as: "teacher", attributes: ["id", "firstName", "lastName", "email"] }] }],
      distinct: true, order: [["createdAt", "DESC"]], limit, offset,
    });
    return res.json({ total: result.count, page, limit, totalPages: Math.max(1, Math.ceil(result.count / limit)), content: result.rows, mode: "read-only" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load content oversight" });
  }
});

router.get("/content/:id", async (req, res) => {
  try {
    const contentId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(contentId) || contentId <= 0) return res.status(400).json({ message: "Invalid content id" });
    const content = await ClassroomLesson.findByPk(contentId, {
      attributes: ["id", "title", "description", "contentType", "moduleId", "externalUrl", "isPublished", "publishAt", "createdAt", "updatedAt"],
      include: [
        { model: Classroom, as: "classroom", attributes: ["id", "className", "isActive"], include: [{ model: User, as: "teacher", attributes: ["id", "firstName", "lastName", "email"] }] },
        { model: ClassroomLessonAttachment, as: "attachments", attributes: ["id", "originalName", "mimeType", "sizeBytes", "scanStatus", "createdAt"] },
        { model: ClassroomLesson, as: "module", attributes: ["id", "title"] },
      ],
    });
    if (!content) return res.status(404).json({ message: "Content not found" });
    return res.json({ content, mode: "read-only" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load content details" });
  }
});

router.get("/logs/export.csv", async (req, res) => {
  try {
    const actor = normalizeString(req.query.actor).toLowerCase();
    const target = normalizeString(req.query.target).toLowerCase();
    const action = normalizeString(req.query.action);
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to, true);
    const whereClause = {};
    if (actor) whereClause.actorUsername = { [Op.iLike]: `%${actor}%` };
    if (target) whereClause.targetUsername = { [Op.iLike]: `%${target}%` };
    if (action) whereClause.activity = { [Op.iLike]: `%${action}%` };
    if (from || to) whereClause.createdAt = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
    const logs = await AdminActivityLog.findAll({ where: whereClause, order: [["createdAt", "DESC"]] });
    return sendCsv(res, "sharprunner-audit-logs.csv", ["Actor", "Action", "Target", "Details", "Status", "Timestamp"], logs.map((log) => [log.actorUsername, log.activity, log.targetUsername, log.details, log.status, log.createdAt?.toISOString?.() ?? log.createdAt]));
  } catch (error) {
    return res.status(500).json({ message: "Failed to export audit logs" });
  }
});

router.post("/users/teacher", teacherCreationRateLimit, async (req, res) => {
  try {
    const firstName = normalizeString(req.body.firstName);
    const lastName = normalizeString(req.body.lastName);
    const username = normalizeString(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = normalizeString(req.body.password);

    if (!firstName || !lastName || !username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const emailValidation = await validateEmailAddress(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.reason });
    }

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          where(fn("lower", col("email")), email),
          where(fn("lower", col("username")), username.toLowerCase()),
        ],
      },
    });

    if (existingUser) {
      return res.status(409).json({ message: "Username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      username,
      email,
      role: "teacher",
      status: "pending",
      emailVerifiedAt: null,
      authProvider: "password",
      password: hashedPassword,
    });

    try {
      await sendTeacherInviteEmail({
        email: user.email,
        firstName: user.firstName,
        username: user.username,
        temporaryPassword: password,
      });
    } catch (error) {
      await user.destroy();
      throw error;
    }

    const actorUsername = await getActorUsername(req.userId);

    await logAdminActivity({
      actorUserId: req.userId,
      actorUsername,
      role: req.userRole ?? "admin",
      targetUserId: user.id,
      targetUsername: user.username,
      activity: "Invited teacher account",
      details: `${user.username} (${user.email})`,
      status: "success",
    });

    return res.status(201).json({
      message: "Teacher account created. Login details were emailed.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error",
    });
  }
});

module.exports = router;
