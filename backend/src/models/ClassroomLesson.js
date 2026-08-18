const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLesson = sequelize.define("ClassroomLessons", {
  classroomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(160),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  dueAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  isPublished: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
});

module.exports = ClassroomLesson;
