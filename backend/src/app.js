const express = require("express");
const cors = require("cors");

require("./models/User");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));

module.exports = app;
