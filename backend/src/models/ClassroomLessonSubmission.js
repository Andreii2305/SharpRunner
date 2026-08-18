const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLessonSubmission = sequelize.define("ClassroomLessonSubmissions", {
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  comment: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "submitted" },
  submittedAt: { type: DataTypes.DATE, allowNull: false },
  grade: { type: DataTypes.INTEGER, allowNull: true },
  feedback: { type: DataTypes.TEXT, allowNull: true },
  gradedAt: { type: DataTypes.DATE, allowNull: true },
  attemptCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  rubricScores: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
});

module.exports = ClassroomLessonSubmission;
