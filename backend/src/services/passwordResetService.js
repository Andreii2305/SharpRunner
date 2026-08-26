const crypto = require("node:crypto");
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const User = require("../models/User");
const PasswordResetToken = require("../models/PasswordResetToken");
const { sendPasswordResetEmail } = require("./emailService");

const configuredTtl = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES);
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Number.isFinite(configuredTtl) && configuredTtl > 0
  ? configuredTtl
  : 30;
const PASSWORD_RESET_TOKEN_TTL_MS = PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000;

const hashPasswordResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const isValidRawToken = (token) =>
  typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);

const issuePasswordReset = async (user) => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  let tokenRecord;

  await sequelize.transaction(async (transaction) => {
    await User.findByPk(user.id, {
      attributes: ["id"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    await PasswordResetToken.update(
      { usedAt: now },
      { where: { userId: user.id, usedAt: null }, transaction },
    );
    tokenRecord = await PasswordResetToken.create({
      userId: user.id,
      tokenHash: hashPasswordResetToken(rawToken),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
    }, { transaction });
  });

  const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

  try {
    await sendPasswordResetEmail({
      email: user.email,
      firstName: user.firstName,
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES,
    });
  } catch (error) {
    await tokenRecord.destroy().catch(() => undefined);
    throw error;
  }
};

const resetPassword = async ({ rawToken, passwordHash }) => {
  if (!isValidRawToken(rawToken)) return false;

  return sequelize.transaction(async (transaction) => {
    const tokenRecord = await PasswordResetToken.findOne({
      where: {
        tokenHash: hashPasswordResetToken(rawToken),
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!tokenRecord) return false;

    const user = await User.findByPk(tokenRecord.userId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      !user ||
      user.status === "archived" ||
      user.authProvider !== "password"
    ) {
      return false;
    }

    user.password = passwordHash;
    user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
    await user.save({ transaction });

    await PasswordResetToken.update(
      { usedAt: new Date() },
      { where: { userId: user.id, usedAt: null }, transaction },
    );
    return true;
  });
};

module.exports = {
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  hashPasswordResetToken,
  issuePasswordReset,
  resetPassword,
};
