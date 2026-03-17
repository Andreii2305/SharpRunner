const AdminActivityLog = require("../models/AdminActivityLog");

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const logAdminActivity = async ({
  actorUserId,
  actorUsername,
  role = "admin",
  targetUserId,
  targetUsername,
  activity,
  details,
  status = "success",
}) => {
  try {
    const normalizedActivity = normalizeString(activity);
    if (!normalizedActivity) {
      return null;
    }

    const normalizedStatus = normalizeString(status).toLowerCase();
    const safeStatus =
      normalizedStatus === "failed" ? "failed" : "success";

    return await AdminActivityLog.create({
      actorUserId: Number.isInteger(actorUserId) ? actorUserId : null,
      actorUsername: normalizeString(actorUsername) || null,
      role: normalizeString(role) || "admin",
      targetUserId: Number.isInteger(targetUserId) ? targetUserId : null,
      targetUsername: normalizeString(targetUsername) || null,
      activity: normalizedActivity,
      details: normalizeString(details) || null,
      status: safeStatus,
    });
  } catch (error) {
    console.error("Failed to write admin activity log", error);
    return null;
  }
};

module.exports = {
  logAdminActivity,
};
