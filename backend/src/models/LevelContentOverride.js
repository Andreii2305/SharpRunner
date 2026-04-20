const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const LevelContentOverride = sequelize.define(
  "LevelContentOverrides",
  {
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    levelKey: { type: DataTypes.STRING, allowNull: false },
    lessonCardTitle: { type: DataTypes.STRING, allowNull: true },
    lessonCardDescription: { type: DataTypes.TEXT, allowNull: true },
    goalTitle: { type: DataTypes.STRING, allowNull: true },
    goalDescription: { type: DataTypes.TEXT, allowNull: true },
    instructionItems: { type: DataTypes.JSONB, allowNull: true },
    defaultCode: { type: DataTypes.TEXT, allowNull: true },
    validatorConfig: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    indexes: [{ unique: true, fields: ["classroomId", "levelKey"] }],
  }
);

module.exports = LevelContentOverride;
