const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { Op, col, fn, where } = require("sequelize");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

const ALLOWED_ROLES = new Set(["student", "teacher", "admin"]);

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
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

router.use(authMiddleware, requireRole("admin"));

router.get("/users", async (req, res) => {
  try {
    const roleFilter = normalizeString(req.query.role).toLowerCase();
    const searchText = normalizeString(req.query.search).toLowerCase();
    const whereClause = {};

    if (roleFilter) {
      if (!ALLOWED_ROLES.has(roleFilter)) {
        return res.status(400).json({ message: "Invalid role filter" });
      }
      whereClause.role = roleFilter;
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

router.post("/users/teacher", async (req, res) => {
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
      password: hashedPassword,
    });

    return res.status(201).json({
      message: "Teacher account created successfully",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
