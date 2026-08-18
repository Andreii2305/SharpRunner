const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLessonAttachment = sequelize.define("ClassroomLessonAttachments", {
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  originalName: { type: DataTypes.STRING(255), allowNull: false },
  storedName: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  mimeType: { type: DataTypes.STRING(255), allowNull: false },
  sizeBytes: { type: DataTypes.BIGINT, allowNull: false },
});

module.exports = ClassroomLessonAttachment;
