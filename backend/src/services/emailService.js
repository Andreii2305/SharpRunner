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

  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
  });
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const sendVerificationEmail = async ({ email, firstName, verificationUrl }) => {
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
    text: `Hi ${firstName || "there"}, verify your SharpRunner email: ${verificationUrl}\n\nThis link expires in 30 minutes. If you did not request this account, you can ignore this email.`,
    html: `<p>Hi ${safeName},</p><p>Confirm that this email belongs to you:</p><p><a href="${safeUrl}">Verify my email</a></p><p>This link expires in 30 minutes. If you did not request this account, you can ignore this email.</p>`,
  });
};

module.exports = { sendVerificationEmail };
