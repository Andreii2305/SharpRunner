const crypto = require("node:crypto");
const EmailVerificationToken = require("../models/EmailVerificationToken");
const { sendVerificationEmail } = require("./emailService");

const TOKEN_TTL_MS = 30 * 60 * 1000;
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const issueEmailVerification = async (user) => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const now = new Date();

  await EmailVerificationToken.update(
    { usedAt: now },
    { where: { userId: user.id, usedAt: null } },
  );

  const tokenRecord = await EmailVerificationToken.create({
    userId: user.id,
    tokenHash: hashToken(rawToken),
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
    });
  } catch (error) {
    await tokenRecord.destroy();
    throw error;
  }
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

module.exports = { issueEmailVerification, verifyEmailToken };
