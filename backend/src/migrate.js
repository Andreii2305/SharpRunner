require("dotenv").config();
require("./models");
const sequelize = require("./config/database");
const { runMigrations } = require("./services/migrationService");

runMigrations()
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error("Database migration failed", error);
    await sequelize.close().catch(() => undefined);
    process.exitCode = 1;
  });
