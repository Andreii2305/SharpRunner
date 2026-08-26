const nodemailer = require("nodemailer");

const getTransport = () => {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host || !user || !pass) {
    const error = new Error("Email delivery is not configured");
    error.statusCode = 503;
    throw error;
  }

  const port = Number(process.env.SMTP_PORT) || 2587;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const sendVerificationEmail = async ({
  email,
  firstName,
  verificationUrl,
  verificationCode,
}) => {
  const from = String(process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();
  if (!from) {
    const error = new Error("Email sender is not configured");
    error.statusCode = 503;
    throw error;
  }

  const safeName = escapeHtml(firstName || "there");
  const safeUrl = escapeHtml(verificationUrl);
  await getTransport().sendMail({
    from,
    to: email,
    subject: "Verify your SharpRunner email",
    text: `Hi ${firstName || "there"},\n\nYour SharpRunner verification code is: ${verificationCode}\n\nEnter this code on the SharpRunner verification page, or open this link: ${verificationUrl}\n\nThe code and link expire in 30 minutes. If you did not request this account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#23384d;line-height:1.6"><p>Hi ${safeName},</p><p>Enter this verification code on SharpRunner:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#eef4f8;border-radius:8px;padding:14px 18px;text-align:center;color:#26547c">${verificationCode}</div><p style="text-align:center;margin:24px 0"><a href="${safeUrl}" style="display:inline-block;background:#26547c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700">Verify my email</a></p><p>The code and link expire in 30 minutes. If you did not request this account, you can ignore this email.</p></div>`,
  });
};

const sendTeacherInviteEmail = async ({
  email,
  firstName,
  username,
  temporaryPassword,
}) => {
  const from = String(process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();
  if (!from) {
    const error = new Error("Email sender is not configured");
    error.statusCode = 503;
    throw error;
  }

  const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");
  const loginUrl = `${frontendUrl}/login`;
  const safeName = escapeHtml(firstName || "Teacher");
  const safeUsername = escapeHtml(username);
  const safePassword = escapeHtml(temporaryPassword);
  const safeLoginUrl = escapeHtml(loginUrl);

  await getTransport().sendMail({
    from,
    to: email,
    subject: "You have been invited to SharpRunner",
    text: `Hi ${firstName || "Teacher"},\n\nAn administrator created a SharpRunner teacher account for you.\n\nUsername: ${username}\nTemporary password: ${temporaryPassword}\n\nSign in here: ${loginUrl}\n\nOn your first login, we will email you a six-digit verification code to activate your account. After signing in, change your temporary password from Teacher Settings. If you were not expecting this invitation, contact your administrator.`,
    html: `<div style="font-family:Arial,sans-serif;color:#23384d;line-height:1.6;max-width:600px;margin:0 auto"><div style="background:#26547c;color:#ffffff;border-radius:10px 10px 0 0;padding:20px 24px"><strong style="font-size:20px">SharpRunner Teacher Invitation</strong></div><div style="border:1px solid #d9e1ea;border-top:0;border-radius:0 0 10px 10px;padding:24px"><p>Hi ${safeName},</p><p>An administrator created a SharpRunner teacher account for you. Use these details to sign in:</p><div style="background:#eef4f8;border-radius:8px;padding:16px 18px;margin:18px 0"><p style="margin:0 0 8px"><strong>Username:</strong> ${safeUsername}</p><p style="margin:0"><strong>Temporary password:</strong> ${safePassword}</p></div><p style="text-align:center;margin:24px 0"><a href="${safeLoginUrl}" style="display:inline-block;background:#26547c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700">Log in to SharpRunner</a></p><p>On your first login, we will send a six-digit verification code to this email address. After signing in, change your temporary password from Teacher Settings.</p><p style="color:#687786;font-size:13px">If you were not expecting this invitation, contact your administrator.</p></div></div>`,
  });
};

const sendTemporaryPasswordEmail = async ({ email, firstName, username, temporaryPassword }) => {
  const from = String(process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();
  if (!from) {
    const error = new Error("Email sender is not configured");
    error.statusCode = 503;
    throw error;
  }

  const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")[0].trim().replace(/\/$/, "");
  const loginUrl = `${frontendUrl}/login`;
  const safeName = escapeHtml(firstName || "there");
  const safeUsername = escapeHtml(username);
  const safePassword = escapeHtml(temporaryPassword);
  const safeLoginUrl = escapeHtml(loginUrl);

  await getTransport().sendMail({
    from,
    to: email,
    subject: "Your SharpRunner password was reset",
    text: `Hi ${firstName || "there"},\n\nA SharpRunner administrator reset your password.\n\nUsername: ${username}\nTemporary password: ${temporaryPassword}\n\nSign in here: ${loginUrl}\n\nChange this temporary password immediately from account settings. If you did not expect this reset, contact your administrator.`,
    html: `<div style="font-family:Arial,sans-serif;color:#23384d;line-height:1.6;max-width:600px;margin:0 auto"><p>Hi ${safeName},</p><p>A SharpRunner administrator reset your password.</p><div style="background:#eef4f8;border-radius:8px;padding:16px 18px"><p><strong>Username:</strong> ${safeUsername}</p><p><strong>Temporary password:</strong> ${safePassword}</p></div><p style="text-align:center;margin:24px 0"><a href="${safeLoginUrl}" style="display:inline-block;background:#26547c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700">Sign in</a></p><p>Change this temporary password immediately from account settings. If you did not expect this reset, contact your administrator.</p></div>`,
  });
};

const sendPasswordResetEmail = async ({
  email,
  firstName,
  resetUrl,
  expiresInMinutes,
}) => {
  const from = String(process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();
  if (!from) {
    const error = new Error("Email sender is not configured");
    error.statusCode = 503;
    throw error;
  }

  const safeName = escapeHtml(firstName || "there");
  const safeUrl = escapeHtml(resetUrl);
  await getTransport().sendMail({
    from,
    to: email,
    subject: "Reset your SharpRunner password",
    text: `Hi ${firstName || "there"},\n\nWe received a request to reset your SharpRunner password.\n\nReset your password: ${resetUrl}\n\nThis link will expire in ${expiresInMinutes} minutes. If you did not request a password reset, you can safely ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#23384d;line-height:1.6;max-width:600px;margin:0 auto"><div style="background:#26547c;color:#ffffff;border-radius:10px 10px 0 0;padding:20px 24px"><strong style="font-size:20px">SharpRunner Password Reset</strong></div><div style="border:1px solid #d9e1ea;border-top:0;border-radius:0 0 10px 10px;padding:24px"><p>Hi ${safeName},</p><p>We received a request to reset your SharpRunner password.</p><p style="text-align:center;margin:24px 0"><a href="${safeUrl}" style="display:inline-block;background:#26547c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700">Reset Password</a></p><p>This link will expire in ${expiresInMinutes} minutes.</p><p style="color:#687786;font-size:13px">If you did not request a password reset, you can safely ignore this email.</p></div></div>`,
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendTeacherInviteEmail,
  sendTemporaryPasswordEmail,
  sendVerificationEmail,
};
