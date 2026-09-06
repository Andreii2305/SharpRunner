const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const StudentLevelExtension = sequelize.define(
  "StudentLevelExtensions",
  {
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    levelKey: { type: DataTypes.STRING, allowNull: false },
    extendedDueAt: { type: DataTypes.DATE, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["classroomId", "studentId", "levelKey"],
      },
    ],
  },
);

module.exports = StudentLevelExtension;
