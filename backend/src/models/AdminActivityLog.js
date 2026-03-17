const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const AdminActivityLog = sequelize.define("AdminActivityLogs", {
  actorUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  targetUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  actorUsername: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  targetUsername: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "admin",
    validate: {
      isIn: [["admin", "teacher", "student", "system"]],
    },
  },
  activity: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  details: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "success",
    validate: {
      isIn: [["success", "failed"]],
    },
  },
});

module.exports = AdminActivityLog;
