require("dotenv").config();
const app = require("./app");
const sequelize = require("./config/database");
const { runMigrations } = require("./services/migrationService");

const startServer = async () => {
  try {
    await sequelize.authenticate();
    await runMigrations();
    console.log("Database migrations are current");

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
