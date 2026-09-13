const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getPolicyStatus } = require("../constants/policyVersions");

const POLICY_EXEMPT_ROUTES = new Set([
  "GET /api/auth/me",
  "PUT /api/auth/me/policy-acceptance",
]);

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
};

const authMiddleware = async (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "Auth is not configured" });
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: "Missing authentication token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = Number(payload.id);
    if (!Number.isInteger(userId)) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const user = await User.findByPk(userId, {
      attributes: [
        "id",
        "role",
        "status",
        "tokenVersion",
        "termsVersionAccepted",
        "privacyVersionAcknowledged",
      ],
    });
    if (!user) {
      return res.status(401).json({ message: "Account no longer exists" });
    }
    if (user.status !== "active") {
      return res.status(403).json({ message: "Account is not active" });
    }
    const tokenVersion = Number(payload.tokenVersion ?? 0);
    if (tokenVersion !== Number(user.tokenVersion ?? 0)) {
      return res.status(401).json({ message: "Session has been revoked" });
    }

    req.user = user;
    req.userId = user.id;
    req.userRole =
      typeof user.role === "string" ? user.role.toLowerCase() : null;

    const policyStatus = getPolicyStatus(user);
    req.policyStatus = policyStatus;
    const requestPath = String(req.originalUrl || req.url || "").split("?")[0];
    const routeKey = `${req.method || "GET"} ${requestPath}`;
    if (policyStatus.requiresAcceptance && !POLICY_EXEMPT_ROUTES.has(routeKey)) {
      return res.status(428).json({
        code: "POLICY_ACCEPTANCE_REQUIRED",
        message: "Current Terms and Privacy acknowledgement are required.",
        policyStatus,
      });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;
