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

module.exports = { sendVerificationEmail };
