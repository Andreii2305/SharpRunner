const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TABLE = "UserProgresses";

const ensureProgressGradingColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable(TABLE);

  if (!table["attemptCount"]) {
    await queryInterface.addColumn(TABLE, "attemptCount", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await sequelize.query(`UPDATE "${TABLE}" SET "attemptCount" = 0 WHERE "attemptCount" IS NULL`);
    await queryInterface.changeColumn(TABLE, "attemptCount", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  }

  if (!table["timeSpentSeconds"]) {
    await queryInterface.addColumn(TABLE, "timeSpentSeconds", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await sequelize.query(`UPDATE "${TABLE}" SET "timeSpentSeconds" = 0 WHERE "timeSpentSeconds" IS NULL`);
    await queryInterface.changeColumn(TABLE, "timeSpentSeconds", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  }

  if (!table["finalScore"]) {
    await queryInterface.addColumn(TABLE, "finalScore", {
      type: DataTypes.FLOAT,
      allowNull: true,
    });
  }

  if (!table["startedAt"]) {
    await queryInterface.addColumn(TABLE, "startedAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
};

module.exports = { ensureProgressGradingColumns };
