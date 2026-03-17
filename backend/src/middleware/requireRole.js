const normalizeRole = (role) =>
  typeof role === "string" ? role.trim().toLowerCase() : "";

const requireRole = (...allowedRoles) => {
  const normalizedAllowedRoles = allowedRoles
    .map(normalizeRole)
    .filter(Boolean);

  return (req, res, next) => {
    const currentRole = normalizeRole(req.userRole);

    if (!currentRole) {
      return res.status(403).json({ message: "Missing role information" });
    }

    if (!normalizedAllowedRoles.includes(currentRole)) {
      return res.status(403).json({ message: "You are not allowed to access this resource" });
    }

    return next();
  };
};

module.exports = requireRole;
