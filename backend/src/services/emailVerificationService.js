const crypto = require("node:crypto");
const { Op } = require("sequelize");
const EmailVerificationToken = require("../models/EmailVerificationToken");
const { sendVerificationEmail } = require("./emailService");

const TOKEN_TTL_MS = 30 * 60 * 1000;
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const hashCode = (userId, code) => {
  const secret = process.env.EMAIL_VERIFICATION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    const error = new Error("Email verification is not configured");
    error.statusCode = 503;
    throw error;
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${code}`)
    .digest("hex");
};

const issueEmailVerification = async (user) => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const verificationCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();

  const tokenRecord = await EmailVerificationToken.create({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    codeHash: hashCode(user.id, verificationCode),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
  });

  const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");
  const verificationUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

  try {
    await sendVerificationEmail({
      email: user.email,
      firstName: user.firstName,
      verificationUrl,
      verificationCode,
    });
  } catch (error) {
    await tokenRecord.destroy();
    throw error;
  }

  await EmailVerificationToken.update(
    { usedAt: new Date() },
    {
      where: {
        userId: user.id,
        usedAt: null,
        id: { [Op.ne]: tokenRecord.id },
      },
    },
  );
};

const verifyEmailToken = async (rawToken) => {
  if (typeof rawToken !== "string" || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    return { ok: false, reason: "invalid" };
  }

  const tokenRecord = await EmailVerificationToken.findOne({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (!tokenRecord) return { ok: false, reason: "invalid" };
  if (tokenRecord.usedAt) return { ok: true, tokenRecord, alreadyUsed: true };
  if (tokenRecord.expiresAt <= new Date()) return { ok: false, reason: "invalid" };

  return { ok: true, tokenRecord };
};

const verifyEmailCode = async (userId, code) => {
  if (!Number.isInteger(userId) || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return { ok: false, reason: "invalid" };
  }

  const tokenRecord = await EmailVerificationToken.findOne({
    where: {
      userId,
      codeHash: hashCode(userId, code),
      usedAt: null,
    },
    order: [["createdAt", "DESC"]],
  });

  if (!tokenRecord || tokenRecord.expiresAt <= new Date()) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, tokenRecord };
};

module.exports = { issueEmailVerification, verifyEmailToken, verifyEmailCode };
