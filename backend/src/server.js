require("dotenv").config();
const app = require("./app");
const sequelize = require("./config/database");
const {
  ensureUserRoleColumn,
  ensureUserStatusColumn,
  ensureUserActivityColumns,
} = require("./services/userRoleSchemaService");
const { ensureClassroomColumns } = require("./services/classroomSchemaService");
const { ensureProgressGradingColumns } = require("./services/progressSchemaService");
const { ensureLevelContentOverridesTable } = require("./services/levelContentSchemaService");

const startServer = async () => {
  try {
    await sequelize.sync();
    await ensureUserRoleColumn();
    await ensureUserStatusColumn();
    await ensureUserActivityColumns();
    await ensureClassroomColumns();
    await ensureProgressGradingColumns();
    await ensureLevelContentOverridesTable();
    console.log("Database synced");

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () =>
      console.log(`Server running on port ${PORT}`)
    );
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();
