const jwt = require("jsonwebtoken");
const User = require("../models/User");

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
      attributes: ["id", "role", "status"],
    });
    if (!user) {
      return res.status(401).json({ message: "Account no longer exists" });
    }
    if (user.status !== "active") {
      return res.status(403).json({ message: "Account is not active" });
    }

    req.user = user;
    req.userId = user.id;
    req.userRole =
      typeof user.role === "string" ? user.role.toLowerCase() : null;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;
