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
        isIn: [["active", "pending", "removed"]],
      },
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
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
