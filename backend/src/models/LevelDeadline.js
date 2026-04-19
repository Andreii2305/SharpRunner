const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const LevelDeadline = sequelize.define("LevelDeadlines", {
  classroomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  levelKey: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  deadlineAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ["classroomId", "levelKey"],
    },
  ],
});

module.exports = LevelDeadline;
