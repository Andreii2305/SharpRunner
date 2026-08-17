const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { Op, col, fn, where } = require("sequelize");
const User = require("../models/User");
const AdminActivityLog = require("../models/AdminActivityLog");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const { logAdminActivity } = require("../services/adminActivityLogService");
const { validateEmailAddress } = require("../services/emailValidationService");
const { sendTeacherInviteEmail } = require("../services/emailService");
const { createRateLimit } = require("../middleware/rateLimit");

const ALLOWED_ROLES = new Set(["student", "teacher", "admin"]);
const ALLOWED_STATUSES = new Set(["active", "inactive", "pending"]);
const teacherCreationRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `teacher-create:${req.userId}`,
  message: "Too many teacher account requests. Please try again later.",
});

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

    const users = await User.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      total: users.length,
      users: users.map(sanitizeUser),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/logs", async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 20;

    const logs = await AdminActivityLog.findAll({
      order: [["createdAt", "DESC"]],
      limit,
    });

    return res.json({
      total: logs.length,
      logs: logs.map(sanitizeActivityLog),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/users/:id/status", async (req, res) => {
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

router.delete("/users/:id", async (req, res) => {
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

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
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
