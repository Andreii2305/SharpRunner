const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomMembership = sequelize.define(
  "ClassroomMemberships",
  {
    classroomId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    studentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
      validate: {
        isIn: [["active", "pending", "removed", "rejected"]],
      },
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    requestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["classroomId", "studentId"],
      },
    ],
  }
);

module.exports = ClassroomMembership;
