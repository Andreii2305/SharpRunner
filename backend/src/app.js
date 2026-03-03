const express = require("express");
const cors = require("cors");

require("./models");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/progress", require("./routes/progress"));

module.exports = app;
