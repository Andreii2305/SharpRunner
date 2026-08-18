const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLessonSubmissionAttachment = sequelize.define("ClassroomLessonSubmissionAttachments", {
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  submissionId: { type: DataTypes.INTEGER, allowNull: false },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  originalName: { type: DataTypes.STRING(255), allowNull: false },
  mimeType: { type: DataTypes.STRING(255), allowNull: false },
  sizeBytes: { type: DataTypes.BIGINT, allowNull: false },
  data: { type: DataTypes.BLOB("long"), allowNull: true },
  storageProvider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "database" },
  storageKey: { type: DataTypes.STRING(500), allowNull: true },
  sha256: { type: DataTypes.STRING(64), allowNull: true },
  scanStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "not_configured" },
});

module.exports = ClassroomLessonSubmissionAttachment;
