const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");

require("./models");

const app = express();

app.set("trust proxy", 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));

app.use(session({
  secret: process.env.JWT_SECRET || "sharprunner-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 10 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/progress", require("./routes/progress"));
app.use("/api/lesson-content", require("./routes/lessonContent"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/teacher", require("./routes/teacher"));
app.use("/api/classrooms", require("./routes/classrooms"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/developer", require("./routes/developer"));

module.exports = app;
