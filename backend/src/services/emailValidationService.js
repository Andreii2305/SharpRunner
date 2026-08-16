const dns = require("node:dns").promises;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isEmailSyntaxValid = (email) => {
  if (typeof email !== "string" || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return false;
  }

  const [localPart, domain, ...extra] = email.split("@");
  return extra.length === 0 && localPart.length <= 64 && domain.length <= 253;
};

const validateEmailAddress = async (email) => {
  if (!isEmailSyntaxValid(email)) {
    return { valid: false, reason: "Please enter a valid email address" };
  }

  const domain = email.slice(email.lastIndexOf("@") + 1);
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(
        new Error("DNS lookup timed out"),
        { code: "ETIMEOUT" },
      )), 5000)),
    ]);

    if (!records.length || records.every((record) => !record.exchange || record.exchange === ".")) {
      return { valid: false, reason: "This email domain cannot receive email" };
    }
  } catch (error) {
    if (["ENODATA", "ENOTFOUND"].includes(error.code)) {
      return { valid: false, reason: "This email domain cannot receive email" };
    }

    const unavailable = new Error("Email validation is temporarily unavailable");
    unavailable.statusCode = 503;
    throw unavailable;
  }

  return { valid: true };
};

module.exports = { isEmailSyntaxValid, validateEmailAddress };
