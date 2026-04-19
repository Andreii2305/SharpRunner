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
