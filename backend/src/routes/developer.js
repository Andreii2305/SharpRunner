const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const AdminInvite = require("../models/AdminInvite");

const INVITE_CODE_LENGTH = 10;
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_INVITE_EXPIRY_HOURS = 72;
const MIN_INVITE_EXPIRY_HOURS = 1;
const MAX_INVITE_EXPIRY_HOURS = 24 * 30;

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value) =>
  normalizeString(value).toLowerCase();

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
};

const randomInviteCode = () =>
  Array.from({ length: INVITE_CODE_LENGTH }, () =>
    INVITE_CODE_CHARS.charAt(Math.floor(Math.random() * INVITE_CODE_CHARS.length))
  ).join("");

const createUniqueInviteCode = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const inviteCode = randomInviteCode();
    const existing = await AdminInvite.findOne({
      where: { inviteCode },
      attributes: ["id"],
    });

    if (!existing) {
      return inviteCode;
    }
  }

  throw new Error("Unable to generate unique invite code");
};

const createDeveloperToken = () =>
  jwt.sign(
    { scope: "developer" },
    process.env.JWT_SECRET,
    { expiresIn: "8h" },
  );

const requireDeveloperToken = (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "Auth is not configured" });
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: "Missing developer token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload?.scope !== "developer") {
      return res.status(403).json({ message: "Invalid developer token scope" });
    }

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired developer token" });
  }
};

const toInviteResponse = (invite) => {
  const expiresAt = invite.expiresAt ? new Date(invite.expiresAt) : null;
  const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false;

  return {
    id: invite.id,
    inviteCode: invite.inviteCode,
    invitedEmail: invite.invitedEmail,
    expiresAt: invite.expiresAt,
    usedAt: invite.usedAt,
    generatedBy: invite.generatedBy,
    createdAt: invite.createdAt,
    status: invite.usedAt ? "used" : isExpired ? "expired" : "active",
  };
};

router.post("/login", async (req, res) => {
  const setupKey = normalizeString(req.body.setupKey);
  const expectedSetupKey = normalizeString(process.env.DEVELOPER_SETUP_KEY);

  if (!expectedSetupKey) {
    return res.status(503).json({
      message: "Developer access is disabled. Set DEVELOPER_SETUP_KEY.",
    });
  }

  if (!setupKey || setupKey !== expectedSetupKey) {
    return res.status(403).json({ message: "Invalid developer setup key" });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "Auth is not configured" });
  }

  return res.json({
    token: createDeveloperToken(),
    expiresIn: "8h",
  });
});

router.use(requireDeveloperToken);

router.get("/admin-invites", async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 30;
    const invites = await AdminInvite.findAll({
      order: [["createdAt", "DESC"]],
      limit,
    });

    return res.json({
      total: invites.length,
      invites: invites.map(toInviteResponse),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/admin-invites", async (req, res) => {
  try {
    const invitedEmailRaw = normalizeEmail(req.body.invitedEmail);
    const invitedEmail = invitedEmailRaw || null;
    const requestedExpiry = Number.parseInt(req.body.expiresInHours, 10);
    const expiresInHours = Number.isInteger(requestedExpiry)
      ? requestedExpiry
      : DEFAULT_INVITE_EXPIRY_HOURS;

    if (
      expiresInHours < MIN_INVITE_EXPIRY_HOURS ||
      expiresInHours > MAX_INVITE_EXPIRY_HOURS
    ) {
      return res.status(400).json({
        message: `expiresInHours must be between ${MIN_INVITE_EXPIRY_HOURS} and ${MAX_INVITE_EXPIRY_HOURS}`,
      });
    }

    if (invitedEmail && !isValidEmail(invitedEmail)) {
      return res.status(400).json({ message: "invitedEmail must be a valid email" });
    }

    const inviteCode = await createUniqueInviteCode();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const invite = await AdminInvite.create({
      inviteCode,
      invitedEmail,
      expiresAt,
      usedAt: null,
      usedByUserId: null,
      generatedBy: "developer",
    });

    return res.status(201).json({
      message: "Admin invite code generated",
      invite: toInviteResponse(invite),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/admin-invites/active/count", async (_req, res) => {
  try {
    const activeCount = await AdminInvite.count({
      where: {
        usedAt: null,
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
    });

    return res.json({ activeCount });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
