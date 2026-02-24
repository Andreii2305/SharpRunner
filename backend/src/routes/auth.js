const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op, col, fn, where } = require("sequelize");
const User = require("../models/User");

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value) =>
  normalizeString(value).toLowerCase();

const createAuthToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1h" });

router.post("/login", async (req, res) => {
  try {
    const identifier =
      normalizeString(req.body.identifier) ||
      normalizeString(req.body.email) ||
      normalizeString(req.body.username);
    const password = normalizeString(req.body.password);

    if (!identifier || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Auth is not configured" });
    }

    const normalizedIdentifier = identifier.toLowerCase();

    const user = await User.findOne({
      where: {
        [Op.or]: [
          where(fn("lower", col("email")), normalizedIdentifier),
          where(fn("lower", col("username")), normalizedIdentifier)
        ]
      }
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = createAuthToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const firstName = normalizeString(req.body.firstName);
    const lastName = normalizeString(req.body.lastName);
    const username = normalizeString(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = normalizeString(req.body.password);

    if (!firstName || !lastName || !username || !email || !password) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters"
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Auth is not configured" });
    }

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          where(fn("lower", col("email")), email),
          where(fn("lower", col("username")), username.toLowerCase())
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Username or email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      username,
      email,
      password: hashedPassword
    });

    const token = createAuthToken(user.id);

    res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
