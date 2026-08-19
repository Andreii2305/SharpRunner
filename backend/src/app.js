const express = require("express");
const cors = require("cors");
const passport = require("passport");
const sequelize = require("./config/database");

require("./models");

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

const LOCAL_FRONTEND_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const parseOriginList = (value = "") =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = new Set([
  ...LOCAL_FRONTEND_ORIGINS,
  ...parseOriginList(process.env.FRONTEND_URL),
  ...parseOriginList(process.env.FRONTEND_URLS),
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
}));

app.use(passport.initialize());
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
});
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check failed", error);
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/progress", require("./routes/progress"));
app.use("/api/lesson-content", require("./routes/lessonContent"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/teacher", require("./routes/teacher"));
app.use("/api/classrooms", require("./routes/classrooms"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/developer", require("./routes/developer"));

app.use((_req, res) => {
  res.status(404).json({ message: "API route not found" });
});

app.use((error, _req, res, next) => {
  console.error("Unhandled request error", error);
  if (res.headersSent) return next(error);
  res.status(500).json({ message: "Server error" });
});

module.exports = app;
