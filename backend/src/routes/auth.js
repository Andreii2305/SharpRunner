const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { Op, col, fn, where } = require("sequelize");
const User = require("../models/User");
const AdminInvite = require("../models/AdminInvite");
const { ensureProgressRowsForUser } = require("../services/progressService");
const authMiddleware = require("../middleware/authMiddleware");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id, { attributes: ["id", "role", "status"] });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${BACKEND_URL}/api/auth/google/callback`,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value ?? null;
      const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "User";
      const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";

      let user = await User.findOne({ where: { googleId } });

      if (!user && email) {
        user = await User.findOne({ where: { email } });
        if (user) {
          user.googleId = googleId;
          await user.save();
        }
      }

      if (!user) {
        const base = email ? email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "") : `user${Date.now()}`;
        let username = base;
        let counter = 1;
        while (await User.findOne({ where: { username } })) {
          username = `${base}${counter++}`;
        }
        user = await User.create({
          firstName,
          lastName,
          username,
          email: email || `${googleId}@googleauth.com`,
          googleId,
          password: null,
          role: "student",
          status: "active",
        });
        await ensureProgressRowsForUser(user.id);
      }

      if (user.status === "inactive") return done(null, false);

      user.lastLoginAt = new Date();
      await user.save();
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value) =>
  normalizeString(value).toLowerCase();

const normalizeInviteCode = (value) =>
  normalizeString(value).toUpperCase().replace(/\s+/g, "");

const createAuthToken = (userId, role = "student") =>
  jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: "1h" });

const findUserByEmailOrUsername = (email, username) =>
  User.findOne({
    where: {
      [Op.or]: [
        where(fn("lower", col("email")), email),
        where(fn("lower", col("username")), username.toLowerCase())
      ]
    }
  });

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

    if (!user.password) {
      return res.status(401).json({ message: "This account uses Google Sign-In. Please log in with Google." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.status === "inactive") {
      return res.status(403).json({
        message: "Your account is inactive. Please contact your administrator.",
      });
    }

    user.lastLoginAt = new Date();
    user.isPlayingGame = false;
    await user.save();

    const token = createAuthToken(user.id, user.role ?? "student");
    await ensureProgressRowsForUser(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        role: user.role ?? "student",
        status: user.status ?? "active",
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
    const requestedRole = normalizeString(req.body.role).toLowerCase();

    if (requestedRole && requestedRole !== "student") {
      return res.status(403).json({
        message: "Teacher and admin accounts can only be created by an admin",
      });
    }

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

    const existingUser = await findUserByEmailOrUsername(email, username);

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
      role: "student",
      status: "active",
      password: hashedPassword
    });
    await ensureProgressRowsForUser(user.id);

    const token = createAuthToken(user.id, user.role ?? "student");

    res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        role: user.role ?? "student",
        status: user.status ?? "active",
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/register-admin-invite", async (req, res) => {
  try {
    const firstName = normalizeString(req.body.firstName);
    const lastName = normalizeString(req.body.lastName);
    const username = normalizeString(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = normalizeString(req.body.password);
    const inviteCode = normalizeInviteCode(req.body.inviteCode);

    if (!firstName || !lastName || !username || !email || !password || !inviteCode) {
      return res.status(400).json({
        message: "firstName, lastName, username, email, password, and inviteCode are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Auth is not configured" });
    }

    const invite = await AdminInvite.findOne({
      where: { inviteCode },
    });

    if (!invite) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    if (invite.usedAt) {
      return res.status(409).json({ message: "Invite code has already been used" });
    }

    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      return res.status(410).json({ message: "Invite code has expired" });
    }

    if (invite.invitedEmail && invite.invitedEmail !== email) {
      return res.status(403).json({
        message: "This invite code is restricted to a different email",
      });
    }

    const existingUser = await findUserByEmailOrUsername(email, username);
    if (existingUser) {
      return res.status(409).json({
        message: "Username or email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName,
      lastName,
      username,
      email,
      role: "admin",
      status: "active",
      password: hashedPassword,
    });

    invite.usedAt = new Date();
    invite.usedByUserId = user.id;
    await invite.save();

    const token = createAuthToken(user.id, user.role ?? "admin");

    return res.status(201).json({
      message: "Admin account created successfully from invite",
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        role: user.role ?? "admin",
        status: user.status ?? "active",
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/google",
  passport.authenticate("google", {
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
  })
);

router.get("/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/login?error=google_auth_failed`,
    session: false,
  }),
  (req, res) => {
    const token = createAuthToken(req.user.id, req.user.role);
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

router.post("/bootstrap-admin", async (req, res) => {
  try {
    const setupKey = normalizeString(req.body.setupKey);
    const expectedSetupKey = normalizeString(process.env.ADMIN_SETUP_KEY);

    if (!expectedSetupKey) {
      return res.status(503).json({
        message: "Admin bootstrap is disabled. Set ADMIN_SETUP_KEY to enable it.",
      });
    }

    if (setupKey !== expectedSetupKey) {
      return res.status(403).json({ message: "Invalid setup key" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Auth is not configured" });
    }

    const adminCount = await User.count({ where: { role: "admin" } });
    if (adminCount > 0) {
      return res.status(409).json({
        message: "An admin account already exists",
      });
    }

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

    const existingUser = await findUserByEmailOrUsername(email, username);
    if (existingUser) {
      return res.status(409).json({
        message: "Username or email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName,
      lastName,
      username,
      email,
      role: "admin",
      status: "active",
      password: hashedPassword,
    });

    const token = createAuthToken(user.id, user.role ?? "admin");

    return res.status(201).json({
      message: "Admin account created successfully",
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        role: user.role ?? "admin",
        status: user.status ?? "active",
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: ["id", "firstName", "lastName", "username", "email", "role", "status"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
