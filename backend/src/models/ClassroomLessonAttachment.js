const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLessonAttachment = sequelize.define("ClassroomLessonAttachments", {
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  originalName: { type: DataTypes.STRING(255), allowNull: false },
  storedName: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  mimeType: { type: DataTypes.STRING(255), allowNull: false },
  sizeBytes: { type: DataTypes.BIGINT, allowNull: false },
  data: { type: DataTypes.BLOB("long"), allowNull: true },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  storageProvider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "database" },
  storageKey: { type: DataTypes.STRING(500), allowNull: true },
  sha256: { type: DataTypes.STRING(64), allowNull: true },
  scanStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "not_configured" },
});

module.exports = ClassroomLessonAttachment;
