require("dotenv").config();
const app = require("./app");
const sequelize = require("./config/database");
const {
  ensureUserRoleColumn,
  ensureUserStatusColumn,
} = require("./services/userRoleSchemaService");

const startServer = async () => {
  try {
    await sequelize.sync();
    await ensureUserRoleColumn();
    await ensureUserStatusColumn();
    console.log("Database synced");

    app.listen(5000, () =>
      console.log("Server running on port 5000")
    );
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();
