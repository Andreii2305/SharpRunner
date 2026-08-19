const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Op, col, fn, where } = require("sequelize");
const User = require("../models/User");
const AdminActivityLog = require("../models/AdminActivityLog");
const Classroom = require("../models/Classroom");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const { logAdminActivity } = require("../services/adminActivityLogService");
const { validateEmailAddress } = require("../services/emailValidationService");
const { sendTeacherInviteEmail, sendTemporaryPasswordEmail } = require("../services/emailService");
const { createRateLimit } = require("../middleware/rateLimit");

const ALLOWED_ROLES = new Set(["student", "teacher", "admin"]);
const ALLOWED_STATUSES = new Set(["active", "inactive", "pending"]);
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

router.use(authMiddleware, requireRole("admin"));

router.get("/users", async (req, res) => {
  try {
    const roleFilter = normalizeString(req.query.role).toLowerCase();
    const statusFilter = normalizeString(req.query.status).toLowerCase();
    const searchText = normalizeString(req.query.search).toLowerCase();
    const whereClause = {};

    if (roleFilter) {
      if (!ALLOWED_ROLES.has(roleFilter)) {
        return res.status(400).json({ message: "Invalid role filter" });
      }
      whereClause.role = roleFilter;
    }

    if (statusFilter) {
      if (!ALLOWED_STATUSES.has(statusFilter)) {
        return res.status(400).json({ message: "Invalid status filter" });
      }
      whereClause.status = statusFilter;
    }

    if (searchText) {
      const likeQuery = `%${searchText}%`;
      whereClause[Op.or] = [
        where(fn("lower", col("firstName")), { [Op.like]: likeQuery }),
        where(fn("lower", col("lastName")), { [Op.like]: likeQuery }),
        where(fn("lower", col("username")), { [Op.like]: likeQuery }),
        where(fn("lower", col("email")), { [Op.like]: likeQuery }),
      ];
    }

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
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/logs", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query, 20);
    const result = await AdminActivityLog.findAndCountAll({
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
    const [totalUsers, activeTeachers, activeStudents, activeClassrooms] = await Promise.all([
      User.count(),
      User.count({ where: { role: "teacher", status: "active" } }),
      User.count({ where: { role: "student", status: "active" } }),
      Classroom.count({ where: { isActive: true } }),
    ]);
    return res.json({ totalUsers, activeTeachers, activeStudents, activeClassrooms });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
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
      activity: "Updated user status",
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
    user.password = await bcrypt.hash(temporaryPassword, 10);
    await user.save();
    try {
      await sendTemporaryPasswordEmail({ email: user.email, firstName: user.firstName, username: user.username, temporaryPassword });
    } catch (error) {
      user.password = previousPassword;
      await user.save();
      throw error;
    }

    const actorUsername = await getActorUsername(req.userId);
    await logAdminActivity({ actorUserId: req.userId, actorUsername, role: req.userRole ?? "admin", targetUserId: user.id, targetUsername: user.username, activity: "Reset user password", details: `${user.username}: temporary password emailed`, status: "success" });
    return res.json({ message: "A temporary password was emailed to the user" });
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

    const deletedUsername = user.username;
    const deletedRole = user.role;
    const actorUsername = await getActorUsername(req.userId);

    await user.destroy();

    await logAdminActivity({
      actorUserId: req.userId,
      actorUsername,
      role: req.userRole ?? "admin",
      targetUsername: deletedUsername,
      activity: "Deleted user account",
      details: `${deletedUsername} (${deletedRole})`,
      status: "success",
    });

    return res.json({ message: `User ${deletedUsername} was permanently deleted` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete user" });
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
