const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const crypto = require("crypto");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { Op, col, fn, where } = require("sequelize");
const User = require("../models/User");
const AdminInvite = require("../models/AdminInvite");
const { ensureProgressRowsForUser } = require("../services/progressService");
const authMiddleware = require("../middleware/authMiddleware");
const EmailVerificationToken = require("../models/EmailVerificationToken");
const { validateEmailAddress } = require("../services/emailValidationService");
const {
  issueEmailVerification,
  verifyEmailCode,
  verifyEmailToken,
} = require("../services/emailVerificationService");
const { createRateLimit } = require("../middleware/rateLimit");
const {
  GAMIFICATION_PREFERENCES,
  LEARNING_GAME_INTERESTS,
} = require("../constants/gamificationConfig");

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const isGoogleAuthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

const registerRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `register:${req.ip}`,
  message: "Too many registration attempts. Please try again later.",
});
const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `login:${req.ip}:${normalizeString(req.body?.identifier || req.body?.email || req.body?.username).toLowerCase()}`,
  message: "Too many login attempts. Please try again later.",
});
const passwordChangeRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `password-change:${req.userId}`,
  message: "Too many password change attempts. Please try again later.",
});
const bootstrapRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `admin-bootstrap:${req.ip}`,
  message: "Too many administrator bootstrap attempts. Please try again later.",
});
const resendRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `resend:${req.ip}:${normalizeEmail(req.body?.email)}`,
  message: "Too many verification requests. Please try again later.",
});
const verifyRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `verify:${req.ip}`,
  message: "Too many verification attempts. Please try again later.",
});
const verifyCodeRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `verify-code:${req.ip}:${normalizeEmail(req.body?.email)}`,
  message: "Too many code attempts. Please wait before trying again.",
});

if (isGoogleAuthConfigured) {
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
        const isEmailVerified = profile.emails?.[0]?.verified === true ||
          profile._json?.email_verified === true;
        const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "User";
        const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";

        if (!email || !isEmailVerified) {
          return done(null, false);
        }

        let user = await User.findOne({ where: { googleId } });

        if (!user && email) {
          user = await User.findOne({
            where: where(fn("lower", col("email")), email.toLowerCase()),
          });
          if (user) {
            user.googleId = googleId;
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
            email: email.toLowerCase(),
            googleId,
            password: null,
            emailVerifiedAt: new Date(),
            authProvider: "google",
            role: "student",
            status: "active",
          });
          await ensureProgressRowsForUser(user.id);
        }

        if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
        if (user.status === "pending") user.status = "active";
        if (user.status === "inactive") return done(null, false);

        user.lastLoginAt = new Date();
        await user.save();
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value) =>
  normalizeString(value).toLowerCase();

const normalizeInviteCode = (value) =>
  normalizeString(value).toUpperCase().replace(/\s+/g, "");

const secretsMatch = (provided, expected) => {
  const providedDigest = crypto.createHash("sha256").update(provided).digest();
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
};

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

const completeEmailVerification = async (result, res) => {
  const user = await User.findByPk(result.tokenRecord.userId);
  if (!user) {
    return res.status(400).json({
      message: "This verification code or link is invalid or has expired.",
    });
  }

  user.emailVerifiedAt = user.emailVerifiedAt || new Date();
  if (user.status === "pending") user.status = "active";
  result.tokenRecord.usedAt = new Date();
  await user.save();
  await result.tokenRecord.save();
  await EmailVerificationToken.update(
    { usedAt: new Date() },
    { where: { userId: user.id, usedAt: null } },
  );

  if (user.role === "student") {
    await ensureProgressRowsForUser(user.id);
  }

  return res.json({
    message: "Email verified successfully. You can now sign in.",
  });
};

router.post("/login", loginRateLimit, async (req, res) => {
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

    if (!user.emailVerifiedAt) {
      let verificationSent = false;

      if (user.role === "teacher") {
        const activeVerification = await EmailVerificationToken.findOne({
          where: {
            userId: user.id,
            usedAt: null,
            expiresAt: { [Op.gt]: new Date() },
          },
          order: [["createdAt", "DESC"]],
        });

        if (!activeVerification) {
          try {
            await issueEmailVerification(user);
          } catch (error) {
            console.error("Failed to start teacher email verification", error);
            return res.status(error.statusCode || 503).json({
              message: error.statusCode
                ? error.message
                : "Unable to send the verification code. Please try again.",
            });
          }
        }

        verificationSent = true;
      }

      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: verificationSent
          ? "A verification code was sent to your email."
          : "Please verify your email before signing in.",
        email: user.email,
        role: user.role,
        verificationSent,
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

router.post("/register", registerRateLimit, async (req, res) => {
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

    const emailValidation = await validateEmailAddress(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.reason });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Auth is not configured" });
    }

    const existingUser = await findUserByEmailOrUsername(email, username);

    if (existingUser) {
      if (
        existingUser.status === "pending" &&
        !existingUser.emailVerifiedAt &&
        existingUser.email.toLowerCase() === email
      ) {
        return res.status(409).json({
          code: "EMAIL_VERIFICATION_PENDING",
          message: "This account is waiting for email verification.",
          email: existingUser.email,
        });
      }

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
      status: "pending",
      emailVerifiedAt: null,
      authProvider: "password",
      password: hashedPassword
    });

    try {
      await issueEmailVerification(user);
    } catch (error) {
      await user.destroy();
      throw error;
    }

    res.status(201).json({
      message: "Account created. Check your email for the six-digit verification code.",
      requiresEmailVerification: true,
      email: user.email,
    });

  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : "Server error",
    });
  }
});

router.post("/verify-email", verifyRateLimit, async (req, res) => {
  try {
    const result = await verifyEmailToken(normalizeString(req.body.token));
    if (!result.ok) {
      return res.status(400).json({
        message: "This verification code or link is invalid or has expired.",
      });
    }

    return await completeEmailVerification(result, res);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/verify-email-code", verifyCodeRateLimit, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = normalizeString(req.body.code).replace(/\s+/g, "");
    const invalidResponse = () => res.status(400).json({
      message: "This verification code is invalid or has expired.",
    });

    if (!email || !/^\d{6}$/.test(code)) return invalidResponse();

    const user = await User.findOne({
      where: where(fn("lower", col("email")), email),
    });
    if (!user || user.emailVerifiedAt) return invalidResponse();

    const result = await verifyEmailCode(user.id, code);
    if (!result.ok) return invalidResponse();

    return await completeEmailVerification(result, res);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/resend-verification", resendRateLimit, async (req, res) => {
  const genericResponse = {
    message: "If that address has an unverified account, a new verification code and link have been sent.",
  };

  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.json(genericResponse);

    const user = await User.findOne({
      where: where(fn("lower", col("email")), email),
    });
    if (!user || user.emailVerifiedAt || !user.password) {
      return res.json(genericResponse);
    }

    const latestVerification = await EmailVerificationToken.findOne({
      where: { userId: user.id },
      attributes: ["createdAt"],
      order: [["createdAt", "DESC"]],
    });

    // Teacher OTP verification begins only after the first successful
    // username/password login, not from the public resend form.
    if (user.role === "teacher" && !latestVerification) {
      return res.json(genericResponse);
    }

    if (latestVerification?.createdAt) {
      const elapsedMs = Date.now() - new Date(latestVerification.createdAt).getTime();
      const remainingMs = VERIFICATION_RESEND_COOLDOWN_MS - elapsedMs;
      if (remainingMs > 0) {
        const retryAfter = Math.ceil(remainingMs / 1000);
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          message: `Please wait ${retryAfter} seconds before requesting another code.`,
          retryAfter,
        });
      }
    }

    await issueEmailVerification(user);
    return res.json(genericResponse);
  } catch (error) {
    console.error("Failed to resend verification email", error);
    return res.json(genericResponse);
  }
});

router.post("/register-admin-invite", registerRateLimit, async (req, res) => {
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

    const emailValidation = await validateEmailAddress(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.reason });
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
      const invitedUser = invite.usedByUserId
        ? await User.findByPk(invite.usedByUserId)
        : null;
      if (
        invitedUser?.role === "admin" &&
        invitedUser.status === "pending" &&
        !invitedUser.emailVerifiedAt &&
        invitedUser.email.toLowerCase() === email
      ) {
        return res.status(409).json({
          code: "EMAIL_VERIFICATION_PENDING",
          message: "This admin account is waiting for email verification.",
          email: invitedUser.email,
          role: "admin",
        });
      }
      return res.status(409).json({ message: "Invite code has already been used" });
    }

    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      return res.status(410).json({ message: "Invite code has expired" });
    }

    if (invite.invitedEmail && normalizeEmail(invite.invitedEmail) !== email) {
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
      status: "pending",
      emailVerifiedAt: null,
      authProvider: "password",
      password: hashedPassword,
    });

    try {
      await issueEmailVerification(user);
    } catch (error) {
      await user.destroy();
      throw error;
    }

    invite.usedAt = new Date();
    invite.usedByUserId = user.id;
    try {
      await invite.save();
    } catch (error) {
      await user.destroy();
      throw error;
    }

    return res.status(201).json({
      message: "Admin account created. Check your email for the verification code.",
      requiresEmailVerification: true,
      email: user.email,
      role: "admin",
    });
  } catch (err) {
    console.error(err);
    return res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : "Server error",
    });
  }
});

router.get("/google", (req, res, next) => {
  if (!isGoogleAuthConfigured) {
    return res.status(503).json({
      message: "Google Sign-In is not configured on this server.",
    });
  }

  return passport.authenticate("google", {
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
  })(req, res, next);
});

router.get("/google/callback", (req, res, next) => {
  if (!isGoogleAuthConfigured) {
    return res.redirect(`${FRONTEND_URL}/login?error=google_auth_not_configured`);
  }

  return passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/login?error=google_auth_failed`,
    session: false,
  })(req, res, next);
}, (req, res) => {
    const token = createAuthToken(req.user.id, req.user.role);
    res.redirect(`${FRONTEND_URL}/auth/callback#token=${encodeURIComponent(token)}`);
  }
);

router.post("/bootstrap-admin", bootstrapRateLimit, async (req, res) => {
  try {
    const setupKey = normalizeString(req.body.setupKey);
    const expectedSetupKey = normalizeString(process.env.ADMIN_SETUP_KEY);

    if (!expectedSetupKey) {
      return res.status(503).json({
        message: "Admin bootstrap is disabled. Set ADMIN_SETUP_KEY to enable it.",
      });
    }

    if (!setupKey || !secretsMatch(setupKey, expectedSetupKey)) {
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
      emailVerifiedAt: new Date(),
      authProvider: "password",
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
      attributes: ["id", "firstName", "lastName", "username", "email", "role", "status", "xpTotal", "gamificationPreference", "learningGameInterest"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/me/gamification-preferences", authMiddleware, async (req, res) => {
  try {
    const preference = normalizeString(req.body?.gamificationPreference).toLowerCase();
    const interest = normalizeString(req.body?.learningGameInterest).toLowerCase();
    if (preference && !GAMIFICATION_PREFERENCES.includes(preference)) {
      return res.status(400).json({ message: "Unknown gamification preference" });
    }
    if (interest && !LEARNING_GAME_INTERESTS.includes(interest)) {
      return res.status(400).json({ message: "Unknown learning-game interest" });
    }
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "student") {
      return res.status(403).json({ message: "Gamification preferences are available to students" });
    }
    user.gamificationPreference = preference || null;
    user.learningGameInterest = interest || null;
    await user.save();
    return res.json({
      message: "Motivation preferences updated",
      gamificationPreference: user.gamificationPreference,
      learningGameInterest: user.learningGameInterest,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/me/profile", authMiddleware, async (req, res) => {
  try {
    const firstName = normalizeString(req.body?.firstName);
    const lastName = normalizeString(req.body?.lastName);
    const username = normalizeString(req.body?.username).toLowerCase();
    if (!firstName || !lastName || !username) {
      return res.status(400).json({ message: "First name, last name, and username are required" });
    }
    if (firstName.length > 80 || lastName.length > 80 || username.length > 80) {
      return res.status(400).json({ message: "Profile fields must be 80 characters or fewer" });
    }

    const duplicate = await User.findOne({
      where: { username: { [Op.iLike]: username }, id: { [Op.ne]: req.userId } },
      attributes: ["id"],
    });
    if (duplicate) return res.status(409).json({ message: "Username is already in use" });

    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.firstName = firstName;
    user.lastName = lastName;
    user.username = username;
    await user.save();
    return res.json({
      message: "Profile updated",
      user: {
        id: user.id, firstName: user.firstName, lastName: user.lastName,
        username: user.username, email: user.email, role: user.role, status: user.status,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/me/password", authMiddleware, passwordChangeRateLimit, async (req, res) => {
  try {
    const currentPassword = normalizeString(req.body?.currentPassword);
    const newPassword = normalizeString(req.body?.newPassword);
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new passwords are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different" });
    }

    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.password || user.authProvider === "google") {
      return res.status(400).json({ message: "Password changes are unavailable for Google Sign-In accounts" });
    }
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ message: "Password updated" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
