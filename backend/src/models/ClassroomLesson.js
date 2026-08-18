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
  contentType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: "lesson",
    validate: { isIn: [["lesson", "assignment"]] },
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
  publishAt: { type: DataTypes.DATE, allowNull: true },
  allowSubmissions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  maxScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  rubric: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  feedbackReleaseAt: { type: DataTypes.DATE, allowNull: true },
  allowLateSubmissions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  allowedFileTypes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  maxFileSizeMb: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  assignedStudentIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
});

module.exports = ClassroomLesson;
