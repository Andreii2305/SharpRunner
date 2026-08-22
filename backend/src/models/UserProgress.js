const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const UserProgress = sequelize.define(
  "UserProgress",
  {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    levelKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lessonTitle: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    orderIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    progressPercent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100,
      },
    },
    isCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    attemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    timeSpentSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    finalScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    hintUsed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    hintUsedAt: { type: DataTypes.DATE, allowNull: true },
    hintType: { type: DataTypes.STRING(20), allowNull: true },
    attemptCountAtHintUnlock: { type: DataTypes.INTEGER, allowNull: true },
    detailedHintUnlocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    detailedHintPurchasedAt: { type: DataTypes.DATE, allowNull: true },
    detailedHintUsedAt: { type: DataTypes.DATE, allowNull: true },
    detailedHintXpCost: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0 },
    },
    xpAwarded: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    xpAwardedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["userId", "levelKey"],
      },
    ],
  }
);

module.exports = UserProgress;
