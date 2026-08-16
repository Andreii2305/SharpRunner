const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ensureEmailVerificationColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("Users");

  if (!columns.emailVerifiedAt) {
    await queryInterface.addColumn("Users", "emailVerifiedAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });

    // Preserve access for accounts that existed before email verification shipped.
    await sequelize.query(
      `UPDATE "Users" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;`,
    );
  }

  if (!columns.authProvider) {
    await queryInterface.addColumn("Users", "authProvider", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "password",
    });
  }
};

module.exports = { ensureEmailVerificationColumns };
