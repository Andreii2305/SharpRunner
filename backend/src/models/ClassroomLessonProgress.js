const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLessonProgress = sequelize.define("ClassroomLessonProgress", {
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  viewedAt: { type: DataTypes.DATE, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  indexes: [{
    unique: true,
    fields: ["classroomId", "lessonId", "studentId"],
    name: "classroom_lesson_progress_class_scope",
  }],
});

module.exports = ClassroomLessonProgress;
