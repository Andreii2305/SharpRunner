const sequelize = require("../config/database");

const ensureGoogleAuthColumns = async () => {
  const qi = sequelize.getQueryInterface();

  try {
    const columns = await qi.describeTable("Users");

    if (!columns.googleId) {
      await qi.addColumn("Users", "googleId", {
        type: require("sequelize").DataTypes.STRING,
        allowNull: true,
        unique: true,
      });
      console.log("Added googleId column to Users");
    }

    if (columns.password && !columns.password.allowNull) {
      await qi.changeColumn("Users", "password", {
        type: require("sequelize").DataTypes.STRING,
        allowNull: true,
      });
      console.log("Made password column nullable in Users");
    }
  } catch (err) {
    console.error("googleAuthSchemaService error:", err.message);
  }
};

module.exports = { ensureGoogleAuthColumns };
