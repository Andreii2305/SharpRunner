const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const AdminInvite = sequelize.define("AdminInvites", {
  inviteCode: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  invitedEmail: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  usedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  usedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  generatedBy: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "developer",
  },
});

module.exports = AdminInvite;
