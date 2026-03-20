const ClassroomMembership = require("../models/ClassroomMembership");

const normalizeRole = (role) =>
  typeof role === "string" ? role.trim().toLowerCase() : "";

const requireActiveClassMembership = async (req, res, next) => {
  const currentRole = normalizeRole(req.userRole);

  if (currentRole !== "student") {
    return next();
  }

  try {
    const activeMembership = await ClassroomMembership.findOne({
      where: {
        studentId: req.userId,
        status: "active",
      },
      attributes: ["id"],
    });

    if (activeMembership) {
      return next();
    }

    return res.status(403).json({
      message: "Join a class first before accessing this feature.",
      code: "CLASS_MEMBERSHIP_REQUIRED",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = requireActiveClassMembership;
